async function isHeic(file: File) {
  if (/\.(heic|heif)$/i.test(file.name) || /^image\/hei[cf](?:-sequence)?$/i.test(file.type))
    return true;
  const bytes = new Uint8Array(await file.slice(0, 256).arrayBuffer());
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  if (bytes.length < 16 || ascii(4, 8) !== 'ftyp') return false;
  const end = Math.min(new DataView(bytes.buffer).getUint32(0), bytes.length);
  for (let offset = 8; offset + 4 <= end; offset += 4) {
    if (
      offset !== 12 &&
      ['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(ascii(offset, offset + 4))
    )
      return true;
  }
  return false;
}

/** The returned blob is only a preview. The draft and upload keep the original File. */
export async function photoPreview(file: File, signal: AbortSignal): Promise<Blob> {
  if (!(await isHeic(file))) return file;
  signal.throwIfAborted();
  // Safari may already decode HEIC without loading a separate decoder.
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return file;
  } catch {
    signal.throwIfAborted();
  } finally {
    URL.revokeObjectURL(url);
  }
  const worker = new Worker(new URL('./photo-preview.worker.ts', import.meta.url), {
    type: 'module',
  });
  return new Promise<Blob>((resolve, reject) => {
    const finish = (blob?: Blob) => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      worker.terminate();
      if (blob) resolve(blob);
      else reject(new Error('Photo preview unavailable'));
    };
    const abort = () => finish();
    const timer = setTimeout(abort, 30_000);
    signal.addEventListener('abort', abort, { once: true });
    worker.onmessage = (event: MessageEvent<Blob | null>) => finish(event.data || undefined);
    worker.onerror = () => finish();
    worker.postMessage(file);
  });
}
