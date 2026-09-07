import { setTimeout as delay } from 'node:timers/promises';
import { personById } from './config.js';
import { beijingDate, beijingTime, type Entry } from './model.js';

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
      const content = [
        '此刻，同频有新动态啦！',
        `记录时间：${beijingDate(entry.occurredAt)} ${beijingTime(entry.occurredAt)}`,
        `动态编号：${entry.id}`,
        siteUrl ? `打开手账查看：${siteUrl}` : '打开「此刻，同频」查看。',
      ].join('\n');
      const response = await request('https://www.pushplus.plus/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          ...(topic ? { topic } : {}),
          channel: 'wechat',
          template: 'txt',
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
