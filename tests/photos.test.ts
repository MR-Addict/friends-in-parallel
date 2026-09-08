import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
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

test('HEIC compression failure preserves converted PNG instead of the HEIC original', async (t) => {
  const bytes = await readFile('tests/fixtures/photo.heic');
  t.mock.method(sharp.prototype, 'webp', () => {
    throw new Error('Encoder failure');
  });
  const result = await optimizePhoto(bytes, 'heic');
  assert.equal(result.mime, 'image/png');
  assert.equal(result.extension, 'png');
  const metadata = await sharp(result.bytes).metadata();
  assert.equal(metadata.width, 640);
  assert.equal(metadata.height, 480);
});

test('Bundled decoder handles HEIC when native tools and Sharp HEIC decoding are unavailable', async (t) => {
  const originalPath = process.env.PATH;
  process.env.PATH = '';
  t.after(() => {
    process.env.PATH = originalPath;
  });
  t.mock.method(sharp.prototype, 'png', () => {
    throw new Error('HEIC codec unavailable');
  });
  const result = await optimizePhoto(await readFile('tests/fixtures/photo.heic'), 'heic');
  assert.equal(result.mime, 'image/webp');
  assert.equal((await sharp(result.bytes).metadata()).width, 640);
});

test('Watch-mode worker reports do not crash uploads or hide conversion failures', async () => {
  // Use a subprocess so the regression catches a server crash, rather than
  // letting an uncaught worker callback affect the test runner itself.
  await promisify(execFile)(
    process.execPath,
    [
      '--import',
      pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href,
      '--input-type=module',
      '-e',
      `
      import assert from 'node:assert/strict';
      import { readFile } from 'node:fs/promises';
      import sharp from 'sharp';
      import { optimizePhoto } from './apps/server/src/photos.ts';
      sharp.prototype.png = () => { throw new Error('Native HEIC codec unavailable'); };
      const bytes = await readFile('tests/fixtures/photo.heic');
      await assert.rejects(optimizePhoto(bytes.subarray(0, 24), 'heic'), /转换失败/);
      const photo = await optimizePhoto(bytes, 'heic');
      assert.equal(photo.mime, 'image/webp');
      assert.equal((await sharp(photo.bytes).metadata()).width, 640);
    `,
    ],
    {
      cwd: fileURLToPath(new URL('../', import.meta.url)),
      env: { ...process.env, PATH: '', WATCH_REPORT_DEPENDENCIES: '1' },
      timeout: 45_000,
    },
  );
});

test('Recognizable containers with unreadable pixels are rejected before compression', async () => {
  const bytes = await readFile('tests/fixtures/photo.heic');
  await assert.rejects(optimizePhoto(bytes.subarray(0, 24), 'heic'), /转换失败/);
  await assert.rejects(
    optimizePhoto(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), 'png'),
    /无法读取/,
  );
});
