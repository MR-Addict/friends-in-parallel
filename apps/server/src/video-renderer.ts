import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { chromium, type Page } from 'playwright';
import {
  balancedPages,
  videoGroups,
  mediaShapes,
  layoutCandidates,
  layoutSeed,
  chooseLayout,
  type LayoutCandidate,
  type LayoutSlot,
} from './video-layout.js';
import { beijingTime } from './model.js';
import type { SnapshotItem } from './exports.js';
import type { VideoStyle } from './video-types.js';
import type { MusicAsset } from './video-catalog.js';
import { videoProcess } from './video-process.js';
import type { CacheWork } from './export-cache.js';

export const VIDEO_WIDTH = 1080,
  VIDEO_HEIGHT = 1920,
  VIDEO_FPS = 30;
export interface SceneEntry {
  itemIndex: number;
  text: string;
  continuation: number;
}
export interface VideoScene {
  kind: 'title' | 'entry' | 'ending';
  title: string;
  text: string;
  duration: number;
  entries?: SceneEntry[];
  layout?: LayoutCandidate;
  pageNumber?: number;
  pageCount?: number;
}
const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

const styles = `
@font-face{font-family:Video;src:url('http://render.local/font.otf')}
*{box-sizing:border-box}body{margin:0;font-family:Video,sans-serif;color:var(--ink)}
.frame{color:var(--ink);width:1080px;height:1920px;overflow:hidden;padding:96px 80px 80px;background:var(--bg);position:relative}
.entry{display:flex;flex-direction:column;padding-bottom:160px}.entry .brand,.entry .rule{flex-shrink:0}.entry .card{margin:auto 0;flex-shrink:0}
.brand{font-size:28px;letter-spacing:8px;color:var(--accent);display:flex;justify-content:space-between;position:relative;z-index:1}
.brand span:last-child{letter-spacing:2px;font-size:24px}.rule{height:2px;background:var(--accent);opacity:.35;margin:28px 0 44px}
.card{position:relative;background:var(--paper);padding:44px;border-radius:18px;border:2px solid color-mix(in srgb,var(--accent) 25%,transparent);box-shadow:0 20px 60px #00000009}
.person{font-size:36px;line-height:1.5;margin:0 0 24px;display:flex;gap:16px;align-items:center}.person strong{overflow-wrap:anywhere;min-width:0}.person i{width:16px;height:16px;border-radius:50%;flex-shrink:0}.person time{font-size:28px;margin-left:auto;white-space:nowrap;color:var(--accent)}
.media-box{height:660px;display:flex;align-items:center;justify-content:center;border-radius:12px;background:color-mix(in srgb,var(--accent) 6%,var(--paper));overflow:hidden}
.media-box img{width:100%;height:100%;object-fit:contain}.media-box.sticker img{width:340px;height:340px}
.copy{font-size:40px;line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere;margin:32px 0 0;max-height:576px}
.continuation{font-size:24px;letter-spacing:3px;color:var(--accent);margin-top:20px}
.hero{height:1470px;display:flex;flex-direction:column;justify-content:center;position:relative;padding:30px}.hero .eyebrow{font-size:28px;color:var(--accent);letter-spacing:8px;margin-bottom:36px}.hero h1{font-size:100px;line-height:1.45;letter-spacing:4px;white-space:pre-line;margin:0 0 44px;overflow-wrap:anywhere}.hero p{font-size:34px;line-height:1.9;white-space:pre-wrap;overflow-wrap:anywhere;margin:0}.hour .hero h1{font-size:150px}.ornament{position:absolute;pointer-events:none;opacity:.16;width:560px;height:560px;border:2px solid var(--accent);border-radius:50%;right:-180px;top:260px}.ornament:after{content:'';position:absolute;inset:45px;border:2px solid var(--accent);border-radius:inherit}
.paper{background-image:repeating-linear-gradient(0deg,transparent,transparent 47px,#8f644b0b 48px)}.paper .card:before{content:'';position:absolute;width:220px;height:46px;background:#c9ac7799;top:-24px;left:calc(50% - 110px);transform:rotate(-3deg)}
.minimal .card{border:0;border-radius:0;box-shadow:none;padding:44px 24px}.minimal .person{border-left:6px solid var(--accent);padding-left:24px}.minimal .hero{padding:0}.minimal .hero h1{font-size:112px;font-weight:400}.minimal .ornament{display:none}
.forest .ornament{border-radius:0 100%;transform:rotate(30deg);background:#53795d22;right:-210px;top:40px}.forest .card{border-radius:100px 18px 100px 18px}.forest .rule{height:5px;width:120px}
.postcard .card{border:10px solid transparent;border-image:repeating-linear-gradient(45deg,#be6749 0 18px,#fffaf0 18px 36px,#507c97 36px 54px,#fffaf0 54px 72px) 10;border-radius:0}.postcard .person time{border:3px dashed var(--accent);border-radius:50%;padding:12px;transform:rotate(8deg)}.postcard .hero{border-bottom:3px dashed var(--accent)}
.polaroid .card{transform:rotate(-1deg);border:0;border-radius:0;box-shadow:14px 18px 0 #bfb0a577,24px 28px 0 #d3c4b8}.polaroid .person{order:2}.polaroid .copy{font-size:40px}.polaroid .ornament{border-radius:0;transform:rotate(15deg)}
.film:before,.film:after{content:'';position:absolute;top:0;bottom:0;width:25px;background:repeating-linear-gradient(0deg,transparent 0 30px,#ead7b2 30px 65px,transparent 65px 96px);left:16px}.film:after{left:auto;right:16px}.film .card{border-radius:0;border:1px solid #d4ac78}.film .rule{height:1px}.film .brand{letter-spacing:12px}
.cinema .card{border:0;border-radius:0;padding:44px 24px}.cinema .media-box{border-top:26px solid #111;border-bottom:26px solid #111}.cinema .copy{text-align:center}.cinema .hero{text-align:center}.cinema .brand{border-bottom:1px solid #888;padding-bottom:24px}.cinema .rule,.cinema .ornament{display:none}
.night{background-image:radial-gradient(circle at 20% 15%,#b0bbdf88 1px,transparent 3px),radial-gradient(circle at 72% 32%,#b0bbdf66 2px,transparent 4px);background-size:160px 180px,240px 290px}.night .card{background:#21314fee;border:1px solid #b0bbdf44;border-radius:50px}.night .ornament{width:220px;height:220px;top:250px;right:100px;background:#b0bbdf;border:0;opacity:.15}.night .hero{padding-top:220px}
.candy .card{border:6px solid #e390af;border-radius:64px;box-shadow:14px 14px 0 #d69bd9}.candy .person{background:#fbd4e2;padding:16px;border-radius:28px}.candy .media-box{height:628px;background:#fff4b0}.candy .ornament{background:#df97c7;border:0;top:400px;right:-300px;opacity:.5}.candy .hero h1{color:#a63963}
.comic .card{border:7px solid #262b37;border-radius:0;box-shadow:16px 16px 0 #262b37}.comic .copy{background:#fff;padding:0 16px;border-left:6px solid #262b37}.comic .person{border-bottom:5px solid #262b37;padding-bottom:20px}.comic .media-box{height:640px;border:3px solid #262b37}.comic .ornament{border-radius:0;background:repeating-linear-gradient(45deg,#262b37 0 3px,transparent 3px 20px);transform:rotate(15deg)}
.neon .card{border:3px solid #73e5de;border-radius:4px;box-shadow:12px 12px 0 #b17ce344,0 0 55px #73e5de22}.neon .person{border-bottom:2px solid #b17ce3;padding-bottom:20px}.neon .media-box{height:640px}.neon .hero h1{text-shadow:5px 5px #b17ce3}.neon .ornament{border:3px solid #73e5de;border-radius:0;transform:rotate(45deg)}
.pixel{background-image:linear-gradient(#8eedb210 2px,transparent 2px),linear-gradient(90deg,#8eedb210 2px,transparent 2px);background-size:64px 64px}.pixel .card{border:8px solid #8eedb2;border-radius:0;box-shadow:12px 12px #151832}.pixel .media-box{border-radius:0}.pixel .person{background:#25284c;padding:12px}.pixel .media-box{height:636px}.pixel .ornament{border:24px solid var(--accent);border-radius:0;width:260px;height:260px;transform:rotate(0deg)}
`;

