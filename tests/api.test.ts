import { personById } from '../apps/server/src/config.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, access, writeFile, readdir, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
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
async function fixture(notify: (entry: Entry) => Promise<void> = async () => {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'parallel-test-'));
  const { app, store, dispose } = await createApp(dir, notify);
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
    assert.equal(persisted.entries.length, 12);
    assert.equal('nickname' in persisted.entries[0], false);
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
test('Incomplete multipart uploads return 400 without creating or replacing an entry', async () => {
  const notifications: Entry[] = [];
  const f = await fixture(async (entry) => {
    notifications.push(entry);
  });
  try {
    const { entry } = await post(f.origin);
    const before = f.store.list(date);
    const notified = notifications.length;
    const boundary = 'test-mobile-upload';
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="photo"; filename="phone.jpg"',
      'Content-Type: image/jpeg',
      '',
      'truncated photo without closing boundary',
    ].join('\r\n');
    for (const method of ['POST', 'PATCH']) {
      for (const contentType of [
        `multipart/form-data; boundary=${boundary}`,
        'multipart/form-data',
      ]) {
        const res = await fetch(
          f.origin + '/api/entries' + (method === 'PATCH' ? `/${entry.id}` : ''),
          {
            method,
            headers: { 'content-type': contentType },
            body,
            signal: AbortSignal.timeout(5000),
          },
        );
        assert.equal(res.status, 400);
        assert.match((await res.json()).error, /上传内容不完整/);
        assert.deepEqual(f.store.list(date), before);
        assert.deepEqual(await readdir(f.store.uploads), []);
        assert.equal(notifications.length, notified);
      }
    }
    assert.equal((await post(f.origin)).res.status, 201);
  } finally {
    await f.close();
  }
});
test('Stored photo bytes survive export, retained-photo edits work, replacement cleans up', async () => {
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
    const storedBytes = Buffer.from(
      await (await fetch(f.origin + '/uploads/' + filename)).arrayBuffer(),
    );
    assert.ok(storedBytes.length <= bytes.length);
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
    assert.equal(manifest[0].nickname, personById('lu-yuhan').nickname);
    assert.ok(manifest.every((item) => contents[item.path]));
    assert.ok(manifest.every((item) => !item.path.includes('_')));
    assert.ok(contents['licenses/openmoji.txt']);
    const csv = strFromU8(contents['manifest.csv']);
    assert.ok(csv.includes(personById('lu-yuhan').nickname));
    assert.ok(csv.includes('保留原图'));
    assert.deepEqual(
      Buffer.from(contents[manifest.find((item) => item.mediaType === 'photo')!.path]),
      storedBytes,
    );
    const snap = await snapshot(f.store, date);
    await fetch(f.origin + '/api/entries/' + entry.id, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload()),
    });
    await assert.rejects(access(path.join(f.store.uploads, filename)));
    assert.deepEqual(snap.find((i) => i.entry.id === entry.id)?.bytes, storedBytes);
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

