import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { optimizePhoto } from '../apps/server/src/photos.js';

test('Sharp compression errors preserve the original bytes and MIME', async (t) => {
  const bytes = await sharp({ create: { width: 100, height: 100, channels: 3, background: 'red' } })
    .png()
    .toBuffer();
  t.mock.method(sharp.prototype, 'webp', () => {
    throw new Error('Encoder failure');
  });
  const result = await optimizePhoto(bytes, 'png');
  assert.deepEqual(result.bytes, bytes);
  assert.equal(result.mime, 'image/png');
});

test('Native libheif converts a real HEIC into a browser-readable photo', async () => {
  const bytes = await readFile('tests/fixtures/photo.heic');
  const result = await optimizePhoto(bytes, 'heic');
  assert.equal(result.mime, 'image/webp');
  const metadata = await sharp(result.bytes).metadata();
  assert.equal(metadata.width, 640);
  assert.equal(metadata.height, 480);
});
