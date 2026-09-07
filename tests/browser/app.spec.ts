import { test, expect } from '@playwright/test';
// Feature tests start with an existing access cookie; access.spec.ts covers the gate itself.
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
  await expect(page.getByRole('navigation', { name: '页面切换' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '前一天', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '后一天', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '回到今天', exact: true })).toBeDisabled();
  const initialDate = await page.getByLabel('选择日期').inputValue();
  await page.getByLabel('选择日期').fill('2026-08-29');
  await page.getByRole('button', { name: '前一天', exact: true }).click();
  await expect(page.getByLabel('选择日期')).toHaveValue('2026-08-28');
  await page.getByRole('button', { name: '后一天', exact: true }).click();
  await expect(page.getByLabel('选择日期')).toHaveValue('2026-08-29');
  await page.getByRole('button', { name: '回到今天', exact: true }).click();
  await expect(page.getByLabel('选择日期')).toHaveValue(initialDate);
  await page.getByLabel('选择日期').fill(initialDate);
  await expect(page.getByLabel('选择日期')).toHaveValue(initialDate);
  await expect(page.getByRole('heading', { name: '此刻，同频' })).toBeVisible();
  await expect(page.locator('.floating-create')).toBeInViewport();
  await page.screenshot({ path: 'test-results/home-375.png', fullPage: true });
  await page.locator('.floating-create').click();
  await expect(page.getByRole('dialog', { name: '这一刻，属于谁' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: '陆语涵', exact: true }).click();
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByLabel('想说的话').fill('和朋友们在同一天，收集一个小小的开心。');
  await page.getByLabel('发生的时间').fill(time);
  await page.getByRole('button', { name: '选择表情', exact: true }).click();
  await page.getByRole('button', { name: '糖果扁平', exact: true }).click();
  await page.getByRole('button', { name: '好开心', exact: true }).click();
  await page.getByRole('button', { name: '更换表情', exact: true }).click();
  await page.getByRole('button', { name: '线条涂鸦', exact: true }).click();
  await page.getByRole('button', { name: '笑出眼泪', exact: true }).click();
  await page.getByRole('button', { name: '更换表情', exact: true }).click();
  await page.getByRole('button', { name: '软萌立体', exact: true }).click();
  await page.getByRole('button', { name: '幸福冒泡', exact: true }).click();
  await page.getByRole('button', { name: /换一位朋友/ }).click();
  await page.getByRole('button', { name: '下一步' }).click();
  await expect(page.getByLabel('想说的话')).toHaveValue('和朋友们在同一天，收集一个小小的开心。');
  await expect(page.getByLabel('发生的时间')).toHaveValue(time);
  await expect(page.getByRole('button', { name: '发布', exact: true })).toBeInViewport();
  await expect(page.getByRole('button', { name: '贴纸', exact: true })).toHaveCount(0);
  await page.screenshot({ path: 'test-results/composer-375.png', fullPage: true });
  await page.getByRole('button', { name: '发布' }).click();
  await expect(page.getByRole('heading', { name: '此刻，同频' })).toBeVisible();
  await expect(page.getByLabel('选择日期')).toHaveValue('2026-08-29');
  await expect(page.getByText('和朋友们在同一天，收集一个小小的开心。')).toBeVisible();
  await page.screenshot({ path: 'test-results/timeline-375.png', fullPage: true });
  await page.getByRole('button', { name: '生成今日手账' }).click();
  let releaseExport!: () => void;
  const exportGate = new Promise<void>((resolve) => {
    releaseExport = resolve;
  });
  await page.route('**/api/exports/images', async (route) => {
    await exportGate;
    await route.continue();
  });
  const modalHeight = await page
    .getByRole('dialog')
    .evaluate((el) => el.getBoundingClientRect().height);
  await page.getByRole('button', { name: /生成手账长图/ }).click();
  await expect(page.getByRole('button', { name: /生成手账长图/ })).toHaveAttribute(
    'aria-busy',
    'true',
  );
  expect(await page.getByRole('dialog').evaluate((el) => el.getBoundingClientRect().height)).toBe(
    modalHeight,
  );
  releaseExport();

  await expect(page.getByAltText('2026-08-29手账 第1张')).toBeVisible({ timeout: 100000 });
  await page.getByAltText('2026-08-29手账 第1张').evaluate((img: HTMLImageElement) => img.decode());
  await expect(page.getByRole('link', { name: '下载图片', exact: true })).toHaveClass(
    'primary full',
  );
  await expect(page.getByRole('link', { name: '下载图片合集', exact: true })).toHaveClass(
    'text-button full',
  );
  await expect(page.getByRole('link', { name: '下载图片', exact: true })).toBeInViewport();
  const pngDownload = page.waitForEvent('download');
  await page.getByRole('link', { name: '下载图片', exact: true }).click();
  expect((await pngDownload).suggestedFilename()).toMatch(
    /^此刻同频_2026-08-29_手账-01_导出\d{4}-\d{2}-\d{2}\.png$/,
  );
  await page.screenshot({ path: 'test-results/export-375.png', fullPage: true });
  const imageZipPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: '下载图片合集', exact: true }).click();
  expect((await imageZipPromise).suggestedFilename()).toMatch(
    /^此刻同频_2026-08-29_手账合集_导出\d{4}-\d{2}-\d{2}\.zip$/,
  );
  await page.getByRole('button', { name: '返回导出选项' }).click();
  let archiveDownloads = 0;
  page.on('download', () => archiveDownloads++);
  await page.getByRole('button', { name: /下载素材 ZIP/ }).click();
  const prompt = page.getByLabel('可直接复制的 AI 提示词');
  await expect(prompt).toHaveValue(/manifest.json/);
  expect(archiveDownloads).toBe(0);
  await page.getByRole('button', { name: '生成视频', exact: true }).click();
  await page.getByLabel('希望生成什么？', { exact: false }).fill('30 秒水彩风格回忆视频');
  await expect(prompt).toHaveValue(/30 秒水彩风格回忆视频/);
  await expect(prompt).toHaveValue(/逐镜头生成提示词/);
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          (window as unknown as { copiedPrompt: string }).copiedPrompt = text;
        },
      },
    }),
  );
  await page.getByRole('button', { name: '复制提示词', exact: true }).click();
  await expect(page.getByText('提示词已复制', { exact: true })).toBeVisible();
  expect(
    await page.evaluate(() => (window as unknown as { copiedPrompt: string }).copiedPrompt),
  ).toBe(await prompt.inputValue());
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error('Permission denied');
        },
      },
    }),
  );
  await page.getByRole('button', { name: '复制提示词', exact: true }).click();
  await expect(page.getByText('未能自动复制', { exact: false })).toBeVisible();
  await page.screenshot({ path: 'test-results/archive-prompt-375.png', fullPage: true });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载压缩包', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(
    /^此刻同频_2026-08-29_素材包_导出\d{4}-\d{2}-\d{2}\.zip$/,
  );
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: /更多操作：陆语涵/ }).click();
  await page.getByRole('button', { name: /编辑陆语涵/ }).click();
  await page.getByLabel('想说的话').fill('修改后的记录');
  await page.getByRole('button', { name: '保存修改' }).click();
  await expect(page.getByText('修改后的记录')).toBeVisible();
  await page.reload();
  await page.getByLabel('选择日期').fill('2026-08-29');
  await expect(page.getByText('修改后的记录')).toBeVisible();
  await page.getByRole('button', { name: /更多操作：陆语涵/ }).click();
  await page.getByRole('button', { name: /删除陆语涵/ }).click();
  await page.getByRole('button', { name: '再想想' }).click();
  await expect(page.getByText('修改后的记录')).toBeVisible();
  await page.getByRole('button', { name: /更多操作：陆语涵/ }).click();
  await page.getByRole('button', { name: /删除陆语涵/ }).click();
  await page.getByRole('button', { name: '确认删除' }).click();
  await expect(page.getByText('修改后的记录')).toHaveCount(0);
  await page.setViewportSize({ width: 430, height: 932 });
  await page.screenshot({ path: 'test-results/home-430.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
test('Backend PNG is 1080px, wraps safely and paginates long days; every archive source is local', async ({
  page,
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
  await page.setViewportSize({ width: 430, height: 932 });
  await page.goto('/');
  await page.getByLabel('选择日期').fill(date);
  await page.getByRole('button', { name: '生成今日手账' }).click();
  const generated = page.waitForResponse(
    (r) => r.url().endsWith('/api/exports/images') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '生成手账长图' }).click();
  const preview = await (await generated).json();
  const downloadLink = page.getByRole('link', { name: '下载当前图片', exact: true });
  await expect(downloadLink).toHaveAttribute('href', preview.images[0] + '?download=1');
  await expect(downloadLink).toBeInViewport();
  await expect(page.getByRole('button', { name: '上一张图片' })).toBeDisabled();
  await page.locator('.export-preview-scroll').evaluate((el) => (el.scrollTop = el.scrollHeight));
  await expect(downloadLink).toBeInViewport();
  await page.getByRole('button', { name: '下一张图片' }).click();
  await expect(downloadLink).toHaveAttribute('href', preview.images[1] + '?download=1');
  await expect(page.getByAltText(`${date}手账 第2张`)).toBeVisible();
  expect(await page.locator('.export-preview-scroll').evaluate((el) => el.scrollTop)).toBe(0);
  const currentDownload = page.waitForEvent('download');
  await downloadLink.click();
  expect((await currentDownload).suggestedFilename()).toMatch(
    /_手账-02_导出\d{4}-\d{2}-\d{2}\.png$/,
  );
  await page.screenshot({ path: 'test-results/export-paginated-430.png' });
  await page.getByRole('button', { name: '上一张图片' }).click();
  await expect(downloadLink).toHaveAttribute('href', preview.images[0] + '?download=1');
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  const list = await (await request.get('/api/entries?date=' + date)).json();
  for (const e of list) await request.delete('/api/entries/' + e.id);
});
test('Photo upload retains input after a failed request; posting resets a different person filter', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 430, height: 932 });
  await page.goto('/');
  await page.locator('.floating-create').click();
  await page.getByRole('dialog').getByRole('button', { name: '水水', exact: true }).click();
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
  await page.getByRole('button', { name: '发布' }).click();
  await expect(page.getByRole('alert')).toContainText('网络连接断开');
  await expect(page.getByLabel('想说的话')).toHaveValue('照片上传测试');
  await expect(page.getByAltText('照片预览')).toBeVisible();
  await page.unroute('**/api/entries');
  await page.getByRole('button', { name: '发布' }).click();
  await expect(page.getByText('照片上传测试')).toBeVisible();
  await page.getByRole('button', { name: '水水', exact: true }).click();
  await page.locator('.floating-create').click();
  await expect(page.getByLabel('发生的时间')).toHaveValue(/2026-08-27T/);
  await page.getByRole('button', { name: /换一位朋友/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: '陆语涵', exact: true }).click();
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByRole('button', { name: '表情', exact: true }).click();
  await page.getByRole('button', { name: '选择表情', exact: true }).click();
  await page.getByRole('button', { name: '好开心', exact: true }).click();
  await page.getByLabel('想说的话').fill('新朋友的表情');
  await page.getByLabel('发生的时间').fill('2026-08-27T10:31');
  await page.getByRole('button', { name: '发布' }).click();
  await expect(page.getByText('新朋友的表情')).toBeVisible();
  await expect(page.getByText('照片上传测试')).toBeVisible();
  await page.screenshot({ path: 'test-results/timeline-430.png', fullPage: true });
  const entries = await (await request.get('/api/entries?date=2026-08-27')).json();
  for (const e of entries) await request.delete('/api/entries/' + e.id);
});

