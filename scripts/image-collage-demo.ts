import { mkdir, copyFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { Store } from '../apps/server/src/store.js';
import { snapshot, ImageExports } from '../apps/server/src/exports.js';
import { ExportCache } from '../apps/server/src/export-cache.js';
const date = process.argv[2] || '2026-09-07';
const dir = path.resolve(process.argv[3] || `data/video-demo-${date}`);
const out = path.resolve(`test-results/image-collage-${date}`);
const store = new Store(dir);
await store.init();
const items = await snapshot(store, date),
  cache = new ExportCache(dir);
try {
  const result = await new ImageExports(cache).generate(items, date);
  await mkdir(out, { recursive: true });
  for (const name of await readdir(out)) {
    if (/^\d+\.png$/.test(name) || name === 'images.zip') await rm(path.join(out, name));
  }
  for (const url of [...result.images, result.archiveUrl]) {
    const [token, filename] = url.split('/').slice(-2);
    const file = await cache.file(token, filename);
    await copyFile(file.filename, path.join(out, filename));
  }
  console.log(`${items.length} entries, ${result.images.length} images: ${out}`);
} finally {
  await cache.dispose();
}
