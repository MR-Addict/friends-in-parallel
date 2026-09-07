import { mkdir, readFile, writeFile, readdir, lstat, rm, rename } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import path from 'node:path';
import { checkDate, HttpError } from './model.js';
import type { Store } from './store.js';
import type { SnapshotItem } from './exports.js';

export const EXPORT_TTL = 86_400_000;
const TOKEN = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const FILE = /^(?:[1-9]\d*\.png|images\.zip|video\.mp4|cover\.jpg)$/;
export interface CacheRecord<T = unknown> {
  version: 2;
  sourceRevision: string;
  token: string;
  kind: 'images' | 'video';
  key: string;
  date: string;
  completedAt: string;
  expiresAt: string;
  files: Record<string, { size: number; downloadName: string }>;
  result: T;
}
export interface CacheWork {
  token: string;
  dir: string;
  signal: AbortSignal;
  date: string;
  sourceRevision: string;
}

export function contentFingerprint(items: SnapshotItem[], parts: (string | Buffer)[]) {
  const hash = createHash('sha256');
  for (const part of parts) hash.update(createHash('sha256').update(part).digest());
  for (const { bytes, ...item } of items) {
    const { updatedAt: _ignored, ...entry } = item.entry;
    hash.update(JSON.stringify({ ...item, entry }));
    hash.update(createHash('sha256').update(bytes).digest());
  }
  return hash.digest('hex');
}

