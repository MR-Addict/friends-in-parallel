import { selectDate } from './calendar';
import { test, expect, type Page } from '@playwright/test';

const date = '2026-08-24';
const readyLabel = '已准备好，再次点击分享';
async function prepareResource(page: Page, label = '分享图片') {
  await page.getByRole('button', { name: label, exact: true }).click();
  await expect(page.getByRole('button', { name: readyLabel })).toBeEnabled();
}
async function shareResource(page: Page, label = '分享图片') {
  const ready = page.getByRole('button', { name: readyLabel });
  if (!(await ready.count())) await prepareResource(page, label);
  await ready.click();
}

async function mockShare(page: Page, mode = 'ok') {
  await page.addInitScript((mode) => {
    const activation = navigator.userActivation;
    const state = { mode, calls: [] as unknown[] };
    (window as any).sharing = state;
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value:
        mode === 'missing'
          ? undefined
          : (data: ShareData) => {
              return !(
                state.mode === 'unsupported' ||
                (state.mode === 'zip-unsupported' && data.files?.[0]?.type === 'application/zip') ||
                (state.mode === 'actual' && data.files?.[0]?.size)
              );
            },
    });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data: ShareData) => {
        if (!activation.isActive) throw new Error('Share requires user activation');
        if (state.mode === 'cancel') throw new DOMException('Cancelled', 'AbortError');
        if (state.mode === 'denied') throw new DOMException('Blocked', 'NotAllowedError');
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
  await selectDate(page, date);
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
  await page.route('**/api/exports/*/validity', (route) => route.fulfill({ status: 204 }));
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
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      },
    }),
  );
  await page.route('**/api/exports/archive?date=*', (route) =>
    route.fulfill({
      body: 'materials-zip',
      contentType: 'application/zip',
      headers: {
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`和朋友的同一时间-${date}-素材包.zip`)}`,
      },
    }),
  );
  await page.route('**/api/exports/archive?date=*&check=1', (route) =>
    route.fulfill({ json: { count: 1 } }),
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
  await page.route('**/share/single.png', (route) =>
    route.fulfill({
      contentType: 'image/png',
      body:
        route.request().resourceType() === 'image'
          ? Buffer.from(
              'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
              'base64',
            )
          : 'image-content',
      headers: { 'X-Export-Filename': encodeURIComponent(`和朋友的同一时间-${date}-手账-01.png`) },
    }),
  );
});

for (const mode of ['missing', 'unsupported']) {
  test(`hide unsupported image share: ${mode}`, async ({ page }) => {
    let reads = 0;
    page.on('request', (req) => {
      if (req.url().endsWith('/share/single.png') && req.resourceType() === 'fetch') reads++;
    });
    await mockShare(page, mode);
    await openImage(page);
    await expect(page.getByRole('button', { name: '分享图片' })).toHaveCount(0);
    expect(reads).toBe(0);
    await expect(page.getByRole('link', { name: '下载图片', exact: true })).toBeEnabled();
  });
}
for (const width of [375, 430]) {
  test(`prepare image on first click and share on second click, hiding download at ${width}px`, async ({
    page,
  }) => {
    let reads = 0;
    page.on('request', (req) => {
      if (req.url().endsWith('/share/single.png') && req.resourceType() === 'fetch') reads++;
    });
    await mockShare(page);
    await page.setViewportSize({ width, height: 812 });
    await openImage(page);
    await expect(page.getByRole('button', { name: '分享图片' })).toBeInViewport();
    expect(reads).toBe(0);
    await prepareResource(page);
    expect(reads).toBe(1);
    expect(await calls(page)).toHaveLength(0);
    await expect(page.getByRole('link', { name: '下载图片', exact: true })).toHaveCount(0);
    await shareResource(page, '分享图片');
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

test('prepared file is reused after successful sharing', async ({ page }) => {
  await mockShare(page);
  await openImage(page);
  await shareResource(page, '分享图片');
  await expect.poll(async () => (await calls(page)).length).toBe(1);
  await page.route('**/share/single.png', (route) => route.abort());
  await shareResource(page, '分享图片');
  await expect.poll(async () => (await calls(page)).length).toBe(2);
});

test('unsupported actual file falls back to download after preparation', async ({ page }) => {
  await mockShare(page, 'actual');
  await openImage(page);
  await page.getByRole('button', { name: '分享图片' }).click();
  await expect(page.getByRole('link', { name: '下载图片', exact: true })).toBeEnabled();
  await expect(page.locator('.resource-share button')).toHaveCount(0);
  expect(await calls(page)).toHaveLength(0);
});

for (const mode of ['cancel', 'failure']) {
  test(`handle ${mode} while keeping share and reusing the file`, async ({ page }) => {
    await mockShare(page, mode);
    await openImage(page);
    const button = page.locator('.resource-share button');
    await expect(button).toHaveText('分享图片');
    await button.click();
    await expect(button).toHaveText(readyLabel);
    await button.click();
    await expect(button).toBeEnabled();
    await expect(button).toHaveText(mode === 'cancel' ? readyLabel : '分享失败，点击重试');
    await expect(page.getByRole('link', { name: '下载图片', exact: true })).toHaveCount(0);
    await page.route('**/share/single.png', (route) => route.abort());
    await page.evaluate(() => {
      (window as any).sharing.mode = 'ok';
    });
    await button.click();
    await expect.poll(async () => (await calls(page)).length).toBe(1);
  });
}

test('fetch failure retries; closing during preparation never opens share', async ({ page }) => {
  await mockShare(page);
  await page.route('**/share/single.png', (route) => route.fulfill({ status: 500 }));
  await openImage(page);
  await page.getByRole('button', { name: '分享图片' }).click();
  await expect(page.getByRole('button', { name: '准备失败，点击重试' })).toBeEnabled();
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/share/single.png', async (route) => {
    await pending;
    await route.fulfill({ body: 'zip', contentType: 'image/png' }).catch(() => {});
  });
  await page.getByRole('button', { name: '准备失败，点击重试' }).click();
  await expect(page.getByRole('button', { name: '正在准备分享…' })).toBeDisabled();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  release();
  await openImage(page);
  expect(await calls(page)).toHaveLength(0);
  await expect(page.getByText(readyLabel)).toHaveCount(0);
});

test('paginated exports only share the current image', async ({ page }) => {
  await mockShare(page);
  await page.route('**/api/exports/images', (route) =>
    route.fulfill({
      json: {
        images: ['/share/01.png', '/share/02.png'],
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
  await expect(page.getByRole('button', { name: '分享当前图片' })).toBeEnabled();
  await page.getByRole('button', { name: '下一张图片' }).click();
  await expect(page.getByText(readyLabel)).toHaveCount(0);
  await shareResource(page, '分享当前图片');
  await expect
    .poll(async () => (await calls(page))[0]?.files[0])
    .toEqual({ name: `和朋友的同一时间-${date}-手账-02.png`, type: 'image/png', body: 'page2' });
  await expect(page.getByRole('button', { name: '分享图片合集' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: '下载图片合集' })).toHaveCount(0);
  await page.route('**/api/exports/*/validity', (route) => route.fulfill({ status: 404 }));
  await page.getByRole('button', { name: '上一张图片' }).click();
  await expect(page.locator('.export-previews')).toHaveCount(0);
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
          description: '',
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
  await selectDate(page, date);
  await page.getByRole('button', { name: /更多操作：.*14:30/ }).click();
  await shareResource(page, '分享图片');
  await expect
    .poll(async () => (await calls(page))[0]?.files[0])
    .toMatchObject({ type: 'image/jpeg', body: 'original-photo' });
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: '查看上传的照片' }).click();
  await expect(
    page.getByRole('dialog').getByRole('link', { name: /下载照片|下载图片/ }),
  ).toHaveCount(0);
  await shareResource(page, '分享图片');
  await expect.poll(async () => (await calls(page))[1]?.files[0].body).toBe('original-photo');
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: /更多操作：.*13:30/ }).click();
  await expect(page.getByRole('button', { name: '分享图片' })).toHaveCount(0);
});

for (const mode of ['ok', 'missing']) {
  test(`video export uses ${mode === 'ok' ? 'sharing' : 'download fallback'} and disappears after expiry`, async ({
    page,
  }) => {
    await mockShare(page, mode);
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
    await selectDate(page, date);
    await page.getByRole('button', { name: '制作回忆' }).click();
    await page.getByRole('button', { name: '生成回忆视频' }).click();
    if (mode === 'ok') {
      await expect(page.getByRole('link', { name: '下载视频' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: '分享视频' })).toHaveClass(/primary/);
      await expect(page.getByRole('button', { name: '修改样式与音乐' })).toHaveClass(/secondary/);
      await shareResource(page, '分享视频');
      await expect
        .poll(async () => (await calls(page))[0]?.files[0])
        .toEqual({
          name: `和朋友的同一时间-${date}-回忆视频.mp4`,
          type: 'video/mp4',
          body: 'video-content',
        });
    } else {
      const link = page.getByRole('link', { name: '下载视频' });
      await expect(link).toHaveAttribute('href', '/share/video.mp4?download=1');
      await expect(page.getByRole('button', { name: '分享视频' })).toHaveCount(0);
      const download = page.waitForEvent('download');
      await link.click();
      expect((await download).suggestedFilename()).toBe(`和朋友的同一时间-${date}-回忆视频.mp4`);
    }
    await page.getByRole('button', { name: '关闭', exact: true }).click();
    result.expiresAt = new Date(Date.now() - 1000).toISOString();
    await page.getByRole('button', { name: '制作回忆' }).click();
    await page.getByRole('button', { name: '生成回忆视频' }).click();
    await expect(page.getByRole('button', { name: '开始生成视频' })).toBeVisible();
    await expect(page.getByRole('button', { name: '分享视频' })).toHaveCount(0);
  });
}

test('sticker shares original SVG with its MIME type', async ({ page }) => {
  await mockShare(page);
  await page.route('**/api/entries?*', (route) =>
    route.fulfill({
      json: [
        {
          id: 'svg',
          personId: 'lu-yuhan',
          media: { type: 'sticker', stickerId: 'twemoji-1f60a' },
          description: '',
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
  await selectDate(page, date);
  await page.locator('.moment-media').click();
  await shareResource(page, '分享图片');
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

test('materials ZIP prefers sharing and home creation card is visible', async ({ page }) => {
  await mockShare(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  await selectDate(page, date);
  await expect(page.getByRole('button', { name: '制作回忆', exact: true })).toBeInViewport();
  await expect(page.getByRole('button', { name: '制作回忆', exact: true })).toHaveAttribute(
    'title',
    '手账长图 · 回忆视频 · 素材导出',
  );
  expect((await page.locator('.moment-card').first().boundingBox())!.y).toBeLessThan(310);
  await expect(page.locator('.moment-card').first()).toBeInViewport();
  await page.screenshot({ path: 'test-results/creation-home-375.png' });
  await page.getByRole('button', { name: '制作回忆' }).click();
  await page.getByRole('button', { name: '素材 ZIP' }).click();
  await expect(page.getByRole('button', { name: '分享压缩包', exact: true })).toBeEnabled();
  await expect(page.getByRole('link', { name: '下载压缩包' })).toHaveCount(0);
  await shareResource(page, '分享压缩包');
  await expect
    .poll(async () => (await calls(page))[0]?.files[0])
    .toEqual({
      name: `和朋友的同一时间-${date}-素材包.zip`,
      type: 'application/zip',
      body: 'materials-zip',
    });
});

for (const width of [375, 430]) {
  test(`compact browsing keeps the first moment above 310px at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 812 });
    await page.goto('/');
    await selectDate(page, date);
    await page.evaluate(() => document.fonts.ready);
    const first = page.locator('.moment-card').first();
    await expect(first).toBeVisible();
    await expect.poll(async () => (await first.boundingBox())?.y ?? Infinity).toBeLessThan(310);
    await expect(page.getByRole('button', { name: '制作回忆', exact: true })).toBeInViewport();
    await page.getByRole('button', { name: /^筛选朋友：/ }).click();
    const filters = page.getByRole('group', { name: '按人物筛选' });
    await filters.getByRole('button').last().click();
    await page.getByRole('button', { name: /^筛选朋友：/ }).click();
    await expect(filters.getByRole('button').last()).toHaveAttribute('aria-pressed', 'true');
    await filters.getByRole('button', { name: '全部朋友' }).click();
    await expect(first).toBeVisible();
    await expect(page.getByRole('navigation', { name: '日期导航' })).toHaveCount(0);
    await page.getByLabel('选择日期').click();
    await page.getByRole('button', { name: /^2026-08-23，/ }).click();
    await expect(page.getByLabel('选择日期')).toHaveAttribute('title', '2026-08-23');
    await page.getByLabel('选择日期').click();
    await page.getByRole('button', { name: /^2026-08-24，/ }).click();
    await expect(page.getByLabel('选择日期')).toHaveAttribute('title', date);
    await expect(first).toBeVisible();
    await page.screenshot({ path: `test-results/compact-home-${width}.png` });
  });
}

