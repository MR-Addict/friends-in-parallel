import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
import type { SnapshotItem } from '../apps/server/src/exports.js';
import {
  balancedPages,
  videoGroups,
  layoutCandidates,
  chooseLayout,
  layoutSeed,
  mediaShapes,
} from '../apps/server/src/video-layout.js';
import {
  videoScenes,
  loadVideoScene,
  measureVideoScene,
} from '../apps/server/src/video-renderer.js';
import { videoStyles, videoMusic } from '../apps/server/src/video-catalog.js';
import { publicDir } from '../apps/server/src/config.js';

function item(id: number, hour: number, description = ''): SnapshotItem {
  return {
    entry: {
      id: String(id),
      personId: 'test',
      occurredAt: `2026-09-07T${String(hour - 8).padStart(2, '0')}:15:00Z`,
      createdAt: '',
      updatedAt: '',
      description,
      media: { type: 'sticker', stickerId: 'test' },
    },
    person: { id: 'test', nickname: '朋友名字', color: '#a06d42', background: '#fff', avatar: '' },
    bytes: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><circle cx="100" cy="100" r="90" fill="#fbbf24"/></svg>',
    ),
    mime: 'image/svg+xml',
    extension: 'svg',
    filename: '',
    credit: '',
  };
}

test('hour groups sort input, merge only adjacent singleton hours and balance pages at six', () => {
  const items = [item(3, 21), item(1, 18), item(2, 19), item(5, 22), item(4, 21)];
  assert.deepEqual(
    videoGroups(items).map((g) => [g.title, g.indices.map((i) => items[i].entry.id)]),
    [
      ['18:00 — 19:59', ['1', '2']],
      ['21:00', ['3', '4']],
      ['22:00', ['5']],
    ],
  );
  assert.deepEqual(
    balancedPages(Array.from({ length: 7 }, (_, i) => i)).map((p) => p.length),
    [4, 3],
  );
  assert.deepEqual(
    balancedPages(Array.from({ length: 13 }, (_, i) => i)).map((p) => p.length),
    [5, 4, 4],
  );
  assert.deepEqual(
    videoGroups(Array.from({ length: 7 }, (_, i) => item(i, i + 8))).map((g) => g.indices.length),
    [6, 1],
  );
  assert.deepEqual(
    videoGroups([item(0, 18), item(1, 20)]).map((g) => g.indices.length),
    [1, 1],
  );
  assert.deepEqual(videoGroups([]), []);
});

test('photo shapes respect EXIF orientation and seeded layouts are reproducible', async () => {
  const photo = item(0, 12);
  photo.bytes = await sharp({
    create: { width: 800, height: 400, channels: 3, background: '#aabbcc' },
  })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();
  photo.entry.media = { type: 'photo', filename: 'test.jpg', mime: 'image/jpeg' };
  const shapes = await mediaShapes([photo]);
  assert.deepEqual(shapes[0], { width: 400, height: 800, kind: 'portrait' });
  const candidates = [
    { id: 'a', score: 1 },
    { id: 'b', score: 0.97 },
    { id: 'bad', score: 0.2 },
  ];
  const seed = layoutSeed([photo], '2026-09-07', 'paper');
  assert.equal(chooseLayout(candidates, seed).id, chooseLayout([...candidates].reverse(), seed).id);
  assert.ok(
    new Set(Array.from({ length: 30 }, (_, i) => chooseLayout(candidates, String(i)).id)).size > 1,
  );
  assert.ok(
    !Array.from({ length: 30 }, (_, i) => chooseLayout(candidates, String(i)).id).includes('bad'),
  );
  photo.entry.updatedAt = 'changed';
  assert.equal(layoutSeed([photo], '2026-09-07', 'paper'), seed);
  photo.entry.description = 'changed';
  assert.notEqual(layoutSeed([photo], '2026-09-07', 'paper'), seed);
});

