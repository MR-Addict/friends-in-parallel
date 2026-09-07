import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, access, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { unzipSync, strFromU8 } from 'fflate';
import sharp from 'sharp';
import { createApp } from '../apps/server/src/app.js';
import { beijingDate, checkDate, type Entry } from '../apps/server/src/model.js';
import { partitionHeights, snapshot } from '../apps/server/src/exports.js';
import { Store } from '../apps/server/src/store.js';
const date = '2026-08-30';
async function fixture() {
  const dir = await mkdtemp(path.join(tmpdir(), 'parallel-test-'));
  const { app, store, dispose } = await createApp(dir);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  return {
    dir,
    store,
    origin,
    close: async () => {
      dispose();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(dir, { recursive: true, force: true });
    },
  };
}
const payload = (extra = {}) => ({
  personId: 'lu-yuhan',
  mediaType: 'sticker',
  stickerId: 'fluent-1f60a',
  description: '今天的小小日常',
  occurredAt: `${date}T06:30:00Z`,
  ...extra,
});
async function post(origin: string, body = payload()) {
  const res = await fetch(origin + '/api/entries', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { res, entry: (await res.json()) as Entry };
}
test('Beijing date boundaries and pagination preserve whole cards', () => {
  assert.equal(beijingDate(`${date}T15:59:59Z`), date);
  assert.equal(beijingDate(`${date}T16:00:00Z`), '2026-08-31');
  assert.throws(() => checkDate('2026-02-30'));
  assert.throws(() => checkDate('../data'));
  assert.deepEqual(partitionHeights([5000, 5000, 5000]), [[0, 1], [2]]);
});
test('Concurrent publishing persists every entry and supports edit/delete/restart', async () => {
  const f = await fixture();
  try {
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) => post(f.origin, payload({ description: `record ${i}` }))),
    );
    assert.ok(results.every((r) => r.res.status === 201));
    const list = (await (await fetch(`${f.origin}/api/entries?date=${date}`)).json()) as Entry[];
    assert.equal(list.length, 12);
    const persisted = JSON.parse(await readFile(path.join(f.dir, 'entries.json'), 'utf8'));
    assert.equal(persisted.length, 12);
    assert.equal('nickname' in persisted[0], false);
    const id = list[0].id;
    const edit = await fetch(f.origin + '/api/entries/' + id, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload({ description: 'changed', personId: 'shui-shui' })),
    });
    assert.equal(edit.status, 200);
    assert.equal((await edit.json()).description, 'changed');
    const restart = new Store(f.dir);
    await restart.init();
    assert.equal(restart.list(date).length, 12);
    assert.equal(restart.list(date).find((e) => e.id === id)?.personId, 'shui-shui');
    assert.equal((await fetch(f.origin + '/api/entries/' + id, { method: 'DELETE' })).status, 204);
    assert.equal((await fetch(f.origin + '/api/entries/' + id, { method: 'DELETE' })).status, 404);
    assert.equal(f.store.list(date).length, 11);
  } finally {
    await f.close();
  }
});
test('Validation rejects future times, unknown assets, oversized descriptions and malformed photos', async () => {
  const f = await fixture();
  try {
    for (const body of [
      payload({ personId: 'nobody' }),
      payload({ stickerId: 'external-url' }),
      payload({ description: '字'.repeat(501) }),
      payload({ occurredAt: '2099-01-01T00:00:00Z' }),
      payload({ occurredAt: 'not a date' }),
      payload({ mediaType: 'emoji', emoji: 'no' }),
      payload({ mediaType: 'photo', filename: '../../secret' }),
    ]) {
      assert.equal((await post(f.origin, body)).res.status, 400);
    }
    const form = new FormData();
    Object.entries(payload({ mediaType: 'photo' })).forEach(([k, v]) => form.set(k, v));
    form.set('photo', new Blob(['not an image'], { type: 'image/png' }), 'bad.png');
    assert.equal(
      (await fetch(f.origin + '/api/entries', { method: 'POST', body: form })).status,
      400,
    );
    const big = new FormData();
    Object.entries(payload({ mediaType: 'photo' })).forEach(([k, v]) => big.set(k, v));
    big.set(
      'photo',
      new Blob([new Uint8Array(20 * 1024 * 1024 + 1)], { type: 'image/png' }),
      'huge.png',
    );
    assert.equal(
      (await fetch(f.origin + '/api/entries', { method: 'POST', body: big })).status,
      400,
    );
    assert.equal(f.store.list(date).length, 0);
  } finally {
    await f.close();
  }
});
test('Original photo bytes survive export, retained-photo edits work, replacement cleans up', async () => {
  const f = await fixture();
  try {
    const bytes = await sharp({
      create: { width: 24, height: 40, channels: 3, background: '#e7bb93' },
    })
      .png()
      .toBuffer();
    const form = new FormData();
    Object.entries(payload({ mediaType: 'photo', description: '=formula\n中文,原图' })).forEach(
      ([k, v]) => form.set(k, v),
    );
    form.set('photo', new Blob([new Uint8Array(bytes)], { type: 'image/png' }), '照片.png');
    const res = await fetch(f.origin + '/api/entries', { method: 'POST', body: form });
    assert.equal(res.status, 201);
    const entry = (await res.json()) as Entry;
    assert.equal(entry.media.type, 'photo');
    if (entry.media.type !== 'photo') return;
    const filename = entry.media.filename;
    assert.deepEqual(
      Buffer.from(await (await fetch(f.origin + '/uploads/' + filename)).arrayBuffer()),
      bytes,
    );
    const retained = await fetch(f.origin + '/api/entries/' + entry.id, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload({ mediaType: 'photo', filename, description: '保留原图' })),
    });
    assert.equal(retained.status, 200);
    await post(f.origin, payload({ mediaType: 'emoji', emoji: '😊' }));
    await post(f.origin, payload({ stickerId: 'twemoji-1f60a' }));
    await post(f.origin, payload({ stickerId: 'openmoji-1f60a' }));
    const archive = await fetch(`${f.origin}/api/exports/archive?date=${date}`);
    assert.equal(archive.status, 200);
    const zipfile = path.join(f.dir, 'archive.zip');
    await writeFile(zipfile, Buffer.from(await archive.arrayBuffer()));
    const contents = unzipSync(new Uint8Array(await readFile(zipfile)));
    const manifest = JSON.parse(strFromU8(contents['manifest.json'])) as {
      path: string;
      nickname: string;
      mediaType: string;
    }[];
    assert.equal(manifest.length, 4);
    assert.equal(manifest[0].nickname, '陆语涵');
    assert.ok(manifest.every((item) => contents[item.path]));
    assert.ok(contents['licenses/openmoji.txt']);
    const csv = strFromU8(contents['manifest.csv']);
    assert.ok(csv.includes('陆语涵'));
    assert.ok(csv.includes('保留原图'));
    assert.deepEqual(
      Buffer.from(contents[manifest.find((item) => item.mediaType === 'photo')!.path]),
      bytes,
    );
    const snap = await snapshot(f.store, date);
    await fetch(f.origin + '/api/entries/' + entry.id, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload()),
    });
    await assert.rejects(access(path.join(f.store.uploads, filename)));
    assert.deepEqual(snap.find((i) => i.entry.id === entry.id)?.bytes, bytes);
  } finally {
    await f.close();
  }
});
test('Invalid date and empty export return clear errors; missing image is not silently skipped', async () => {
  const f = await fixture();
  try {
    assert.equal((await fetch(f.origin + '/api/entries?date=2026-02-30')).status, 400);
    assert.equal((await fetch(f.origin + '/api/exports/archive?date=' + date)).status, 400);
    await post(f.origin);
    assert.equal((await fetch(f.origin + '/api/exports/files/not-a-token/1.png')).status, 404);
    assert.equal((await fetch(f.origin + '/api/unknown')).status, 404);
    assert.equal((await readdir(f.store.uploads)).length, 0);
    await f.store.save(
      {
        personId: 'lu-yuhan',
        description: 'missing photo',
        occurredAt: date + 'T00:00:00Z',
        media: { type: 'photo', filename: 'missing.png', mime: 'image/png' },
      },
      Buffer.from('fixture'),
    );
    await rm(path.join(f.store.uploads, 'missing.png'));
    const missing = await fetch(f.origin + '/api/exports/archive?date=' + date);
    assert.equal(missing.status, 409);
    assert.match((await missing.json()).error, /素材缺失/);
    const empty = await fetch(f.origin + '/api/entries', { method: 'POST' });
    assert.equal(empty.status, 400);
  } finally {
    await f.close();
  }
});

