import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNotifier } from '../apps/server/src/notifications.js';
import type { Entry } from '../apps/server/src/model.js';
const entry: Entry = {
  id: 'notification-test',
  personId: 'lu-yuhan',
  description: 'private text',
  media: { type: 'emoji', emoji: '😊' },
  occurredAt: '2026-08-30T06:30:00Z',
  createdAt: '2026-08-30T06:30:00Z',
  updatedAt: '2026-08-30T06:30:00Z',
};
test('notifications are disabled without a token', async () => {
  await createNotifier({}, async () => {
    throw new Error('must not call');
  })(entry);
});
test('notification sends to self or topic with no private description or photo', async () => {
  for (const topic of ['', 'friends']) {
    const notify = createNotifier(
      { PUSHPLUS_TOKEN: 'test-token', PUSHPLUS_TOPIC: topic, SITE_URL: 'https://example.com' },
      async (url, options) => {
        assert.equal(url, 'https://www.pushplus.plus/send');
        const body = JSON.parse(String(options?.body));
        assert.equal(body.topic, topic || undefined);
        assert.equal(body.token, 'test-token');
        assert.equal(body.channel, 'wechat');
        assert.match(body.title, /陆语涵/);
        assert.match(body.content, /2026-08-30 14:30/);
        assert.match(body.content, /https:\/\/example.com/);
        assert.ok(!body.content.includes(entry.description));
        assert.ok(options?.signal);
        return Response.json({ code: 200 });
      },
    );
    await notify(entry);
  }
});
test('HTTP errors, API errors and network failures do not poison the queue', async () => {
  let calls = 0;
  let pauses = 0;
  const notify = createNotifier(
    { PUSHPLUS_TOKEN: 'test' },
    async () => {
      calls++;
      if (calls === 1) return new Response('', { status: 500 });
      if (calls === 2) return Response.json({ code: 905 });
      if (calls === 3) throw new Error('network failure');
      return Response.json({ code: 200 });
    },
    async (ms) => {
      assert.ok(ms > 0);
      pauses++;
    },
  );
  for (let i = 0; i < 3; i++) await assert.rejects(notify(entry));
  await notify(entry);
  assert.equal(calls, 4);
  assert.equal(pauses, 3);
});