test('ready files stay shareable without periodic or visibility validation', async ({ page }) => {
  await mockShare(page);
  await page.clock.install();
  let checks = 0;
  await page.route('**/api/exports/*/validity', (route) => {
    checks++;
    return route.fulfill({ status: checks === 1 ? 204 : 404 });
  });
  await openImage(page);
  expect(checks).toBe(0);
  await prepareResource(page);
  expect(checks).toBe(1);
  await page.clock.fastForward(31000);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await shareResource(page);
  expect(checks).toBe(1);
  await expect.poll(async () => (await calls(page)).length).toBe(1);
});

test('validation network failures keep the image for retry; confirmed expiry hides it on download', async ({
  page,
}) => {
  await mockShare(page, 'missing');
  await openImage(page);
  await page.route('**/api/exports/*/validity', (route) => route.fulfill({ status: 503 }));
  await page.getByRole('link', { name: '下载图片', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('暂时无法检查');
  await expect(page.locator('.export-previews')).toBeVisible();
  await page.route('**/api/exports/*/validity', (route) => route.fulfill({ status: 404 }));
  await page.getByRole('link', { name: '下载图片', exact: true }).click();
  await expect(page.locator('.export-previews')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '生成手账长图' })).toBeVisible();
});

test('the long-image preview disappears at its expiry without polling', async ({ page }) => {
  await mockShare(page);
  await page.clock.install();
  await openImage(page);
  await expect(page.locator('.export-previews')).toBeVisible();
  await page.clock.fastForward(61000);
  await expect(page.locator('.export-previews')).toHaveCount(0);
  await expect(page.getByRole('alert')).toContainText('已过期');
});

