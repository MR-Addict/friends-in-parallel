import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, readdir, mkdir, copyFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import { chromium } from '@playwright/test';
import { ExportCache } from '../apps/server/src/export-cache.js';
import { VideoExports } from '../apps/server/src/video-exports.js';
import {
  videoMusic,
  videoStyles,
  musicBytes,
  videoSelection,
} from '../apps/server/src/video-catalog.js';
import { videoProcess } from '../apps/server/src/video-process.js';
import {
  videoScenes,
  videoTemplate,
  loadVideoScene,
  renderVideo,
} from '../apps/server/src/video-renderer.js';
import { publicDir } from '../apps/server/src/config.js';
import { snapshot, ImageExports } from '../apps/server/src/exports.js';
import { optimizePhoto } from '../apps/server/src/photos.js';
import { createApp } from '../apps/server/src/app.js';
import { Store } from '../apps/server/src/store.js';
import { HttpError } from '../apps/server/src/model.js';

const date = '2026-08-30';
async function data(t: { after: (fn: () => Promise<void>) => void }) {
  const dir = await mkdtemp(path.join(tmpdir(), 'parallel-video-'));
  const cache = new ExportCache(dir),
    store = new Store(dir);
  await store.init();
  t.after(async () => {
    await cache.dispose();
    await rm(dir, { recursive: true, force: true });
  });
  await store.save({
    personId: 'lu-yuhan',
    description: '今天也有小小的快乐。',
    occurredAt: `${date}T06:30:00Z`,
    media: { type: 'sticker', stickerId: 'fluent-1f60a' },
  });
  return { dir, cache, store, items: await snapshot(store, date) };
}
async function complete(videos: VideoExports, id: string) {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const job = await videos.status(id);
    if (job.status !== 'rendering') {
      assert.equal(job.status, 'ready', job.error);
      return job;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Video test timed out');
}
test('all 24 bundled tracks have matching checksums and can be decoded and encoded as AAC', async () => {
  assert.equal(videoStyles.length, 12);
  assert.equal(videoMusic.length, 24);
  assert.equal(new Set(videoMusic.map((music) => music.sha256)).size, 24);
  for (const style of videoStyles) videoSelection(style.id, style.defaultMusicId);
  for (const music of videoMusic) {
    assert.ok((await musicBytes(music)).length > 10_000);
    await videoProcess(
      'ffmpeg',
      [
        '-v',
        'error',
        '-i',
        path.join(publicDir, music.file),
        '-t',
        '0.1',
        '-map',
        '0:a:0',
        '-c:a',
        'aac',
        '-f',
        'null',
        '-',
      ],
      AbortSignal.timeout(10_000),
    );
  }
});
test('video layouts preserve 500 characters, blank lines, emoji and all media without clipping', async (t) => {
  const f = await data(t);
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  const text = '文字<&>\n\n👩‍👩‍👧‍👦'.repeat(35);
  f.items[0].entry.description = text;
  for (const stickerId of ['twemoji-1f60a', 'openmoji-1f60a']) {
    await f.store.save({
      personId: 'shui-shui',
      description: '另一位朋友的瞬间',
      occurredAt: `${date}T07:00:00Z`,
      media: { type: 'sticker', stickerId },
    });
  }
  await f.store.save({
    personId: 'shui-shui',
    description: '旧表情也在这里',
    occurredAt: `${date}T08:00:00Z`,
    media: { type: 'emoji', emoji: '😊' },
  });
  const photo = await optimizePhoto(
    await readFile(new URL('fixtures/photo.heic', import.meta.url)),
    'heic',
  );
  await f.store.save(
    {
      personId: 'lu-yuhan',
      description: '照片完整展示',
      occurredAt: `${date}T09:00:00Z`,
      media: { type: 'photo', filename: `sample.${photo.extension}`, mime: photo.mime },
    },
    photo.bytes,
  );
  f.items.push(...(await snapshot(f.store, date)).slice(1));
  const font = await readFile(path.join(publicDir, 'fonts/NotoSansCJKsc-Regular.otf'));
  await page.route('**/*', async (route) => {
    if (route.request().url().endsWith('font.otf'))
      return route.fulfill({
        body: font,
        contentType: 'font/otf',
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    const index = Number(new URL(route.request().url()).pathname.split('/').pop());
    return route.fulfill({ body: f.items[index].bytes, contentType: f.items[index].mime });
  });
  for (const style of videoStyles) {
    const scenes = await videoScenes(page, f.items, date, style, videoMusic[0]);
    const entries = scenes.filter((scene) => scene.kind === 'entry');
    assert.ok(entries.length > 1);
    assert.equal(
      entries
        .filter((scene) => scene.itemIndex === 0)
        .map((scene) => scene.text)
        .join(''),
      text,
    );
    assert.deepEqual([...new Set(entries.map((scene) => scene.itemIndex))], [0, 1, 2, 3, 4]);
    assert.equal(scenes[1].title, '14:00');
    for (const scene of entries) {
      await loadVideoScene(page, scene, f.items, date, style);
      assert.equal(await page.locator('.copy').textContent(), scene.text);
      const ink = await page.locator('.frame').evaluate((node) => getComputedStyle(node).color);
      assert.equal(
        await page.locator('.copy').evaluate((node) => getComputedStyle(node).color),
        ink,
      );
      if (['cinema', 'film', 'night', 'neon', 'pixel'].includes(style.id))
        assert.notEqual(ink, 'rgb(0, 0, 0)');
      assert.ok(await page.locator('.copy').evaluate((node) => node.scrollHeight <= 576));
      assert.ok(
        await page.locator('.card').evaluate((node) => node.getBoundingClientRect().bottom < 1820),
      );
    }
    assert.ok(!videoTemplate(entries[0], f.items, date, style).includes('文字<&>'));
  }
  f.items[0].entry.description = '字'.repeat(500);
  const long = await videoScenes(page, f.items, date, videoStyles[0]);
  assert.equal(
    long
      .filter((scene) => scene.itemIndex === 0)
      .map((scene) => scene.text)
      .join(''),
    '字'.repeat(500),
  );
});
test('real MP4 exports deduplicate, survive restart, expose ranged downloads and share image admission', async (t) => {
  const f = await data(t),
    videos = new VideoExports(f.cache);
  const [a, b] = await Promise.all([
    videos.start(f.items, date, 'paper', 'carefree'),
    videos.start(f.items, date, 'paper', 'carefree'),
  ]);
  assert.equal(a.jobId, b.jobId);
  await assert.rejects(
    new ImageExports(f.cache).generate(f.items, date),
    (e: HttpError) => e.status === 429,
  );
  await assert.rejects(
    videos.start(f.items, date, 'night', 'none'),
    (e: HttpError) => e.status === 429,
  );
  const done = await complete(videos, a.jobId);
  assert.ok(done.result!.duration > 10);
  assert.deepEqual(
    await new VideoExports(new ExportCache(f.dir)).start(f.items, date, 'paper', 'carefree'),
    done,
  );
  f.items[0].entry.updatedAt = new Date().toISOString();
  assert.equal((await videos.start(f.items, date, 'paper', 'carefree')).jobId, done.jobId);
  assert.deepEqual((await readdir(path.join(f.cache.dir, done.jobId))).sort(), [
    'cover.jpg',
    'metadata.json',
    'video.mp4',
  ]);
  const noMusic = await complete(
    videos,
    (await videos.start(f.items, date, 'paper', 'none')).jobId,
  );
  assert.notEqual(noMusic.jobId, done.jobId);
  const app = await createApp(f.dir, async () => {});
  const server = app.app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await app.dispose();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const range = await fetch(origin + done.result!.videoUrl, { headers: { range: 'bytes=0-1023' } });
  assert.equal(range.status, 206);
  assert.equal((await range.arrayBuffer()).byteLength, 1024);
  const download = await fetch(origin + done.result!.videoUrl + '?download=1');
  assert.match(download.headers.get('content-disposition')!, /attachment/);
  await download.arrayBuffer();
  assert.equal(
    (await fetch(origin + '/api/exports/music/carefree', { headers: { range: 'bytes=0-100' } }))
      .status,
    206,
  );
  assert.equal((await fetch(origin + '/api/exports/videos/not-a-token')).status, 404);
  assert.equal(
    (
      await fetch(origin + '/api/exports/videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, styleId: '../', musicId: 'none' }),
      })
    ).status,
    400,
  );
});
test('encoder cancellation terminates its child and failed jobs release the render slot', async (t) => {
  const signal = AbortSignal.timeout(80);
  await assert.rejects(
    videoProcess(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], signal),
    /timeout/i,
  );
  const f = await data(t),
    videos = new VideoExports(f.cache);
  const launch = t.mock.method(chromium, 'launch', async () => {
    throw new Error('test renderer failure');
  });
  const job = await videos.start(f.items, date, 'paper', 'none');
  let status = await videos.status(job.jobId);
  while (status.status === 'rendering') {
    await new Promise((resolve) => setTimeout(resolve, 10));
    status = await videos.status(job.jobId);
  }
  assert.equal(status.status, 'failed');
  await f.cache.dispose();
  assert.deepEqual(await readdir(f.cache.dir), []);
  launch.mock.restore();
});

// Explicit full-catalog QA retains playable samples and frames for visual inspection.
test(
  'all twelve styles produce playable real samples',
  { skip: !process.env.VIDEO_QA },
  async (t) => {
    const f = await data(t),
      videos = new VideoExports(f.cache);
    const out = path.resolve(process.env.VIDEO_QA_DIR || 'test-results/video-samples');
    await mkdir(out, { recursive: true });
    for (const style of videoStyles) {
      const job = await complete(
        videos,
        (await videos.start(f.items, date, style.id, style.defaultMusicId)).jobId,
      );
      const file = (await f.cache.file(job.jobId, 'video.mp4')).filename;
      await copyFile(file, path.join(out, `${style.id}.mp4`));
      await videoProcess(
        'ffmpeg',
        [
          '-v',
          'error',
          '-y',
          '-ss',
          '7',
          '-i',
          file,
          '-frames:v',
          '1',
          path.join(out, `${style.id}.jpg`),
        ],
        AbortSignal.timeout(20_000),
      );
      const second = await complete(
        videos,
        (await videos.start(f.items, date, style.id, style.secondMusicId)).jobId,
      );
      assert.ok(second.result!.duration > 0);
    }
  },
);

test('short background music loops through the full video, and the final audio matches its duration', async (t) => {
  const f = await data(t);
  const audio = path.join(f.dir, 'short.mp3');
  await videoProcess(
    'ffmpeg',
    [
      '-v',
      'error',
      '-y',
      '-i',
      path.join(publicDir, videoMusic[0].file),
      '-t',
      '0.5',
      '-c:a',
      'libmp3lame',
      audio,
    ],
    AbortSignal.timeout(10_000),
  );
  const work = f.cache.reserve(30_000);
  try {
    const result = await renderVideo(
      work,
      f.items,
      date,
      videoStyles[0],
      videoMusic[0],
      await readFile(audio),
      await readFile(path.join(publicDir, 'fonts/NotoSansCJKsc-Regular.otf')),
      () => {},
    );
    assert.ok(result.duration > 10);
    const info = JSON.parse(
      await videoProcess(
        'ffprobe',
        ['-v', 'error', '-show_streams', '-of', 'json', path.join(work.dir, 'video.mp4')],
        work.signal,
      ),
    );
    const stream = info.streams.find(
      (stream: { codec_type: string }) => stream.codec_type === 'audio',
    );
    assert.ok(Math.abs(Number(stream.duration) - result.duration) < 0.1);
  } finally {
    await f.cache.finish(work);
  }
});
