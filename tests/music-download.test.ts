import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ensureMusic } from '../scripts/download-music.js';

async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const dir = await mkdtemp(path.join(tmpdir(), 'music-download-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const root = pathToFileURL(dir + path.sep);
  const bytes = Buffer.from('pinned audio fixture');
  const track = {
    title: 'Example',
    file: 'music/example.mp3',
    download: 'https://example.test/music.mp3',
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
  const manifest = new URL('packages/config/src/video-music.json', root);
  await mkdir(new URL('packages/config/src/', root), { recursive: true });
  const original = JSON.stringify([track], null, 2) + '\n';
  await writeFile(manifest, original);
  return {
    root,
    bytes,
    manifest,
    original,
    target: new URL('apps/web/public/music/example.mp3', root),
  };
}

test('music preparation downloads missing files, reuses valid files and never rewrites the manifest', async (t) => {
  const f = await fixture(t);
  let downloads = 0;
  const download = async () => {
    downloads++;
    return new Response(new Uint8Array(f.bytes));
  };
  await ensureMusic(f.root, download);
  assert.deepEqual(await readFile(f.target), f.bytes);
  await ensureMusic(f.root, download);
  assert.equal(downloads, 1);
  await writeFile(f.target, 'corrupted');
  await ensureMusic(f.root, download);
  assert.equal(downloads, 2);
  assert.deepEqual(await readFile(f.target), f.bytes);
  assert.equal(await readFile(f.manifest, 'utf8'), f.original);
});

test('failed downloads do not publish mismatched bytes or change pinned checksums', async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    ensureMusic(f.root, async () => new Response('changed audio')),
    /checksum changed/,
  );
  assert.deepEqual(await readdir(new URL('apps/web/public/music/', f.root)), []);
  await assert.rejects(
    ensureMusic(f.root, async () => new Response('', { status: 503 })),
    /HTTP 503/,
  );
  assert.equal(await readFile(f.manifest, 'utf8'), f.original);
});