const collageStyles = `
.frame.entry{display:block;padding-bottom:80px}
.entry .rule{margin-bottom:22px}
.scene-heading{height:62px;margin:0 0 22px;display:flex;align-items:center;justify-content:space-between;font-size:38px;font-weight:400;letter-spacing:2px}
.scene-heading small{font-size:24px;color:var(--accent)}
.board{width:920px;height:1400px;position:relative}
.entry .board .card{position:absolute;margin:0;padding:24px;display:flex;flex-direction:column;transform:none;min-width:0;border-radius:18px}
.entry .board .person{font-size:24px;line-height:1.4;margin:0 0 16px;gap:8px;flex-shrink:0;flex-wrap:wrap;padding:0;border:0;background:none}
.entry .board .person i{width:10px;height:10px}
.entry .board .person time{font-size:24px;padding:0;border:0;transform:none}
.entry .board .media-box{height:auto;min-height:150px;flex:1 1 0;border:0;border-radius:8px;position:relative}
.entry .board .media-box img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}
.entry .board .media-box.sticker{background:transparent}
.entry .board .media-box.sticker img{inset:50% auto auto 50%;transform:translate(-50%,-50%);max-width:320px;max-height:320px;width:85%;height:85%}
.entry .board .copy{font-size:28px;line-height:1.5;margin:16px 0 0;max-height:none;padding:0;border:0;flex-shrink:0}
.entry .board .copy:empty{display:none}
.entry .board .continuation{font-size:24px;margin-top:12px;flex-shrink:0}
.entry .board .card:before{width:90px;height:22px;top:-12px;left:calc(50% - 45px)}
.entry.polaroid .board .card{box-shadow:6px 8px 0 #bfb0a577;border-radius:0}
.entry.forest .board .card{border-radius:40px 14px 40px 14px}
.entry.postcard .board .card{border-width:6px;border-radius:0}
.entry.minimal .board .card,.entry.cinema .board .card,.entry.film .board .card,.entry.comic .board .card,.entry.pixel .board .card{border-radius:0}
.entry.candy .board .card,.entry.comic .board .card,.entry.neon .board .card,.entry.pixel .board .card{box-shadow:6px 6px 0 var(--accent)}
.entry.single .board .copy{font-size:36px;line-height:1.5}
.entry.single .board .media-box{min-height:300px}
`;