test('all styles render six mixed or sticker entries with complete text and no clipping', async (t) => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  const font = await readFile(path.join(publicDir, 'fonts/NotoSansCJKsc-Regular.otf'));
  let items: SnapshotItem[] = [];
  await page.route('**/*', (route) => {
    if (route.request().url().endsWith('font.otf'))
      return route.fulfill({
        body: font,
        contentType: 'font/otf',
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    const i = Number(new URL(route.request().url()).pathname.split('/').pop());
    return route.fulfill({ body: items[i].bytes, contentType: items[i].mime });
  });
  for (const mixed of [false, true]) {
    items = Array.from({ length: 6 }, (_, i) =>
      item(i, 16, i === 0 ? '' : `第 ${i} 个瞬间，今天也很好 👩‍👩‍👧‍👦`),
    );
    if (mixed)
      for (let i = 0; i < 3; i++) {
        const [width, height] = [
          [1000, 450],
          [450, 1000],
          [600, 600],
        ][i];
        items[i].bytes = await sharp({
          create: { width, height, channels: 3, background: ['#accaca', '#dcadba', '#d9c094'][i] },
        })
          .png()
          .toBuffer();
        items[i].mime = 'image/png';
        items[i].entry.media = { type: 'photo', filename: `${i}.png`, mime: 'image/png' };
      }
    const shapes = await mediaShapes(items);
    assert.ok(layoutCandidates([0, 1, 2, 3, 4, 5], shapes, items).length >= 3);
    for (const style of videoStyles) {
      const scenes = await videoScenes(page, items, '2026-09-07', style);
      const content = scenes.filter((scene) => scene.kind === 'entry');
      assert.equal(content.length, 1, `${style.id}: six short entries should share a page`);
      assert.equal(content[0].entries!.length, 6);
      await loadVideoScene(page, content[0], items, '2026-09-07', style);
      assert.ok((await measureVideoScene(page)).fits, style.id);
      for (const entry of content[0].entries!) {
        const card = page.locator(`[data-item-index="${entry.itemIndex}"]`);
        assert.equal(
          await card.locator('.copy').textContent(),
          items[entry.itemIndex].entry.description,
        );
        assert.equal(
          await card.locator('img').evaluate((node) => getComputedStyle(node).objectFit),
          'contain',
        );
      }
      if (style.id === 'paper') {
        const repeat = await videoScenes(page, [...items], '2026-09-07', style);
        assert.deepEqual(
          repeat.filter((s) => s.kind !== 'ending'),
          scenes.filter((s) => s.kind !== 'ending'),
        );
        const withMusic = await videoScenes(page, items, '2026-09-07', style, videoMusic[0]);
        assert.deepEqual(
          withMusic.filter((s) => s.kind === 'entry'),
          content,
        );
      }
    }
  }
  items = Array.from({ length: 7 }, (_, i) => item(i, 16, '短文'));
  const balanced = (await videoScenes(page, items, '2026-09-07', videoStyles[0])).filter(
    (s) => s.kind === 'entry',
  );
  assert.deepEqual(
    balanced.map((s) => s.entries!.length),
    [4, 3],
  );
  assert.deepEqual(
    balanced.map((s) => [s.pageNumber, s.pageCount]),
    [
      [1, 2],
      [2, 2],
    ],
  );
  assert.deepEqual(
    balanced.flatMap((s) => s.entries!.map((e) => e.itemIndex)),
    [0, 1, 2, 3, 4, 5, 6],
  );
  items = [item(0, 16, '长文👩‍👩‍👧‍👦\n\n'.repeat(80)), item(1, 16, '另一条短文')];
  const long = (await videoScenes(page, items, '2026-09-07', videoStyles[0])).filter(
    (s) => s.kind === 'entry',
  );
  assert.ok(long.length > 2);
  for (let i = 0; i < items.length; i++)
    assert.equal(
      long
        .flatMap((s) => s.entries || [])
        .filter((e) => e.itemIndex === i)
        .map((e) => e.text)
        .join(''),
      items[i].entry.description,
    );
  for (const scene of long) {
    await loadVideoScene(page, scene, items, '2026-09-07', videoStyles[0]);
    assert.ok((await measureVideoScene(page)).fits);
  }
});
