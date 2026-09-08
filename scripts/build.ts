import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ensureMusic } from './download-music.js';

await ensureMusic();

// The frontend must finish before the backend copies its static output.
for (const workspace of ['@parallel/config', '@parallel/web', '@parallel/server']) {
  const result = spawnSync('pnpm', ['--filter', workspace, 'run', 'build'], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
