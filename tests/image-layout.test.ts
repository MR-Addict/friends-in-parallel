import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { chromium } from '@playwright/test';
import type { SnapshotItem } from '../apps/server/src/exports.js';
import { publicDir } from '../apps/server/src/config.js';
import {
  postTemplate,
  imageBlocks,
  imageTemplate,
  loadImageScene,
  measureImageScene,
  partitionImageBlocks,
  type ImageBlock,
  type ImageTree,
} from '../apps/server/src/image-layout.js';
function item(i: number, hour: number, text = ''): SnapshotItem {
  return {
    entry: {
      id: String(i),
      personId: `person-${i % 2}`,
      occurredAt: `2026-09-07T${String(hour - 8).padStart(2, '0')}:10:00Z`,
      createdAt: '',
      updatedAt: '',
      description: text,
      media: { type: 'sticker', stickerId: 'test' },
    },
    person: {
      id: `person-${i % 2}`,
      nickname: '朋友',
      avatar: '',
      color: '#aa7755',
      background: '#fff',
    },
    bytes: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><circle cx="100" cy="100" r="90" fill="#fbbf24"/></svg>',
    ),
    mime: 'image/svg+xml',
    extension: 'svg',
    filename: '',
    credit: '',
  };
}
function entries(tree: ImageTree): { itemIndex: number; text: string; continuation: number }[] {
  return 'entry' in tree ? [tree.entry] : tree.children.flatMap(entries);
}
function block(group: number, height: number): ImageBlock {
  return {
    group,
    height,
    groupIndices: [0],
    title: '10:00–10:59',
    tree: { entry: { itemIndex: 0, text: '', continuation: 0 }, width: 984, mediaHeight: 180 },
  };
}
test('image pagination keeps groups together and adds headings on each continuation page', () => {
  assert.deepEqual(partitionImageBlocks([block(0, 400), block(1, 300), block(1, 300)], 1000, 100), [
    [0],
    [1, 2],
  ]);
  assert.deepEqual(partitionImageBlocks([block(0, 400), block(1, 500), block(1, 500)], 1000, 100), [
    [0],
    [1],
    [2],
  ]);
  assert.throws(() => partitionImageBlocks([block(0, 1000)], 1000, 100));
  const html = imageTemplate(
    [item(0, 10)],
    [block(0, 500), block(0, 500)],
    [1],
    '2026-09-07',
    2,
    2,
  );
  assert.ok(html.includes('10:00–10:59（续）'));
  assert.ok(html.includes('1 位朋友 · 1 条动态'));
});
test('adaptive collages preserve media and text, stay compact, paginate and repeat deterministically', async (t) => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1080, height: 1000 } });
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
  items = Array.from({ length: 7 }, (_, i) => item(i, 16, i === 0 ? '' : '文字<&>👩‍👩‍👧‍👦'));
  const first = await imageBlocks(page, items, '2026-09-07');
  assert.deepEqual(
    first.blocks.map((b) => entries(b.tree).length),
    [4, 3],
  );
  assert.ok(
    first.blocks.every((b) => b.height < 1000),
    'sticker blocks should be compact',
  );
  assert.deepEqual(await imageBlocks(page, items, '2026-09-07'), first);
  for (const indices of first.pages) {
    const html = imageTemplate(items, first.blocks, indices, '2026-09-07', 1, first.pages.length);
    assert.ok(!html.includes('文字<&>'));
    await loadImageScene(page, html);
    const m = await measureImageScene(page);
    assert.ok(m.fits && m.height <= 12000);
    assert.equal(
      await page.locator('.sheet').evaluate((n) => n.getBoundingClientRect().width),
      1080,
    );
    for (const entry of first.blocks.flatMap((b) => entries(b.tree))) {
      const card = page.locator(`[data-entry-id="${items[entry.itemIndex].entry.id}"]`);
      if (entry.text) assert.equal(await card.locator('.description').textContent(), entry.text);
    }
  }
  items = [item(0, 18, '短文'), item(1, 19, '短文'), item(2, 21, '短文'), item(3, 21, '短文')];
  for (let i = 0; i < 3; i++) {
    const [width, height] = [
      [1000, 400],
      [400, 1000],
      [600, 600],
    ][i];
    items[i].bytes = await sharp({ create: { width, height, channels: 3, background: '#bbaacc' } })
      .png()
      .toBuffer();
    items[i].mime = 'image/png';
    items[i].entry.media = { type: 'photo', filename: `${i}.png`, mime: 'image/png' };
  }
  const mixed = await imageBlocks(page, items, '2026-09-07');
  assert.deepEqual(
    mixed.blocks.map((b) => [b.title, entries(b.tree).length]),
    [
      ['18:00 — 19:59', 2],
      ['21:00–21:59', 2],
    ],
  );
  for (const indices of mixed.pages) {
    await loadImageScene(
      page,
      imageTemplate(items, mixed.blocks, indices, '2026-09-07', 1, mixed.pages.length),
    );
    assert.ok((await measureImageScene(page)).fits);
    assert.ok(
      await page
        .locator('img')
        .evaluateAll((images) =>
          images.every(
            (image) => getComputedStyle(image).objectFit === 'contain' && image.naturalWidth > 0,
          ),
        ),
    );
  }
  items = [item(0, 16, '文字👩‍👩‍👧‍👦\n\n'.repeat(170)), item(1, 16, '最后一条')];
  const long = await imageBlocks(page, items, '2026-09-07');
  assert.ok(long.pages.length > 1);
  for (const [i, source] of items.entries())
    assert.equal(
      long.blocks
        .flatMap((b) => entries(b.tree))
        .filter((e) => e.itemIndex === i)
        .map((e) => e.text)
        .join(''),
      source.entry.description,
    );
  for (const [p, indices] of long.pages.entries()) {
    await loadImageScene(
      page,
      imageTemplate(items, long.blocks, indices, '2026-09-07', p + 1, long.pages.length),
    );
    const m = await measureImageScene(page);
    assert.ok(m.fits && m.height <= 12000);
    assert.ok(await page.locator('.hour-title').count());
    if (p) assert.match((await page.locator('.hour-title').first().textContent()) || '', /（续）/);
    assert.match(
      (await page.locator('.hour-title').first().textContent()) || '',
      /2 位朋友 · 2 条动态/,
    );
  }
});

