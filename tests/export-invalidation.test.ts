import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Store } from '../apps/server/src/store.js';
import { ExportCache, contentFingerprint } from '../apps/server/src/export-cache.js';
import { snapshot } from '../apps/server/src/exports.js';
import { VideoExports } from '../apps/server/src/video-exports.js';

const date = '2026-08-30';
const other = '2026-08-31';
const input = {
  personId: 'lu-yuhan',
  description: 'original',
  occurredAt: `${date}T06:30:00Z`,
  media: { type: 'sticker' as const, stickerId: 'fluent-1f60a' },
};
async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const dir = await mkdtemp(path.join(tmpdir(), 'export-invalidation-'));
  const store = new Store(dir);
  await store.init();
  const cache = new ExportCache(dir, Date.now, store);
  store.onDatesChanged = (dates) => cache.invalidate(dates);
  t.after(async () => {
    await cache.dispose();
    await cache.cleanup();
    await rm(dir, { recursive: true, force: true });
  });
  const entry = await store.save(input);
  async function prepare(kind: 'images' | 'video', day = date, styleId = 'paper') {
    const work = cache.reserve(10000, day, store.revision(day));
    await mkdir(work.dir, { recursive: true });
    const names = kind === 'images' ? ['1.png', '2.png'] : ['video.mp4', 'cover.jpg'];
    for (const name of names) await writeFile(path.join(work.dir, name), 'fixture');
    const key = contentFingerprint([], [kind, day, styleId, work.sourceRevision]);
    const publish = () =>
      cache.publish(
        work,
        kind,
        key,
        day,
        Object.fromEntries(names.map((n) => [n, n])),
        (expiresAt) => {
          const prefix = `/api/exports/files/${work.token}/`;
          return kind === 'images'
            ? {
                expiresAt,
                images: [prefix + '1.png', prefix + '2.png'],
              }
            : {
                expiresAt,
                videoUrl: prefix + 'video.mp4',
                coverUrl: prefix + 'cover.jpg',
                duration: 1,
                styleId,
                musicId: 'none',
              };
        },
      );
    return { work, publish, names, key };
  }
  async function save(kind: 'images' | 'video', day = date, style = 'paper') {
    const item = await prepare(kind, day, style);
    await item.publish();
    await cache.finish(item.work);
    return item;
  }
  return { dir, store, cache, entry, prepare, save };
}

test('all artifacts expire by affected date, stay expired after reverting, and survive restart correctly', async (t) => {
  const f = await fixture(t);
  const artifacts = [
    await f.save('images'),
    await f.save('video'),
    await f.save('video', date, 'polaroid'),
  ];
  const unaffected = await f.save('images', other);
  const before = f.store.revision(date);
  const lease = await f.cache.acquireFile(artifacts[0].work.token, '1.png');
  await f.store.save({ ...input, description: 'changed' }, undefined, f.entry.id);
  assert.notEqual(f.store.revision(date), before);
  for (const item of artifacts) {
    assert.equal(await f.cache.read(item.work.token), undefined);
    assert.equal(
      await f.cache.find(item.key, item === artifacts[0] ? 'images' : 'video'),
      undefined,
    );
    for (const name of item.names)
      await assert.rejects(f.cache.file(item.work.token, name), { status: 404 });
  }
  await assert.rejects(new VideoExports(f.cache).status(artifacts[1].work.token), { status: 404 });
  assert.equal(await readFile(lease.filename, 'utf8'), 'fixture');
  lease.release();
  await f.store.save(input, undefined, f.entry.id);
  assert.notEqual(f.store.revision(date), before);
  assert.ok(await f.cache.read(unaffected.work.token));
  const fresh = await f.save('video');
  const restart = new Store(f.dir);
  await restart.init();
  const cache = new ExportCache(f.dir, Date.now, restart);
  assert.ok(await cache.read(fresh.work.token));
  assert.equal(await cache.read(artifacts[1].work.token), undefined);
  assert.equal((await snapshot(restart, date))[0].sourceRevision, restart.revision(date));
});

