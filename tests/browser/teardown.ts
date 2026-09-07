import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
export default async function teardown() {
  const dir = process.env.PARALLEL_TEST_DATA_DIR;
  if (dir && path.dirname(dir) === tmpdir() && path.basename(dir).startsWith('parallel-browser-'))
    await rm(dir, { recursive: true, force: true });
}
