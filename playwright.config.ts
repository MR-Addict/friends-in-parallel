import { defineConfig } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const testDataDir =
  process.env.PARALLEL_TEST_DATA_DIR || mkdtempSync(path.join(tmpdir(), 'parallel-browser-'));
process.env.PARALLEL_TEST_DATA_DIR = testDataDir;
export default defineConfig({
  testDir: 'tests/browser',
  timeout: 120000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:3101', headless: true },
  globalTeardown: './tests/browser/teardown.ts',
  webServer: {
    command: 'pnpm start',
    url: 'http://127.0.0.1:3101',
    timeout: 30000,
    reuseExistingServer: false,
    env: { PORT: '3101', DATA_DIR: testDataDir },
  },
  reporter: 'list',
});
