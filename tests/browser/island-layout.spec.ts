import { test, expect } from '@playwright/test';

async function unlock(context: import('@playwright/test').BrowserContext) {
  await context.addCookies([
    {
      name: 'parallel_access',
      value: String(Date.now() + 600_000),
      domain: '127.0.0.1',
      path: '/',
    },
  ]);
}

test('Island welcome fits narrow screens and uses both desktop columns', async ({ page }) => {
  for (const width of [320, 375, 768, 1280]) {
    await page.setViewportSize({ width, height: 812 });
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    const layout = await page.locator('.access-shell').evaluate((shell) => {
      const scene = shell.querySelector('.access-welcome')!.getBoundingClientRect();
      const card = shell.querySelector('.access-card')!.getBoundingClientRect();
      const input = shell.querySelector('input')!;
      return {
        overflow: document.documentElement.scrollWidth > innerWidth,
        sceneRight: scene.right,
        cardLeft: card.left,
        cardWidth: card.width,
        fontSize: parseFloat(getComputedStyle(input).fontSize),
      };
    });
    expect(layout.overflow).toBe(false);
    expect(layout.fontSize).toBeGreaterThanOrEqual(16);
    if (width > 700) {
      expect(layout.sceneRight).toBeLessThan(layout.cardLeft);
      expect(layout.cardWidth).toBeGreaterThan(280);
    }
    await page.screenshot({ path: `test-results/island-access-${width}.png`, fullPage: true });
  }
});

test('Composer date and actions fit narrow and landscape viewports', async ({ page, context }) => {
  await unlock(context);
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/');
  await page.locator('.floating-create').click();
  await page.getByRole('dialog').getByRole('button', { name: '水水', exact: true }).click();
  await page.getByRole('button', { name: '下一步' }).click();
  for (const size of [
    { width: 320, height: 740 },
    { width: 375, height: 400 },
    { width: 812, height: 375 },
  ]) {
    await page.setViewportSize(size);
    const time = page.getByLabel('发生的时间');
    await time.scrollIntoViewIfNeeded();
    await expect(time).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole('button', { name: '发布', exact: true })).toBeInViewport({
      ratio: 1,
    });
    const layout = await page.locator('.editor-fields').evaluate((fields) => {
      const input = fields.querySelector<HTMLInputElement>('#moment-time')!;
      const rect = input.getBoundingClientRect();
      const bounds = fields.getBoundingClientRect();
      return {
        overflow: fields.scrollWidth > fields.clientWidth,
        inputFits: rect.left >= bounds.left && rect.right <= bounds.right,
        fontSize: parseFloat(getComputedStyle(input).fontSize),
      };
    });
    expect(layout.overflow).toBe(false);
    expect(layout.inputFits).toBe(true);
    expect(layout.fontSize).toBeGreaterThanOrEqual(16);
    await page.screenshot({ path: `test-results/island-editor-${size.width}-${size.height}.png` });
  }
});

test('Mobile sheets use available height and keep footer reachable without safe-area values', async ({
  page,
  context,
}) => {
  await unlock(context);
  await page.addInitScript(() => {
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: undefined });
  });
  await page.route('**/*.css', async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: (await response.text()).replaceAll('safe-area-inset-bottom', 'unavailable-safe-area'),
    });
  });
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');
  await page.getByLabel('选择日期').click();
  const dialog = page.getByRole('dialog');
  await page.setViewportSize({ width: 320, height: 400 });
  await expect(dialog).toHaveCSS('max-height', '400px');
  await dialog.getByRole('button', { name: '回到今天', exact: true }).scrollIntoViewIfNeeded();
  await expect(dialog.getByRole('button', { name: '回到今天', exact: true })).toBeInViewport({
    ratio: 1,
  });
  const gap = await dialog.evaluate((el) => {
    const inner = el.querySelector('.sheet-inner')!.getBoundingClientRect();
    return el.getBoundingClientRect().bottom - inner.bottom;
  });
  expect(gap).toBeLessThanOrEqual(2);
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('选择日期')).toBeFocused();
});

test('Timeline packs uneven cards and reflows loaded photos and mobile widths', async ({
  page,
  context,
}) => {
  await unlock(context);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const entries = Array.from({ length: 5 }, (_, index) => ({
    id: `masonry-${index}`,
    personId: 'shui-shui',
    media:
      index === 0
        ? { type: 'photo', filename: 'masonry-photo.svg', mime: 'image/svg+xml' }
        : { type: 'sticker', stickerId: 'fluent-1f60a' },
    description: index === 0 ? '一张慢慢加载的长图' : `朋友的第 ${index + 1} 个瞬间`,
    occurredAt: `2026-08-24T04:${String(50 - index).padStart(2, '0')}:00Z`,
    createdAt: '2026-08-24',
    updatedAt: '2026-08-24',
  }));
  await page.route('**/api/entries?*', (route) => route.fulfill({ json: entries }));
  let releasePhoto!: () => void;
  const photoReady = new Promise<void>((resolve) => {
    releasePhoto = resolve;
  });
  await page.route('**/uploads/masonry-photo.svg', async (route) => {
    await photoReady;
    await route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="720"><rect width="480" height="720" fill="#b9d59b"/><circle cx="240" cy="230" r="100" fill="#f7cd67"/></svg>',
    });
  });
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const cards = page.locator('.moment-card');
  await expect(cards).toHaveCount(5);
  releasePhoto();
  await expect
    .poll(
      async () =>
        await cards
          .first()
          .locator('img[alt="上传的照片"]')
          .evaluate((img) => (img as HTMLImageElement).naturalHeight),
    )
    .toBe(720);
  const rects = () =>
    cards.evaluateAll((items) =>
      items.map((item) => {
        const { x, y, width, height, bottom } = item.getBoundingClientRect();
        return { x, y, width, height, bottom };
      }),
    );
  await expect
    .poll(async () => {
      const [first, second, third] = await rects();
      return (
        third.x === second.x && Math.abs(third.y - second.bottom - 16) < 1 && third.y < first.bottom
      );
    })
    .toBe(true);
  await page.screenshot({ path: 'test-results/island-masonry-desktop.png', fullPage: true });
  for (const width of [320, 700, 701, 900]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(async () => {
        const boxes = await rects();
        return boxes.every((a, i) =>
          boxes
            .slice(i + 1)
            .every(
              (b) =>
                a.x + a.width <= b.x + 1 ||
                b.x + b.width <= a.x + 1 ||
                a.bottom <= b.y + 1 ||
                b.bottom <= a.y + 1,
            ),
        );
      })
      .toBe(true);
    if (width <= 700) {
      const boxes = await rects();
      expect(
        boxes.every((box, i) => box.x === boxes[0].x && (!i || box.y > boxes[i - 1].bottom)),
      ).toBe(true);
      await page.screenshot({ path: `test-results/island-masonry-${width}.png`, fullPage: true });
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  expect(await cards.evaluateAll((items) => items.map((item) => item.id))).toEqual(
    entries.map((entry) => `entry-${entry.id}`),
  );
  await cards
    .nth(2)
    .getByRole('button', { name: /更多操作/ })
    .click();
  await expect(page.getByRole('dialog', { name: '动态操作' })).toBeVisible();
  expect(errors).toEqual([]);
});
