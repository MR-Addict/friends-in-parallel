import { createHash } from 'node:crypto';
import sharp from 'sharp';
import type { SnapshotItem } from './exports.js';
import { beijingTime } from './model.js';

export const COLLAGE_LAYOUT_VERSION = 'hour-collage-v1';
export const MAX_COLLAGE_ITEMS = 6;
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
export interface CollageGroup {
  indices: number[];
  title: string;
}

export function balancedPages<T>(values: T[], maximum = MAX_COLLAGE_ITEMS): T[][] {
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

export function collageGroups(items: SnapshotItem[]): CollageGroup[] {
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
  const groups: CollageGroup[] = [];
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
        collected.length < MAX_COLLAGE_ITEMS
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
  const hash = createHash('sha256').update(COLLAGE_LAYOUT_VERSION).update(date).update(styleId);
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
