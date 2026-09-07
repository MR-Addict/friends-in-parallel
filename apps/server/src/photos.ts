import sharp from 'sharp';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { HttpError } from './model.js';

const exec = promisify(execFile);
export const MAX_PHOTO_BYTES = 20 * 1024 * 1024;
const TARGET_BYTES = 3_000_000;
export const PHOTO_MIMES = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
} as const;
export type PhotoExtension = keyof typeof PHOTO_MIMES;

// Check the container signature independently of the browser's MIME type.
// Decoding is best-effort: an unreadable image container can still be retained.
export function photoExtension(bytes: Buffer): PhotoExtension {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP')
    return 'webp';
  if (bytes.length >= 16 && bytes.toString('ascii', 4, 8) === 'ftyp') {
    const size = Math.min(bytes.readUInt32BE(0), bytes.length, 256);
    const brands = [bytes.toString('ascii', 8, 12)];
    for (let offset = 16; offset + 4 <= size; offset += 4)
      brands.push(bytes.toString('ascii', offset, offset + 4));
    if (brands.some((brand) => ['heic', 'heix', 'hevc', 'hevx'].includes(brand))) return 'heic';
    if (brands.some((brand) => ['mif1', 'msf1'].includes(brand))) return 'heif';
  }
  throw new HttpError(400, '请选择 JPEG、PNG、WebP 或 HEIC/HEIF 照片');
}

async function decodeHeic(bytes: Buffer): Promise<Buffer> {
  const dir = await mkdtemp(path.join(tmpdir(), 'parallel-heic-'));
  try {
    const input = path.join(dir, 'input.heic');
    await writeFile(input, bytes);
    await exec('heif-convert', [input, path.join(dir, 'output.png')], {
      timeout: 30_000,
      killSignal: 'SIGKILL',
      maxBuffer: 1024 * 1024,
    });
    const files = await readdir(dir);
    const output = files.includes('output.png')
      ? 'output.png'
      : files
          .filter((name) => /^output-\d+\.png$/.test(name))
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))[0];
    if (!output) throw new Error('HEIC decoder produced no image');
    return await readFile(path.join(dir, output));
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Never turn an optimization failure into an upload failure. */
export async function optimizePhoto(bytes: Buffer, extension: PhotoExtension) {
  const original = { bytes, extension, mime: PHOTO_MIMES[extension] };
  try {
    const heic = extension === 'heic' || extension === 'heif';
    const source = heic ? await decodeHeic(bytes) : bytes;
    const deadline = Date.now() + 20_000;
    let best: Buffer | undefined;
    for (const edge of [2560, 2048, 1600]) {
      for (const quality of [85, 75, 65]) {
        if (Date.now() >= deadline) throw new Error('Photo optimization timed out');
        const result = await sharp(source, { limitInputPixels: 80_000_000 })
          .rotate()
          .resize({ width: edge, height: edge, fit: 'inside', withoutEnlargement: true })
          .webp({ quality, effort: 4 })
          .timeout({ seconds: 5 })
          .toBuffer();
        if (!best || result.length < best.length) best = result;
        if (best.length <= TARGET_BYTES) break;
      }
      if (best && best.length <= TARGET_BYTES) break;
    }
    // A compatible HEIC conversion may be larger than the original. Never
    // exceed the server limit, and never enlarge ordinary JPEG/PNG/WebP files.
    if (best && best.length <= MAX_PHOTO_BYTES && (heic || best.length < bytes.length))
      return { bytes: best, extension: 'webp' as const, mime: PHOTO_MIMES.webp };
  } catch {
    // Missing decoder, corrupt pixels, resource limits, and encoder errors all
    // preserve the exact original bytes and format.
  }
  return original;
}
