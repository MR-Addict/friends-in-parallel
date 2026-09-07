import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Person, Sticker, Pack } from './model.js';
const here = path.dirname(fileURLToPath(import.meta.url));
const production = path.basename(here) === 'dist';
export const publicDir = production
  ? path.join(here, 'public')
  : path.resolve(here, '../../web/public');
export const configDir = production
  ? path.join(here, 'config')
  : path.resolve(here, '../../web/src/config');
export const people: Person[] = JSON.parse(
  readFileSync(path.join(configDir, 'people.json'), 'utf8'),
);
export const { stickers, packs }: { stickers: Sticker[]; packs: Pack[] } = JSON.parse(
  readFileSync(path.join(configDir, 'stickers.json'), 'utf8'),
);
export const dataDir = path.resolve(process.env.DATA_DIR || path.resolve(here, '../../../data'));
export const personById = (id: string) => people.find((p) => p.id === id)!;
export const stickerById = (id: string) => stickers.find((s) => s.id === id)!;
export const emojiSticker = (emoji: string) =>
  stickers.find((s) => s.packId === 'fluent' && s.emoji === emoji)!;
