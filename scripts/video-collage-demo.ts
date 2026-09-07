/** Import a trusted export ZIP into an isolated local store and render review artifacts. */
import { readFile, writeFile, mkdir, copyFile, access } from 'node:fs/promises';
import path from 'node:path';
import { unzipSync } from 'fflate';
import { chromium } from '@playwright/test';
import { Store } from '../apps/server/src/store.js';
import { snapshot } from '../apps/server/src/exports.js';
import { publicDir } from '../apps/server/src/config.js';
import { videoStyles } from '../apps/server/src/video-catalog.js';
import { ExportCache } from '../apps/server/src/export-cache.js';
import {
  videoScenes,
  loadVideoScene,
  measureVideoScene,
  renderVideo,
} from '../apps/server/src/video-renderer.js';
import type { Entry } from '../apps/server/src/model.js';

const archive = process.argv[2];
if (!archive)
  throw new Error(
    'Usage: node --import tsx scripts/video-collage-demo.ts <materials.zip> [--video]',
  );
const files = unzipSync(await readFile(archive));
const manifest: {
  id: string;
  personId: string;
  occurredAt: string;
  description: string;
  media: Entry['media'];
  path: string;
}[] = JSON.parse(Buffer.from(files['manifest.json']).toString('utf8'));
const date = manifest[0]?.occurredAt
  ? new Date(Date.parse(manifest[0].occurredAt) + 8 * 3600_000).toISOString().slice(0, 10)
  : '';
if (!date) throw new Error('Empty material archive');
const dir = path.resolve(`data/video-demo-${date}`);
const out = path.resolve(`test-results/video-collage-${date}`);
await mkdir(path.join(dir, 'uploads'), { recursive: true });
await mkdir(out, { recursive: true });
// Re-running QA reuses the imported store without overwriting edits made in the demo.
let exists = true;
try {
  await access(path.join(dir, 'entries.json'));
} catch {
  exists = false;
}
if (!exists) {
  const entries: Entry[] = [];
  for (const row of manifest) {
    if (!files[row.path]) throw new Error(`Missing media: ${row.path}`);
    let media = row.media;
    if (media.type === 'photo') {
      const filename = path.basename(media.filename);
      if (filename !== media.filename) throw new Error('Invalid photo filename');
      await writeFile(path.join(dir, 'uploads', filename), files[row.path], { flag: 'wx' });
      media = { ...media, filename };
    }
    entries.push({
      id: row.id,
      personId: row.personId,
      occurredAt: row.occurredAt,
      description: row.description,
      media,
      createdAt: row.occurredAt,
      updatedAt: row.occurredAt,
    });
  }
  await writeFile(path.join(dir, 'entries.json'), JSON.stringify(entries, null, 2), { flag: 'wx' });
}
const store = new Store(dir);
await store.init();
const items = await snapshot(store, date);
const font = await readFile(path.join(publicDir, 'fonts/NotoSansCJKsc-Regular.otf'));
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  await page.route('**/*', (route) => {
    if (route.request().url().endsWith('font.otf'))
      return route.fulfill({
        body: font,
        contentType: 'font/otf',
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    const i = Number(new URL(route.request().url()).pathname.split('/').pop());
    return route.fulfill({ body: items[i].bytes, contentType: items[i].mime });
  });
  for (const style of videoStyles) {
    const scenes = await videoScenes(page, items, date, style);
    await writeFile(path.join(out, `${style.id}-scenes.json`), JSON.stringify(scenes, null, 2));
    for (const [i, scene] of scenes.entries()) {
      await loadVideoScene(page, scene, items, date, style);
      if (!(await measureVideoScene(page)).fits)
        throw new Error(`${style.id} scene ${i} overflows`);
      await page.screenshot({ path: path.join(out, `${style.id}-${i}.png`) });
    }
    console.log(
      style.id,
      scenes
        .filter((s) => s.kind === 'entry')
        .map((s) => `${s.title}: ${s.entries!.length}`)
        .join(', '),
    );
  }
} finally {
  await browser.close();
}
if (process.argv.includes('--video')) {
  const cache = new ExportCache(dir);
  const work = cache.reserve(30 * 60_000);
  try {
    await renderVideo(
      work,
      items,
      date,
      videoStyles[0],
      undefined,
      undefined,
      font,
      (phase, percent) => console.log(percent, phase),
    );
    await copyFile(path.join(work.dir, 'video.mp4'), path.join(out, 'paper.mp4'));
    await copyFile(path.join(work.dir, 'cover.jpg'), path.join(out, 'cover.jpg'));
  } finally {
    await cache.finish(work);
    await cache.dispose();
  }
}
console.log(`Demo data: ${dir}\nReview artifacts: ${out}\nStart with DATA_DIR=${dir} pnpm dev`);
