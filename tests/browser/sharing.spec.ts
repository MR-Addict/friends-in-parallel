import { test, expect, type Page } from '@playwright/test';

const date = '2026-08-24';
async function mockShare(page: Page, mode = 'ok') {
  await page.addInitScript((mode) => {
    const state = { mode, active: true, calls: [] as unknown[] };
    (window as any).sharing = state;
    Object.defineProperty(navigator, 'userActivation', {
      configurable: true,
      value: {
        get isActive() {
          return state.active;
        },
      },
    });
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value:
        mode === 'missing'
          ? undefined
          : (data: ShareData) => {
              return !(
                state.mode === 'unsupported' ||
                (state.mode === 'zip' && data.files?.[0]?.type === 'application/zip') ||
                (state.mode === 'actual' && data.files?.[0]?.size)
              );
            },
    });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data: ShareData) => {
        if (state.mode === 'cancel') throw new DOMException('Cancelled', 'AbortError');
        if (state.mode === 'failure') throw new DOMException('Failed', 'DataError');
        state.calls.push({
          text: data.text,
          files: await Promise.all(
            (data.files || []).map(async (f) => ({
              name: f.name,
              type: f.type,
              body: await f.text(),
            })),
          ),
        });
      },
    });
  }, mode);
}
async function openExport(page: Page) {
  await page.goto('/');
  await page.getByLabel('选择日期').fill(date);
  await page.getByRole('button', { name: '生成今日手账' }).click();
}
async function openArchive(page: Page) {
  await openExport(page);
  await page.getByRole('button', { name: '下载素材 ZIP' }).click();
}
async function calls(page: Page) {
  return page.evaluate(() => (window as any).sharing.calls);
}