test('create, cross-date edit, and delete invalidate exactly the affected dates', async (t) => {
  const f = await fixture(t);
  const original = f.store.revision(date);
  const newEntry = await f.store.save(input);
  assert.notEqual(f.store.revision(date), original);
  const first = await f.save('images');
  const second = await f.save('images', other);
  await f.store.save({ ...input, occurredAt: `${other}T06:30:00Z` }, undefined, newEntry.id);
  assert.equal(await f.cache.read(first.work.token), undefined);
  assert.equal(await f.cache.read(second.work.token), undefined);
  const fresh = await f.save('images', other);
  const unchanged = f.store.revision(date);
  await f.store.delete(newEntry.id);
  assert.equal(f.store.revision(date), unchanged);
  assert.equal(await f.cache.read(fresh.work.token), undefined);
  assert.equal(f.store.list(other).length, 0);
});

test('mutation aborts active work and prevents publication of an old snapshot', async (t) => {
  const f = await fixture(t);
  const active = await f.prepare('video');
  await f.store.save({ ...input, description: 'new' }, undefined, f.entry.id);
  assert.ok(active.work.signal.aborted);
  await assert.rejects(active.publish(), /动态已更新/);
  assert.equal(await f.cache.read(active.work.token), undefined);
  await f.cache.finish(active.work);
  assert.throws(() => f.cache.reserve(10000, date, active.work.sourceRevision), /动态已更新/);
  const unaffected = await f.prepare('images', other);
  await f.store.delete(f.entry.id);
  assert.equal(unaffected.work.signal.aborted, false);
  await unaffected.publish();
  await f.cache.finish(unaffected.work);
});

test('legacy entry arrays migrate atomically; old cache metadata and failed saves do not revive exports', async (t) => {
  const f = await fixture(t);
  await writeFile(path.join(f.dir, 'entries.json'), JSON.stringify([f.entry]));
  const legacy = new Store(f.dir);
  await legacy.init();
  const legacyRestart = new Store(f.dir);
  await legacyRestart.init();
  assert.equal(legacyRestart.revision(date), legacy.revision(date));
  await legacy.save(input, undefined, f.entry.id);
  const persisted = JSON.parse(await readFile(path.join(f.dir, 'entries.json'), 'utf8'));
  assert.equal(persisted.version, 1);
  assert.equal(persisted.revisions[date], legacy.revision(date));
  const artifact = await f.save('images');
  const metaPath = path.join(f.cache.dir, artifact.work.token, 'metadata.json');
  const meta = JSON.parse(await readFile(metaPath, 'utf8'));
  await writeFile(metaPath, JSON.stringify({ ...meta, version: 1, sourceRevision: undefined }));
  assert.equal(await f.cache.read(artifact.work.token), undefined);
  const revision = f.store.revision(date);
  const before = f.store.list(date);
  // Replacing the destination with a directory forces the atomic rename to fail.
  await rm(path.join(f.dir, 'entries.json'));
  await mkdir(path.join(f.dir, 'entries.json'));
  await assert.rejects(f.store.save({ ...input, description: 'must fail' }, undefined, f.entry.id));
  assert.equal(f.store.revision(date), revision);
  assert.deepEqual(f.store.list(date), before);
});

test('publication rechecks the version even if cancellation has not reached the renderer', async (t) => {
  const f = await fixture(t);
  const pending = await f.prepare('images');
  // Cancellation is an optimization; correctness must also hold without its notification.
  f.store.onDatesChanged = () => {};
  await f.store.save(
    { ...input, description: 'changed before publication' },
    undefined,
    f.entry.id,
  );
  assert.equal(pending.work.signal.aborted, false);
  await assert.rejects(pending.publish(), /动态已更新/);
  assert.equal(await f.cache.read(pending.work.token), undefined);
  await f.cache.finish(pending.work);
});
