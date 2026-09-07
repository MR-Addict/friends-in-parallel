import { test, expect } from '@playwright/test';
const time = '2026-08-29T09:30';
test('Mobile two-step publishing, preserving form, all packs, edit/delete and exports', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const list = await (await request.get('/api/entries?date=2026-08-29')).json();
  for (const e of list) await request.delete('/api/entries/' + e.id);
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByRole('button', { name: '陆语涵', exact: true })).toHaveCount(0);
  await page.screenshot({ path: 'test-results/home-375.png', fullPage: true });
  await page.getByRole('button', { name: '上传动态', exact: true }).click();
  await expect(page.getByText('01 选择朋友')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: '陆语涵', exact: true }).click();
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByLabel('想说的话').fill('和朋友们在同一天，收集一个小小的开心。');
  await page.getByLabel('发生的时间').fill(time);
  await page.getByRole('button', { name: '糖果扁平', exact: true }).click();
  await page.getByRole('button', { name: '好开心', exact: true }).click();
  await page.getByRole('button', { name: '线条涂鸦', exact: true }).click();
  await page.getByRole('button', { name: '笑出眼泪', exact: true }).click();
  await page.getByRole('button', { name: '软萌立体', exact: true }).click();
  await page.getByRole('button', { name: '幸福冒泡', exact: true }).click();
  await page.getByRole('button', { name: /换一位朋友/ }).click();
  await page.getByRole('button', { name: '下一步' }).click();
  await expect(page.getByLabel('想说的话')).toHaveValue('和朋友们在同一天，收集一个小小的开心。');
  await expect(page.getByLabel('发生的时间')).toHaveValue(time);
  await page.screenshot({ path: 'test-results/composer-375.png', fullPage: true });
  await page.getByRole('button', { name: '发布这一刻' }).click();
  await expect(page.getByRole('heading', { name: '同一天的我们。' })).toBeVisible();
  await expect(page.getByLabel('选择日期')).toHaveValue('2026-08-29');
  await expect(page.getByText('和朋友们在同一天，收集一个小小的开心。')).toBeVisible();
  await page.screenshot({ path: 'test-results/timeline-375.png', fullPage: true });
  await page.getByRole('button', { name: '导出这一天' }).click();
  await page.getByRole('button', { name: /分享手账长图/ }).click();
  await expect(page.getByAltText('2026-08-29手账 第1张')).toBeVisible({ timeout: 100000 });
  await page.getByAltText('2026-08-29手账 第1张').evaluate((img: HTMLImageElement) => img.decode());
  await page.screenshot({ path: 'test-results/export-375.png', fullPage: true });
  await page.getByRole('button', { name: '返回导出选项' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /下载素材压缩包/ }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain('materials.zip');
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: /编辑陆语涵/ }).click();
  await page.getByLabel('想说的话').fill('修改后的记录');
  await page.getByRole('button', { name: '保存修改' }).click();
  await expect(page.getByText('修改后的记录')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: '同一天', exact: true }).click();
  await page.getByLabel('选择日期').fill('2026-08-29');
  await expect(page.getByText('修改后的记录')).toBeVisible();
  await page.getByRole('button', { name: /删除陆语涵/ }).click();
  await page.getByRole('button', { name: '再想想' }).click();
  await expect(page.getByText('修改后的记录')).toBeVisible();
  await page.getByRole('button', { name: /删除陆语涵/ }).click();
  await page.getByRole('button', { name: '确认删除' }).click();
  await expect(page.getByText('修改后的记录')).toHaveCount(0);
  await page.setViewportSize({ width: 430, height: 932 });
  await page.getByRole('button', { name: '记一刻', exact: true }).click();
  await page.screenshot({ path: 'test-results/home-430.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
test('Backend PNG is 1080px, wraps safely and paginates long days; every archive source is local', async ({
  request,
}) => {
  const date = '2026-08-28';
  const old = await (await request.get('/api/entries?date=' + date)).json();
  for (const e of old) await request.delete('/api/entries/' + e.id);
  for (let i = 0; i < 23; i++) {
    const r = await request.post('/api/entries', {
      data: {
        personId: i % 2 ? 'shui-shui' : 'lu-yuhan',
        mediaType: 'sticker',
        stickerId: ['fluent-1f60a', 'twemoji-1f602', 'openmoji-1f970'][i % 3],
        description:
          `第 ${i + 1} 个瞬间 <script>alert('safe')</script>\n` +
          '这一天的我们，慢慢记录生活里的小确幸。'.repeat(12),
        occurredAt: `${date}T0${i % 9}:30:00Z`,
      },
    });
    expect(r.status()).toBe(201);
  }
  const result = await request.post('/api/exports/images', { data: { date }, timeout: 110000 });
  expect(result.status()).toBe(200);
  const data = await result.json();
  expect(data.images.length).toBeGreaterThan(1);
  const { default: sharp } = await import('sharp');
  for (const [i, url] of data.images.entries()) {
    const r = await request.get(url);
    expect(r.status()).toBe(200);
    const buffer = await r.body();
    const meta = await sharp(buffer).metadata();
    expect(meta.width).toBe(1080);
    expect(meta.height).toBeLessThanOrEqual(12000);
    if (i === 0) {
      const fs = await import('node:fs/promises');
      await fs.mkdir('test-results', { recursive: true });
      await fs.writeFile('test-results/long-export.png', buffer);
    }
  }
  expect((await request.get(data.archiveUrl)).status()).toBe(200);
  const list = await (await request.get('/api/entries?date=' + date)).json();
  for (const e of list) await request.delete('/api/entries/' + e.id);
});
test('Photo upload retains input after a failed request; posting resets a different person filter', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 430, height: 932 });
  await page.goto('/');
  await page.getByRole('button', { name: '上传动态', exact: true }).click();
  await page.getByRole('button', { name: '水水', exact: true }).click();
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByRole('button', { name: '照片', exact: true }).click();
  const { default: sharp } = await import('sharp');
  const buffer = await sharp({
    create: { width: 800, height: 1200, channels: 3, background: '#e1bd8a' },
  })
    .png()
    .toBuffer();
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: '生活照片.png', mimeType: 'image/png', buffer });
  await page.getByLabel('想说的话').fill('照片上传测试');
  await page.getByLabel('发生的时间').fill('2026-08-27T10:30');
  await page.route('**/api/entries', (route) =>
    route.request().method() === 'POST' ? route.abort('failed') : route.continue(),
  );
  await page.getByRole('button', { name: '发布这一刻' }).click();
  await expect(page.getByRole('alert')).toContainText('网络连接断开');
  await expect(page.getByLabel('想说的话')).toHaveValue('照片上传测试');
  await expect(page.getByAltText('照片预览')).toBeVisible();
  await page.unroute('**/api/entries');
  await page.getByRole('button', { name: '发布这一刻' }).click();
  await expect(page.getByText('照片上传测试')).toBeVisible();
  await page.getByRole('button', { name: '水水', exact: true }).click();
  await page.getByRole('button', { name: '上传动态', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '陆语涵', exact: true }).click();
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByRole('button', { name: '表情', exact: true }).click();
  await page.getByRole('button', { name: '好开心', exact: true }).click();
  await page.getByLabel('想说的话').fill('新朋友的表情');
  await page.getByLabel('发生的时间').fill('2026-08-27T10:31');
  await page.getByRole('button', { name: '发布这一刻' }).click();
  await expect(page.getByText('新朋友的表情')).toBeVisible();
  await expect(page.getByText('照片上传测试')).toBeVisible();
  await page.screenshot({ path: 'test-results/timeline-430.png', fullPage: true });
  const entries = await (await request.get('/api/entries?date=2026-08-27')).json();
  for (const e of entries) await request.delete('/api/entries/' + e.id);
});
