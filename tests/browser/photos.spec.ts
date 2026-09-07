import { test, expect } from '@playwright/test';
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';

test.beforeEach(async ({ context }) => {
  const expiry = Date.now() + 7 * 86400_000;
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
});

for (const kind of ['heic', 'large', 'oriented'] as const) {
  test(`Optimizes ${kind} photo before upload`, async ({ page, request }) => {
    const buffer =
      kind === 'heic'
        ? await readFile('tests/fixtures/photo.heic')
        : kind === 'large'
          ? await sharp(randomBytes(3000 * 2000 * 3), {
              raw: { width: 3000, height: 2000, channels: 3 },
            })
              .png()
              .toBuffer()
          : await sharp({
              create: { width: 1200, height: 800, channels: 3, background: '#ff8800' },
            })
              .jpeg({ quality: 100 })
              .withMetadata({ orientation: 6 })
              .toBuffer();
    const name = kind === 'heic' ? 'iphone.HEIC' : kind === 'large' ? 'large.png' : 'portrait.jpg';
    await page.goto('/');
    await page.locator('.floating-create').click();
    await page.getByRole('dialog').getByRole('button', { name: '水水', exact: true }).click();
    await page.getByRole('button', { name: '下一步' }).click();
    await page.getByRole('button', { name: '照片', exact: true }).click();
    await page.locator('input[type=file]').setInputFiles({
      name,
      mimeType: kind === 'heic' ? '' : kind === 'large' ? 'image/png' : 'image/jpeg',
      buffer,
    });
    await expect(page.getByText(/已优化 ·/)).toBeVisible({ timeout: 60000 });
    await expect(page.getByAltText('照片预览')).toBeVisible();
    // Failed replacement must preserve the successfully optimized photo.
    await page.locator('input[type=file]').setInputFiles({
      name: 'broken.heic',
      mimeType: 'image/heic',
      buffer: Buffer.from('broken'),
    });
    await expect(page.getByRole('alert')).toContainText('转换失败');
    await expect(page.getByAltText('照片预览')).toBeVisible();
    await page.getByLabel('想说的话').fill(`优化测试 ${kind}`);
    await page.getByLabel('发生的时间').fill('2026-08-27T10:30');
    const savedResponse = page.waitForResponse(
      (r) => r.url().endsWith('/api/entries') && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: '发布' }).click();
    const response = await savedResponse;
    expect(response.ok()).toBeTruthy();
    const entry = await response.json();
    try {
      const uploaded = await (await request.get(`/uploads/${entry.media.filename}`)).body();
      expect(uploaded.length).toBeLessThanOrEqual(3_000_000);
      const metadata = await sharp(uploaded).metadata();
      expect(['jpeg', 'png', 'webp']).toContain(metadata.format);
      if (kind !== 'heic') expect(uploaded.length).toBeLessThan(buffer.length);
      if (kind === 'large')
        expect(Math.max(metadata.width!, metadata.height!)).toBeLessThanOrEqual(2560);
      if (kind === 'oriented') {
        expect(metadata.width).toBe(800);
        expect(metadata.height).toBe(1200);
      }
    } finally {
      await request.delete(`/api/entries/${entry.id}`);
    }
  });
}
