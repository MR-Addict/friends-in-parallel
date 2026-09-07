import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { ImageExports, snapshot } from '../apps/server/src/exports.js';
import { Store } from '../apps/server/src/store.js';
import { HttpError } from '../apps/server/src/model.js';

test('Image exports reuse persistent content caches, deduplicate concurrent requests and recover expired/missing files', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'parallel-export-cache-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = new Store(dir);
  await store.init();
  await store.save({
    personId: 'lu-yuhan',
    description: '缓存测试',
    occurredAt: '2026-08-30T06:30:00Z',
    media: { type: 'sticker', stickerId: 'fluent-1f60a' },
  });
  const date = '2026-08-30';
  const items = await snapshot(store, date);
  const copyItems = () =>
    items.map((item) => ({ ...structuredClone(item), bytes: Buffer.from(item.bytes) }));
  const exporter = new ImageExports(dir);
  const launch = chromium.launch.bind(chromium);
  let launches = 0;
  const launcher = t.mock.method(chromium, 'launch', (...args: Parameters<typeof launch>) => {
    launches++;
    return launch(...args);
  });
  const [first, ...duplicates] = await Promise.all(
    Array.from({ length: 3 }, () => exporter.generate(items, date)),
  );
  assert.equal(launches, 1);
  for (const duplicate of duplicates) assert.deepEqual(duplicate, first);
  assert.equal((await readdir(exporter.dir)).length, 1);
  const token = first.images[0].split('/')[4];
  assert.equal(
    (await sharp(await readFile((await exporter.file(token, '1.png')).filename)).metadata()).width,
    1080,
  );
  assert.deepEqual(await new ImageExports(dir).generate(items, date), first);
  const unchanged = copyItems();
  unchanged[0].entry.updatedAt = '2026-09-01T00:00:00Z';
  assert.deepEqual(await exporter.generate(unchanged, date), first);
  assert.equal(launches, 1);

  // A cached day remains available while a different snapshot is rendering.
  let started!: () => void, release!: () => void;
  const start = new Promise<void>((resolve) => {
    started = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  launcher.mock.mockImplementation(async (...args: Parameters<typeof launch>) => {
    started();
    await gate;
    return launch(...args);
  });
  const changed = copyItems();
  changed[0].entry.description = '更新后的内容';
  const rendering = exporter.generate(changed, date);
  try {
    await start;
    assert.deepEqual(await exporter.generate(items, date), first);
    await assert.rejects(
      exporter.generate(items, '2026-08-29'),
      (error: HttpError) => error.status === 429,
    );
  } finally {
    release();
  }
  const next = await rendering;
  assert.notDeepEqual(next.images, first.images);
  assert.deepEqual(await exporter.generate(changed, date), next);

  // A miss must try rendering, never silently return a stale or partial cache.
  launcher.mock.mockImplementation(async () => {
    throw new HttpError(503, 'render attempted');
  });
  for (const mutate of [
    (copy: typeof items) => {
      copy[0].person.nickname = '新名字';
    },
    (copy: typeof items) => {
      copy[0].bytes = Buffer.from('changed asset');
    },
    (copy: typeof items) => {
      copy.push({ ...copy[0], entry: { ...copy[0].entry, id: 'new' } });
    },
    (copy: typeof items) => {
      copy[0].entry.occurredAt = '2026-08-30T07:30:00Z';
    },
  ]) {
    const copy = copyItems();
    mutate(copy);
    await assert.rejects(exporter.generate(copy, date), /render attempted/);
  }
  const metadataPath = path.join(exporter.dir, token, 'metadata.json');
  const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
  await writeFile(
    metadataPath,
    JSON.stringify({ ...metadata, expiresAt: new Date(0).toISOString() }),
  );
  await assert.rejects(exporter.generate(items, date), /render attempted/);
  await assert.rejects(exporter.file(token, '1.png'), (error: HttpError) => error.status === 404);
  await writeFile(metadataPath, JSON.stringify(metadata));
  for (const name of ['1.png', 'images.zip']) {
    const filename = path.join(exporter.dir, token, name);
    const bytes = await readFile(filename);
    await rm(filename);
    await assert.rejects(exporter.generate(items, date), /render attempted/);
    await writeFile(filename, bytes);
  }
  assert.deepEqual(await exporter.generate(items, date), first);
});
