import { test, expect } from '@playwright/test';

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