test('Legacy emoji editing, picker cancellation and small viewport preserve the draft', async ({
  page,
  request,
}) => {
  const response = await request.post('/api/entries', {
    data: {
      personId: 'lu-yuhan',
      mediaType: 'emoji',
      emoji: '😊',
      description: '旧表情记录',
      occurredAt: '2026-08-26T02:00:00Z',
    },
  });
  expect(response.status()).toBe(201);
  const entry = await response.json();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await page.getByLabel('选择日期').fill('2026-08-26');
  await expect(page.locator(`#entry-${entry.id} img`).last()).toBeVisible();
  const exported = await request.get('/api/exports/archive?date=2026-08-26');
  expect(exported.status()).toBe(200);
  const { unzipSync } = await import('fflate');
  const files = unzipSync(new Uint8Array(await exported.body()));
  expect(Object.keys(files).some((name) => name.endsWith('.png'))).toBe(true);
  await page.getByRole('button', { name: /更多操作：陆语涵/ }).click();
  await page.getByRole('button', { name: /编辑陆语涵/ }).click();
  const originalSrc = await page.locator('.selected-media img').getAttribute('src');
  await page.getByRole('button', { name: '更换表情', exact: true }).click();
  await page.getByRole('button', { name: '线条涂鸦', exact: true }).click();
  await page.getByLabel('搜索表情').fill('不存在的表情');
  await expect(page.getByText('没有找到，试试别的词吧')).toBeVisible();
  await page.getByRole('button', { name: '返回编辑', exact: true }).click();
  await expect(page.locator('.selected-media img')).toHaveAttribute('src', originalSrc!);
  await expect(page.getByLabel('想说的话')).toHaveValue('旧表情记录');
  await page.getByRole('button', { name: '照片', exact: true }).click();
  await page.getByRole('button', { name: '表情', exact: true }).click();
  await expect(page.locator('.selected-media img')).toHaveAttribute('src', originalSrc!);
  await page.setViewportSize({ width: 375, height: 420 });
  await page.getByLabel('想说的话').focus();
  await expect(page.getByRole('button', { name: '保存修改', exact: true })).toBeInViewport();
  await expect(page.getByLabel('想说的话')).toBeInViewport();
  expect(await page.getByRole('dialog').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  await page.screenshot({ path: 'test-results/composer-small-viewport.png' });
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  const saved = (await (await request.get('/api/entries?date=2026-08-26')).json()).find(
    (e: { id: string }) => e.id === entry.id,
  );
  expect(saved.media).toEqual({ type: 'sticker', stickerId: 'fluent-1f60a' });
  await request.delete('/api/entries/' + entry.id);
});

test('Home shows newest hours and entries first, regardless of person configuration order', async ({
  page,
  request,
}) => {
  const date = '2026-08-25';
  const ids: string[] = [];
  for (const [personId, occurredAt] of [
    ['shui-shui', `${date}T02:10:00Z`],
    ['lu-yuhan', `${date}T02:40:00Z`],
    ['shui-shui', `${date}T01:59:00Z`],
    ['cai-jianwen', `${date}T03:00:00Z`],
  ]) {
    const res = await request.post('/api/entries', {
      data: {
        personId,
        occurredAt,
        mediaType: 'sticker',
        stickerId: 'fluent-1f60a',
        description: occurredAt,
      },
    });
    expect(res.status()).toBe(201);
    ids.push((await res.json()).id);
  }
  await page.goto('/');
  await page.getByLabel('选择日期').fill(date);
  await expect(page.locator('.hour-heading time')).toHaveText(['11:00', '10:00', '09:00']);
  expect(await page.locator('.moment-card').evaluateAll((nodes) => nodes.map((n) => n.id))).toEqual(
    [ids[3], ids[1], ids[0], ids[2]].map((id) => `entry-${id}`),
  );
  await expect(page.getByText('2 位朋友的此刻')).toBeVisible();
  await page.getByRole('button', { name: '水水', exact: true }).click();
  await expect(page.locator('.timeline-summary')).toContainText('水水 · 2 个瞬间');
  expect(await page.locator('.moment-card').evaluateAll((nodes) => nodes.map((n) => n.id))).toEqual(
    [ids[0], ids[2]].map((id) => `entry-${id}`),
  );
  for (const id of ids) await request.delete('/api/entries/' + id);
});

test('Photo drafts survive closing and reload, stay separate by date, and clear after publishing', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await page.getByLabel('选择日期').fill('2026-08-24');
  await page.locator('.floating-create').click();
  await page.getByRole('dialog').getByRole('button', { name: '水水', exact: true }).click();
  await page.getByRole('button', { name: '下一步' }).click();
  await expect(page.getByLabel('发生的时间')).toHaveValue(/2026-08-24T/);
  await page.getByRole('button', { name: '照片', exact: true }).click();
  const { default: sharp } = await import('sharp');
  const buffer = await sharp({
    create: { width: 40, height: 60, channels: 3, background: '#e1bd8a' },
  })
    .png()
    .toBuffer();
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'draft.png', mimeType: 'image/png', buffer });
  await page.getByLabel('想说的话').fill('刷新后仍在的草稿');
  const draftTime = await page.getByLabel('发生的时间').inputValue();
  await page.getByRole('button', { name: '清空草稿', exact: true }).click();
  await expect(page.getByLabel('想说的话')).toHaveValue('');
  await expect(page.getByAltText('照片预览')).toHaveCount(0);
  await page.getByRole('button', { name: '撤销清空', exact: true }).click();
  await expect(page.getByLabel('想说的话')).toHaveValue('刷新后仍在的草稿');
  await expect(page.getByLabel('发生的时间')).toHaveValue(draftTime);
  await expect(page.getByAltText('照片预览')).toBeVisible();

  await expect(page.getByText('草稿已保存在此设备')).toBeVisible();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.locator('.floating-create').click();
  await expect(page.getByLabel('想说的话')).toHaveValue('刷新后仍在的草稿');
  await expect(page.getByAltText('照片预览')).toBeVisible();
  await page.reload();
  await page.getByLabel('选择日期').fill('2026-08-23');
  await page.locator('.floating-create').click();
  await expect(page.getByLabel('想说的话')).toHaveValue('');
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByLabel('选择日期').fill('2026-08-24');
  await page.locator('.floating-create').click();
  await expect(page.getByLabel('想说的话')).toHaveValue('刷新后仍在的草稿');
  await expect(page.getByAltText('照片预览')).toBeVisible();
  await page.getByRole('button', { name: '发布', exact: true }).click();
  await expect(page.getByText('刷新后仍在的草稿')).toBeVisible();
  await page.locator('.floating-create').click();
  await expect(page.getByLabel('想说的话')).toHaveValue('');
  await expect(page.getByAltText('照片预览')).toHaveCount(0);
  const entries = await (await request.get('/api/entries?date=2026-08-24')).json();
  for (const e of entries) await request.delete('/api/entries/' + e.id);
});

