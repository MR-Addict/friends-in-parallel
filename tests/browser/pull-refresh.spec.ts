import { test, expect, type Page } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

test.beforeEach(async ({ context, page }) => {
  const expiry = Date.now() + 6 * 86400_000;
  await context.addCookies([
    { name: 'parallel_access', value: String(expiry), domain: '127.0.0.1', path: '/' },
  ]);
  await page.route('**/api/entries?*', (route) => route.fulfill({ json: [] }));
  await page.goto('/');
  await expect(page.locator('.timeline-summary')).toContainText('0 个瞬间');
});

async function gesture(
  page: Page,
  dy: number,
  options: { dx?: number; cancel?: boolean; target?: string } = {},
) {
  await page.locator(options.target || '.timeline-heading').evaluate(
    (target, { dy, dx, cancel }) => {
      const emit = (type: string, x: number, y: number) => {
        const touch = new Touch({ identifier: 1, target, clientX: x, clientY: y });
        target.dispatchEvent(
          new TouchEvent(type, {
            bubbles: true,
            cancelable: true,
            touches: type === 'touchend' || type === 'touchcancel' ? [] : [touch],
            changedTouches: [touch],
          }),
        );
      };
      emit('touchstart', 100, 200);
      emit('touchmove', 100 + dx, 200 + dy);
      emit(cancel ? 'touchcancel' : 'touchend', 100 + dx, 200 + dy);
    },
    { dy, dx: options.dx || 0, cancel: options.cancel || false },
  );
}

test('pull refreshes the selected date once, recovers after failure, and keeps the page', async ({
  page,
}) => {
  const selectedDate = await page.getByLabel('选择日期').getAttribute('title');
  let calls = 0;
  let finish!: () => void;
  await page.route('**/api/entries?*', async (route) => {
    calls++;
    expect(new URL(route.request().url()).searchParams.get('date')).toBe(selectedDate);
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
    await route.fulfill({ status: 500, json: { error: '刷新失败，请重试' } });
  });
  await page.evaluate(() => {
    (window as Window & { refreshMarker?: boolean }).refreshMarker = true;
  });
  await gesture(page, 150);
  await expect(page.locator('.pull-refresh')).toContainText('正在刷新');
  await expect.poll(() => calls).toBe(1);
  await gesture(page, 150);
  expect(calls).toBe(1);
  finish();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.locator('.pull-refresh')).toBeEmpty();
  await page.route('**/api/entries?*', (route) => route.fulfill({ json: [] }));
  await gesture(page, 150);
  await expect(page.locator('.timeline-summary')).toContainText('0 个瞬间');
  await expect(page.getByLabel('选择日期')).toHaveAttribute('title', selectedDate!);
  expect(
    await page.evaluate(() => (window as Window & { refreshMarker?: boolean }).refreshMarker),
  ).toBe(true);
});

test('short, horizontal, upward, canceled, scrolled and dialog gestures do not refresh', async ({
  page,
}) => {
  let calls = 0;
  page.on('request', (request) => {
    if (request.url().includes('/api/entries?')) calls++;
  });
  await gesture(page, 70);
  await gesture(page, 150, { dx: 200 });
  await gesture(page, -150);
  await gesture(page, 150, { cancel: true });
  await gesture(page, 150, { dx: 200, target: '.people-filter button:first-child' });
  await page.evaluate(() => {
    document.body.style.minHeight = '2000px';
    window.scrollTo(0, 200);
  });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(200);
  await gesture(page, 150);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator('.floating-create').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await gesture(page, 150, { target: '.sheet-heading' });
  expect(calls).toBe(0);
  await expect(page.locator('.pull-refresh')).toBeEmpty();
});

test('browser touch input shows the release hint and refreshes on release', async ({
  page,
  context,
}) => {
  const session = await context.newCDPSession(page);
  const box = (await page.locator('.timeline-heading').boundingBox())!;
  const x = box.x + 10;
  const y = box.y + box.height / 2;
  let calls = 0;
  page.on('request', (request) => {
    if (request.url().includes('/api/entries?')) calls++;
  });
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let delta = 15; delta <= 150; delta += 15) {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y: y + delta }],
    });
  }
  await expect(page.locator('.pull-refresh')).toContainText('松开刷新');
  expect(calls).toBe(0);
  await page.screenshot({ path: 'test-results/pull-refresh-ready.png' });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => calls).toBe(1);
  await expect(page.locator('.pull-refresh')).toBeEmpty();
  await session.detach();
});

test('pulling a card image refreshes without opening it, while a tap still opens it', async ({
  page,
  context,
}) => {
  const date = await page.getByLabel('选择日期').getAttribute('title');
  await page.route('**/api/entries?*', (route) =>
    route.fulfill({
      json: [
        {
          id: 'pull-card',
          personId: 'lu-yuhan',
          description: 'Pull from this card',
          media: { type: 'sticker', stickerId: 'fluent-1f60a' },
          occurredAt: `${date}T06:30:00Z`,
          createdAt: date,
        },
      ],
    }),
  );
  await page.reload();
  const media = page.locator('.moment-media');
  await expect(media).toBeVisible();
  const box = (await media.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const session = await context.newCDPSession(page);
  let calls = 0;
  page.on('request', (request) => {
    if (request.url().includes('/api/entries?')) calls++;
  });
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  // A small first move must already be captured before Safari starts native scroll.
  for (const delta of [2, 5, 15, 40, 80, 120, 150]) {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y: y + delta }],
    });
  }
  await expect(page.locator('.pull-refresh')).toContainText('松开刷新');
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => calls).toBe(1);
  await expect(page.locator('.pull-refresh')).toBeEmpty();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await media.tap();
  await expect(page.getByRole('dialog')).toBeVisible();
  await session.detach();
});

test('the first small downward movement on a card button is canceled', async ({ page }) => {
  const canceled = await page.locator('.people-filter button:first-child').evaluate((target) => {
    const emit = (type: string, y: number) => {
      const touch = new Touch({ identifier: 1, target, clientX: 100, clientY: y });
      const event = new TouchEvent(type, { bubbles: true, cancelable: true, touches: [touch] });
      target.dispatchEvent(event);
      return event.defaultPrevented;
    };
    emit('touchstart', 200);
    const result = emit('touchmove', 202);
    emit('touchcancel', 202);
    return result;
  });
  expect(canceled).toBe(true);
});
