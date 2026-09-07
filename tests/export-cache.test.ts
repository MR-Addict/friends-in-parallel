import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { ExportCache, EXPORT_TTL, contentFingerprint } from '../apps/server/src/export-cache.js';
import { HttpError } from '../apps/server/src/model.js';

async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const root = await mkdtemp(path.join(tmpdir(), 'shared-exports-'));
  let now = Date.now();
  const cache = new ExportCache(root, () => now);
  t.after(async () => {
    await cache.dispose();
    await rm(root, { recursive: true, force: true });
  });
  const save = async (kind: 'images' | 'video') => {
    const work = cache.reserve(10_000);
    await mkdir(work.dir, { recursive: true });
    const names = kind === 'images' ? ['1.png', 'images.zip'] : ['cover.jpg', 'video.mp4'];
    for (const name of names) await writeFile(path.join(work.dir, name), Buffer.from('fixture'));
    const key = contentFingerprint([], [kind]);
    await cache.publish(
      work,
      kind,
      key,
      '2026-08-30',
      Object.fromEntries(names.map((n) => [n, n])),
      (expiresAt) =>
        kind === 'images'
          ? {
              expiresAt,
              images: [`/api/exports/files/${work.token}/1.png`],
              archiveUrl: `/api/exports/files/${work.token}/images.zip`,
            }
          : {
              expiresAt,
              videoUrl: `/api/exports/files/${work.token}/video.mp4`,
              coverUrl: `/api/exports/files/${work.token}/cover.jpg`,
              duration: 10,
              styleId: 'paper',
              musicId: 'none',
            },
    );
    await cache.finish(work);
    return { token: work.token, key, names };
  };
  return {
    root,
    cache,
    save,
    advance: (ms: number) => {
      now += ms;
    },
  };
}
test('shared cache expires exactly 24h after completion, hits and downloads never renew it', async (t) => {
  const f = await fixture(t);
  const image = await f.save('images'),
    video = await f.save('video');
  const initial = await f.cache.read(image.token);
  assert.equal(Date.parse(initial!.expiresAt) - Date.parse(initial!.completedAt), EXPORT_TTL);
  f.advance(EXPORT_TTL - 1);
  assert.ok(await f.cache.find(image.key, 'images'));
  assert.ok(await new ExportCache(f.root).read(image.token));
  const lease = await f.cache.acquireFile(video.token, 'video.mp4');
  f.advance(1);
  const a = f.cache.cleanup(),
    b = f.cache.cleanup();
  assert.equal(a, b);
  await a;
  await assert.rejects(access(path.join(f.cache.dir, image.token)));
  assert.equal((await readFile(lease.filename)).toString(), 'fixture');
  await assert.rejects(f.cache.file(video.token, 'video.mp4'), (e: HttpError) => e.status === 404);
  lease.release();
  lease.release();
  await f.cache.cleanup();
  await assert.rejects(access(path.join(f.cache.dir, video.token)));
});
test('cleanup removes legacy, corrupt, missing and orphaned files while protecting active work', async (t) => {
  const f = await fixture(t);
  const image = await f.save('images'),
    video = await f.save('video');
  await writeFile(path.join(f.cache.dir, image.token, 'metadata.json'), '{}');
  await writeFile(path.join(f.cache.dir, video.token, 'video.mp4'), 'short');
  assert.equal(await f.cache.find(video.key, 'video'), undefined);
  const orphan = path.join(f.cache.dir, `.tmp-${randomUUID()}`);
  await mkdir(orphan);
  const active = f.cache.reserve(10_000);
  await mkdir(active.dir);
  await f.cache.cleanup();
  assert.deepEqual(await readdir(f.cache.dir), [path.basename(active.dir)]);
  assert.throws(
    () => f.cache.reserve(10_000),
    (e: HttpError) => e.status === 429,
  );
  await f.cache.finish(active);
  const next = await f.save('video');
  await rm(path.join(f.cache.dir, next.token, 'cover.jpg'));
  await f.cache.cleanup();
  assert.deepEqual(await readdir(f.cache.dir), []);
});
test('atomic publication and same-key single flight do not expose unfinished exports', async (t) => {
  const f = await fixture(t);
  let count = 0;
  const generate = () =>
    f.cache.singleFlight('same', async () => {
      count++;
      return f.save('video');
    });
  const [a, b] = await Promise.all([generate(), generate()]);
  assert.equal(count, 1);
  assert.deepEqual(a, b);
  assert.deepEqual((await readdir(f.cache.dir)).sort(), [a.token]);
  await assert.rejects(f.cache.file(a.token, 'metadata.json'), (e: HttpError) => e.status === 404);
  await assert.rejects(f.cache.file('../', 'video.mp4'), (e: HttpError) => e.status === 404);
  const work = f.cache.reserve(10_000);
  await mkdir(work.dir);
  await assert.rejects(
    f.cache.publish(work, 'video', a.key, '2026-08-30', { 'video.mp4': 'v.mp4' }, () => ({})),
  );
  assert.equal(await f.cache.read(work.token), undefined);
  await f.cache.dispose();
  assert.equal(work.signal.aborted, true);
  await f.cache.finish(work);
});
