import { selectDate } from './calendar';
import { people } from '@parallel/config';
import { test, expect } from '@playwright/test';

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
for (const width of [375, 430, 1100]) {
  test(`video configuration, preview, persistence and sharing at ${width}px`, async ({
    page,
    request,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
      Object.defineProperty(navigator, 'share', {
        value: async (data: ShareData) => {
          (window as any).sharedVideo = data.files?.[0]?.name;
        },
        configurable: true,
      });
    });
    const date = '2026-08-25';
    const entries = await (await request.get(`/api/entries?date=${date}`)).json();
    for (const entry of entries) await request.delete(`/api/entries/${entry.id}`);
    await request.post('/api/entries', {
      data: {
        personId: people[0].id,
        mediaType: 'sticker',
        stickerId: 'twemoji-1f60a',
        description: '给未来的我们，留下一点今天的快乐。',
        occurredAt: `${date}T06:30:00Z`,
      },
    });
    await page.setViewportSize({ width, height: 812 });
    await page.goto('/');
    await selectDate(page, date);
    await page.getByRole('button', { name: '制作回忆' }).click();
    const labels = await page.locator('.export-options strong').allTextContents();
    expect(labels).toEqual(['生成手账长图', '生成回忆视频', '素材 ZIP']);
    await page.getByRole('button', { name: /生成回忆视频/ }).click();
    await expect(page.locator('.video-style-option')).toHaveCount(12);
    await expect(page.getByRole('dialog')).not.toContainText(/Kevin MacLeod|CC BY|署名|许可/);
    await page.getByRole('combobox', { name: '背景音乐' }).click();
    await expect(page.getByRole('option')).toHaveCount(25);
    await page.getByRole('combobox', { name: '背景音乐' }).press('Escape');
    await expect(page.getByRole('button', { name: '开始生成视频' })).toBeInViewport();
    await page.screenshot({ path: `test-results/video-options-${width}.png` });
    await page.getByRole('button', { name: '试听背景音乐' }).click();
    await expect(page.getByRole('button', { name: '停止试听' })).toBeVisible();
    await page.getByRole('combobox', { name: '背景音乐' }).click();
    await page.getByRole('option', { name: '无音乐 · 安静回顾' }).click();
    await expect(page.getByRole('button', { name: '试听背景音乐' })).toBeDisabled();
    await page.getByRole('button', { name: /拍立得相册/ }).click();
    await expect(page.getByLabel('背景音乐', { exact: true })).toContainText('Daily Beetle');
    await page.getByRole('combobox', { name: '背景音乐' }).click();
    await page.getByRole('option', { name: '无音乐 · 安静回顾' }).click();
    await page.getByRole('button', { name: '返回导出选项' }).click();
    await page.getByRole('button', { name: /生成回忆视频/ }).click();
    await expect(page.getByLabel('背景音乐', { exact: true })).toContainText('无音乐');
    await expect(page.getByRole('button', { name: /拍立得相册/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const submitted = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/exports/videos') && response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: '开始生成视频' }).click();
    expect((await submitted).status()).toBe(202);
    await page.getByRole('button', { name: '关闭', exact: true }).click();
    await page.reload();
    await selectDate(page, date);
    await page.getByRole('button', { name: '制作回忆' }).click();
    await page.getByRole('button', { name: /生成回忆视频/ }).click();
    await expect(page.getByRole('button', { name: '分享视频' })).toBeVisible({ timeout: 90000 });
    await expect(page.getByRole('button', { name: '分享视频' })).toBeInViewport();
    const video = page.getByLabel('回忆视频预览');
    await expect
      .poll(() => video.evaluate((node: HTMLVideoElement) => node.readyState))
      .toBeGreaterThanOrEqual(1);
    expect(
      await video.evaluate((node: HTMLVideoElement) => [node.videoWidth, node.videoHeight]),
    ).toEqual([1080, 1920]);
    await video.evaluate(async (node: HTMLVideoElement) => {
      node.muted = true;
      await node.play();
      node.currentTime = 5;
    });
    await expect
      .poll(() => video.evaluate((node: HTMLVideoElement) => node.currentTime))
      .toBeGreaterThanOrEqual(5);
    await video.evaluate((node: HTMLVideoElement) => node.pause());
    await expect(page.getByRole('dialog')).not.toContainText(
      /拍立得相册|Kevin MacLeod|CC BY|署名|许可/,
    );
    await page.screenshot({ path: `test-results/video-ready-${width}.png` });
    await expect(page.getByRole('link', { name: '下载视频' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '分享视频' })).toHaveClass(/primary/);
    await page.getByRole('button', { name: '分享视频' }).click();
    await expect(page.getByRole('button', { name: '分享视频' })).toBeEnabled();
    await expect
      .poll(() => page.evaluate(() => (window as any).sharedVideo))
      .toBe(`和朋友的同一时间-${date}-回忆视频.mp4`);
    if (width === 375) {
      const latest = await (await request.get(`/api/entries?date=${date}`)).json();
      const videoUrl = await video.getAttribute('src');
      await request.delete(`/api/entries/${latest[0].id}`);
      expect((await request.get(videoUrl!)).status()).toBe(404);
      // Returning to the page revalidates the prepared file immediately.
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      await expect(video).toHaveCount(0);
      await expect(page.getByRole('alert')).toContainText('重新生成');
      const saved = await page.evaluate(
        (date) => JSON.parse(localStorage.getItem(`parallel-video:${date}`)!),
        date,
      );
      expect(saved.jobId).toBe('');
    } else {
      await page.getByRole('button', { name: '修改样式与音乐' }).click();
    }
    await expect(page.getByLabel('背景音乐', { exact: true })).toContainText('无音乐');
  });
}
test('video errors and expired tasks preserve selections and permit regeneration', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await page.evaluate(() =>
    localStorage.setItem(
      'parallel-video:2026-08-25',
      JSON.stringify({ jobId: 'old', styleId: 'night', musicId: 'none' }),
    ),
  );
  await selectDate(page, '2026-08-25');
  await page.getByRole('button', { name: '制作回忆' }).click();
  await page.getByRole('button', { name: /生成回忆视频/ }).click();
  await expect(page.getByRole('alert')).toContainText('已过期');
  await expect(page.getByRole('button', { name: '开始生成视频' })).toBeEnabled();
  await expect(page.getByRole('button', { name: /夜色留白/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByLabel('背景音乐', { exact: true })).toContainText('无音乐');
  await page.route('**/api/exports/videos', (route) =>
    route.fulfill({ status: 429, json: { error: '另一份手账或视频正在生成，请稍后再试' } }),
  );
  await page.getByRole('button', { name: '开始生成视频' }).click();
  await expect(page.getByRole('alert')).toContainText('稍后再试');
  await expect(page.getByRole('button', { name: '开始生成视频' })).toBeEnabled();
});
