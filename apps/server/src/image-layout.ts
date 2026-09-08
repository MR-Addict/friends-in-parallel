import type { Page } from 'playwright';
import type { SnapshotItem } from './exports.js';
import { beijingTime } from './model.js';
import {
  balancedPages,
  collageGroups,
  mediaShapes,
  layoutSeed,
  chooseLayout,
  type MediaShape,
} from './collage-layout.js';

export const IMAGE_MAX_HEIGHT = 12000;
const WIDTH = 984,
  GAP = 24;
export interface ImageEntry {
  itemIndex: number;
  text: string;
  continuation: number;
}
export type ImageTree =
  | { entry: ImageEntry; width: number; mediaHeight: number }
  | { axis: 'row' | 'column'; children: ImageTree[]; weights?: number[] };
export interface ImageBlock {
  group: number;
  title: string;
  groupIndices: number[];
  tree: ImageTree;
  height: number;
}
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
const css = `
@font-face{font-family:Handbook;src:url('http://render.local/font.otf')}
*{box-sizing:border-box}body{margin:0;background:#faf9f6;color:#292724;font-family:Handbook,sans-serif}
.sheet{width:1080px;padding:48px;background:#faf9f6}.masthead{display:flex;justify-content:space-between;align-items:center;gap:24px;border-bottom:2px solid #e9e5df;padding-bottom:24px;margin-bottom:24px}h1{font-size:44px;margin:0 0 12px}.subtitle{font-size:22px;color:#716b65;margin:0}.date{flex-shrink:0;font-size:26px;color:#716b65}
.hour-title{min-height:84px;display:flex;align-items:center;justify-content:space-between;gap:16px;margin:0;font-size:30px}.hour-title span{font-size:20px;font-weight:400;color:#716b65;white-space:nowrap}
.collage-block{padding-bottom:24px}.layout-row,.layout-column{display:flex;gap:24px;min-width:0}.layout-row{align-items:stretch}.layout-column{flex-direction:column}.layout-row>*{flex:1 1 0;min-width:0}
.card{min-width:0;padding:24px;background:#fff;border:2px solid #e9e5df;border-radius:18px;display:flex;flex-direction:column}
.person{display:flex;align-items:center;flex-wrap:wrap;gap:10px;font-size:24px;line-height:1.4;margin-bottom:18px}.person strong{overflow-wrap:anywhere;min-width:0}.dot{width:12px;height:12px;border-radius:50%;flex-shrink:0}.time{margin-left:auto;font-size:24px;color:#716b65;white-space:nowrap}
.media-box{flex-shrink:0;display:flex;align-items:center;justify-content:center;background:#f8f7f4;border-radius:10px}.media-box img{width:100%;height:100%;object-fit:contain;display:block}.media-box.sticker{background:transparent}.media-box.sticker img{max-width:180px;max-height:180px}
.description{font-size:28px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere;margin:18px 0 0}.description:after{content:'\\200b'}.continuation{font-size:24px;color:#716b65;margin-top:12px}.footer{font-size:18px;text-align:center;color:#716b65;padding-top:18px}
`;
function treeHtml(tree: ImageTree, items: SnapshotItem[]): string {
  if ('entry' in tree) {
    const { itemIndex, text, continuation } = tree.entry,
      item = items[itemIndex];
    return `<article class="card" data-entry-id="${escape(item.entry.id)}"><div class="person"><i class="dot" style="background:${escape(item.person.color)}"></i><strong>${escape(item.person.nickname)}</strong><time class="time">${beijingTime(item.entry.occurredAt)}</time></div><div class="media-box ${item.entry.media.type === 'photo' ? '' : 'sticker'}" style="height:${tree.mediaHeight}px"><img alt="动态素材" src="http://render.local/image/${itemIndex}"></div>${text ? `<p class="description">${escape(text)}</p>` : ''}${continuation ? `<div class="continuation">接着记录 · ${continuation + 1}</div>` : ''}</article>`;
  }
  return `<div class="layout-${tree.axis}">${tree.children.map((child, i) => `<div class="layout-column"${tree.axis === 'row' ? ` style="flex-grow:${tree.weights?.[i] || 1}"` : ''}>${treeHtml(child, items)}</div>`).join('')}</div>`;
}
export function imageTemplate(
  items: SnapshotItem[],
  blocks: ImageBlock[],
  indices: number[],
  date: string,
  page: number,
  total: number,
) {
  let previous = -1;
  const body = indices
    .map((index) => {
      const block = blocks[index];
      let heading = '';
      if (block.group !== previous) {
        const continued = index > 0 && blocks[index - 1].group === block.group;
        heading = `<h2 class="hour-title">${escape(block.title)}${continued ? '（续）' : ''}<span>${new Set(block.groupIndices.map((i) => items[i].entry.personId)).size} 位朋友 · ${block.groupIndices.length} 条动态</span></h2>`;
        previous = block.group;
      }
      return `${heading}<section class="collage-block" data-block="${index}">${treeHtml(block.tree, items)}</section>`;
    })
    .join('');
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>${css}</style><body><main class="sheet"><header class="masthead"><div><h1>和朋友的同一时间</h1><p class="subtitle">同一时间，看看朋友们都在干嘛。</p></div><div class="date">${date}<br><small>${new Set(items.map((i) => i.entry.personId)).size} 位朋友 · ${items.length} 条动态</small></div></header>${body}<footer class="footer">${page} / ${total}</footer></main></body></html>`;
}
export async function loadImageScene(page: Page, html: string) {
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(async () => {
    await document.fonts.load('28px Handbook');
    await document.fonts.ready;
    if (!document.fonts.check('28px Handbook')) throw new Error('Chinese font failed to load');
    await Promise.all(Array.from(document.images).map((image) => image.decode()));
  });
}
export async function measureImageScene(page: Page) {
  return page.evaluate(() => {
    const sheet = document.querySelector<HTMLElement>('.sheet')!;
    const cards = Array.from(document.querySelectorAll<HTMLElement>('.card'));
    const rects = cards.map((c) => c.getBoundingClientRect());
    let fits = sheet.scrollWidth <= sheet.clientWidth,
      score = 0;
    cards.forEach((card, i) => {
      const rect = rects[i];
      if (
        card.scrollWidth > card.clientWidth ||
        card.scrollHeight > card.clientHeight + 1 ||
        rect.width < 252 ||
        rect.left < 48 ||
        rect.right > 1032
      )
        fits = false;
      const media = card.querySelector<HTMLElement>('.media-box')!;
      const image = media.querySelector('img')!;
      const box = image.getBoundingClientRect(),
        ratio = image.naturalWidth / image.naturalHeight;
      if (!image.naturalWidth || getComputedStyle(image).objectFit !== 'contain') fits = false;
      const area =
        Math.min(box.width, box.height * ratio) * Math.min(box.height, box.width / ratio);
      score += media.classList.contains('sticker') ? 0.35 : Math.sqrt(area) / 500;
      for (const child of card.querySelectorAll<HTMLElement>(
        '.person,.description,.continuation,.media-box',
      )) {
        const r = child.getBoundingClientRect();
        if (
          r.bottom > rect.bottom - 20 ||
          r.right > rect.right - 20 ||
          child.scrollWidth > child.clientWidth + 1
        )
          fits = false;
      }
      for (let j = 0; j < i; j++)
        if (
          rect.left < rects[j].right - 1 &&
          rect.right > rects[j].left + 1 &&
          rect.top < rects[j].bottom - 1 &&
          rect.bottom > rects[j].top + 1
        )
          fits = false;
    });
    const heights = Array.from(
      document.querySelectorAll('.collage-block'),
      (n) => n.getBoundingClientRect().height,
    );
    const height = sheet.getBoundingClientRect().height;
    // Reward useful image area, with a cost for overly tall layouts.
    score -= heights.reduce((a, b) => a + b, 0) / 650;
    return {
      fits,
      score,
      heights,
      height,
      headingHeight: document.querySelector('.hour-title')?.getBoundingClientRect().height || 84,
    };
  });
}

type Pattern = number | { axis: 'row' | 'column'; children: Pattern[]; weights?: number[] };
function patterns(n: number): Pattern[] {
  const row = (values: Pattern[], weights?: number[]): Pattern => ({
    axis: 'row',
    children: values,
    weights,
  });
  const column = (values: Pattern[]): Pattern => ({ axis: 'column', children: values });
  if (n === 1) return [0];
  const values = Array.from({ length: n }, (_, i) => i);
  const result = [column(values), row(values)];
  for (const columns of [2, 3])
    result.push(
      column(
        Array.from({ length: Math.ceil(n / columns) }, (_, i) =>
          row(values.slice(i * columns, (i + 1) * columns)),
        ),
      ),
    );
  if (n > 2) {
    const rest = column(values.slice(1));
    result.push(row([0, rest], [1.5, 1]), row([rest, 0], [1, 1.5]));
    const small =
      n <= 4 ? row(values.slice(1)) : column([row(values.slice(1, 3)), row(values.slice(3))]);
    result.push(column([0, small]), column([small, 0]));
  }
  return result;
}
function permutations(values: ImageEntry[]): ImageEntry[][] {
  return values.length < 2
    ? [values]
    : values.flatMap((v, i) =>
        permutations(values.filter((_, j) => i !== j)).map((tail) => [v, ...tail]),
      );
}
function build(
  pattern: Pattern,
  entries: ImageEntry[],
  shapes: MediaShape[],
  width: number,
): ImageTree {
  if (typeof pattern === 'number') {
    const entry = entries[pattern],
      shape = shapes[entry.itemIndex],
      inner = width - 52;
    return {
      entry,
      width,
      mediaHeight:
        shape.kind === 'sticker'
          ? 180
          : Math.max(180, Math.min(1300, (inner * shape.height) / shape.width)),
    };
  }
  const weights = pattern.weights || pattern.children.map(() => 1),
    sum = weights.reduce((a, b) => a + b, 0);
  return {
    ...pattern,
    children: pattern.children.map((p, i) =>
      build(
        p,
        entries,
        shapes,
        pattern.axis === 'row' ? ((width - GAP * (weights.length - 1)) * weights[i]) / sum : width,
      ),
    ),
  };
}
function estimate(tree: ImageTree): { height: number; score: number } {
  if ('entry' in tree) {
    const inner = tree.width - 52;
    if (inner < 200) return { height: 100000, score: -100 };
    const lines = tree.entry.text
      .split('\n')
      .reduce(
        (sum, line) =>
          sum +
          Math.max(1, Math.ceil(Array.from(line).length / Math.max(1, Math.floor(inner / 28)))),
        0,
      );
    const height =
      104 +
      tree.mediaHeight +
      (tree.entry.text ? 18 + lines * 42 : 0) +
      (tree.entry.continuation ? 48 : 0);
    return { height, score: Math.sqrt(inner * tree.mediaHeight) / 500 };
  }
  const parts = tree.children.map(estimate);
  const height =
    tree.axis === 'row'
      ? Math.max(...parts.map((p) => p.height))
      : parts.reduce((s, p) => s + p.height, 0) + GAP * (parts.length - 1);
  return { height, score: parts.reduce((s, p) => s + p.score, 0) };
}
export function partitionImageBlocks(
  blocks: ImageBlock[],
  available: number,
  heading = 84,
): number[][] {
  const pages: number[][] = [];
  let current: number[] = [],
    used = 0;
  const flush = () => {
    if (current.length) pages.push(current);
    current = [];
    used = 0;
  };
  for (let start = 0; start < blocks.length;) {
    let end = start + 1;
    while (end < blocks.length && blocks[end].group === blocks[start].group) end++;
    const whole = heading + blocks.slice(start, end).reduce((s, b) => s + b.height, 0);
    if (whole <= available) {
      if (used + whole > available) flush();
      for (let i = start; i < end; i++) current.push(i);
      used += whole;
    } else
      for (let i = start; i < end; i++) {
        if (blocks[i].height + heading > available)
          throw new Error('Image block exceeds page height');
        let cost = blocks[i].height + (i === start || !current.length ? heading : 0);
        if (used + cost > available) {
          flush();
          cost = blocks[i].height + heading;
        }
        current.push(i);
        used += cost;
      }
    start = end;
  }
  flush();
  return pages;
}
export async function imageBlocks(
  page: Page,
  items: SnapshotItem[],
  date: string,
  maxHeight = IMAGE_MAX_HEIGHT,
) {
  await loadImageScene(page, imageTemplate(items, [], [], date, 1, 1));
  const chrome = (await measureImageScene(page)).height;
  const available = maxHeight - Math.ceil(chrome) - 4,
    heading = 84;
  const shapes = await mediaShapes(items),
    seed = layoutSeed(items, date, 'images-v1');
  const blocks: ImageBlock[] = [];
  async function arrange(
    entries: ImageEntry[],
    group: number,
    title: string,
    groupIndices: number[],
  ): Promise<ImageBlock[]> {
    const candidates = patterns(entries.length).map((pattern) => {
      const choices = permutations(entries).map((order) => {
        const tree = build(pattern, order, shapes, WIDTH),
          measured = estimate(tree);
        return { tree, id: JSON.stringify(tree), score: measured.score - measured.height / 650 };
      });
      return choices.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))[0];
    });
    const fitting: { id: string; score: number; block: ImageBlock }[] = [];
    for (const c of candidates) {
      const block: ImageBlock = { group, title, groupIndices, tree: c.tree, height: 0 };
      await loadImageScene(page, imageTemplate(items, [block], [0], date, 1, 1));
      const measured = await measureImageScene(page);
      block.height = Math.ceil(measured.heights[0]);
      if (measured.fits && block.height + measured.headingHeight <= available)
        fitting.push({ id: c.id, score: measured.score, block });
    }
    if (fitting.length)
      return [
        chooseLayout(
          fitting,
          `${seed}:${entries.map((e) => items[e.itemIndex].entry.id).join(',')}`,
        ).block,
      ];
    if (entries.length > 1) {
      const middle = Math.ceil(entries.length / 2);
      return [
        ...(await arrange(entries.slice(0, middle), group, title, groupIndices)),
        ...(await arrange(entries.slice(middle), group, title, groupIndices)),
      ];
    }
    const entry = entries[0];
    const chars = Array.from(
      new Intl.Segmenter('zh-CN', { granularity: 'grapheme' }).segment(entry.text),
      (s) => s.segment,
    );
    const result: ImageBlock[] = [];
    let start = 0;
    while (start < chars.length) {
      let low = 1,
        high = chars.length - start,
        best: ImageBlock | undefined,
        count = 0;
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const chunk = {
          ...entry,
          text: chars.slice(start, start + mid).join(''),
          continuation: result.length,
        };
        const block: ImageBlock = {
          group,
          title,
          groupIndices,
          tree: build(0, [chunk], shapes, WIDTH),
          height: 0,
        };
        await loadImageScene(page, imageTemplate(items, [block], [0], date, 1, 1));
        const m = await measureImageScene(page);
        block.height = Math.ceil(m.heights[0]);
        if (m.fits && block.height + m.headingHeight <= available) {
          best = block;
          count = mid;
          low = mid + 1;
        } else high = mid - 1;
      }
      if (!best) throw new Error('Single entry cannot fit image');
      result.push(best);
      start += count;
    }
    if (!result.length) throw new Error('Image media cannot fit page');
    return result;
  }
  for (const [group, g] of collageGroups(items).entries()) {
    const title = g.title.includes('—') ? g.title : `${g.title}–${g.title.slice(0, 2)}:59`;
    for (const indices of balancedPages(g.indices))
      blocks.push(
        ...(await arrange(
          indices.map((itemIndex) => ({
            itemIndex,
            text: items[itemIndex].entry.description,
            continuation: 0,
          })),
          group,
          title,
          g.indices,
        )),
      );
  }
  return { blocks, pages: partitionImageBlocks(blocks, available, heading) };
}

/** A single post stays intact, including its full caption. */
export function postTemplate(item: SnapshotItem, date: string) {
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>${css}
.sheet{height:auto;min-height:0;padding:48px}.post-media{display:block;width:100%;max-height:1400px;object-fit:contain;border-radius:10px}.post-media.sticker{height:320px}.card{padding:32px}.time{font-size:22px}
</style><body><main class="sheet"><article class="card"><div class="person"><i class="dot" style="background:${escape(item.person.color)}"></i><strong>${escape(item.person.nickname)}</strong><time class="time">${escape(date)} ${beijingTime(item.entry.occurredAt)}（北京时间）</time></div><img class="post-media ${item.entry.media.type === 'photo' ? '' : 'sticker'}" src="http://render.local/image/0" alt="动态素材"><p class="description">${escape(item.entry.description)}</p></article></main></body></html>`;
}
