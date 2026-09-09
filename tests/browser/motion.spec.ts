import { test, expect } from '@playwright/test';
import { people } from '@parallel/config';

for (const width of [375, 1280]) {
  test(`media tabs slide without changing layout at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 812 });
    await page.goto('/');
    await page.locator('.floating-create').click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: people[0].nickname, exact: true })
      .click();
    await page.getByRole('button', { name: '下一步' }).click();
    const tabs = page.locator('.media-tabs');
    await tabs.scrollIntoViewIfNeeded();
    const before = await tabs.boundingBox();
    await tabs.getByRole('button', { name: '表情', exact: true }).click();
    await expect(tabs).toHaveAttribute('data-media', 'sticker');
    await expect
      .poll(() =>
        tabs.evaluate((element) => {
          const matrix = new DOMMatrixReadOnly(getComputedStyle(element, '::before').transform);
          return Math.abs(matrix.m41 - (element.clientWidth - 2) / 2) < 1;
        }),
      )
      .toBe(true);
    expect((await tabs.boundingBox())?.width).toBe(before?.width);
    await page.screenshot({ path: `test-results/media-tabs-${width}.png` });
    await tabs.getByRole('button', { name: '照片', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(tabs).toHaveAttribute('data-instant', 'true');
    await expect(tabs).toHaveAttribute('data-media', 'photo');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await tabs.getByRole('button', { name: '表情', exact: true }).click();
    expect(
      await tabs.evaluate((element) => getComputedStyle(element, '::before').transitionDuration),
    ).toBe('0s');
  });
}

test.beforeEach(async ({ context }) => {
  await context.addCookies([
    {
      name: 'parallel_access',
      value: String(Date.now() + 600_000),
      domain: '127.0.0.1',
      path: '/',
    },
  ]);
});

for (const width of [375, 1280]) {
  test(`modal motion preserves focus and layout at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 812 });
    await page.goto('/');
    const trigger = page.getByRole('button', { name: '选择日期', exact: true });
    await trigger.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toHaveCSS('opacity', '1');
    await expect(dialog).toHaveCSS('transition-duration', '0.2s, 0.2s');
    await page.screenshot({ path: `test-results/motion-calendar-${width}.png` });
    await dialog.getByRole('button', { name: '关闭', exact: true }).click();
    await expect(dialog).toHaveAttribute('data-closing', 'true');
    expect(await page.locator('body').evaluate((body) => body.style.overflow)).toBe('hidden');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await trigger.click();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

test('reduced motion disables transitions and closes without exit delay', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: '选择日期', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toHaveCSS('transition-duration', '0s');
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(dialog).toHaveCount(0);
});

test('post download feedback uses motion tokens and respects reduced motion', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
  });
  await page.route('**/api/entries?*', (route) => {
    const date = new URL(route.request().url()).searchParams.get('date');
    return route.fulfill({
      json: [
        {
          id: 'motion-post',
          personId: 'lu-yuhan',
          description: '',
          media: { type: 'sticker', stickerId: 'fluent-1f60a' },
          occurredAt: `${date}T06:30:00Z`,
          createdAt: date,
        },
      ],
    });
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await page.locator('.moment-media').click();
  const dialog = page.getByRole('dialog');
  const download = dialog.getByRole('link', { name: '下载图片' });
  await expect(download).toHaveCSS('transition-duration', '0.14s, 0.14s, 0.14s');
  await expect(dialog).toHaveCSS('opacity', '1');
  await page.screenshot({ path: 'test-results/motion-post-share.png' });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(download).toHaveCSS('transition-duration', '0s');
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(dialog).toHaveCount(0);
});
