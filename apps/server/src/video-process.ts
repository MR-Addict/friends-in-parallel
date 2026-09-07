import { spawn } from 'node:child_process';

/** Abort waits for process exit, so callers can safely delete temporary artifacts. */
export function videoProcess(
  command: string,
  args: string[],
  signal: AbortSignal,
  onProgress?: (seconds: number) => void,
): Promise<string> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: false });
    let output = '',
      errors = '',
      partial = '';
    let force: ReturnType<typeof setTimeout> | undefined;
    const abort = () => {
      child.kill('SIGTERM');
      force = setTimeout(() => child.kill('SIGKILL'), 2000);
      force.unref();
    };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    child.stdout.on('data', (data: Buffer) => {
      const text = data.toString();
      output = (output + text).slice(-1_000_000);
      partial += text;
      const lines = partial.split('\n');
      partial = lines.pop()!;
      for (const line of lines) {
        const match = /^out_time_us=(\d+)/.exec(line);
        if (match) onProgress?.(Number(match[1]) / 1_000_000);
      }
    });
    child.stderr.on('data', (data: Buffer) => {
      errors = (errors + data.toString()).slice(-8000);
    });
    const finish = () => {
      if (force) clearTimeout(force);
      signal.removeEventListener('abort', abort);
    };
    child.on('error', (error) => {
      finish();
      reject(error);
    });
    child.on('close', (code) => {
      finish();
      if (signal.aborted) reject(signal.reason);
      else if (code !== 0) reject(new Error(`${command} exited ${code}: ${errors}`));
      else resolve(output);
    });
  });
}
export async function videoCapability() {
  try {
    const signal = AbortSignal.timeout(10_000);
    const [encoders, filters] = await Promise.all([
      videoProcess('ffmpeg', ['-hide_banner', '-encoders'], signal),
      videoProcess('ffmpeg', ['-hide_banner', '-filters'], signal),
      videoProcess('ffprobe', ['-version'], signal),
    ]);
    return encoders.includes('libx264') && /\baac\b/.test(encoders) && filters.includes('xfade');
  } catch {
    return false;
  }
}
