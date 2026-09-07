import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { chromium, type Page } from 'playwright';
import { beijingTime } from './model.js';
import type { SnapshotItem } from './exports.js';
import type { VideoStyle } from './video-types.js';
import type { MusicAsset } from './video-catalog.js';
import { videoProcess } from './video-process.js';
import type { CacheWork } from './export-cache.js';

export const VIDEO_WIDTH = 1080,
  VIDEO_HEIGHT = 1920,
  VIDEO_FPS = 30;
export interface VideoScene {
  kind: 'title' | 'hour' | 'entry' | 'credits';
  title: string;
  text: string;
  duration: number;
  itemIndex?: number;
  continuation?: number;
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
.bottom{position:absolute;bottom:64px;left:80px;right:80px;display:flex;justify-content:space-between;gap:20px;font-size:24px;color:var(--accent)}
.hero{height:1470px;display:flex;flex-direction:column;justify-content:center;position:relative;padding:30px}.hero .eyebrow{font-size:28px;color:var(--accent);letter-spacing:8px;margin-bottom:36px}.hero h1{font-size:100px;line-height:1.45;letter-spacing:4px;white-space:pre-line;margin:0 0 44px;overflow-wrap:anywhere}.hero p{font-size:34px;line-height:1.9;white-space:pre-wrap;overflow-wrap:anywhere;margin:0}.hour .hero h1{font-size:150px}.credits .hero h1{font-size:68px}.credits .hero p{font-size:27px;line-height:1.8}.ornament{position:absolute;pointer-events:none;opacity:.16;width:560px;height:560px;border:2px solid var(--accent);border-radius:50%;right:-180px;top:260px}.ornament:after{content:'';position:absolute;inset:45px;border:2px solid var(--accent);border-radius:inherit}
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

export function videoTemplate(
  scene: VideoScene,
  items: SnapshotItem[],
  date: string,
  style: VideoStyle,
) {
  const item = scene.itemIndex === undefined ? undefined : items[scene.itemIndex];
  const body = item
    ? `<article class="card"><div class="person"><i style="background:${escape(item.person.color)}"></i><strong>${escape(item.person.nickname)}</strong><time>${beijingTime(item.entry.occurredAt)}</time></div><div class="media-box ${item.entry.media.type === 'photo' ? '' : 'sticker'}"><img src="http://render.local/image/${scene.itemIndex}" alt="动态素材"></div><p class="copy">${escape(scene.text)}</p>${scene.continuation ? `<div class="continuation">接着记录 · ${scene.continuation + 1}</div>` : ''}</article>`
    : `<section class="hero"><div class="eyebrow">${scene.kind === 'credits' ? '这一刻，我们同频' : scene.kind === 'hour' ? '同一小时，各自精彩' : '朋友们的一天'}</div><h1>${escape(scene.title)}</h1><p>${escape(scene.text)}</p></section>`;
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>${styles}</style><body><main class="frame ${style.id} ${scene.kind}" style="--bg:${style.background};--ink:${style.ink};--paper:${style.paper};--accent:${style.accent}"><div class="ornament"></div><header class="brand"><span>此刻，同频</span><span>${date}</span></header><div class="rule"></div>${body}<footer class="bottom"><span>${escape(style.name)}</span><span>${scene.kind === 'entry' ? '每个瞬间，都值得收藏' : '各自在生活，也在同频'}</span></footer></main></body></html>`;
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
      title: '此刻，\n同频',
      text: `${date}\n${new Set(items.map((item) => item.entry.personId)).size} 位朋友 · ${items.length} 个瞬间`,
      duration: 2,
    },
  ];
  let hour = '';
  for (let index = 0; index < items.length; index++) {
    const nextHour = beijingTime(items[index].entry.occurredAt).slice(0, 2);
    if (nextHour !== hour) {
      hour = nextHour;
      scenes.push({
        kind: 'hour',
        title: `${hour}:00`,
        text: `${hour}:00 — ${hour}:59`,
        duration: 1.5,
      });
    }
    const seed: VideoScene = { kind: 'entry', title: '', text: '', duration: 4, itemIndex: index };
    await loadVideoScene(page, seed, items, date, style);
    const chunks = await page.evaluate((text) => {
      const node = document.querySelector<HTMLElement>('.copy')!;
      const chars = Array.from(
        new Intl.Segmenter('zh-CN', { granularity: 'grapheme' }).segment(text),
        (s) => s.segment,
      );
      if (!chars.length) return [''];
      const result: string[] = [];
      let start = 0;
      while (start < chars.length) {
        let low = 1,
          high = chars.length - start,
          best = 0;
        while (low <= high) {
          const count = Math.floor((low + high) / 2);
          // A trailing zero-width character makes trailing blank lines measurable.
          node.textContent = chars.slice(start, start + count).join('') + '\u200b';
          if (node.scrollHeight <= 576) {
            best = count;
            low = count + 1;
          } else high = count - 1;
        }
        if (!best) throw new Error('Text cannot fit video scene');
        result.push(chars.slice(start, start + best).join(''));
        start += best;
      }
      return result;
    }, items[index].entry.description);
    chunks.forEach((text, continuation) =>
      scenes.push({
        ...seed,
        text,
        continuation,
        duration: Math.max(4, Math.ceil(Array.from(text).length / 6) + 1),
      }),
    );
  }
  const assetCredits = [...new Set(items.map((item) => item.credit).filter(Boolean))];
  const lines = ['谢谢你，分享今天。', '', ...assetCredits];
  if (assetCredits.some((credit) => credit.includes('Twemoji')))
    lines.push('Twemoji: creativecommons.org/licenses/by/4.0/');
  if (assetCredits.some((credit) => credit.includes('OpenMoji')))
    lines.push('OpenMoji: creativecommons.org/licenses/by-sa/4.0/');
  if (music)
    lines.push(
      '',
      music.title,
      'Kevin MacLeod (incompetech.com)',
      'CC BY 4.0',
      'https://creativecommons.org/licenses/by/4.0/',
      '音乐已裁剪 / 循环、调整响度并淡入淡出',
    );
  scenes.push({
    kind: 'credits',
    title: '把今天，\n留给未来。',
    text: lines.join('\n'),
    duration: Math.max(5, Math.ceil(lines.length / 2)),
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
      const fits = await page.evaluate(() => {
        const content = document.querySelector('.card') || document.querySelector('.hero');
        return !!content && content.getBoundingClientRect().bottom < 1820;
      });
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
