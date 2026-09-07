import { test, expect } from '@playwright/test';
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { randomBytes, createHash } from 'node:crypto';

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

for (const kind of ['heic', 'large', 'oriented', 'corrupt'] as const) {
  test(`Optimizes ${kind} photo on the server`, async ({ page, request }) => {
    const buffer =
      kind === 'corrupt'
        ? (await readFile('tests/fixtures/photo.heic')).subarray(0, 24)
        : kind === 'heic'
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
    const name =
      kind === 'heic' || kind === 'corrupt'
        ? 'iphone.HEIC'
        : kind === 'large'
          ? 'large.png'
          : 'portrait.jpg';
    await page.addInitScript(() => {
      const send = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.send = function (body) {
        if (body instanceof FormData)
          (window as unknown as { uploadedPhoto: FormDataEntryValue | null }).uploadedPhoto =
            body.get('photo');
        return send.call(this, body);
      };
    });
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
    await expect(page.getByText(new RegExp(name.replace('.', '\\.')))).toBeVisible();
    if (kind !== 'corrupt') {
      await expect(page.getByAltText('照片预览')).toBeVisible({ timeout: 35000 });
      await page.getByAltText('照片预览').evaluate((image: HTMLImageElement) => image.decode());
    }
    if (kind === 'heic') {
      await expect(page.getByText('草稿已保存在此设备')).toBeVisible();
      await page.reload();
      await page.locator('.floating-create').click();
      await expect(page.getByAltText('照片预览')).toBeVisible({ timeout: 35000 });
      await page.getByAltText('照片预览').evaluate((image: HTMLImageElement) => image.decode());
    }
    await page.getByLabel('想说的话').fill(`优化测试 ${kind}`);
    await page.getByLabel('发生的时间').fill('2026-08-27T10:30');
    const savedResponse = page.waitForResponse(
      (r) => r.url().endsWith('/api/entries') && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: '发布' }).click();
    const response = await savedResponse;
    // The multipart request contains the exact original, not a browser conversion.
    const sentHash = await page.evaluate(async () => {
      const file = (window as unknown as { uploadedPhoto: File }).uploadedPhoto;
      const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
      return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
    });
    expect(sentHash).toBe(createHash('sha256').update(buffer).digest('hex'));
    if (kind === 'corrupt') {
      expect(response.status()).toBe(400);
      await expect(page.getByRole('alert')).toContainText('HEIC/HEIF 照片转换失败');
      await expect(page.getByLabel('想说的话')).toHaveValue(`优化测试 ${kind}`);
      await expect(page.getByText(new RegExp(name.replace('.', '\\.')))).toBeVisible();
      expect(await (await request.get('/api/entries?date=2026-08-27')).json()).toEqual([]);
      return;
    }
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
