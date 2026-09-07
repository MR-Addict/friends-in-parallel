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
  await page.getByRole('button', { name: '制作回忆' }).click();
}
async function openImage(page: Page) {
  await openExport(page);
  await page.getByRole('button', { name: '生成手账长图' }).click();
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
  await page.route('**/api/exports/images', (route) =>
    route.fulfill({
      json: {
        images: ['/share/single.png'],
        archiveUrl: '/share/all.zip',
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      },
    }),
  );
  await page.route('**/share/single.png', (route) =>
    route.fulfill({
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
        'base64',
      ),
    }),
  );
  await page.route('**/share/single.png?download=1', (route) =>
    route.fulfill({
      contentType: 'image/png',
      body: 'image-content',
      headers: {
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`和朋友的同一时间-${date}-手账-01.png`)}`,
      },
    }),
  );
});

for (const mode of ['missing', 'unsupported']) {
  test(`hide unsupported image share: ${mode}`, async ({ page }) => {
    await mockShare(page, mode);
    await openImage(page);
    await expect(page.getByRole('button', { name: '分享图片' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: '下载图片', exact: true })).toBeEnabled();
  });
}
for (const width of [375, 430]) {
  test(`share image on demand and keep download at ${width}px`, async ({ page }) => {
    let reads = 0;
    page.on('request', (req) => {
      if (req.url().includes('/share/single.png?download=1')) reads++;
    });
    await mockShare(page);
    await page.setViewportSize({ width, height: 812 });
    await openImage(page);
    expect(reads).toBe(0);
    await expect(page.getByRole('button', { name: '分享图片' })).toBeInViewport();
    await expect(page.getByRole('link', { name: '下载图片', exact: true })).toBeInViewport();
    await page.getByRole('button', { name: '分享图片' }).click();
    await expect
      .poll(() => calls(page))
      .toEqual([
        {
          files: [
            {
              name: `和朋友的同一时间-${date}-手账-01.png`,
              type: 'image/png',
              body: 'image-content',
            },
          ],
        },
      ]);
    await page.screenshot({ path: `test-results/share-image-${width}.png` });
  });
}

test('prepared file waits for another click and is reused', async ({ page }) => {
  await mockShare(page);
  await openImage(page);
  await page.evaluate(() => {
    (window as any).sharing.active = false;
  });
  await page.getByRole('button', { name: '分享图片' }).click();
  await expect(page.locator('.resource-share button').first()).toBeEnabled();
  await expect(page.getByText('文件已准备好，点击分享')).toHaveCount(0);
  expect(await calls(page)).toHaveLength(0);
  await page.unroute('**/share/single.png?download=1');
  await page.route('**/share/single.png?download=1', (route) => route.abort());
  await page.getByRole('button', { name: '分享图片' }).click();
  await expect.poll(async () => (await calls(page)).length).toBe(1);
});

for (const mode of ['actual', 'cancel', 'failure']) {
  test(`handle ${mode} without losing download`, async ({ page }) => {
    await mockShare(page, mode);
    await openImage(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.evaluate(() => document.fonts.ready);
    const button = page.locator('.resource-share button');
    const before = await button.boundingBox();
    await button.click();
    await expect(button).toBeEnabled();
    await expect(button).toHaveText(
      mode === 'cancel' ? '分享图片' : mode === 'actual' ? '暂不支持分享' : '分享失败，点击重试',
    );
    expect(await button.boundingBox()).toEqual(before);
    await expect(page.locator('.resource-share p')).toHaveCount(0);
    if (mode === 'failure') {
      await page.evaluate(() => {
        (window as any).sharing.mode = 'ok';
      });
      await button.click();
      await expect.poll(async () => (await calls(page)).length).toBe(1);
      await expect(button).toHaveText('分享图片');
    }
    await expect(page.getByRole('link', { name: '下载图片', exact: true })).toBeEnabled();
  });
}

test('fetch failure retries; closing during preparation never opens share', async ({ page }) => {
  await mockShare(page);
  await openImage(page);
  await page.route('**/share/single.png?download=1', (route) => route.fulfill({ status: 404 }));
  await page.getByRole('button', { name: '分享图片' }).click();
  await expect(page.getByRole('button', { name: '读取失败，点击重试' })).toBeEnabled();
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/share/single.png?download=1', async (route) => {
    await pending;
    await route.fulfill({ body: 'zip', contentType: 'image/png' }).catch(() => {});
  });
  await page.getByRole('button', { name: '读取失败，点击重试' }).click();
  await expect(page.getByRole('button', { name: '正在准备分享…' })).toBeDisabled();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  release();
  await openImage(page);
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
    .toEqual({ name: `和朋友的同一时间-${date}-手账-02.png`, type: 'image/png', body: 'page2' });
  await expect(page.getByRole('button', { name: '分享图片合集' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: '下载图片合集' })).toBeVisible();
});

test('entry menu and photo detail share the original image', async ({ page }) => {
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
  await page.getByRole('button', { name: '分享图片' }).click();
  await expect
    .poll(async () => (await calls(page))[0]?.files[0])
    .toMatchObject({ type: 'image/jpeg', body: 'original-photo' });
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: '查看上传的照片' }).click();
  await expect(
    page.getByRole('dialog').getByRole('link', { name: /下载照片|下载图片/ }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: '分享照片' }).click();
  await expect.poll(async () => (await calls(page))[1]?.files[0].body).toBe('original-photo');
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: /更多操作：.*13:30/ }).click();
  await expect(page.getByRole('button', { name: '分享图片' })).toHaveCount(0);
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
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`和朋友的同一时间-${date}-回忆视频.mp4`)}`,
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
  await page.getByRole('button', { name: '制作回忆' }).click();
  await page.getByRole('button', { name: '生成回忆视频' }).click();
  await expect(page.getByRole('link', { name: '下载视频' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '分享视频' })).toHaveClass(/primary/);
  await expect(page.getByRole('button', { name: '修改样式与音乐' })).toHaveClass(/secondary/);
  await page.getByRole('button', { name: '分享视频' }).click();
  await expect
    .poll(async () => (await calls(page))[0]?.files[0])
    .toEqual({
      name: `和朋友的同一时间-${date}-回忆视频.mp4`,
      type: 'video/mp4',
      body: 'video-content',
    });
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  result.expiresAt = new Date(Date.now() - 1000).toISOString();
  await page.getByRole('button', { name: '制作回忆' }).click();
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
  await page.locator('.moment-media').click();
  await page.getByRole('button', { name: '分享图片' }).click();
  await expect
    .poll(async () => (await calls(page))[0]?.files[0])
    .toEqual({
      name: `和朋友的同一时间-${date}-14-30-表情.svg`,
      type: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg"/>',
    });
});