test('slow preparation and validation finish between the preparation and synchronous share clicks', async ({
  page,
}) => {
  await mockShare(page);
  let releaseFile!: () => void;
  let releaseCheck!: () => void;
  const fileGate = new Promise<void>((resolve) => {
    releaseFile = resolve;
  });
  const checkGate = new Promise<void>((resolve) => {
    releaseCheck = resolve;
  });
  await page.route('**/share/single.png', async (route) => {
    if (route.request().resourceType() !== 'fetch') return route.fallback();
    await fileGate;
    await route.fulfill({ body: 'slow-image', contentType: 'image/png' });
  });
  await page.route('**/api/exports/*/validity', async (route) => {
    await checkGate;
    await route.fulfill({ status: 204 });
  });
  await openImage(page);
  await page.getByRole('button', { name: /分享图片|分享当前图片/ }).click();
  await expect(page.getByRole('button', { name: /正在准备分享/ })).toBeDisabled();
  expect(await calls(page)).toHaveLength(0);
  releaseFile();
  await expect(page.getByRole('button', { name: '正在检查有效性…' })).toBeDisabled();
  releaseCheck();
  const button = page.getByRole('button', { name: readyLabel, exact: true });
  await expect(button).toBeEnabled();
  // No request is allowed between readiness and the final user gesture.
  await page.route('**/api/exports/*/validity', (route) => route.abort());
  await page.route('**/share/single.png', (route) => route.abort());
  expect(
    await button.evaluate((node: HTMLButtonElement) => {
      let invoked = false;
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: () => {
          invoked = true;
          return Promise.resolve();
        },
      });
      node.click();
      return invoked;
    }),
  ).toBe(true);
});

