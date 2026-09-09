import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { people, stickers } from '@parallel/config';
export { people, stickers, packs } from '@parallel/config';
const here = path.dirname(fileURLToPath(import.meta.url));
const production = path.basename(here) === 'dist';
export const publicDir = production
  ? path.join(here, 'public')
  : path.resolve(here, '../../web/public');
export const dataDir = path.resolve(process.env.DATA_DIR || path.resolve(here, '../../../data'));
export const personById = (id: string) => people.find((p) => p.id === id)!;
export const stickerById = (id: string) => stickers.find((s) => s.id === id)!;
export const emojiSticker = (emoji: string) =>
  stickers.find((s) => s.packId === 'fluent' && s.emoji === emoji)!;