test('post cards preserve full descriptions and uncropped media at all aspect ratios', async (t) => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1080, height: 1000 } });
  const font = await readFile(path.join(publicDir, 'fonts/NotoSansCJKsc-Regular.otf'));
  let current = item(0, 14);
  await page.route('**/*', (route) =>
    route.request().url().endsWith('font.otf')
      ? route.fulfill({
          body: font,
          contentType: 'font/otf',
          headers: { 'Access-Control-Allow-Origin': '*' },
        })
      : route.fulfill({ body: current.bytes, contentType: current.mime }),
  );
  for (const [width, height] of [
    [200, 200],
    [400, 1600],
    [1600, 400],
  ]) {
    current = item(0, 14, '今天与朋友散步。\n中文 <script> & emoji 😊\n' + '完整的描述'.repeat(92));
    if (width !== height) {
      current.entry.media = { type: 'photo', filename: 'photo.png', mime: 'image/png' };
      current.mime = 'image/png';
      current.bytes = await sharp({ create: { width, height, channels: 3, background: '#8eb7a1' } })
        .png()
        .toBuffer();
    }
    await loadImageScene(
      page,
      postTemplate(current, '2026-09-07').replace('/image/0', `/image/0?shape=${width}x${height}`),
    );
    assert.equal(
      await page.locator('.post-media').evaluate((el) => (el as HTMLImageElement).naturalWidth),
      width,
    );
    assert.equal(await page.locator('.description').textContent(), current.entry.description);
    assert.equal(await page.locator('script').count(), 0);
    assert.equal(
      await page.locator('.post-media').evaluate((el) => getComputedStyle(el).objectFit),
      'contain',
    );
    assert.ok(await page.locator('.sheet').evaluate((el) => el.scrollWidth === el.clientWidth));
    assert.ok((await page.locator('.sheet').boundingBox())!.height > 400);
    await page
      .locator('.sheet')
      .screenshot({ path: `test-results/post-card-${width}x${height}.png` });
  }
});
