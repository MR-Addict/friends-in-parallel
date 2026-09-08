import type { SnapshotItem } from './exports.js';
import {
  MAX_COLLAGE_ITEMS as MAX_SCENE_ITEMS,
  type LayoutSlot,
  type LayoutCandidate,
  type MediaShape,
} from './collage-layout.js';
export {
  COLLAGE_LAYOUT_VERSION as VIDEO_LAYOUT_VERSION,
  MAX_COLLAGE_ITEMS as MAX_SCENE_ITEMS,
  balancedPages,
  collageGroups as videoGroups,
  mediaShapes,
  layoutSeed,
  chooseLayout,
  type LayoutSlot,
  type LayoutCandidate,
  type MediaShape,
  type CollageGroup as VideoGroup,
} from './collage-layout.js';
export const BOARD_WIDTH = 920;
export const BOARD_HEIGHT = 1400;
const GAP = 28;
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
