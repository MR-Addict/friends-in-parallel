import { selectDate } from './calendar';
import people from '../../apps/web/src/config/people.json' with { type: 'json' };
const testNickname = people.find((person) => person.id === 'lu-yuhan')!.nickname;
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
test('Mobile create action stays reachable without safe-area values', async ({ page }) => {
  // Simulate a WebView that parses env() but does not expose the safe-area variable.
  await page.route('**/*.css', async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: (await response.text()).replaceAll('safe-area-inset-bottom', 'unavailable-safe-area'),
    });
  });
  await page.goto('/');
  const initialDate = (await page.getByLabel('选择日期').getAttribute('title'))!;
  const button = page.locator('.floating-create');
  for (const width of [320, 375, 430]) {
    await page.setViewportSize({ width, height: 740 });
    await selectDate(page, '2026-08-30');
    await expect(button).toHaveAccessibleName('补个泡');
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(button).toBeInViewport({ ratio: 1 });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(button).toBeInViewport({ ratio: 1 });
    await button.click();
    await expect(page.getByRole('dialog', { name: '谁来冒个泡？' })).toBeVisible();
    await page.getByRole('button', { name: '关闭', exact: true }).click();
    await selectDate(page, initialDate);
    await expect(button).toHaveAccessibleName('冒个泡');
    await expect(button).toBeInViewport({ ratio: 1 });
  }
});

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
  const initialDate = (await page.getByLabel('选择日期').getAttribute('title'))!;
  await selectDate(page, '2026-08-29');
  await expect(page.getByLabel('选择日期')).toHaveAttribute('title', '2026-08-29');
  await selectDate(page, initialDate);
  await expect(page.getByLabel('选择日期')).toHaveAttribute('title', initialDate);
  await expect(page.getByRole('heading', { name: '和朋友的同一时间' })).toBeVisible();
  await expect(page.locator('.floating-create')).toBeInViewport();
  await page.screenshot({ path: 'test-results/home-375.png', fullPage: true });
  await page.locator('.floating-create').click();
  await expect(page.getByRole('dialog', { name: '谁来冒个泡？' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: testNickname, exact: true }).click();
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByLabel('想说的话').fill('和朋友们在同一天，收集一个小小的开心。');
  await page.getByLabel('发生的时间').fill(time);
  await page.getByRole('button', { name: '表情', exact: true }).click();
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
  await expect(page.getByRole('heading', { name: '和朋友的同一时间' })).toBeVisible();
  await expect(page.getByLabel('选择日期')).toHaveAttribute('title', '2026-08-29');
  await expect(page.getByText('和朋友们在同一天，收集一个小小的开心。')).toBeVisible();
  await page.screenshot({ path: 'test-results/timeline-375.png', fullPage: true });
  await page.getByRole('button', { name: '制作回忆' }).click();
  await page.screenshot({ path: 'test-results/export-options-375.png', fullPage: true });
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
  await expect(page.getByRole('link', { name: '下载图片合集', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: '下载图片', exact: true })).toBeInViewport();
  const pngDownload = page.waitForEvent('download');
  await page.getByRole('link', { name: '下载图片', exact: true }).click();
  expect((await pngDownload).suggestedFilename()).toBe('和朋友的同一时间-2026-08-29-手账-01.png');
  await page.screenshot({ path: 'test-results/export-375.png', fullPage: true });
  await page.getByRole('button', { name: '返回导出选项' }).click();
  let archiveDownloads = 0;
  page.on('download', () => archiveDownloads++);
  await page.getByRole('button', { name: /素材 ZIP/ }).click();
  const prompt = page.getByLabel('AI 提示词', { exact: true });
  await expect(prompt).toHaveValue(/manifest.json/);
  await expect(prompt).toHaveValue(/2026-08-29/);
  expect(archiveDownloads).toBe(0);
  const archiveDownload = page.getByRole('link', { name: '下载压缩包', exact: true });
  await expect(archiveDownload).toBeInViewport({ ratio: 1 });
  const downloadPosition = await archiveDownload.boundingBox();
  await prompt.evaluate((el) => (el.scrollTop = el.scrollHeight));
  expect(await prompt.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  expect(await archiveDownload.boundingBox()).toEqual(downloadPosition);
  await page.setViewportSize({ width: 375, height: 480 });
  await expect(archiveDownload).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole('button', { name: '返回导出选项' })).toBeInViewport({ ratio: 1 });
  await page.setViewportSize({ width: 375, height: 812 });
  await prompt.evaluate((el) => (el.scrollTop = 0));
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
  const copyButton = page.locator('.archive-prompt-heading').getByRole('button');
  await copyButton.click();
  await expect(copyButton).toHaveAccessibleName('提示词已复制');
  await expect(copyButton.locator('.lucide-check')).toBeVisible();
  await expect(page.getByText('提示词已复制', { exact: true })).toHaveCount(0);
  expect(
    await page.evaluate(() => (window as unknown as { copiedPrompt: string }).copiedPrompt),
  ).toBe(await prompt.inputValue());
  await page.screenshot({ path: 'test-results/archive-prompt-375.png', fullPage: true });
  await expect(copyButton).toHaveAccessibleName('复制提示词');
  await expect(copyButton.locator('.lucide-copy')).toBeVisible();
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
  await expect(copyButton.locator('.lucide-copy')).toBeVisible();
  expect(
    await prompt.evaluate((el: HTMLTextAreaElement) => el.selectionEnd - el.selectionStart),
  ).toBe((await prompt.inputValue()).length);
  await expect(archiveDownload).toBeInViewport({ ratio: 1 });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: '下载压缩包', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('和朋友的同一时间-2026-08-29-素材包.zip');
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: new RegExp(`更多操作：${testNickname}`) }).click();
  await page.getByRole('button', { name: new RegExp(`编辑${testNickname}`) }).click();
  await page.getByLabel('想说的话').fill('修改后的记录');
  await page.getByRole('button', { name: '保存修改' }).click();
  await expect(page.getByText('修改后的记录')).toBeVisible();
  await page.reload();
  await selectDate(page, '2026-08-29');
  await expect(page.getByText('修改后的记录')).toBeVisible();
  await page.getByRole('button', { name: new RegExp(`更多操作：${testNickname}`) }).click();
  await page.getByRole('button', { name: new RegExp(`删除${testNickname}`) }).click();
  await page.getByRole('button', { name: '再想想' }).click();
  await expect(page.getByText('修改后的记录')).toBeVisible();
  await page.getByRole('button', { name: new RegExp(`更多操作：${testNickname}`) }).click();
  await page.getByRole('button', { name: new RegExp(`删除${testNickname}`) }).click();
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
  // A card prepared in the preceding interaction may still own the shared renderer.
  let result = await request.post('/api/exports/images', { data: { date }, timeout: 110000 });
  await expect
    .poll(
      async () => {
        if (result.status() === 429)
          result = await request.post('/api/exports/images', { data: { date }, timeout: 110000 });
        return result.status();
      },
      { timeout: 110000 },
    )
    .toBe(200);
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
  expect(data).not.toHaveProperty('archiveUrl');
  await page.setViewportSize({ width: 430, height: 932 });
  await page.goto('/');
  await selectDate(page, date);
  await page.getByRole('button', { name: '制作回忆' }).click();
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
  expect((await currentDownload).suggestedFilename()).toBe(`和朋友的同一时间-${date}-手账-02.png`);
  await expect(page.getByRole('link', { name: '下载图片合集', exact: true })).toHaveCount(0);
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
  await expect(page.getByRole('button', { name: '照片', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
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
  await page.getByRole('button', { name: /^筛选朋友：/ }).click();
  await page.getByRole('button', { name: '水水', exact: true }).click();
  await page.locator('.floating-create').click();
  await expect(page.getByLabel('发生的时间')).toHaveValue(/2026-08-27T/);
  await page.getByRole('button', { name: /换一位朋友/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: testNickname, exact: true }).click();
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByRole('button', { name: '表情', exact: true }).click();
  await page.getByRole('button', { name: '选择表情', exact: true }).click();
  await page.getByRole('button', { name: '好开心', exact: true }).click();
  await page.getByLabel('想说的话').fill('新朋友的表情');
  await page.getByLabel('发生的时间').fill('2026-08-27T10:31');
  await page.getByRole('button', { name: '发布' }).click();
  await expect(page.getByText('新朋友的表情')).toBeVisible();
  await expect(page.getByRole('button', { name: '筛选朋友：全部朋友' })).toBeVisible();
  await page.getByRole('button', { name: /^筛选朋友：/ }).click();
  const filters = page.getByRole('group', { name: '按人物筛选' }).getByRole('button');
  await expect(filters).toHaveText(['全部朋友', ...people.map((p) => p.nickname)]);
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.reload();
  await selectDate(page, '2026-08-27');
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
  await selectDate(page, '2026-08-26');
  await expect(page.locator(`#entry-${entry.id} img`).last()).toBeVisible();
  const card = page.locator(`#entry-${entry.id}`);
  const cardBounds = (await card.boundingBox())!;
  // The text area and outer padding both open the same preview as the emoji.
  for (const position of [
    { x: cardBounds.width - 24, y: cardBounds.height - 24 },
    { x: 8, y: 8 },
  ]) {
    await card.click({ position });
    await expect(page.getByRole('dialog', { name: `${testNickname} · 10:00` })).toBeVisible();
    await expect(page.getByRole('dialog').getByText('旧表情记录')).toBeVisible();
    await page.getByRole('button', { name: '关闭', exact: true }).click();
  }
  await card.getByRole('button', { name: '查看😊', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: `${testNickname} · 10:00` })).toBeVisible();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  const exported = await request.get('/api/exports/archive?date=2026-08-26');
  expect(exported.status()).toBe(200);
  const { unzipSync } = await import('fflate');
  const files = unzipSync(new Uint8Array(await exported.body()));
  expect(Object.keys(files).some((name) => name.endsWith('.png'))).toBe(true);
  await page.getByRole('button', { name: new RegExp(`更多操作：${testNickname}`) }).click();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(page.getByRole('dialog', { name: '动态操作' })).toBeVisible();
  await page.getByRole('button', { name: new RegExp(`编辑${testNickname}`) }).click();
  const originalSrc = await page.locator('.selected-media img').getAttribute('src');
  await page.getByRole('button', { name: '更换表情', exact: true }).click();
  await page.getByRole('button', { name: '线条涂鸦', exact: true }).click();
  await page.getByRole('button', { name: '最近', exact: true }).click();
  await expect(page.getByText('这套表情还没有使用记录')).toBeVisible();
  await page.getByRole('button', { name: '吃喝', exact: true }).click();
  await expect(page.getByRole('button', { name: '嗦面时间', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '好开心', exact: true })).toHaveCount(0);
  await page.screenshot({ path: 'test-results/sticker-categories-375.png' });
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
  const savedResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/entries/${entry.id}`) &&
      response.request().method() === 'PATCH',
  );
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  expect((await savedResponse).status()).toBe(200);
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
  await selectDate(page, date);
  await expect(page.locator('.hour-heading time')).toHaveText(['11:00', '10:00', '09:00']);
  expect(await page.locator('.moment-card').evaluateAll((nodes) => nodes.map((n) => n.id))).toEqual(
    [ids[3], ids[1], ids[0], ids[2]].map((id) => `entry-${id}`),
  );
  await expect(page.getByText('2 位朋友的此刻')).toBeVisible();
  await page.getByRole('button', { name: /^筛选朋友：/ }).click();
  await page.getByRole('button', { name: '水水', exact: true }).click();
  await expect(page.getByRole('button', { name: '筛选朋友：水水' })).toBeVisible();
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
  await selectDate(page, '2026-08-24');
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
  await selectDate(page, '2026-08-23');
  await page.locator('.floating-create').click();
  await expect(page.getByLabel('想说的话')).toHaveValue('');
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await selectDate(page, '2026-08-24');
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
    await selectDate(page, '2024-02-28');
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
    await expect(page.getByLabel('选择日期')).toHaveAttribute('title', '2024-02-29');
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
    await expect(page.getByLabel('选择日期')).toHaveAttribute(
      'title',
      new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10),
    );
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

test('new brand fits mobile and all credits live in the home acknowledgements', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/');
  await expect(page).toHaveTitle(/和朋友的同一时间/);
  await expect(
    page.getByRole('heading', { name: '和朋友的同一时间首页', exact: true }),
  ).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/©|CC BY|Kevin MacLeod/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/brand-320.png', fullPage: true });
  await page.getByRole('button', { name: '素材鸣谢' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('和朋友的同一时间 ©');
  await expect(dialog).toContainText('Fluent Emoji');
  await expect(dialog).toContainText('Twemoji');
  await expect(dialog).toContainText('OpenMoji');
  await expect(dialog).toContainText('Noto Sans CJK');
  await expect(dialog.getByRole('link', { name: /Kevin MacLeod/ })).toHaveCount(24);
  await expect(dialog.getByRole('link', { name: '完整音乐许可与来源' })).toBeVisible();
});

test('Calendar trigger restores focus without reopening and header stays aligned', async ({
  page,
}) => {
  await page.goto('/');
  const trigger = page.getByRole('button', { name: '选择日期', exact: true });
  await expect(page.locator('.brand-header input')).toHaveCount(0);
  await trigger.focus();
  await page.keyboard.press('Enter');
  const calendar = page.getByRole('dialog', { name: '翻到哪一天？' });
  await expect(calendar).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(calendar).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Space');
  await expect(calendar).toBeVisible();
  await calendar.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(trigger).toBeFocused();
  await selectDate(page, '2024-02-29');
  await expect(trigger).toBeFocused();
  for (const width of [320, 375, 390, 430, 540]) {
    await page.setViewportSize({ width, height: 812 });
    await page.evaluate(() => document.fonts.ready);
    const layout = await page.locator('.brand-header').evaluate((header) => {
      const title = header.querySelector('h1')!.getBoundingClientRect();
      const subtitle = header.querySelector('p')!.getBoundingClientRect();
      const date = header.querySelector('.date-picker')!.getBoundingClientRect();
      const action = document
        .querySelector('.floating-actions .export-trigger')!
        .getBoundingClientRect();
      const create = document.querySelector('.floating-create')!.getBoundingClientRect();
      return {
        titleFits: title.right <= date.left,
        actionsAligned:
          create.right < action.left &&
          create.top === action.top &&
          create.height === action.height,
        actionsVisible: action.right <= window.innerWidth && action.bottom <= window.innerHeight,
        subtitleFits: subtitle.right <= date.left,
        overflow: document.documentElement.scrollWidth > window.innerWidth,
        titleHeight: title.height,
      };
    });
    expect(layout.titleFits).toBe(true);
    expect(layout.actionsAligned).toBe(true);
    expect(layout.actionsVisible).toBe(true);
    expect(layout.subtitleFits).toBe(true);
    expect(layout.overflow).toBe(false);
    expect(layout.titleHeight).toBeLessThan(35);
  }
  await page.screenshot({ path: 'test-results/header-updated.png' });
});

test('Compact friend filter uses default order, closes on selection and restores focus', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('parallel.lastSubmittedPerson', JSON.stringify('lu-yuhan'));
    localStorage.setItem('parallel.person', JSON.stringify('jia-quan'));
  });
  await page.reload();
  const trigger = page.getByRole('button', { name: /^筛选朋友：/ });
  await expect(trigger).toHaveAccessibleName('筛选朋友：全部朋友');
  await expect(page.locator('.people-panel, .timeline-summary')).toHaveCount(0);
  for (const width of [320, 375, 1502]) {
    await page.setViewportSize({ width, height: 812 });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: '选择朋友' });
    const filters = dialog.getByRole('button', { pressed: true });
    await expect(filters).toHaveText('全部朋友');
    await expect(dialog.getByRole('group').getByRole('button')).toHaveText([
      '全部朋友',
      ...people.map((p) => p.nickname),
    ]);
    await dialog.getByRole('button', { name: '水水', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toHaveAccessibleName('筛选朋友：水水');
    await expect(trigger).toBeFocused();
    const layout = await page.locator('.timeline-heading').evaluate((row) => {
      const title = row.querySelector('h2')!.getBoundingClientRect();
      const button = row.querySelector('button')!.getBoundingClientRect();
      return (
        title.right < button.left &&
        button.right <= innerWidth &&
        Math.abs(title.y + title.height / 2 - button.y - button.height / 2) < 1
      );
    });
    expect(layout).toBe(true);
    await trigger.press('Enter');
    await expect(dialog.getByRole('button', { name: '水水', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
    await trigger.click();
    await dialog.getByRole('button', { name: '全部朋友', exact: true }).click();
    await page.screenshot({ path: `test-results/compact-filter-${width}.png`, fullPage: true });
  }
});