export function videoTemplate(
  scene: VideoScene,
  items: SnapshotItem[],
  date: string,
  style: VideoStyle,
) {
  const body =
    scene.kind === 'entry'
      ? `<h2 class="scene-heading"><span>${escape(scene.title)}</span><small>${scene.pageCount && scene.pageCount > 1 ? `${scene.pageNumber} / ${scene.pageCount}` : ''}</small></h2><section class="board">${scene
          .layout!.slots.map((slot: LayoutSlot) => {
            const entry = scene.entries!.find((entry) => entry.itemIndex === slot.itemIndex)!;
            const item = items[entry.itemIndex];
            return `<article class="card" data-item-index="${entry.itemIndex}" style="left:${slot.x}px;top:${slot.y}px;width:${slot.width}px;height:${slot.height}px"><div class="person"><i style="background:${escape(item.person.color)}"></i><strong>${escape(item.person.nickname)}</strong><time>${beijingTime(item.entry.occurredAt)}</time></div><div class="media-box ${item.entry.media.type === 'photo' ? '' : 'sticker'}"><img src="http://render.local/image/${entry.itemIndex}" alt="动态素材"></div><p class="copy">${escape(entry.text)}</p>${entry.continuation ? `<div class="continuation">接着记录 · ${entry.continuation + 1}</div>` : ''}</article>`;
          })
          .join('')}</section>`
      : `<section class="hero"><div class="eyebrow">朋友们的一天</div><h1>${escape(scene.title)}</h1><p>${escape(scene.text)}</p></section>`;
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>${styles}${collageStyles}</style><body><main class="frame ${style.id} ${scene.kind} ${scene.entries?.length === 1 ? 'single' : ''}" style="--bg:${style.background};--ink:${style.ink};--paper:${style.paper};--accent:${style.accent}"><div class="ornament"></div><header class="brand"><span>和朋友的同一时间</span><span>${date}</span></header><div class="rule"></div>${body}</main></body></html>`;
}

/** Check actual rendered geometry, including text, all cards and the footer safe area. */
export async function measureVideoScene(page: Page): Promise<{ fits: boolean; score: number }> {
  return page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll<HTMLElement>('.board .card'));
    if (!cards.length) {
      const hero = document.querySelector<HTMLElement>('.hero');
      return {
        fits:
          !!hero &&
          hero.getBoundingClientRect().bottom < 1820 &&
          hero.scrollHeight <= hero.clientHeight,
        score: 0,
      };
    }
    const board = document.querySelector('.board')!.getBoundingClientRect();
    const rectangles = cards.map((card) => card.getBoundingClientRect());
    let score = 0;
    let fits = board.bottom < 1820;
    cards.forEach((card, i) => {
      const rect = rectangles[i];
      const media = card.querySelector<HTMLElement>('.media-box')!;
      const image = media.querySelector('img')!;
      const box = media.getBoundingClientRect();
      const ratio = image.naturalWidth / image.naturalHeight;
      const imageRect = image.getBoundingClientRect();
      const area =
        Math.min(imageRect.width, imageRect.height * ratio) *
        Math.min(imageRect.height, imageRect.width / ratio);
      score += media.classList.contains('sticker')
        ? 0.35 - Math.max(0, box.height - 420) / 3000
        : (area / (920 * 1400)) * 4 + (area / (box.width * box.height)) * 0.4;
      if (
        !image.complete ||
        !image.naturalWidth ||
        box.height < 149 ||
        card.scrollHeight > card.clientHeight + 1 ||
        card.scrollWidth > card.clientWidth + 1 ||
        rect.left < board.left - 1 ||
        rect.right > board.right + 1 ||
        rect.top < board.top - 1 ||
        rect.bottom > board.bottom + 1
      )
        fits = false;
      for (const child of card.querySelectorAll<HTMLElement>(
        '.person,.copy,.continuation,.media-box',
      )) {
        const childRect = child.getBoundingClientRect();
        if (
          childRect.width &&
          (childRect.bottom > rect.bottom - 12 ||
            childRect.right > rect.right - 12 ||
            child.scrollWidth > child.clientWidth + 1)
        )
          fits = false;
      }
      for (let j = 0; j < i; j++) {
        const other = rectangles[j];
        if (
          rect.left < other.right - 1 &&
          rect.right > other.left + 1 &&
          rect.top < other.bottom - 1 &&
          rect.bottom > other.top + 1
        )
          fits = false;
      }
    });
    return { fits, score };
  });
}

export async function loadVideoScene(
  page: Page,
  scene: VideoScene,
  items: SnapshotItem[],
  date: string,
  style: VideoStyle,
) {
  await page.setContent(videoTemplate(scene, items, date, style), { waitUntil: 'load' });
  await page.evaluate(async () => {
    await document.fonts.load('40px Video');
    await document.fonts.ready;
    if (!document.fonts.check('40px Video')) throw new Error('Chinese font failed to load');
    await Promise.all(Array.from(document.images).map((image) => image.decode()));
  });
}

export async function videoScenes(
  page: Page,
  items: SnapshotItem[],
  date: string,
  style: VideoStyle,
  music?: MusicAsset,
) {
  const scenes: VideoScene[] = [
    {
      kind: 'title',
      title: '和朋友的\n同一时间',
      text: `${date}\n${new Set(items.map((item) => item.entry.personId)).size} 位朋友 · ${items.length} 个瞬间`,
      duration: 2,
    },
  ];
  const shapes = await mediaShapes(items);
  const seed = layoutSeed(items, date, style.id);
  const duration = (entries: SceneEntry[]) =>
    Math.ceil(
      Math.max(
        4,
        entries.length * 1.5,
        entries.reduce((n, entry) => n + Array.from(entry.text).length, 0) / 6 + 1,
      ),
    );
  async function arrange(indices: number[], title: string): Promise<VideoScene[]> {
    const entries = indices.map((itemIndex) => ({
      itemIndex,
      text: items[itemIndex].entry.description,
      continuation: 0,
    }));
    const base: VideoScene = {
      kind: 'entry',
      title,
      text: '',
      entries,
      duration: duration(entries),
    };
    const candidates = layoutCandidates(indices, shapes, items);
    const fitting: LayoutCandidate[] = [];
    for (const candidate of candidates) {
      await loadVideoScene(page, { ...base, layout: candidate }, items, date, style);
      const measured = await measureVideoScene(page);
      if (measured.fits) fitting.push({ ...candidate, score: measured.score });
    }
    if (fitting.length)
      return [
        {
          ...base,
          layout: chooseLayout(
            fitting,
            `${seed}:${indices.map((i) => items[i].entry.id).join(',')}`,
          ),
        },
      ];
    if (indices.length > 1) {
      // Keep page order chronological while reducing density until every card fits.
      const middle = Math.ceil(indices.length / 2);
      return [
        ...(await arrange(indices.slice(0, middle), title)),
        ...(await arrange(indices.slice(middle), title)),
      ];
    }
    const chunks: VideoScene[] = [];
    const chars = Array.from(
      new Intl.Segmenter('zh-CN', { granularity: 'grapheme' }).segment(entries[0].text),
      (s) => s.segment,
    );
    let start = 0;
    while (start < chars.length) {
      let low = 1,
        high = chars.length - start,
        best = 0;
      const entry = { ...entries[0], continuation: chunks.length };
      while (low <= high) {
        const count = Math.floor((low + high) / 2);
        // Keep trailing blank lines measurable, without changing the saved text.
        entry.text = chars.slice(start, start + count).join('') + '\u200b';
        await loadVideoScene(
          page,
          { ...base, entries: [entry], layout: candidates[0] },
          items,
          date,
          style,
        );
        if ((await measureVideoScene(page)).fits) {
          best = count;
          low = count + 1;
        } else high = count - 1;
      }
      if (!best) throw new Error('Text cannot fit video scene');
      entry.text = chars.slice(start, start + best).join('');
      chunks.push({
        ...base,
        entries: [{ ...entry }],
        layout: candidates[0],
        duration: duration([entry]),
      });
      start += best;
    }
    if (!chunks.length) throw new Error('Media or person cannot fit video scene');
    return chunks;
  }
  for (const group of videoGroups(items)) {
    const pages: VideoScene[] = [];
    for (const indices of balancedPages(group.indices))
      pages.push(...(await arrange(indices, group.title)));
    pages.forEach((scene, i) =>
      scenes.push({ ...scene, pageNumber: i + 1, pageCount: pages.length }),
    );
  }
  scenes.push({
    kind: 'ending',
    title: '今天先到这儿',
    text: '明天接着冒泡。',
    duration: 2,
  });
  return scenes;
}

export async function renderVideo(
  work: CacheWork,
  items: SnapshotItem[],
  date: string,
  style: VideoStyle,
  music: MusicAsset | undefined,
  audio: Buffer | undefined,
  font: Buffer,
  progress: (phase: string, percent: number) => void,
) {
  const scratch = path.join(work.dir, 'render');
  await mkdir(scratch, { recursive: true });
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  const abort = () => {
    void browser?.close().catch(() => {});
  };
  work.signal.addEventListener('abort', abort, { once: true });
  try {
    work.signal.throwIfAborted();
    browser = await chromium.launch({ headless: true, timeout: 30_000 });
    if (work.signal.aborted) {
      abort();
      work.signal.throwIfAborted();
    }
    const page = await browser.newPage({
      viewport: { width: VIDEO_WIDTH, height: VIDEO_HEIGHT },
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
      const match = /^\/image\/(\d+)$/.exec(url.pathname);
      const item = match ? items[Number(match[1])] : undefined;
      return item ? route.fulfill({ body: item.bytes, contentType: item.mime }) : route.abort();
    });
    progress('正在排版完整动态', 2);
    const scenes = await videoScenes(page, items, date, style, music);
    const clips: string[] = [];
    let duration = 0;
    for (let i = 0; i < scenes.length; i++) {
      work.signal.throwIfAborted();
      const scene = scenes[i];
      const frame = path.join(scratch, `${i}.png`);
      await loadVideoScene(page, scene, items, date, style);
      const { fits } = await measureVideoScene(page);
      if (!fits) throw new Error('Scene content overflows safe area');
      await page.screenshot({ path: frame, type: 'png' });
      if (!i)
        await page.screenshot({
          path: path.join(work.dir, 'cover.jpg'),
          type: 'jpeg',
          quality: 85,
        });
      const transition = i ? (style.id === 'night' ? 1 : 0.5) : 0;
      const clipDuration = scene.duration + transition;
      duration += clipDuration;
      const args = ['-hide_banner', '-loglevel', 'error', '-y', '-threads', '2'];
      if (i)
        args.push(
          '-loop',
          '1',
          '-framerate',
          '30',
          '-t',
          String(transition),
          '-i',
          path.join(scratch, `${i - 1}.png`),
        );
      args.push('-loop', '1', '-framerate', '30', '-t', String(clipDuration), '-i', frame);
      let filter = i
        ? `[0:v]settb=AVTB[a];[1:v]settb=AVTB[b];[a][b]xfade=transition=${style.transition}:duration=${transition}:offset=0`
        : '[0:v]null';
      if (style.id === 'polaroid')
        filter += `,rotate=0.008*sin(min(t/0.6\\,1)*PI):c=${style.background.replace('#', '0x')}`;
      if (style.id === 'candy')
        filter += ",zoompan=z='1.015-0.015*min(on/18,1)':d=1:fps=30:s=1080x1920";
      filter += ',format=yuv420p,setsar=1[v]';
      const clip = `${i}.mp4`;
      clips.push(clip);
      args.push(
        '-filter_complex_threads',
        '1',
        '-filter_complex',
        filter,
        '-map',
        '[v]',
        '-an',
        '-t',
        String(clipDuration),
        '-r',
        '30',
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '22',
        '-threads',
        '2',
        '-pix_fmt',
        'yuv420p',
        '-progress',
        'pipe:1',
        path.join(scratch, clip),
      );
      const update = (seconds: number) =>
        progress(
          `正在生成画面 ${i + 1} / ${scenes.length}`,
          Math.round(5 + (85 * (i + Math.min(seconds / clipDuration, 1))) / scenes.length),
        );
      update(0);
      await videoProcess('ffmpeg', args, work.signal, update);
      // Only the previous and current frame are needed for each transition.
      if (i) await rm(path.join(scratch, `${i - 1}.png`));
    }
    await browser.close();
    browser = undefined;
    progress('正在合成音乐与视频', 91);
    await writeFile(
      path.join(scratch, 'clips.txt'),
      clips.map((clip) => `file '${clip}'`).join('\n'),
    );
    const args = [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-f',
      'concat',
      '-safe',
      '1',
      '-i',
      path.join(scratch, 'clips.txt'),
    ];
    if (audio) {
      await writeFile(path.join(scratch, 'music.mp3'), audio);
      args.push(
        '-stream_loop',
        '-1',
        '-i',
        path.join(scratch, 'music.mp3'),
        '-map',
        '0:v:0',
        '-map',
        '1:a:0',
        '-af',
        `loudnorm=I=-18:TP=-1.5:LRA=11,afade=t=in:d=1.5,afade=t=out:st=${Math.max(0, duration - 2)}:d=2`,
        '-c:a',
        'aac',
        '-b:a',
        '160k',
        '-ar',
        '48000',
        '-ac',
        '2',
      );
    } else args.push('-map', '0:v:0', '-an');
    args.push(
      '-c:v',
      'copy',
      '-t',
      String(duration),
      '-movflags',
      '+faststart',
      '-progress',
      'pipe:1',
      path.join(work.dir, 'video.mp4'),
    );
    await videoProcess('ffmpeg', args, work.signal, (seconds) =>
      progress('正在合成音乐与视频', Math.min(97, Math.round(91 + (6 * seconds) / duration))),
    );
    progress('正在检查视频', 98);
    const info = JSON.parse(
      await videoProcess(
        'ffprobe',
        [
          '-v',
          'error',
          '-show_streams',
          '-show_format',
          '-of',
          'json',
          path.join(work.dir, 'video.mp4'),
        ],
        work.signal,
      ),
    );
    const video = info.streams.find(
      (stream: { codec_type: string }) => stream.codec_type === 'video',
    );
    const sound = info.streams.find(
      (stream: { codec_type: string }) => stream.codec_type === 'audio',
    );
    if (
      !video ||
      video.codec_name !== 'h264' ||
      video.width !== 1080 ||
      video.height !== 1920 ||
      video.pix_fmt !== 'yuv420p' ||
      video.avg_frame_rate !== '30/1' ||
      !!sound !== !!audio ||
      (sound &&
        (sound.codec_name !== 'aac' || Math.abs(Number(sound.duration) - duration) > 0.2)) ||
      Math.abs(Number(info.format.duration) - duration) > 0.2
    )
      throw new Error('Video verification failed');
    await rm(scratch, { recursive: true, force: true });
    return { duration: Number(info.format.duration), scenes };
  } finally {
    work.signal.removeEventListener('abort', abort);
    await browser?.close().catch(() => {});
  }
}