test('validation timeout retries without downloading again', async ({ page }) => {
  await mockShare(page);
  await page.clock.install();
  let reads = 0;
  page.on('request', (req) => {
    if (req.url().endsWith('/share/single.png') && req.resourceType() === 'fetch') reads++;
  });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/exports/*/validity', async (route) => {
    await gate;
    await route.fulfill({ status: 204 }).catch(() => {});
  });
  await openImage(page);
  await page.getByRole('button', { name: '分享图片' }).click();
  await expect(page.getByRole('button', { name: '正在检查有效性…' })).toBeDisabled();
  await page.clock.fastForward(10001);
  await expect(page.getByRole('button', { name: '准备失败，点击重试' })).toBeEnabled();
  await page.route('**/api/exports/*/validity', (route) => route.fulfill({ status: 204 }));
  release();
  await page.getByRole('button', { name: '准备失败，点击重试' }).click();
  await expect(page.getByRole('button', { name: readyLabel })).toBeEnabled();
  expect(reads).toBe(1);
  expect(await calls(page)).toHaveLength(0);
});

test('the ready click checks expiry even before the expiry timer runs', async ({ page }) => {
  await mockShare(page);
  await page.clock.install();
  await openImage(page);
  await prepareResource(page);
  await page.clock.setSystemTime(new Date(Date.now() + 61000));
  await page.getByRole('button', { name: readyLabel }).click();
  await expect(page.locator('.export-previews')).toHaveCount(0);
  expect(await calls(page)).toHaveLength(0);
});

test('switching pages during preparation discards the old request', async ({ page }) => {
  await mockShare(page);
  await page.route('**/api/exports/images', (route) =>
    route.fulfill({
      json: {
        images: ['/share/01.png', '/share/02.png'],
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      },
    }),
  );
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/share/*.png', async (route) => {
    const first = route.request().url().endsWith('01.png');
    if (first && route.request().resourceType() === 'fetch') await gate;
    await route
      .fulfill({ body: first ? 'old-page' : 'new-page', contentType: 'image/png' })
      .catch(() => {});
  });
  await page.route('**/share/all.zip', (route) =>
    route.fulfill({ body: 'collection', contentType: 'application/zip' }),
  );
  await openImage(page);
  await page.getByRole('button', { name: /分享图片|分享当前图片/ }).click();
  await expect(page.getByRole('button', { name: /正在准备分享/ })).toBeDisabled();
  await page.getByRole('button', { name: '下一张图片' }).click();
  await expect(page.getByRole('button', { name: '分享当前图片' })).toBeEnabled();
  release();
  await shareResource(page, '分享当前图片');
  await expect.poll(async () => (await calls(page))[0]?.files[0]?.body).toBe('new-page');
});

