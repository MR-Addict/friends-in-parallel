import { readFile, mkdir, writeFile, rm, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import archiver from 'archiver';
import { chromium } from 'playwright';
import type { Response } from 'express';
import { publicDir, packs, personById, stickerById, emojiSticker } from './config.js';
import { beijingTime, HttpError, type Entry, type Person } from './model.js';
import type { Store } from './store.js';
export interface SnapshotItem {
  entry: Entry;
  person: Person;
  bytes: Buffer;
  mime: string;
  extension: string;
  filename: string;
  credit: string;
}
const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
export async function snapshot(store: Store, date: string): Promise<SnapshotItem[]> {
  return store.exclusive(async () => {
    const entries = store.list(date);
    if (!entries.length) throw new HttpError(400, '这一天还没有动态，先记下一刻吧');
    entries.sort(
      (a, b) =>
        a.occurredAt.localeCompare(b.occurredAt) ||
        a.createdAt.localeCompare(b.createdAt) ||
        a.id.localeCompare(b.id),
    );
    return Promise.all(
      entries.map(async (entry) => {
        const person = personById(entry.personId) || {
          id: entry.personId,
          nickname: entry.personId,
          color: '#a8977e',
          background: '#f4ede2',
          avatar: '1f431',
        };
        const s =
          entry.media.type === 'sticker'
            ? stickerById(entry.media.stickerId)
            : entry.media.type === 'emoji'
              ? emojiSticker(entry.media.emoji)
              : undefined;
        if (entry.media.type !== 'photo' && !s)
          throw new HttpError(409, '某张贴纸配置缺失，请恢复素材后重试');
        const file =
          entry.media.type === 'photo'
            ? path.join(store.uploads, entry.media.filename)
            : path.join(publicDir, s!.file);
        let bytes: Buffer;
        try {
          bytes = await readFile(file);
        } catch {
          throw new HttpError(409, `${person.nickname}的一份素材缺失，请检查后重试`);
        }
        const extension = path.extname(file).slice(1);
        const mime =
          entry.media.type === 'photo'
            ? entry.media.mime
            : extension === 'svg'
              ? 'image/svg+xml'
              : extension === 'jpg'
                ? 'image/jpeg'
                : `image/${extension}`;
        const pack = s ? packs.find((p) => p.id === s.packId) : undefined;
        return {
          entry,
          person,
          bytes,
          mime,
          extension,
          filename: `${entry.personId}/${date}_${beijingTime(entry.occurredAt).replace(':', '-')}_${entry.id}.${extension}`,
          credit: pack ? `${pack.brand} · ${pack.license}` : '',
        };
      }),
    );
  });
}
function csvCell(value: string) {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}
export async function streamArchive(res: Response, items: SnapshotItem[], date: string) {
  // Load all supporting files before sending headers, so missing assets produce a clear error.
  const licenses = await Promise.all(
    (await readdir(path.join(publicDir, 'licenses'))).map(async (name) => ({
      name,
      bytes: await readFile(path.join(publicDir, 'licenses', name)),
    })),
  );
  const manifest = items.map(({ entry, person, filename, credit }) => ({
    id: entry.id,
    personId: entry.personId,
    nickname: person.nickname,
    occurredAt: entry.occurredAt,
    beijingTime: `${date} ${beijingTime(entry.occurredAt)} +08:00`,
    description: entry.description,
    mediaType: entry.media.type,
    media: entry.media,
    path: filename,
    credit,
  }));
  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.on('error', () => res.destroy());
  archive.on('warning', () => res.destroy());
  res.attachment(`parallel-${date}-materials.zip`);
  archive.pipe(res);
  res.on('close', () => {
    if (!res.writableFinished) archive.abort();
  });
  for (const item of items) archive.append(item.bytes, { name: item.filename });
  archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });
  const headers = [
    'id',
    'personId',
    'nickname',
    'occurredAt',
    'beijingTime',
    'description',
    'mediaType',
    'path',
    'credit',
  ] as const;
  archive.append(
    '\ufeff' +
      [
        headers.join(','),
        ...manifest.map((row) => headers.map((key) => csvCell(row[key])).join(',')),
      ].join('\r\n'),
    { name: 'manifest.csv' },
  );
  for (const license of licenses)
    archive.append(license.bytes, { name: `licenses/${license.name}` });
  await archive.finalize();
}
export function partitionHeights(heights: number[], available = 11500) {
  const groups: number[][] = [];
  let current: number[] = [];
  let used = 0;
  heights.forEach((h, i) => {
    if (current.length && used + h > available) {
      groups.push(current);
      current = [];
      used = 0;
    }
    current.push(i);
    used += h;
  });
  if (current.length) groups.push(current);
  return groups;
}
export interface HourRow {
  hour: string;
  indices: number[];
}
export function hourRows(items: SnapshotItem[]): HourRow[] {
  const ordered = items
    .map((item, index) => ({ item, index }))
    .sort(
      (a, b) =>
        a.item.entry.occurredAt.localeCompare(b.item.entry.occurredAt) ||
        a.item.entry.createdAt.localeCompare(b.item.entry.createdAt) ||
        a.item.entry.id.localeCompare(b.item.entry.id),
    );
  const rows: HourRow[] = [];
  for (const { item, index } of ordered) {
    const hour = beijingTime(item.entry.occurredAt).slice(0, 2);
    const last = rows.at(-1);
    if (last?.hour === hour && last.indices.length < 2) last.indices.push(index);
    else rows.push({ hour, indices: [index] });
  }
  return rows;
}
// Keep an hour together when it fits; oversized hours split only between complete rows.
export function partitionHourRows(
  rows: HourRow[],
  heights: number[],
  available: number,
  headingHeight = 84,
) {
  const pages: number[][] = [];
  let current: number[] = [],
    used = 0;
  const flush = () => {
    if (current.length) pages.push(current);
    current = [];
    used = 0;
  };
  for (let start = 0; start < rows.length;) {
    let end = start + 1;
    while (end < rows.length && rows[end].hour === rows[start].hour) end++;
    const whole = headingHeight + heights.slice(start, end).reduce((sum, h) => sum + h, 0);
    if (whole <= available) {
      if (used + whole > available) flush();
      for (let i = start; i < end; i++) current.push(i);
      used += whole;
    } else {
      for (let i = start; i < end; i++) {
        if (heights[i] + headingHeight > available)
          throw new HttpError(400, '单条动态内容过长，无法完整放入分享图片，请减少换行后重试');
        let cost = heights[i] + (i === start || !current.length ? headingHeight : 0);
        if (used + cost > available) {
          flush();
          cost = heights[i] + headingHeight;
        }
        current.push(i);
        used += cost;
      }
    }
    start = end;
  }
  flush();
  return pages;
}
const exportStyles = `
@font-face{font-family:Handbook;src:url('http://render.local/font.otf')}*{box-sizing:border-box}body{margin:0;background:#faf9f6;color:#292724;font-family:Handbook,sans-serif}.sheet{width:1080px;padding:48px;background:#faf9f6}.masthead{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #e9e5df;padding-bottom:24px;margin-bottom:24px}h1{font-size:44px;margin:0 0 12px}.subtitle{font-size:22px;color:#716b65;margin:0}.date{font-size:26px;color:#716b65}.hour-title{height:84px;display:flex;align-items:center;justify-content:space-between;gap:16px;margin:0;font-size:30px}.hour-title span{font-size:18px;font-weight:400;color:#716b65}.hour-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px;padding-bottom:24px;align-items:stretch}.card{min-width:0;padding:24px;background:#fff;border:2px solid #e9e5df;border-radius:18px}.person{display:flex;align-items:center;gap:10px;font-size:24px;margin-bottom:18px}.dot{width:12px;height:12px;border-radius:50%;flex-shrink:0}.time{margin-left:auto;font-size:20px;color:#716b65}.media{width:100%;height:auto;max-height:1300px;object-fit:contain;display:block;border-radius:12px}.sticker{width:120px;height:120px;object-fit:contain;display:block;margin:8px auto 18px}.description{font-size:24px;line-height:1.7;white-space:pre-wrap;overflow-wrap:anywhere;margin:18px 0 0}.credit{font-size:14px;color:#716b65;margin:16px 0 0}.footer{font-size:18px;text-align:center;color:#716b65;padding-top:18px}`;
function article(item: SnapshotItem, index: number) {
  return `<article class="card" data-entry-id="${escape(item.entry.id)}"><div class="person"><i class="dot" style="background:${item.person.color}"></i>${escape(item.person.nickname)}<time class="time">${beijingTime(item.entry.occurredAt)}</time></div><img alt="动态素材" class="${item.entry.media.type === 'photo' ? 'media' : 'sticker'}" src="http://render.local/image/${index}"/>${item.entry.description ? `<p class="description">${escape(item.entry.description)}</p>` : ''}</article>`;
}
export function shareTemplate(
  items: SnapshotItem[],
  rows: HourRow[],
  indices: number[],
  date: string,
  page: number,
  total: number,
) {
  let body = '';
  let previous = '';
  for (const index of indices) {
    const row = rows[index];
    if (previous !== row.hour) {
      if (previous) body += '</section>';
      const credits = [...new Set(items.map((item) => item.credit).filter(Boolean))].join(' · ');
      const hourItems = items.filter((item) =>
        beijingTime(item.entry.occurredAt).startsWith(row.hour),
      );
      const continued = index > 0 && rows[index - 1].hour === row.hour;
      body += `<section class="share-hour"><h2 class="hour-title">${row.hour}:00–${row.hour}:59${continued ? '（续）' : ''}<span>${new Set(hourItems.map((item) => item.entry.personId)).size} 位朋友 · ${hourItems.length} 条动态</span></h2>`;
      previous = row.hour;
    }
    body += `<div class="hour-row">${row.indices.map((i) => article(items[i], i)).join('')}</div>`;
  }
  if (previous) body += '</section>';
  const credits = [...new Set(items.map((item) => item.credit).filter(Boolean))].join(' · ');
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>${exportStyles}</style><body><main class="sheet"><header class="masthead"><div><h1>此刻，同频</h1><p class="subtitle">同一小时，朋友们在做什么</p></div><div class="date">${date}<br><small>${new Set(items.map((i) => i.entry.personId)).size} 位朋友 · ${items.length} 条动态</small></div></header>${body}<footer class="footer">${page} / ${total}${credits ? `<p class="credit">${escape(credits)}</p>` : ''}</footer></main></body></html>`;
}
export class ImageExports {
  private busy = false;
  readonly dir: string;
  constructor(dataDir: string) {
    this.dir = path.join(dataDir, 'exports');
  }
  async cleanup() {
    await mkdir(this.dir, { recursive: true });
    for (const name of await readdir(this.dir)) {
      const dest = path.join(this.dir, name);
      const info = await stat(dest);
      if (Date.now() - info.mtimeMs > 3600_000) await rm(dest, { recursive: true, force: true });
    }
  }
  async generate(items: SnapshotItem[], date: string) {
    if (this.busy) throw new HttpError(429, '另一份手账正在生成，请稍后再试');
    this.busy = true;
    const token = randomUUID(),
      dest = path.join(this.dir, token);
    let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await this.cleanup();
      await mkdir(dest, { recursive: true });
      const font = await readFile(path.join(publicDir, 'fonts/NotoSansCJKsc-Regular.otf'));
      browser = await chromium.launch({ headless: true, timeout: 30_000 });
      timer = setTimeout(() => {
        void browser?.close().catch(() => {});
      }, 90_000);
      const page = await browser.newPage({
        viewport: { width: 1080, height: 1000 },
        deviceScaleFactor: 1,
      });
      page.setDefaultTimeout(30_000);
      await page.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== 'http://render.local') return route.abort();
        if (url.pathname === '/font.otf')
          return route.fulfill({
            body: font,
            contentType: 'font/otf',
            headers: { 'Access-Control-Allow-Origin': '*' },
          });
        const match = url.pathname.match(/^\/image\/(\d+)$/),
          item = match ? items[Number(match[1])] : undefined;
        if (item) return route.fulfill({ body: item.bytes, contentType: item.mime });
        return route.abort();
      });
      const load = async (html: string) => {
        await page.setContent(html, { waitUntil: 'load' });
        await page.evaluate(async () => {
          await document.fonts.load('28px Handbook');
          await document.fonts.ready;
          if (!document.fonts.check('28px Handbook'))
            throw new Error('Chinese font failed to load');
          await Promise.all(Array.from(document.images).map((img) => img.decode()));
        });
      };
      const rows = hourRows(items);
      await load(
        shareTemplate(
          items,
          rows,
          rows.map((_, i) => i),
          date,
          1,
          1,
        ),
      );
      const heights = await page
        .locator('.hour-row')
        .evaluateAll((nodes) => nodes.map((n) => n.getBoundingClientRect().height));
      const headingHeight = await page
        .locator('.hour-title')
        .first()
        .evaluate((n) => n.getBoundingClientRect().height);
      const chromeHeight = await page.evaluate(
        () =>
          document.querySelector('.sheet')!.getBoundingClientRect().height -
          Array.from(document.querySelectorAll('.share-hour')).reduce(
            (sum, n) => sum + n.getBoundingClientRect().height,
            0,
          ),
      );
      const groups = partitionHourRows(
        rows,
        heights,
        12000 - Math.ceil(chromeHeight) - 4,
        headingHeight,
      );
      for (let i = 0; i < groups.length; i++) {
        await load(shareTemplate(items, rows, groups[i], date, i + 1, groups.length));
        const height = await page
          .locator('.sheet')
          .evaluate((n) => n.getBoundingClientRect().height);
        if (height > 12000)
          throw new HttpError(400, '分享图片内容过长，请减少动态描述中的换行后重试');
        await page
          .locator('.sheet')
          .screenshot({ path: path.join(dest, `${i + 1}.png`), timeout: 30_000 });
      }
      const archive = archiver('zip', { zlib: { level: 6 } });
      const { createWriteStream } = await import('node:fs');
      const output = createWriteStream(path.join(dest, 'images.zip'));
      const finished = new Promise<void>((resolve, reject) => {
        output.on('close', resolve);
        output.on('error', reject);
        archive.on('error', reject);
      });
      archive.pipe(output);
      groups.forEach((_, i) =>
        archive.file(path.join(dest, `${i + 1}.png`), {
          name: `${date}-${String(i + 1).padStart(2, '0')}.png`,
        }),
      );
      archive.directory(path.join(publicDir, 'licenses'), 'licenses');
      await archive.finalize();
      await finished;
      const expiresAt = new Date(Date.now() + 3600_000).toISOString();
      await writeFile(path.join(dest, 'metadata.json'), JSON.stringify({ expiresAt }));
      return {
        images: groups.map((_, i) => `/api/exports/files/${token}/${i + 1}.png`),
        archiveUrl: `/api/exports/files/${token}/images.zip`,
        expiresAt,
      };
    } catch (e) {
      await rm(dest, { recursive: true, force: true });
      if (e instanceof HttpError) throw e;
      console.error('Image export failed:', e);
      throw new HttpError(500, '长图生成失败，请确认服务端 Chromium 已安装后重试');
    } finally {
      if (timer) clearTimeout(timer);
      await browser?.close().catch(() => {});
      this.busy = false;
    }
  }
  async file(token: string, name: string) {
    if (!/^[a-f0-9-]{36}$/.test(token) || !/^(\d+\.png|images\.zip)$/.test(name))
      throw new HttpError(404, '文件不存在');
    const dir = path.join(this.dir, token);
    try {
      const meta = JSON.parse(await readFile(path.join(dir, 'metadata.json'), 'utf8'));
      if (Date.parse(meta.expiresAt) < Date.now()) throw new Error('Expired');
      const filename = path.join(dir, name);
      await stat(filename);
      return filename;
    } catch {
      throw new HttpError(404, '导出已过期，请重新生成');
    }
  }
}
