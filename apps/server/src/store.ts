import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Entry } from './model.js';
import { beijingDate, HttpError } from './model.js';
export class Store {
  private entries: Entry[] = [];
  private tail: Promise<unknown> = Promise.resolve();
  readonly uploads: string;
  constructor(readonly dir: string) {
    this.uploads = path.join(dir, 'uploads');
  }
  async init() {
    await mkdir(this.uploads, { recursive: true });
    try {
      const parsed = JSON.parse(await readFile(path.join(this.dir, 'entries.json'), 'utf8'));
      if (!Array.isArray(parsed)) throw new Error('Invalid entries.json');
      this.entries = parsed;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
  }
  async exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.tail.then(fn);
    this.tail = result.catch(() => {});
    return result;
  }
  list(date: string) {
    return structuredClone(
      this.entries
        .filter((e) => beijingDate(e.occurredAt) === date)
        .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id)),
    );
  }
  dateCounts(month: string) {
    const counts: Record<string, number> = {};
    for (const entry of this.entries) {
      const date = beijingDate(entry.occurredAt);
      if (date.startsWith(month + '-')) counts[date] = (counts[date] || 0) + 1;
    }
    return counts;
  }
  private async persist(next: Entry[]) {
    const tmp = path.join(this.dir, `entries.${randomUUID()}.tmp`);
    try {
      await writeFile(tmp, JSON.stringify(next, null, 2) + '\n');
      await rename(tmp, path.join(this.dir, 'entries.json'));
      this.entries = next;
    } finally {
      await unlink(tmp).catch(() => {});
    }
  }
  async save(input: Omit<Entry, 'id' | 'createdAt' | 'updatedAt'>, photo?: Buffer, id?: string) {
    return this.exclusive(async () => {
      const previous = id ? this.entries.find((e) => e.id === id) : undefined;
      if (id && !previous) throw new HttpError(404, '这条动态已经不在了');
      // Retained photos must belong to the record being edited.
      if (
        input.media.type === 'photo' &&
        !photo &&
        (previous?.media.type !== 'photo' || previous.media.filename !== input.media.filename)
      )
        throw new HttpError(400, '请重新选择照片');
      const now = new Date().toISOString();
      const entry: Entry = {
        ...input,
        id: id || randomUUID(),
        createdAt: previous?.createdAt || now,
        updatedAt: now,
      };
      let added: string | undefined;
      if (photo && input.media.type === 'photo') {
        added = path.join(this.uploads, input.media.filename);
        await writeFile(added, photo, { flag: 'wx' });
      }
      try {
        await this.persist(
          previous ? this.entries.map((e) => (e.id === id ? entry : e)) : [...this.entries, entry],
        );
      } catch (e) {
        if (added) await unlink(added).catch(() => {});
        throw e;
      }
      if (
        previous?.media.type === 'photo' &&
        (input.media.type !== 'photo' || previous.media.filename !== input.media.filename)
      )
        await unlink(path.join(this.uploads, previous.media.filename)).catch(() => {});
      return structuredClone(entry);
    });
  }
  async delete(id: string) {
    return this.exclusive(async () => {
      const entry = this.entries.find((e) => e.id === id);
      if (!entry) throw new HttpError(404, '这条动态已经不在了');
      await this.persist(this.entries.filter((e) => e.id !== id));
      if (entry.media.type === 'photo')
        await unlink(path.join(this.uploads, entry.media.filename)).catch(() => {});
    });
  }
}