test('a missing export during preparation immediately clears its result', async ({ page }) => {
  await mockShare(page);
  await page.route('**/share/single.png', (route) => route.fulfill({ status: 404 }));
  await openImage(page);
  await page.getByRole('button', { name: '分享图片' }).click();
  await expect(page.getByRole('alert')).toContainText('重新生成');
  await expect(page.locator('.export-previews')).toHaveCount(0);
  expect(await calls(page)).toHaveLength(0);
});

test('permission-denied sharing becomes a validated download without auto-downloading', async ({
  page,
}) => {
  await mockShare(page, 'denied');
  let downloads = 0;
  page.on('download', () => downloads++);
  await openImage(page);
  await shareResource(page, '分享图片');
  const fallback = page.getByRole('link', { name: '下载图片', exact: true });
  await expect(fallback).toBeEnabled();
  expect(downloads).toBe(0);
  await expect(page.locator('.resource-share button')).toHaveCount(0);
  const downloaded = page.waitForEvent('download');
  await fallback.click();
  expect((await downloaded).suggestedFilename()).toBe(`和朋友的同一时间-${date}-手账-01.png`);
});

test('multi-page exports never offer a collection download', async ({ page }) => {
  await mockShare(page, 'zip-unsupported');
  let zipReads = 0;
  page.on('request', (req) => {
    if (req.url().endsWith('/share/all.zip')) zipReads++;
  });
  await page.route('**/api/exports/images', (route) =>
    route.fulfill({
      json: {
        images: ['/share/single.png', '/share/second.png'],
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      },
    }),
  );
  await openImage(page);
  await expect(page.getByRole('button', { name: '分享当前图片' })).toBeEnabled();
  await expect(page.getByRole('link', { name: '下载图片合集' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '分享图片合集' })).toHaveCount(0);
  expect(zipReads).toBe(0);
});

