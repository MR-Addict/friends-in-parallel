import { heicTo } from 'heic-to/next';

self.onmessage = async (event: MessageEvent<File>) => {
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await heicTo({ blob: event.data, type: 'bitmap' });
    const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
    const canvas = new OffscreenCanvas(
      Math.max(1, Math.round(bitmap.width * scale)),
      Math.max(1, Math.round(bitmap.height * scale)),
    );
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    self.postMessage(await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 }));
  } catch {
    self.postMessage(null);
  } finally {
    bitmap?.close();
  }
};