test('canShare alone does not expose sharing without share', async ({ page }) => {
  await mockShare(page);
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined }),
  );
  await openImage(page);
  await expect(page.getByRole('button', { name: '分享图片' })).toHaveCount(0);
});

test('materials ZIP has download only and home creation card is visible', async ({ page }) => {
  await mockShare(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  await page.getByLabel('选择日期').fill(date);
  await expect(page.getByRole('button', { name: '制作回忆', exact: true })).toBeInViewport();
  await expect(page.getByRole('button', { name: '制作回忆', exact: true })).toHaveAttribute(
    'title',
    '手账长图 · 回忆视频 · 素材下载',
  );
  expect((await page.locator('.moment-card').first().boundingBox())!.y).toBeLessThan(310);
  await expect(page.locator('.moment-card').first()).toBeInViewport();
  await page.screenshot({ path: 'test-results/creation-home-375.png' });
  await page.getByRole('button', { name: '制作回忆' }).click();
  await page.getByRole('button', { name: '下载素材 ZIP' }).click();
  await expect(page.getByRole('button', { name: '下载压缩包', exact: true })).toBeEnabled();
  await expect(page.locator('.resource-share')).toHaveCount(0);
});

for (const width of [375, 430]) {
  test(`compact browsing keeps the first moment above 310px at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 812 });
    await page.goto('/');
    await page.getByLabel('选择日期').fill(date);
    await page.evaluate(() => document.fonts.ready);
    const first = page.locator('.moment-card').first();
    await expect(first).toBeVisible();
    expect((await first.boundingBox())!.y).toBeLessThan(310);
    await expect(page.getByRole('button', { name: '制作回忆', exact: true })).toBeInViewport();
    const filters = page.getByRole('group', { name: '按人物筛选' });
    await filters.getByRole('button').last().click();
    await expect(filters.getByRole('button').last()).toHaveAttribute('aria-pressed', 'true');
    await filters.getByRole('button', { name: '全部朋友' }).click();
    await expect(first).toBeVisible();
    await expect(page.getByRole('navigation', { name: '日期导航' })).toHaveCount(0);
    await page.getByLabel('选择日期').click();
    await page.getByRole('button', { name: /^2026-08-23，/ }).click();
    await expect(page.getByLabel('选择日期')).toHaveValue('2026-08-23');
    await page.getByLabel('选择日期').click();
    await page.getByRole('button', { name: /^2026-08-24，/ }).click();
    await expect(page.getByLabel('选择日期')).toHaveValue(date);
    await expect(first).toBeVisible();
    await page.screenshot({ path: `test-results/compact-home-${width}.png` });
  });
}