test('unsupported materials sharing offers a working download without prefetch', async ({
  page,
}) => {
  await mockShare(page, 'zip-unsupported');
  let reads = 0;
  page.on('request', (req) => {
    if (req.url().includes('/api/exports/archive')) reads++;
  });
  await openExport(page);
  await page.getByRole('button', { name: '素材 ZIP' }).click();
  const fallback = page.getByRole('link', { name: '下载压缩包' });
  await expect(fallback).toBeEnabled();
  await expect(page.getByRole('button', { name: '分享压缩包' })).toHaveCount(0);
  expect(reads).toBe(0);
  const downloaded = page.waitForEvent('download');
  await fallback.click();
  expect((await downloaded).url()).toBe(`http://127.0.0.1:3101/api/exports/archive?date=${date}`);
});

for (const mode of ['ok', 'missing']) {
  test(`captioned posts share a rendered card from menu and detail (${mode})`, async ({ page }) => {
    await mockShare(page, mode);
    let generations = 0;
    await page.route('**/api/exports/posts', async (route) => {
      generations++;
      expect(route.request().postDataJSON()).toEqual({ date, entryId: 'fixture' });
      await route.fulfill({
        json: {
          images: ['/api/exports/files/post/1.png'],
          expiresAt: new Date(Date.now() + 60000).toISOString(),
        },
      });
    });
    await page.route('**/api/exports/files/post/1.png*', (route) =>
      route.fulfill({ body: 'complete-post-card', contentType: 'image/png' }),
    );
    await page.goto('/');
    await selectDate(page, date);
    for (const target of ['.card-actions', '.moment-media']) {
      await page.locator(target).click();
      expect(generations).toBe(target === '.card-actions' ? 0 : 1);
      if (mode === 'ok') {
        await shareResource(page, '分享动态');
        await expect.poll(async () => (await calls(page)).length).toBe(generations);
        expect((await calls(page)).at(-1).files).toEqual([
          {
            name: `和朋友的同一时间-${date}-动态.png`,
            type: 'image/png',
            body: 'complete-post-card',
          },
        ]);
      } else {
        const download = page.waitForEvent('download');
        await page.getByRole('link', { name: '下载动态' }).click();
        expect((await download).suggestedFilename()).toContain('动态.png');
      }
      await page.getByRole('button', { name: '关闭', exact: true }).click();
    }
    expect(generations).toBe(2);
  });
}