/** One instance per server: images and videos share admission, persistence and leases. */
export class ExportCache {
  readonly dir: string;
  private active?: {
    token: string;
    controller: AbortController;
    date: string;
    sourceRevision: string;
    finished?: Promise<unknown>;
  };
  private pending = new Map<string, Promise<unknown>>();
  private leases = new Map<string, number>();
  private cleaning?: Promise<void>;
  private stopped = false;
  constructor(
    dataDir: string,
    private now = Date.now,
    private store?: Store,
  ) {
    this.dir = path.join(dataDir, 'exports');
  }
  assertCurrent(date: string, revision: string) {
    if (this.store && this.store.revision(date) !== revision)
      throw new HttpError(409, '动态已更新，请重新生成');
  }
  invalidate(dates: string[]) {
    if (this.active && dates.includes(this.active.date))
      this.active.controller.abort(new HttpError(409, '动态已更新，请重新生成'));
    void this.cleanup().catch(console.error);
  }
  singleFlight<T>(key: string, run: () => Promise<T>): Promise<T> {
    const existing = this.pending.get(key);
    if (existing) return existing as Promise<T>;
    const promise = Promise.resolve().then(run);
    this.pending.set(key, promise);
    void promise.finally(() => this.pending.delete(key)).catch(() => {});
    return promise;
  }
  private protected(token: string) {
    return this.active?.token === token || !!this.leases.get(token);
  }
  async read<T = unknown>(token: string): Promise<CacheRecord<T> | undefined> {
    if (!TOKEN.test(token)) return;
    try {
      const folder = path.join(this.dir, token);
      if (!(await lstat(folder)).isDirectory()) return;
      const meta = JSON.parse(await readFile(path.join(folder, 'metadata.json'), 'utf8'));
      if (
        meta.version !== 2 ||
        typeof meta.sourceRevision !== 'string' ||
        meta.token !== token ||
        !['images', 'video'].includes(meta.kind) ||
        !/^[a-f0-9]{64}$/.test(meta.key) ||
        !(Date.parse(meta.expiresAt) > this.now()) ||
        !Number.isFinite(Date.parse(meta.completedAt)) ||
        Date.parse(meta.expiresAt) - Date.parse(meta.completedAt) !== EXPORT_TTL ||
        !meta.result ||
        !meta.files ||
        typeof meta.files !== 'object'
      )
        return;
      checkDate(meta.date);
      const files = Object.entries(meta.files) as [
        string,
        { size: number; downloadName: string },
      ][];
      if (!files.length) return;
      for (const [name, file] of files) {
        if (
          !FILE.test(name) ||
          !Number.isSafeInteger(file.size) ||
          file.size <= 0 ||
          typeof file.downloadName !== 'string'
        )
          return;
        const info = await lstat(path.join(folder, name));
        if (!info.isFile() || info.size !== file.size) return;
      }
      if (meta.kind === 'video' && (!meta.files['video.mp4'] || !meta.files['cover.jpg'])) return;
      if (meta.kind === 'images' && (!meta.files['1.png'] || !meta.files['images.zip'])) return;
      const result = meta.result;
      const prefix = `/api/exports/files/${token}/`;
      if (typeof result !== 'object' || result.expiresAt !== meta.expiresAt) return;
      if (meta.kind === 'video') {
        if (
          files.length !== 2 ||
          result.videoUrl !== `${prefix}video.mp4` ||
          result.coverUrl !== `${prefix}cover.jpg` ||
          !Number.isFinite(result.duration) ||
          result.duration <= 0 ||
          typeof result.styleId !== 'string' ||
          typeof result.musicId !== 'string' ||
          !/^[a-z][a-z0-9-]*$/.test(result.styleId) ||
          !/^[a-z][a-z0-9-]*$/.test(result.musicId)
        )
          return;
      } else {
        if (
          !Array.isArray(result.images) ||
          !result.images.length ||
          files.length !== result.images.length + 1 ||
          result.archiveUrl !== `${prefix}images.zip` ||
          !result.images.every(
            (url: unknown, index: number) =>
              url === `${prefix}${index + 1}.png` && !!meta.files[`${index + 1}.png`],
          )
        )
          return;
      }
      this.assertCurrent(meta.date, meta.sourceRevision);
      return meta;
    } catch {
      return;
    }
  }
  async find<T>(key: string, kind: CacheRecord['kind']) {
    await mkdir(this.dir, { recursive: true });
    for (const token of await readdir(this.dir)) {
      const meta = await this.read<T>(token);
      if (meta?.key === key && meta.kind === kind) return meta;
    }
  }
  cleanup(): Promise<void> {
    if (this.cleaning) return this.cleaning;
    const work = (async () => {
      await mkdir(this.dir, { recursive: true });
      for (const name of await readdir(this.dir)) {
        const token = name.startsWith('.tmp-') ? name.slice(5) : name;
        if (!TOKEN.test(token) || this.protected(token)) continue;
        if (name.startsWith('.tmp-') || !(await this.read(token))) {
          // Recheck after I/O: a renderer or response may have acquired a lease.
          if (!this.protected(token))
            await rm(path.join(this.dir, name), { recursive: true, force: true });
        }
      }
    })();
    this.cleaning = work;
    void work
      .finally(() => {
        this.cleaning = undefined;
      })
      .catch(() => {});
    return work;
  }
  reserve(timeoutMs: number, date = '', sourceRevision = 'standalone'): CacheWork {
    this.assertCurrent(date, sourceRevision);
    if (this.stopped) throw new HttpError(503, '服务正在重启，请稍后重试');
    if (this.active) throw new HttpError(429, '另一份手账或视频正在生成，请稍后再试');
    const token = randomUUID();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('导出生成超时，请重试')), timeoutMs);
    timer.unref();
    controller.signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
    this.active = { token, controller, date, sourceRevision };
    return {
      token,
      dir: path.join(this.dir, `.tmp-${token}`),
      signal: controller.signal,
      date,
      sourceRevision,
    };
  }
  track(work: CacheWork, finished: Promise<unknown>) {
    if (this.active?.token === work.token) this.active.finished = finished;
  }
  async publish<T>(
    work: CacheWork,
    kind: CacheRecord['kind'],
    key: string,
    date: string,
    names: Record<string, string>,
    result: (expiresAt: string) => T,
  ): Promise<T> {
    work.signal.throwIfAborted();
    const files: CacheRecord['files'] = {};
    for (const [name, downloadName] of Object.entries(names)) {
      if (!FILE.test(name)) throw new Error('Invalid export artifact');
      const info = await lstat(path.join(work.dir, name));
      if (!info.isFile() || !info.size) throw new Error('Incomplete export artifact');
      files[name] = { size: info.size, downloadName };
    }
    const completedAt = new Date(this.now()).toISOString();
    const expiresAt = new Date(Date.parse(completedAt) + EXPORT_TTL).toISOString();
    const value = result(expiresAt);
    const meta: CacheRecord<T> = {
      version: 2,
      sourceRevision: work.sourceRevision,
      token: work.token,
      kind,
      key,
      date,
      completedAt,
      expiresAt,
      files,
      result: value,
    };
    await writeFile(path.join(work.dir, 'metadata.json'), JSON.stringify(meta));
    const commit = async () => {
      work.signal.throwIfAborted();
      this.assertCurrent(date, work.sourceRevision);
      await rename(work.dir, path.join(this.dir, work.token));
    };
    if (this.store) await this.store.exclusive(commit);
    else await commit();
    return value;
  }
  async finish(work: CacheWork) {
    try {
      await rm(work.dir, { recursive: true, force: true });
    } finally {
      if (this.active?.token === work.token) {
        this.active.controller.abort();
        this.active = undefined;
      }
    }
  }
  async file(token: string, name: string) {
    if (!TOKEN.test(token) || !FILE.test(name)) throw new HttpError(404, '文件不存在');
    const meta = await this.read(token);
    if (!meta?.files[name]) throw new HttpError(404, '导出已过期，请重新生成');
    return {
      filename: path.join(this.dir, token, name),
      downloadName: meta.files[name].downloadName,
    };
  }
  async acquireFile(token: string, name: string) {
    if (!TOKEN.test(token)) throw new HttpError(404, '文件不存在');
    await this.cleaning;
    // Take the lease before any asynchronous filesystem operation.
    this.leases.set(token, (this.leases.get(token) || 0) + 1);
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      const count = (this.leases.get(token) || 1) - 1;
      if (count) this.leases.set(token, count);
      else this.leases.delete(token);
      void this.cleanup().catch(console.error);
    };
    try {
      return { ...(await this.file(token, name)), release };
    } catch (error) {
      release();
      throw error;
    }
  }
  async dispose() {
    this.stopped = true;
    const active = this.active;
    active?.controller.abort(new Error('服务已重启，请重新生成'));
    await active?.finished?.catch(() => {});
  }
}