test('Sharing groups ascending hours while pagination keeps complete hourly rows', async () => {
  const { hourRows, partitionHourRows, shareTemplate } =
    await import('../apps/server/src/exports.js');
  const f = await fixture();
  try {
    const late = (
      await post(f.origin, payload({ personId: 'shui-shui', occurredAt: `${date}T02:50:00Z` }))
    ).entry;
    const early = (await post(f.origin, payload({ occurredAt: `${date}T01:10:00Z` }))).entry;
    const middle = (await post(f.origin, payload({ occurredAt: `${date}T02:10:00Z` }))).entry;
    const items = await snapshot(f.store, date);
    assert.deepEqual(
      items.map((i) => i.entry.id),
      [early.id, middle.id, late.id],
    );
    const rows = hourRows(items);
    assert.deepEqual(rows, [
      { hour: '09', indices: [0] },
      { hour: '10', indices: [1, 2] },
    ]);
    const html = shareTemplate(items, rows, [0, 1], date, 1, 1);
    assert.ok(html.indexOf('09:00–09:59') < html.indexOf('10:00–10:59'));
    assert.ok(
      html.indexOf(`data-entry-id="${middle.id}"`) < html.indexOf(`data-entry-id="${late.id}"`),
    );
    assert.ok(html.includes('2 位朋友 · 2 条动态'));
    const grouped = [
      { hour: '09', indices: [0] },
      { hour: '10', indices: [1] },
      { hour: '10', indices: [2] },
    ];
    assert.deepEqual(partitionHourRows(grouped, [400, 300, 300], 1000, 100), [[0], [1, 2]]);
    const pages = partitionHourRows(grouped, [400, 500, 500], 1000, 100);
    assert.deepEqual(pages, [[0], [1], [2]]);
    assert.ok(shareTemplate(items, grouped, pages[2], date, 3, 3).includes('10:00–10:59（续）'));
    assert.throws(() => partitionHourRows(grouped, [2000, 300, 300], 1000, 100));
  } finally {
    await f.close();
  }
});

test('Calendar counts use Beijing dates and reflect edits and deletions', async () => {
  const f = await fixture();
  try {
    const { entry: first } = await post(f.origin, payload({ occurredAt: '2024-02-28T16:00:00Z' }));
    const { entry: second } = await post(f.origin, payload({ occurredAt: '2024-02-29T15:59:00Z' }));
    await post(f.origin, payload({ occurredAt: '2024-02-29T16:00:00Z' }));
    const counts = async () => (await fetch(f.origin + '/api/entry-dates?month=2024-02')).json();
    assert.deepEqual(await counts(), { '2024-02-29': 2 });
    await fetch(f.origin + '/api/entries/' + first.id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload({ occurredAt: '2024-03-01T00:00:00Z' })),
    });
    assert.deepEqual(await counts(), { '2024-02-29': 1 });
    await fetch(f.origin + '/api/entries/' + second.id, { method: 'DELETE' });
    assert.deepEqual(await counts(), {});
    assert.equal((await fetch(f.origin + '/api/entry-dates?month=2024-13')).status, 400);
    assert.equal((await fetch(f.origin + '/api/entry-dates')).status, 400);
  } finally {
    await f.close();
  }
});
