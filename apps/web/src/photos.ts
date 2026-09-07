const TARGET_BYTES = 3_000_000;
const MAX_EDGE = 2560;

async function decode(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode(); // Browser decoding applies the photo's EXIF orientation.
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Convert and optimize locally before either draft storage or uploading. */
export async function preparePhoto(file: File): Promise<File> {
  const header = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  const signature = String.fromCharCode(...header);
  const heic =
    /\.(heic|heif)$/i.test(file.name) ||
    /^image\/hei[cf]/i.test(file.type) ||
    (signature.slice(4, 8) === 'ftyp' && /heic|heix|hevc|hevx|mif1|msf1/.test(signature.slice(8)));
  const mime =
    header[0] === 0xff && header[1] === 0xd8
      ? 'image/jpeg'
      : signature.startsWith('\x89PNG\r\n\x1a\n')
        ? 'image/png'
        : signature.startsWith('RIFF') && signature.slice(8, 12) === 'WEBP'
          ? 'image/webp'
          : '';
  if (!heic && !mime) throw new Error('请选择 JPEG、PNG、WebP 或 iPhone HEIC/HEIF 照片');
  if (file.size > 50 * 1024 * 1024) throw new Error('原始照片不能超过 50 MB，请选择较小的照片');
  let source: HTMLImageElement;
  try {
    source = await decode(file);
  } catch {
    if (!heic) throw new Error('照片无法读取，请重新选择');
    try {
      const { heicTo } = await import('heic-to/csp');
      source = await decode(await heicTo({ blob: file, type: 'image/png' }));
    } catch {
      throw new Error('这张 HEIC 照片转换失败，请重试或在相册中导出为 JPEG');
    }
  }
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('当前浏览器无法处理照片，请更换浏览器重试');
  const scale = Math.min(1, MAX_EDGE / Math.max(source.naturalWidth, source.naturalHeight));
  let width = Math.max(1, Math.round(source.naturalWidth * scale));
  let height = Math.max(1, Math.round(source.naturalHeight * scale));
  try {
    // WebP keeps transparency; Safari versions without WebP encoding fall back to JPEG.
    let outputType = 'image/webp';
    for (let attempt = 0; attempt < 8; attempt++) {
      canvas.width = width;
      canvas.height = height;
      const draw = () => {
        context.clearRect(0, 0, width, height);
        if (outputType === 'image/jpeg') {
          context.fillStyle = '#fff';
          context.fillRect(0, 0, width, height);
        }
        context.drawImage(source, 0, 0, width, height);
      };
      const encode = (quality: number) =>
        new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (blob) => (blob ? resolve(blob) : reject(new Error('照片压缩失败，请重试'))),
            outputType,
            quality,
          ),
        );
      draw();
      for (const quality of [0.85, 0.75, 0.65]) {
        let blob = await encode(quality);
        if (blob.type !== outputType) {
          outputType = 'image/jpeg';
          draw();
          blob = await encode(quality);
        }
        if (blob.size <= TARGET_BYTES) {
          if (!heic && file.size <= TARGET_BYTES && file.size <= blob.size)
            return new File([file], file.name, { type: mime, lastModified: file.lastModified });
          const extension = blob.type === 'image/webp' ? 'webp' : 'jpg';
          return new File([blob], `${file.name.replace(/\.[^.]+$/, '') || 'photo'}.${extension}`, {
            type: blob.type,
            lastModified: file.lastModified,
          });
        }
      }
      width = Math.max(1, Math.floor(width * 0.8));
      height = Math.max(1, Math.floor(height * 0.8));
    }
    throw new Error('照片无法压缩到 3 MB 以内，请选择其他照片');
  } finally {
    canvas.width = canvas.height = 0;
    source.src = '';
  }
}
