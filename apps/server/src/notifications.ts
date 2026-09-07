import { setTimeout as delay } from 'node:timers/promises';
import { personById, stickerById } from './config.js';
import { beijingDate, beijingTime, type Entry } from './model.js';

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[char]!,
  );

export function notificationHtml(entry: Entry, siteUrl?: string) {
  let base: URL | undefined;
  try {
    const url = new URL(siteUrl || '');
    if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) base = url;
  } catch {
    /* An unconfigured website still permits a text preview. */
  }
  const nickname = escapeHtml(personById(entry.personId).nickname);
  const text = Array.from(entry.description.trim());
  const preview = escapeHtml(text.slice(0, 200).join('') + (text.length > 200 ? '…' : '')).replace(
    /\r\n|\r|\n/g,
    '<br>',
  );
  let media = '';
  if (entry.media.type === 'emoji') {
    media = `<p style="font-size:40px;margin:16px 0">${escapeHtml(entry.media.emoji)}</p>`;
  } else if (base) {
    const source =
      entry.media.type === 'photo'
        ? `/uploads/${encodeURIComponent(entry.media.filename)}`
        : stickerById(entry.media.stickerId).file;
    const alt = entry.media.type === 'photo' ? '动态照片' : stickerById(entry.media.stickerId).name;
    const width = entry.media.type === 'photo' ? '100%' : '96px';
    media = `<p><img src="${escapeHtml(new URL(source, base).href)}" alt="${escapeHtml(alt)}" style="width:${width};max-width:480px;height:auto;border-radius:12px"></p>`;
  }
  return [
    '<div style="max-width:480px;margin:0 auto;padding:20px;color:#443d35;background:#fffaf2;font-family:sans-serif;line-height:1.7">',
    '<p style="color:#87796a;font-size:13px;margin:0">此刻，同频</p>',
    `<h2 style="font-size:20px;margin:8px 0">${nickname}发布了一条新动态</h2>`,
    `<p style="color:#87796a;font-size:13px">${beijingDate(entry.occurredAt)} ${beijingTime(entry.occurredAt)} · 北京时间</p>`,
    media,
    `<p style="overflow-wrap:anywhere">${preview || '分享了一个日常瞬间。'}</p>`,
    base
      ? `<p><a href="${escapeHtml(base.href)}" style="color:#91623f;text-decoration:underline;font-weight:bold">打开手账，查看完整动态 →</a></p>`
      : '<p>打开「此刻，同频」查看完整动态。</p>',
    `<p style="color:#a3978b;font-size:11px">动态编号：${escapeHtml(entry.id)}</p>`,
    '</div>',
  ].join('\n');
}

export function createNotifier(
  env: NodeJS.ProcessEnv = process.env,
  request: typeof fetch = fetch,
  pause: (ms: number) => Promise<void> = (ms) => delay(ms, undefined, { ref: false }),
) {
  const token = env.PUSHPLUS_TOKEN?.trim();
  const topic = env.PUSHPLUS_TOPIC?.trim();
  const siteUrl = env.SITE_URL?.trim();
  let queue = Promise.resolve();
  let nextSendAt = 0;
  return (entry: Entry): Promise<void> => {
    if (!token) return Promise.resolve();
    const job = queue.then(async () => {
      const wait = nextSendAt - Date.now();
      if (wait > 0) await pause(wait);
      // Space requests to stay below the standard five-per-minute quota.
      nextSendAt = Date.now() + 13_000;
      const content = notificationHtml(entry, siteUrl);
      const response = await request('https://www.pushplus.plus/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          ...(topic ? { topic } : {}),
          channel: 'wechat',
          template: 'html',
          title: `${personById(entry.personId).nickname}发布了一条新动态`,
          content,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`PushPlus HTTP ${response.status}`);
      const result = (await response.json()) as { code?: number };
      if (result?.code !== 200) throw new Error('PushPlus rejected notification');
    });
    // A failed request must not prevent later notifications from being sent.
    queue = job.catch(() => {});
    return job;
  };
}