test.beforeEach(async ({ context, page }) => {
  const expiry = Date.now() + 86400_000;
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
  await page.route('**/api/entries?*', (route) =>
    route.fulfill({
      json: [
        {
          id: 'fixture',
          personId: 'lu-yuhan',
          media: { type: 'sticker', stickerId: 'fluent-1f60a' },
          description: '日常',
          occurredAt: `${date}T06:30:00Z`,
          createdAt: date,
          updatedAt: date,
        },
      ],
    }),
  );
  await page.route('**/api/exports/archive?date=*', (route) =>
    route.fulfill({
      contentType: 'application/zip',
      body: 'zip-content',
      headers: {
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`此刻同频-${date}-素材包.zip`)}`,
      },
    }),
  );
});

for (const mode of ['missing', 'unsupported', 'zip']) {
  test(`hide unsupported archive share: ${mode}`, async ({ page }) => {
    await mockShare(page, mode);
    await openArchive(page);
    await expect(page.getByRole('button', { name: '分享压缩包' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '下载压缩包', exact: true })).toBeEnabled();
  });
}
for (const width of [375, 430]) {
  test(`share archive on demand and keep download at ${width}px`, async ({ page }) => {
    let reads = 0;
    page.on('request', (req) => {
      if (req.url().includes('/api/exports/archive?')) reads++;
    });
    await mockShare(page);
    await page.setViewportSize({ width, height: 812 });
    await openArchive(page);
    expect(reads).toBe(0);
    await expect(page.getByRole('button', { name: '分享压缩包' })).toBeInViewport();
    await expect(page.getByRole('button', { name: '下载压缩包', exact: true })).toBeInViewport();
    await page.getByRole('button', { name: '分享压缩包' }).click();
    await expect
      .poll(() => calls(page))
      .toEqual([
        {
          files: [
            { name: `此刻同频-${date}-素材包.zip`, type: 'application/zip', body: 'zip-content' },
          ],
        },
      ]);
    await page.screenshot({ path: `test-results/share-archive-${width}.png` });
  });
}

test('prepared file waits for another click and is reused', async ({ page }) => {
  await mockShare(page);
  await openArchive(page);
  await page.evaluate(() => {
    (window as any).sharing.active = false;
  });
  await page.getByRole('button', { name: '分享压缩包' }).click();
  await expect(page.locator('.resource-share button').first()).toBeEnabled();
  await expect(page.getByText('文件已准备好，点击分享')).toHaveCount(0);
  expect(await calls(page)).toHaveLength(0);
  await page.unroute('**/api/exports/archive?date=*');
  await page.route('**/api/exports/archive?date=*', (route) => route.abort());
  await page.getByRole('button', { name: '分享压缩包' }).click();
  await expect.poll(async () => (await calls(page)).length).toBe(1);
});

for (const mode of ['actual', 'cancel', 'failure']) {
  test(`handle ${mode} without losing download`, async ({ page }) => {
    await mockShare(page, mode);
    await openArchive(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.evaluate(() => document.fonts.ready);
    const button = page.locator('.resource-share button');
    const before = await button.boundingBox();
    await button.click();
    await expect(button).toBeEnabled();
    await expect(button).toHaveText(
      mode === 'cancel' ? '分享压缩包' : mode === 'actual' ? '暂不支持分享' : '分享失败，点击重试',
    );
    expect(await button.boundingBox()).toEqual(before);
    await expect(page.locator('.resource-share p')).toHaveCount(0);
    if (mode === 'failure') {
      await page.evaluate(() => {
        (window as any).sharing.mode = 'ok';
      });
      await button.click();
      await expect.poll(async () => (await calls(page)).length).toBe(1);
      await expect(button).toHaveText('分享压缩包');
    }
    await expect(page.getByRole('button', { name: '下载压缩包', exact: true })).toBeEnabled();
  });
}

test('fetch failure retries; closing during preparation never opens share', async ({ page }) => {
  await mockShare(page);
  await openArchive(page);
  await page.route('**/api/exports/archive?date=*', (route) => route.fulfill({ status: 404 }));
  await page.getByRole('button', { name: '分享压缩包' }).click();
  await expect(page.getByRole('button', { name: '读取失败，点击重试' })).toBeEnabled();
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/exports/archive?date=*', async (route) => {
    await pending;
    await route.fulfill({ body: 'zip', contentType: 'application/zip' }).catch(() => {});
  });
  await page.getByRole('button', { name: '读取失败，点击重试' }).click();
  await expect(page.getByRole('button', { name: '正在准备分享…' })).toBeDisabled();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  release();
  await openArchive(page);
  expect(await calls(page)).toHaveLength(0);
  await expect(page.getByText('文件已准备好，点击分享')).toHaveCount(0);
});

test('paginated image and collection share use current resource', async ({ page }) => {
  await mockShare(page);
  await page.route('**/api/exports/images', (route) =>
    route.fulfill({
      json: {
        images: ['/share/01.png', '/share/02.png'],
        archiveUrl: '/share/all.zip',
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      },
    }),
  );
  await page.route('**/share/*', (route) =>
    route.fulfill({
      body: route.request().url().includes('02') ? 'page2' : 'page1',
      contentType: route.request().url().includes('zip') ? 'application/zip' : 'image/png',
    }),
  );
  await openExport(page);
  await page.getByRole('button', { name: '生成手账长图' }).click();
  await page.evaluate(() => {
    (window as any).sharing.active = false;
  });
  await page.getByRole('button', { name: '分享当前图片' }).click();
  await expect(page.locator('.resource-share button').first()).toBeEnabled();
  await expect(page.getByText('文件已准备好，点击分享')).toHaveCount(0);
  await page.getByRole('button', { name: '下一张图片' }).click();
  await expect(page.getByText('文件已准备好，点击分享')).toHaveCount(0);
  await page.evaluate(() => {
    (window as any).sharing.active = true;
  });
  await page.getByRole('button', { name: '分享当前图片' }).click();
  await expect
    .poll(async () => (await calls(page))[0]?.files[0])
    .toEqual({ name: `此刻同频-${date}-手账-02.png`, type: 'image/png', body: 'page2' });
  await page.getByRole('button', { name: '分享图片合集' }).click();
  await expect
    .poll(async () => (await calls(page))[1]?.files[0].name)
    .toBe(`此刻同频-${date}-手账合集.zip`);
});

test('entry share includes original media and local time; legacy emoji falls back to text', async ({
  page,
}) => {
  await mockShare(page);
  await page.route('**/api/entries?*', (route) =>
    route.fulfill({
      json: [
        {
          id: 'photo',
          personId: 'lu-yuhan',
          media: { type: 'photo', filename: 'original.jpg', mime: 'image/jpeg' },
          description: '今天很开心',
          occurredAt: `${date}T06:30:00Z`,
          createdAt: date,
          updatedAt: date,
        },
        {
          id: 'emoji',
          personId: 'lu-yuhan',
          media: { type: 'emoji', emoji: '🫩' },
          description: '旧表情',
          occurredAt: `${date}T05:30:00Z`,
          createdAt: date,
          updatedAt: date,
        },
      ],
    }),
  );
  await page.route('**/uploads/original.jpg', (route) =>
    route.fulfill({ body: 'original-photo', contentType: 'image/jpeg' }),
  );
  await page.goto('/');
  await page.getByLabel('选择日期').fill(date);
  await page.getByRole('button', { name: /更多操作：.*14:30/ }).click();
  await page.getByRole('button', { name: '分享动态' }).click();
  await expect
    .poll(async () => (await calls(page))[0]?.text)
    .toContain(`${date} 14:30（北京时间）\n今天很开心`);
  expect((await calls(page))[0].files[0]).toEqual({
    name: `此刻同频-${date}-14-30-照片.jpg`,
    type: 'image/jpeg',
    body: 'original-photo',
  });
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: /更多操作：.*13:30/ }).click();
  await page.getByRole('button', { name: '分享动态' }).click();
  await expect.poll(async () => (await calls(page))[1]?.text).toContain('旧表情\n🫩');
  expect((await calls(page))[1].files).toEqual([]);
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: '查看上传的照片' }).click();
  await expect(
    page.getByRole('dialog').getByRole('link', { name: /下载照片|下载图片/ }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: '分享照片' }).click();
  await expect.poll(async () => (await calls(page))[2]?.files[0].body).toBe('original-photo');
});

test('video file shares with server filename and disappears after expiry', async ({ page }) => {
  await mockShare(page);
  await page.route('**/api/exports/video-options', (route) =>
    route.fulfill({
      json: {
        available: true,
        styles: [{ id: 'paper', name: '手账', defaultMusicId: 'none' }],
        music: [],
      },
    }),
  );
  const result = {
    videoUrl: '/share/video.mp4',
    coverUrl: '/share/cover.png',
    duration: 20,
    expiresAt: new Date(Date.now() + 120000).toISOString(),
  };
  await page.route('**/api/exports/videos/saved', (route) =>
    route.fulfill({
      json: { jobId: 'saved', status: 'ready', styleId: 'paper', musicId: 'none', result },
    }),
  );
  await page.route('**/share/video.mp4*', (route) =>
    route.fulfill({
      contentType: 'video/mp4',
      body: 'video-content',
      headers: {
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`此刻同频-${date}-回忆视频-手账.mp4`)}`,
      },
    }),
  );
  await page.goto('/');
  await page.evaluate(
    (date) =>
      localStorage.setItem(
        `parallel-video:${date}`,
        JSON.stringify({ jobId: 'saved', styleId: 'paper', musicId: 'none' }),
      ),
    date,
  );
  await page.getByLabel('选择日期').fill(date);
  await page.getByRole('button', { name: '生成今日手账' }).click();
  await page.getByRole('button', { name: '生成回忆视频' }).click();
  await page.getByRole('button', { name: '分享视频' }).click();
  await expect
    .poll(async () => (await calls(page))[0]?.files[0])
    .toEqual({
      name: `此刻同频-${date}-回忆视频-手账.mp4`,
      type: 'video/mp4',
      body: 'video-content',
    });
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  result.expiresAt = new Date(Date.now() - 1000).toISOString();
  await page.getByRole('button', { name: '生成今日手账' }).click();
  await page.getByRole('button', { name: '生成回忆视频' }).click();
  await expect(page.getByRole('button', { name: '重新生成视频' })).toBeVisible();
  await expect(page.getByRole('button', { name: '分享视频' })).toHaveCount(0);
});

test('sticker shares original SVG with its MIME type', async ({ page }) => {
  await mockShare(page);
  await page.route('**/api/entries?*', (route) =>
    route.fulfill({
      json: [
        {
          id: 'svg',
          personId: 'lu-yuhan',
          media: { type: 'sticker', stickerId: 'twemoji-1f60a' },
          description: '贴纸',
          occurredAt: `${date}T06:30:00Z`,
          createdAt: date,
          updatedAt: date,
        },
      ],
    }),
  );
  await page.route('**/stickers/twemoji/1f60a.svg', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg"/>',
    }),
  );
  await page.goto('/');
  await page.getByLabel('选择日期').fill(date);
  await page.getByRole('button', { name: /更多操作：/ }).click();
  await page.getByRole('button', { name: '分享动态' }).click();
  await expect
    .poll(async () => (await calls(page))[0]?.files[0])
    .toEqual({
      name: `此刻同频-${date}-14-30-表情.svg`,
      type: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg"/>',
    });
});

test('canShare alone does not expose sharing without share', async ({ page }) => {
  await mockShare(page);
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined }),
  );
  await openArchive(page);
  await expect(page.getByRole('button', { name: '分享压缩包' })).toHaveCount(0);
});
