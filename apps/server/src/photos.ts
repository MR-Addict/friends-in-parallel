import sharp from 'sharp';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { Worker } from 'node:worker_threads';
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
// Pixel validation and required conversion happen separately from compression.
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

async function decodeNativeHeic(bytes: Buffer, command: string, timeout: number): Promise<Buffer> {
  const dir = await mkdtemp(path.join(tmpdir(), 'parallel-heic-'));
  try {
    const input = path.join(dir, 'input.heic');
    await writeFile(input, bytes);
    await exec(command, [input, path.join(dir, 'output.png')], {
      timeout: Math.min(15_000, timeout),
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

// Isolate the bundled decoder: its CPU work must not block requests, and a
// missing/older system libheif should not prevent otherwise valid HEIC uploads.
async function decodeBundledHeic(bytes: Buffer, timeout: number): Promise<Buffer> {
  const worker = new Worker(
    `const { parentPort, workerData } = require('node:worker_threads');
     require(workerData.module)({ buffer: Buffer.from(workerData.bytes), format: 'PNG' })
       .then(bytes => parentPort.postMessage({ type: 'photo:converted', bytes }))
       .catch(() => parentPort.postMessage({ type: 'photo:failed' }));`,
    {
      eval: true,
      execArgv: [],
      workerData: { module: createRequire(import.meta.url).resolve('heic-convert'), bytes },
      resourceLimits: { maxOldGenerationSizeMb: 512 },
    },
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await new Promise<Buffer>((resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error('HEIC conversion timed out')),
        Math.min(30_000, timeout),
      );
      // Node's --watch mode also emits dependency reports on this channel.
      // Wait for our result instead of treating the first message as bytes.
      worker.on('message', (message: unknown) => {
        if (!message || typeof message !== 'object') return;
        const result = message as { type?: unknown; bytes?: unknown };
        if (result.type === 'photo:failed') {
          reject(new Error('HEIC conversion failed'));
        } else if (result.type === 'photo:converted') {
          try {
            if (!(result.bytes instanceof Uint8Array) || !result.bytes.byteLength)
              throw new Error('HEIC decoder produced no image bytes');
            resolve(Buffer.from(result.bytes));
          } catch (error) {
            reject(error);
          }
        }
      });
      worker.once('error', reject);
      worker.once('exit', () => reject(new Error('HEIC decoder exited without an image')));
    });
  } finally {
    clearTimeout(timer);
    await worker.terminate();
  }
}

async function validatePixels(bytes: Buffer, timeout = 10_000) {
  if (timeout <= 0) throw new Error('Photo decoding timed out');
  // metadata() only reads headers; stats() also checks the actual pixels.
  await sharp(bytes, { limitInputPixels: 80_000_000, failOn: 'warning' })
    .timeout({ seconds: Math.min(10, Math.ceil(timeout / 1000)) })
    .stats();
}

async function compatiblePhoto(bytes: Buffer, extension: PhotoExtension) {
  if (extension !== 'heic' && extension !== 'heif') {
    try {
      await validatePixels(bytes);
      return { bytes, extension, mime: PHOTO_MIMES[extension] };
    } catch {
      throw new HttpError(400, '照片无法读取或已损坏，请重新选择照片');
    }
  }
  // Keep all fallback attempts plus compression inside the upload request timeout.
  const deadline = Date.now() + 75_000;
  for (const decode of [
    (timeout: number) => decodeNativeHeic(bytes, 'heif-dec', timeout),
    (timeout: number) => decodeNativeHeic(bytes, 'heif-convert', timeout),
    (timeout: number) =>
      sharp(bytes, { limitInputPixels: 80_000_000 })
        .rotate()
        .png()
        .timeout({ seconds: Math.min(10, Math.ceil(timeout / 1000)) })
        .toBuffer(),
    (timeout: number) => decodeBundledHeic(bytes, timeout),
  ]) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    try {
      const converted = await decode(remaining);
      await validatePixels(converted, deadline - Date.now());
      return { bytes: converted, extension: 'png' as const, mime: PHOTO_MIMES.png };
    } catch {
      // Try another decoder before rejecting the upload. Never retain HEIC bytes.
    }
  }
  throw new HttpError(400, 'HEIC/HEIF 照片转换失败，请重试或选择 JPEG、PNG、WebP 照片');
}

/** Require readable pixels and a supported format; compression is best-effort. */
export async function optimizePhoto(bytes: Buffer, extension: PhotoExtension) {
  const compatible = await compatiblePhoto(bytes, extension);
  let best: Buffer | undefined;
  try {
    const deadline = Date.now() + 20_000;
    for (const edge of [2560, 2048, 1600]) {
      for (const quality of [85, 75, 65]) {
        if (Date.now() >= deadline) throw new Error('Photo optimization timed out');
        const result = await sharp(compatible.bytes, { limitInputPixels: 80_000_000 })
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
  } catch {
    // Retain the best completed result, or the readable compatible source.
  }
  if (best && best.length < compatible.bytes.length)
    return { bytes: best, extension: 'webp' as const, mime: PHOTO_MIMES.webp };
  return compatible;
}