test('Calendar marks recorded days, supports leap months, and retries failed counts', async ({
  page,
  request,
}) => {
  const entry = await (
    await request.post('/api/entries', {
      data: {
        personId: 'shui-shui',
        mediaType: 'sticker',
        stickerId: 'fluent-1f60a',
        description: '闰日的瞬间',
        occurredAt: '2024-02-29T02:00:00Z',
      },
    })
  ).json();
  try {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await page.getByLabel('选择日期').fill('2024-02-28');
    await page.getByLabel('选择日期').click();
    await expect(
      page.getByRole('button', { name: '2024-02-29，1 个瞬间', exact: true }),
    ).toBeVisible();
    await expect(
      page
        .getByRole('button', { name: '2024-02-29，1 个瞬间', exact: true })
        .locator('.has-records'),
    ).toHaveCount(1);
    await expect(page.getByRole('button', { name: /2024-02-30/ })).toHaveCount(0);
    await page.screenshot({ path: 'test-results/calendar-375.png', fullPage: true });
    await page.getByRole('button', { name: '2024-02-29，1 个瞬间', exact: true }).click();
    await expect(page.getByLabel('选择日期')).toHaveValue('2024-02-29');
    await expect(page.getByText('闰日的瞬间')).toBeVisible();
    await page.route('**/api/entry-dates?*', (route) => route.abort());
    await page.getByLabel('选择日期').click();
    await expect(page.getByText('记录标记加载失败')).toBeVisible();
    await page.unroute('**/api/entry-dates?*');
    await page.getByRole('button', { name: '重试', exact: true }).click();
    await expect(
      page.getByRole('button', { name: '2024-02-29，1 个瞬间', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: '下个月', exact: true }).click();
    await expect(page.getByLabel('选择月份')).toHaveValue('2024-03');
    await page.getByRole('dialog').getByRole('button', { name: '回到今天', exact: true }).click();
    await expect(page.getByRole('button', { name: '后一天', exact: true })).toBeDisabled();
  } finally {
    await request.delete('/api/entries/' + entry.id);
  }
});

test('Draft undo expires and does not overwrite new writing', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await page.locator('.floating-create').click();
  await page.getByRole('dialog').getByRole('button', { name: '水水', exact: true }).click();
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByLabel('想说的话').fill('可以撤销的内容');
  await page.getByRole('button', { name: '清空草稿', exact: true }).click();
  await expect(page.getByRole('button', { name: '撤销清空', exact: true })).toBeVisible();
  await page.clock.fastForward(10001);
  await expect(page.getByRole('button', { name: '撤销清空', exact: true })).toHaveCount(0);
  await page.getByLabel('想说的话').fill('再试一次');
  await page.getByRole('button', { name: '清空草稿', exact: true }).click();
  await page.getByLabel('想说的话').fill('新写的内容');
  await expect(page.getByRole('button', { name: '撤销清空', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('想说的话')).toHaveValue('新写的内容');
});
