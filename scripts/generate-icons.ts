import { mkdir, readFile } from 'node:fs/promises';
import sharp from 'sharp';

const publicDir = new URL('../apps/web/public/', import.meta.url);
const source = await readFile(new URL('favicon.svg', publicDir));
await mkdir(new URL('icons/', publicDir), { recursive: true });

for (const [filename, size] of [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
] as const) {
  await sharp(source)
    .resize(size, size)
    .flatten({ background: '#faf9f6' })
    .png()
    .toFile(new URL(`icons/${filename}`, publicDir).pathname);
}

// Keep the complete mark inside the central 80% safe circle when the OS crops it.
await sharp({ create: { width: 512, height: 512, channels: 3, background: '#faf9f6' } })
  .composite([{ input: await sharp(source).resize(410, 410).png().toBuffer(), gravity: 'centre' }])
  .png()
  .toFile(new URL('icons/icon-maskable-512.png', publicDir).pathname);
