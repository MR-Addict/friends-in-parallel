import { createHash } from 'node:crypto';
import sharp from 'sharp';
import type { SnapshotItem } from './exports.js';
import { beijingTime } from './model.js';

export const VIDEO_LAYOUT_VERSION = 'hour-collage-v1';
export const MAX_SCENE_ITEMS = 6;
export const BOARD_WIDTH = 920;
export const BOARD_HEIGHT = 1400;
const GAP = 28;
export interface MediaShape {
  width: number;
  height: number;
  kind: 'landscape' | 'portrait' | 'square' | 'sticker';
}
export interface LayoutSlot {
  itemIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface LayoutCandidate {
  id: string;
  slots: LayoutSlot[];
  score: number;
}
export interface VideoGroup {
  indices: number[];
  title: string;
}

export function balancedPages<T>(values: T[], maximum = MAX_SCENE_ITEMS): T[][] {
  const count = Math.ceil(values.length / maximum);
  if (!count) return [];
  const size = Math.floor(values.length / count),
    extra = values.length % count;
  let offset = 0;
  return Array.from({ length: count }, (_, i) => {
    const page = values.slice(offset, offset + size + Number(i < extra));
    offset += page.length;
    return page;
  });
}

export function videoGroups(items: SnapshotItem[]): VideoGroup[] {
  const hours = new Map<number, number[]>();
  items
    .map((_, i) => i)
    .sort(
      (a, b) =>
        items[a].entry.occurredAt.localeCompare(items[b].entry.occurredAt) ||
        items[a].entry.id.localeCompare(items[b].entry.id),
    )
    .forEach((index) => {
      const hour = Number(beijingTime(items[index].entry.occurredAt).slice(0, 2));
      hours.set(hour, [...(hours.get(hour) || []), index]);
    });
  const buckets = [...hours.entries()];
  const groups: VideoGroup[] = [];
  const label = (hour: number) => `${String(hour).padStart(2, '0')}:00`;
  for (let i = 0; i < buckets.length; i++) {
    const [start, indices] = buckets[i];
    const collected = [...indices];
    let end = start;
    if (indices.length === 1) {
      while (
        i + 1 < buckets.length &&
        buckets[i + 1][0] === end + 1 &&
        buckets[i + 1][1].length === 1 &&
        collected.length < MAX_SCENE_ITEMS
      ) {
        const next = buckets[++i];
        end = next[0];
        collected.push(...next[1]);
      }
    }
    groups.push({
      indices: collected,
      title: start === end ? label(start) : `${label(start)} — ${String(end).padStart(2, '0')}:59`,
    });
  }
  return groups;
}

export async function mediaShapes(items: SnapshotItem[]): Promise<MediaShape[]> {
  return Promise.all(
    items.map(async (item) => {
      if (item.entry.media.type !== 'photo')
        return { width: 1, height: 1, kind: 'sticker' as const };
      const metadata = await sharp(item.bytes).metadata();
      // EXIF orientations 5–8 swap the axes, as they do in Chromium's image decoder.
      const swap = (metadata.orientation || 1) >= 5;
      const width = (swap ? metadata.height : metadata.width) || 1;
      const height = (swap ? metadata.width : metadata.height) || 1;
      const ratio = width / height;
      return {
        width,
        height,
        kind: ratio > 1.15 ? 'landscape' : ratio < 0.87 ? 'portrait' : 'square',
      };
    }),
  );
}

export function layoutSeed(items: SnapshotItem[], date: string, styleId: string): string {
  const hash = createHash('sha256').update(VIDEO_LAYOUT_VERSION).update(date).update(styleId);
  [...items]
    .sort((a, b) => a.entry.id.localeCompare(b.entry.id))
    .forEach((item) => {
      hash.update(
        JSON.stringify([
          item.entry.id,
          item.entry.occurredAt,
          item.entry.description,
          item.entry.media,
          item.person,
        ]),
      );
      hash.update(item.bytes);
    });
  return hash.digest('hex');
}

export function chooseLayout<T extends { id: string; score: number }>(
  candidates: T[],
  seed: string,
): T {
  const sorted = [...candidates].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const best = sorted[0];
  if (!best) throw new Error('No fitting video layout');
  const shortlist = sorted
    .filter((c) => c.score >= best.score - Math.max(0.03, Math.abs(best.score) * 0.12))
    .slice(0, 3);
  const random = createHash('sha256').update(seed).digest().readUInt32BE(0) / 0x100000000;
  return shortlist[Math.floor(random * shortlist.length)];
}

type Rect = Omit<LayoutSlot, 'itemIndex'>;
function rows(counts: number[]): Rect[] {
  const h = (BOARD_HEIGHT - GAP * (counts.length - 1)) / counts.length;
  return counts.flatMap((count, row) => {
    const w = (BOARD_WIDTH - GAP * (count - 1)) / count;
    return Array.from({ length: count }, (_, col) => ({
      x: col * (w + GAP),
      y: row * (h + GAP),
      width: w,
      height: h,
    }));
  });
}
function hero(n: number, vertical: boolean, fraction: number): Rect[] {
  const axis = vertical ? BOARD_WIDTH : BOARD_HEIGHT;
  const main = (axis - GAP) * fraction,
    rest = axis - GAP - main;
  if (vertical) {
    const h = (BOARD_HEIGHT - GAP * (n - 2)) / (n - 1);
    return [
      { x: 0, y: 0, width: main, height: BOARD_HEIGHT },
      ...Array.from({ length: n - 1 }, (_, i) => ({
        x: main + GAP,
        y: i * (h + GAP),
        width: rest,
        height: h,
      })),
    ];
  }
  const columns = n <= 4 ? n - 1 : 2;
  const rowCount = Math.ceil((n - 1) / columns);
  const h = (rest - GAP * (rowCount - 1)) / rowCount;
  return [
    { x: 0, y: 0, width: BOARD_WIDTH, height: main },
    ...Array.from({ length: n - 1 }, (_, i) => {
      const row = Math.floor(i / columns),
        count = Math.min(columns, n - 1 - row * columns);
      const w = (BOARD_WIDTH - GAP * (count - 1)) / count;
      return { x: (i % columns) * (w + GAP), y: main + GAP + row * (h + GAP), width: w, height: h };
    }),
  ];
}
function permutations(values: number[]): number[][] {
  if (values.length <= 1) return [values];
  return values.flatMap((value, i) =>
    permutations(values.filter((_, j) => i !== j)).map((tail) => [value, ...tail]),
  );
}

export function layoutCandidates(
  indices: number[],
  shapes: MediaShape[],
  items: SnapshotItem[],
): LayoutCandidate[] {
  const n = indices.length;
  if (!n || n > MAX_SCENE_ITEMS) throw new Error('Invalid video page size');
  const templates: Rect[][] =
    n === 1
      ? [rows([1])]
      : n === 2
        ? [rows([1, 1]), rows([2])]
        : n === 3
          ? [rows([1, 2]), rows([2, 1]), rows([1, 1, 1])]
          : n === 4
            ? [rows([2, 2]), rows([1, 2, 1])]
            : n === 5
              ? [rows([2, 3]), rows([3, 2]), rows([2, 1, 2])]
              : [rows([2, 2, 2]), rows([3, 3])];
  if (n > 1)
    for (const vertical of [true, false])
      for (const fraction of [0.45, 0.6]) templates.push(hero(n, vertical, fraction));
  const geometries = templates.flatMap((rects) => [
    rects,
    rects.map((r) => ({ ...r, x: BOARD_WIDTH - r.x - r.width, y: BOARD_HEIGHT - r.y - r.height })),
  ]);
  const candidates: LayoutCandidate[] = [];
  const seen = new Set<string>();
  for (const rects of geometries) {
    let best: LayoutCandidate | undefined;
    for (const order of permutations(indices)) {
      const slots = rects.map((r, i) => ({ ...r, itemIndex: order[i] }));
      let score = 0;
      for (const slot of slots) {
        const shape = shapes[slot.itemIndex],
          text = items[slot.itemIndex].entry.description;
        const w = slot.width - 48;
        const textHeight = text
          ? Math.ceil(Array.from(text).length / Math.max(1, Math.floor(w / 28))) * 42 + 16
          : 0;
        const h = slot.height - 112 - textHeight;
        if (h < 150 || w < 180) {
          score -= 10;
          continue;
        }
        const ratio = shape.width / shape.height;
        const displayed = Math.min(w, h * ratio) * Math.min(h, w / ratio);
        score +=
          shape.kind === 'sticker'
            ? 0.35 - Math.max(0, h - 420) / 3000
            : (displayed / (BOARD_WIDTH * BOARD_HEIGHT)) * 4 + (displayed / (w * h)) * 0.4;
      }
      const id = JSON.stringify(slots);
      if (!best || score > best.score || (score === best.score && id < best.id))
        best = { id, slots, score };
    }
    if (best && !seen.has(best.id)) {
      candidates.push(best);
      seen.add(best.id);
    }
  }
  return candidates.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, 12);
}
