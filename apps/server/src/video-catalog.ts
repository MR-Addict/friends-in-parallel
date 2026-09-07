import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { publicDir, configDir } from './config.js';
import { HttpError } from './model.js';
import type { VideoMusic, VideoStyle } from './video-types.js';
export const videoStyles: VideoStyle[] = JSON.parse(
  readFileSync(path.join(configDir, 'video-styles.json'), 'utf8'),
);
export interface MusicAsset extends Omit<VideoMusic, 'previewUrl'> {
  file: string;
  sha256: string;
  download: string;
}
export const videoMusic: MusicAsset[] = JSON.parse(
  readFileSync(path.join(configDir, 'video-music.json'), 'utf8'),
);
export function videoSelection(styleId: unknown, musicId: unknown) {
  const style = videoStyles.find((style) => style.id === styleId);
  const music = videoMusic.find((music) => music.id === musicId);
  if (!style) throw new HttpError(400, '请选择有效的视频样式');
  if (!music && musicId !== 'none') throw new HttpError(400, '请选择有效的背景音乐');
  return { style, music };
}
export async function musicBytes(music: MusicAsset) {
  const bytes = await readFile(path.join(publicDir, music.file)).catch(() => {
    throw new HttpError(503, '背景音乐暂不可用，请选择其他音乐或无音乐');
  });
  if (createHash('sha256').update(bytes).digest('hex') !== music.sha256)
    throw new HttpError(503, '背景音乐校验失败，请选择其他音乐或无音乐');
  return bytes;
}