test('only successful new publications notify; notification failure preserves the saved entry', async () => {
  const notifications: Entry[] = [];
  const f = await fixture(async (entry) => {
    notifications.push(entry);
    throw new Error('offline');
  });
  try {
    const { res, entry } = await post(f.origin);
    assert.equal(res.status, 201);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].id, entry.id);
    assert.equal(f.store.list(date).length, 1);
    assert.equal((await post(f.origin, payload({ personId: 'invalid' }))).res.status, 400);
    assert.equal(
      (
        await fetch(`${f.origin}/api/entries/${entry.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload()),
        })
      ).status,
      200,
    );
    assert.equal(
      (await fetch(`${f.origin}/api/entries/${entry.id}`, { method: 'DELETE' })).status,
      204,
    );
    assert.equal(notifications.length, 1);
  } finally {
    await f.close();
  }
});

test('Compression failures preserve valid originals up to 20 MiB and converted HEIC, including edits and archives', async (t) => {
  const f = await fixture();
  try {
    const png = await sharp({ create: { width: 24, height: 40, channels: 3, background: 'red' } })
      .png()
      .toBuffer();
    const originals = [
      Buffer.alloc(3_500_000),
      Buffer.alloc(20 * 1024 * 1024),
      await readFile('tests/fixtures/photo.heic'),
    ];
    png.copy(originals[0]);
    png.copy(originals[1]);
    t.mock.method(sharp.prototype, 'webp', () => {
      throw new Error('Compression failed');
    });
    let id: string | undefined;
    let storedBytes: Buffer | undefined;
    for (const [index, bytes] of originals.entries()) {
      const form = new FormData();
      Object.entries(payload({ mediaType: 'photo' })).forEach(([k, v]) => form.set(k, v));
      form.set(
        'photo',
        new Blob([new Uint8Array(bytes)], { type: 'application/octet-stream' }),
        'iphone',
      );
      const response = await fetch(f.origin + '/api/entries' + (id ? '/' + id : ''), {
        method: id ? 'PATCH' : 'POST',
        body: form,
      });
      assert.equal(response.status, id ? 200 : 201);
      const entry = (await response.json()) as Entry;
      id = entry.id;
      assert.equal(entry.media.type, 'photo');
      if (entry.media.type !== 'photo') throw new Error('Expected photo');
      assert.equal(entry.media.mime, 'image/png');
      storedBytes = Buffer.from(
        await (await fetch(f.origin + '/uploads/' + entry.media.filename)).arrayBuffer(),
      );
      if (index < 2) assert.deepEqual(storedBytes, bytes);
      else assert.equal((await sharp(storedBytes).metadata()).width, 640);
      const retained = await fetch(f.origin + '/api/entries/' + id, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload({ mediaType: 'photo', filename: entry.media.filename })),
      });
      assert.equal(retained.status, 200);
    }
    const snap = await snapshot(f.store, date);
    assert.equal(snap[0].mime, 'image/png');
    const zip = unzipSync(
      new Uint8Array(
        await (await fetch(f.origin + '/api/exports/archive?date=' + date)).arrayBuffer(),
      ),
    );
    const manifest = JSON.parse(strFromU8(zip['manifest.json']));
    assert.deepEqual(Buffer.from(zip[manifest[0].path]), storedBytes);
  } finally {
    await f.close();
  }
});

test('Conversion failures neither publish nor replace the existing photo or notify', async () => {
  const notifications: Entry[] = [];
  const f = await fixture(async (entry) => {
    notifications.push(entry);
  });
  try {
    const valid = await sharp({ create: { width: 24, height: 40, channels: 3, background: 'red' } })
      .png()
      .toBuffer();
    const formFor = (bytes: Buffer) => {
      const form = new FormData();
      Object.entries(payload({ mediaType: 'photo' })).forEach(([k, v]) => form.set(k, v));
      form.set('photo', new Blob([new Uint8Array(bytes)]), 'iphone.HEIC');
      return form;
    };
    const saved = await fetch(f.origin + '/api/entries', { method: 'POST', body: formFor(valid) });
    assert.equal(saved.status, 201);
    const entry = (await saved.json()) as Entry;
    const files = await readdir(f.store.uploads);
    for (const broken of [
      (await readFile('tests/fixtures/photo.heic')).subarray(0, 24),
      valid.subarray(0, 8),
    ]) {
      for (const id of ['', '/' + entry.id]) {
        const response = await fetch(f.origin + '/api/entries' + id, {
          method: id ? 'PATCH' : 'POST',
          body: formFor(broken),
        });
        assert.equal(response.status, 400);
        assert.match((await response.json()).error, /转换失败|无法读取/);
        assert.deepEqual(f.store.list(date), [entry]);
        assert.deepEqual(await readdir(f.store.uploads), files);
      }
    }
    assert.equal(notifications.length, 1);
  } finally {
    await f.close();
  }
});

test('every export request cleans legacy caches while ordinary API and upload requests leave them alone', async () => {
  const f = await fixture();
  try {
    const legacy = path.join(f.dir, 'exports', randomUUID());
    await mkdir(legacy, { recursive: true });
    await writeFile(
      path.join(legacy, 'metadata.json'),
      JSON.stringify({ expiresAt: new Date(0).toISOString(), pages: 1 }),
    );
    await fetch(`${f.origin}/api/entries?date=${date}`);
    await fetch(`${f.origin}/uploads/missing.png`);
    await access(legacy);
    assert.equal((await fetch(`${f.origin}/api/exports/music/unknown`)).status, 404);
    await assert.rejects(access(legacy));
  } finally {
    await f.close();
  }
});

for (const invalidation of ['changed day', 'expired files']) {
  test(`validity, video status and conditional artifact requests reject ${invalidation}`, async () => {
    const f = await fixture();
    const { ExportCache, contentFingerprint } = await import('../apps/server/src/export-cache.js');
    const cache = new ExportCache(f.dir, Date.now, f.store);
    try {
      const { entry } = await post(f.origin);
      const tokens: string[] = [];
      const etags = new Map<string, string>();
      for (const kind of ['images', 'video'] as const) {
        const work = cache.reserve(10000, date, f.store.revision(date));
        // Stage outside the server cache: the fixture's publisher is a separate instance.
        work.dir = path.join(f.dir, `stage-${work.token}`);
        await mkdir(cache.dir, { recursive: true });
        await mkdir(work.dir, { recursive: true });
        const names = kind === 'images' ? ['1.png'] : ['video.mp4', 'cover.jpg'];
        for (const name of names) await writeFile(path.join(work.dir, name), 'fixture');
        await cache.publish(
          work,
          kind,
          contentFingerprint([], [kind]),
          date,
          Object.fromEntries(names.map((name) => [name, name])),
          (expiresAt) => {
            const prefix = `/api/exports/files/${work.token}/`;
            return kind === 'images'
              ? { images: [prefix + '1.png'], expiresAt }
              : {
                  videoUrl: prefix + 'video.mp4',
                  coverUrl: prefix + 'cover.jpg',
                  duration: 1,
                  styleId: 'paper',
                  musicId: 'none',
                  expiresAt,
                };
          },
        );
        await cache.finish(work);
        tokens.push(work.token);
        assert.equal((await fetch(`${f.origin}/api/exports/${work.token}/validity`)).status, 204);
        for (const name of names) {
          const url = `${f.origin}/api/exports/files/${work.token}/${name}`;
          const response = await fetch(url);
          assert.equal(response.status, 200);
          assert.equal(response.headers.get('cache-control'), 'private, no-cache');
          assert.equal(decodeURIComponent(response.headers.get('x-export-filename')!), name);
          const etag = response.headers.get('etag')!;
          assert.ok(etag);
          etags.set(`${work.token}/${name}`, etag);
          await response.arrayBuffer();
          const cached = await fetch(url, {
            headers: { 'If-None-Match': etag, 'Cache-Control': 'max-age=0' },
          });
          assert.equal(cached.status, 304);
          assert.equal(cached.headers.get('cache-control'), 'private, no-cache');
          const modified = await fetch(url, {
            headers: {
              'If-Modified-Since': response.headers.get('last-modified')!,
              'Cache-Control': 'max-age=0',
            },
          });
          assert.equal(modified.status, 304);
          const range = await fetch(url, { headers: { Range: 'bytes=0-2' } });
          assert.equal(range.status, 206);
          assert.equal((await range.arrayBuffer()).byteLength, 3);
          const attachment = await fetch(url + '?download=1');
          assert.match(attachment.headers.get('content-disposition')!, /attachment/);
          await attachment.arrayBuffer();
        }
      }
      assert.equal((await fetch(`${f.origin}/api/exports/videos/${tokens[1]}`)).status, 200);
      if (invalidation === 'changed day') {
        await fetch(`${f.origin}/api/entries/${entry.id}`, { method: 'DELETE' });
      } else {
        for (const token of tokens) {
          const filename = path.join(cache.dir, token, 'metadata.json');
          const meta = JSON.parse(await readFile(filename, 'utf8'));
          meta.expiresAt = new Date(Date.now() - 1000).toISOString();
          meta.completedAt = new Date(Date.parse(meta.expiresAt) - 86400_000).toISOString();
          meta.result.expiresAt = meta.expiresAt;
          await writeFile(filename, JSON.stringify(meta));
        }
      }
      for (const token of tokens) {
        assert.equal((await fetch(`${f.origin}/api/exports/${token}/validity`)).status, 404);
        for (const name of ['1.png', 'video.mp4', 'cover.jpg']) {
          const response = await fetch(`${f.origin}/api/exports/files/${token}/${name}`, {
            headers: {
              'If-None-Match': etags.get(`${token}/${name}`) || '*',
              'Cache-Control': 'max-age=0',
            },
          });
          assert.equal(response.status, 404);
          assert.equal(response.headers.get('cache-control'), 'no-store');
        }
      }
      assert.equal((await fetch(`${f.origin}/api/exports/videos/${tokens[1]}`)).status, 404);
    } finally {
      await cache.dispose();
      await f.close();
    }
  });
}

test('post exports isolate one entry, cache PNGs only and invalidate after edits', async () => {
  const f = await fixture();
  try {
    const { entry } = await post(f.origin);
    const { entry: broken } = await post(f.origin);
    // A missing asset belonging to another post must not block this export.
    await f.store.save(
      { ...broken, media: { type: 'photo', filename: 'missing.png', mime: 'image/png' } },
      Buffer.from('temporary asset'),
      broken.id,
    );
    await rm(path.join(f.store.uploads, 'missing.png'));
    const generate = (entryId: unknown = entry.id) =>
      fetch(f.origin + '/api/exports/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, entryId }),
      });
    assert.equal((await generate(null)).status, 400);
    assert.equal((await generate('missing')).status, 404);
    const response = await generate();
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.images.length, 1);
    assert.equal('archiveUrl' in result, false);
    assert.deepEqual(await (await generate()).json(), result);
    const png = await fetch(f.origin + result.images[0]);
    assert.equal(png.status, 200);
    assert.equal((await sharp(Buffer.from(await png.arrayBuffer())).metadata()).width, 1080);
    assert.equal(
      (await fetch(f.origin + result.images[0].replace('1.png', 'images.zip'))).status,
      404,
    );
    await f.store.save({ ...entry, description: '已修改' }, undefined, entry.id);
    assert.equal((await fetch(f.origin + result.images[0])).status, 404);
    await f.store.delete(entry.id);
    assert.equal((await generate()).status, 404);
  } finally {
    await f.close();
  }
});
