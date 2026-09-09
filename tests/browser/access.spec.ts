import { test, expect } from '@playwright/test';
import { appConfig } from '@parallel/config';
const { accessCode: code } = appConfig;

test('Access gate validates code and keeps a fixed seven-day cookie across reloads', async ({
  page,
  context,
}) => {
  let entryRequests = 0;
  page.on('request', (request) => {
    if (request.url().includes('/api/entries')) entryRequests++;
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await expect(page.getByLabel('访问暗号')).toBeVisible();
  await expect(page.locator('.floating-create')).toHaveCount(0);
  expect(entryRequests).toBe(0);
  await page.screenshot({ path: 'test-results/access-375.png', fullPage: true });
  await page.getByLabel('访问暗号').fill('incorrect-' + code);
  await page.getByRole('button', { name: '翻开手账' }).click();
  await expect(page.getByRole('alert')).toContainText('暗号不对');
  expect(
    (await context.cookies()).find((cookie) => cookie.name === 'parallel_access'),
  ).toBeUndefined();
  const before = Date.now();
  await page.getByLabel('访问暗号').fill(code);
  await page.getByRole('button', { name: '翻开手账' }).click();
  await expect(page.locator('.floating-create')).toBeVisible();
  const cookie = (await context.cookies()).find((cookie) => cookie.name === 'parallel_access')!;
  expect(cookie.sameSite).toBe('Lax');
  expect(cookie.path).toBe('/');
  expect(cookie.expires * 1000).toBeGreaterThanOrEqual(before + 7 * 86400_000 - 1000);
  expect(cookie.expires * 1000).toBeLessThanOrEqual(Date.now() + 7 * 86400_000 + 1000);
  await page.reload();
  await expect(page.locator('.floating-create')).toBeVisible();
  const refreshed = (await context.cookies()).find((item) => item.name === 'parallel_access')!;
  expect(refreshed.value).toBe(cookie.value);
  expect(refreshed.expires).toBe(cookie.expires);
  await context.clearCookies();
  await page.reload();
  await expect(page.getByLabel('访问暗号')).toBeVisible();
});

test('An open app locks when its access period expires', async ({ page, context }) => {
  await page.clock.install();
  const expiry = Date.now() + 3000;
  await context.addCookies([
    {
      name: 'parallel_access',
      value: String(expiry),
      domain: '127.0.0.1',
      path: '/',
      expires: expiry / 1000,
      sameSite: 'Lax',
    },
  ]);
  await page.goto('/');
  await expect(page.locator('.floating-create')).toBeVisible();
  await page.clock.fastForward(4000);
  await expect(page.getByLabel('访问暗号')).toBeVisible();
  await expect(page.locator('.floating-create')).toHaveCount(0);
});
