import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { chromium } from '@playwright/test';
import { endingVariants } from '../apps/server/src/video-art-direction.js';
import { loadVideoScene, measureVideoScene } from '../apps/server/src/video-renderer.js';
import { videoStyles } from '../apps/server/src/video-catalog.js';
import { publicDir } from '../apps/server/src/config.js';

// Exhaustive because endings combine independently with every selected visual theme.
test('every ending and title fits all twelve themes, with visible text and stable artwork', async (t) => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  const font = await readFile(path.join(publicDir, 'fonts/NotoSansCJKsc-Regular.otf'));
  await page.route('**/*', (route) =>
    route.fulfill({
      body: font,
      contentType: 'font/otf',
      headers: { 'Access-Control-Allow-Origin': '*' },
    }),
  );
  const previews: Buffer[] = [];
  for (const style of videoStyles) {
    for (const variant of ['title', ...endingVariants] as const) {
      await loadVideoScene(
        page,
        variant === 'title'
          ? {
              kind: 'title',
              title: '和朋友的\n同一时间',
              text: '2026-09-08\n6 位朋友 · 24 个瞬间',
              duration: 2,
            }
          : {
              kind: 'ending',
              endingVariant: variant,
              title: '今天先到这儿',
              text: '明天接着冒泡。',
              duration: 2,
            },
        [],
        '2026-09-08',
        style,
      );
      assert.ok(
        (await measureVideoScene(page)).fits,
        `${style.id}/${variant}: ${JSON.stringify(await page.locator('.hero').evaluate((el) => ({ bottom: el.getBoundingClientRect().bottom, scroll: el.scrollHeight, client: el.clientHeight })))}`,
      );
      const overflow = await page.locator('.hero').evaluate((hero) => {
        const elements = Array.from(
          hero.querySelectorAll<HTMLElement>(
            'h1,p,.eyebrow,.ending-foot,.ending-art,.ending-art i',
          ),
        );
        return elements
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return (
              r.width &&
              (r.left < 65 ||
                r.right > 1015 ||
                r.top < 210 ||
                r.bottom > 1820 ||
                el.scrollWidth > el.clientWidth + 1)
            );
          })
          .map((el) => el.className || el.tagName);
      });
      assert.deepEqual(overflow, [], `${style.id}/${variant}: content safe area`);
      if (process.env.VIDEO_ART_QA_DIR && (variant === 'title' || style.id === 'paper'))
        previews.push(
          await sharp(await page.screenshot())
            .resize(216, 384)
            .png()
            .toBuffer(),
        );
    }
  }
  if (process.env.VIDEO_ART_QA_DIR) {
    await mkdir(process.env.VIDEO_ART_QA_DIR, { recursive: true });
    await sharp({ create: { width: 216 * 6, height: 384 * 3, channels: 3, background: '#ddd' } })
      .composite(
        previews.map((input, i) => ({ input, left: (i % 6) * 216, top: Math.floor(i / 6) * 384 })),
      )
      .png()
      .toFile(path.join(process.env.VIDEO_ART_QA_DIR, 'art-directions.png'));
  }
});
