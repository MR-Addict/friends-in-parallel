import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const web = fileURLToPath(new URL('../apps/web/', import.meta.url));
const server = fileURLToPath(new URL('../apps/server/', import.meta.url));
const require = createRequire(import.meta.url);
const webRequire = createRequire(new URL('../apps/web/package.json', import.meta.url));
const children: ChildProcess[] = [];
let stopping = false;

function signalTree(child: ChildProcess, signal: NodeJS.Signals) {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    return;
  }
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') console.error(error);
  }
}
function shutdown(code: number) {
  if (stopping) return;
  stopping = true;
  for (const child of children) signalTree(child, 'SIGTERM');
  // Kill the entire group even if a watcher has already exited, leaving descendants behind.
  setTimeout(() => {
    for (const child of children) signalTree(child, 'SIGKILL');
    process.exit(code);
  }, 1500);
}
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
  process.on(signal, () => shutdown(0));
}
process.on('exit', () => {
  for (const child of children) signalTree(child, 'SIGKILL');
});

async function checkPort(port: number) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`Invalid port: ${port}`);
  const probe = createServer();
  await new Promise<void>((resolve, reject) => {
    probe.once('error', () =>
      reject(
        new Error(`Port ${port} is occupied. Stop the existing service before running pnpm dev.`),
      ),
    );
    probe.listen(port, '0.0.0.0', () =>
      probe.close((error) => (error ? reject(error) : resolve())),
    );
  });
}
function start(cwd: string, args: string[]) {
  if (stopping) return;
  const child = spawn(process.execPath, args, {
    cwd,
    stdio: 'inherit',
    detached: process.platform !== 'win32',
    env: process.env,
  });
  children.push(child);
  child.on('error', (error) => {
    console.error(error);
    shutdown(1);
  });
  child.on('exit', (code) => {
    if (!stopping) shutdown(code || 1);
  });
}
try {
  const backendPort = Number(process.env.PORT || 4500);
  const frontendPort = Number(process.env.DEV_WEB_PORT || 5173);
  if (backendPort === frontendPort) throw new Error('Frontend and backend ports must differ.');
  await checkPort(backendPort);
  await checkPort(frontendPort);
  start(server, ['--watch', '--import', require.resolve('tsx'), 'src/index.ts']);
  start(web, [
    fileURLToPath(new URL('./bin/vite.js', pathToFileURL(webRequire.resolve('vite/package.json')))),
    '--host',
    '0.0.0.0',
    '--port',
    String(frontendPort),
    '--strictPort',
  ]);
} catch (error) {
  console.error((error as Error).message);
  shutdown(1);
}