test('post generation retries failures and expired cards', async ({ page }) => {
  await mockShare(page);
  let attempts = 0;
  let expiresAt = new Date(Date.now() + 60000).toISOString();
  await page.route('**/api/exports/posts', (route) => {
    attempts++;
    return attempts === 1
      ? route.fulfill({ status: 500, json: { error: '生成失败' } })
      : route.fulfill({
          json: {
            images: ['/api/exports/files/post/1.png'],
            expiresAt,
          },
        });
  });
  await page.route('**/api/exports/files/post/1.png', (route) =>
    route.fulfill({ body: 'post', contentType: 'image/png' }),
  );
  await page.goto('/');
  await selectDate(page, date);
  await page.locator('.card-actions').click();
  expect(attempts).toBe(0);
  await page.getByRole('button', { name: '分享动态' }).click();
  await expect(page.getByRole('button', { name: '准备失败，点击重试' })).toBeEnabled();
  await prepareResource(page, '准备失败，点击重试');
  await page.route('**/api/exports/*/validity', (route) => route.fulfill({ status: 404 }));
  await page.clock.install();
  await page.clock.setSystemTime(new Date(Date.now() + 61000));
  await page.getByRole('button', { name: readyLabel }).click();
  await expect(page.getByRole('alert')).toContainText('重新生成');
  await expect(page.getByRole('button', { name: '分享动态' })).toBeVisible();
  await page.route('**/api/exports/*/validity', (route) => route.fulfill({ status: 204 }));
  expiresAt = new Date(Date.now() + 180000).toISOString();
  await prepareResource(page, '分享动态');
  expect(attempts).toBe(3);
});

test('preparation reports progress and ignores duplicate clicks', async ({ page }) => {
  await mockShare(page);
  await page.addInitScript(() => {
    const originalFetch = window.fetch;
    (window as any).fileReads = 0;
    window.fetch = (input, init) => {
      if (String(input) !== '/share/single.png') return originalFetch(input, init);
      (window as any).fileReads++;
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('first'));
          (window as any).finishFile = () => {
            controller.enqueue(new TextEncoder().encode('other'));
            controller.close();
          };
        },
      });
      return Promise.resolve(
        new Response(stream, {
          headers: { 'Content-Type': 'image/png', 'Content-Length': '10' },
        }),
      );
    };
  });
  await openImage(page);
  const button = page.locator('.resource-share button');
  await button.evaluate((node: HTMLButtonElement) => {
    node.click();
    node.click();
  });
  await expect(button).toHaveText('正在准备分享… 50%');
  await expect(button).toBeDisabled();
  expect(await page.evaluate(() => (window as any).fileReads)).toBe(1);
  expect(await calls(page)).toHaveLength(0);
  await page.evaluate(() => (window as any).finishFile());
  await expect(button).toHaveText(readyLabel);
  await expect(button).toHaveAttribute('aria-live', 'polite');
  expect(await calls(page)).toHaveLength(0);
  await button.click();
  await expect.poll(async () => (await calls(page))[0]?.files[0].body).toBe('firstother');
});

test('closing during post generation discards the pending result', async ({ page }) => {
  await mockShare(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let generations = 0;
  await page.route('**/api/exports/posts', async (route) => {
    generations++;
    await gate;
    await route
      .fulfill({
        json: {
          images: ['/api/exports/files/post/1.png'],
          expiresAt: new Date(Date.now() + 60000).toISOString(),
        },
      })
      .catch(() => {});
  });
  let reads = 0;
  await page.route('**/api/exports/files/post/1.png', (route) => {
    reads++;
    return route.fulfill({ body: 'card', contentType: 'image/png' });
  });
  await page.goto('/');
  await selectDate(page, date);
  await page.locator('.card-actions').click();
  expect(generations).toBe(0);
  await page.getByRole('button', { name: '分享动态' }).click();
  await expect.poll(() => generations).toBe(1);
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  release();
  await page.locator('.card-actions').click();
  await expect(page.getByRole('button', { name: '分享动态' })).toBeEnabled();
  expect(reads).toBe(0);
  expect(await calls(page)).toHaveLength(0);
});
