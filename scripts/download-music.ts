import { readFile, writeFile, mkdir, rename, rm } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectRoot = new URL('../', import.meta.url);
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

// The committed manifest is authoritative: normal builds never update checksums.
export async function ensureMusic(root = projectRoot, download = fetch) {
  const tracks = JSON.parse(
    await readFile(new URL('packages/config/src/video-music.json', root), 'utf8'),
  ) as { title: string; file: string; download: string; sha256: string }[];
  for (const track of tracks) {
    if (!/^[a-f0-9]{64}$/.test(track.sha256))
      throw new Error(`${track.title}: missing pinned SHA-256 checksum`);
  }
  await mkdir(new URL('apps/web/public/music/', root), { recursive: true });
  for (let start = 0; start < tracks.length; start += 3) {
    await Promise.all(
      tracks.slice(start, start + 3).map(async (track) => {
        const target = new URL(`apps/web/public/${track.file}`, root);
        const existing = await readFile(target).catch(() => undefined);
        if (existing && digest(existing) === track.sha256) return;
        const response = await download(track.download, { signal: AbortSignal.timeout(180_000) });
        if (!response.ok) throw new Error(`${track.title}: HTTP ${response.status}`);
        const bytes = Buffer.from(await response.arrayBuffer());
        if (digest(bytes) !== track.sha256) throw new Error(`${track.title}: checksum changed`);
        // Exact checksums identify the previously verified MP3s; downloading needs no FFprobe.
        const temp = new URL(`${target.href}.${randomUUID()}.tmp`);
        try {
          await writeFile(temp, bytes);
          await rename(temp, target);
        } finally {
          await rm(temp, { force: true });
        }
        console.log(`Downloaded ${track.title}`);
      }),
    );
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await ensureMusic();
}
