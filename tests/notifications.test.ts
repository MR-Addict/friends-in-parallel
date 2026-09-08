import { personById } from '../apps/server/src/config.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNotifier, notificationHtml } from '../apps/server/src/notifications.js';
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
test('HTML notification sends preview and clickable link to self or topic', async () => {
  for (const topic of ['', 'friends']) {
    const notify = createNotifier(
      { PUSHPLUS_TOKEN: 'test-token', PUSHPLUS_TOPIC: topic, SITE_URL: 'https://example.com' },
      async (url, options) => {
        assert.equal(url, 'https://www.pushplus.plus/send');
        const body = JSON.parse(String(options?.body));
        assert.equal(body.topic, topic || undefined);
        assert.equal(body.token, 'test-token');
        assert.equal(body.channel, 'wechat');
        assert.ok(body.title.includes(personById('lu-yuhan').nickname));
        assert.match(body.content, /2026-08-30 14:30/);
        assert.match(body.content, /https:\/\/example.com/);
        assert.equal(body.template, 'html');
        assert.ok(body.content.includes(entry.description));
        assert.match(body.content, /<a href="https:\/\/example.com\/"/);
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

test('HTML preview escapes user text and preserves line breaks without splitting emoji', () => {
  const html = notificationHtml({
    ...entry,
    description: '<script>alert("x")</script> & hello\nnext',
  });
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; hello<br>next'));
  assert.ok(!html.includes('<a '));
  const long = notificationHtml({ ...entry, description: '😊'.repeat(201) });
  assert.ok(long.includes('😊'.repeat(200) + '…'));
  assert.ok(!long.includes('😊'.repeat(201)));
});
test('photo and sticker previews use absolute URLs and reject unsafe website addresses', () => {
  const photo: Entry = {
    ...entry,
    media: { type: 'photo', filename: 'a b.jpg', mime: 'image/jpeg' },
  };
  assert.ok(
    notificationHtml(photo, 'https://example.com').includes(
      'src="https://example.com/uploads/a%20b.jpg"',
    ),
  );
  const sticker: Entry = {
    ...entry,
    media: { type: 'sticker', stickerId: 'fluent-1f60a' },
    description: '',
  };
  const html = notificationHtml(sticker, 'https://example.com');
  assert.ok(html.includes('src="https://example.com/stickers/fluent/1f60a.png"'));
  assert.ok(html.includes('分享了一个日常瞬间。'));
  for (const url of [
    undefined,
    '',
    'bad url',
    'javascript:alert(1)',
    'https://user:secret@example.com',
  ]) {
    const result = notificationHtml(photo, url);
    assert.ok(!result.includes('<a '));
    assert.ok(!result.includes('<img '));
  }
  assert.ok(
    notificationHtml(entry, 'https://example.com/?a=1&b=2').includes(
      'href="https://example.com/?a=1&amp;b=2"',
    ),
  );
});
