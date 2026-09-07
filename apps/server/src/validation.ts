import sharp, { type Metadata } from 'sharp';
import { randomUUID } from 'node:crypto';
import { people, stickerById, emojiSticker } from './config.js';
import { checkDate, HttpError, type Media, type Entry } from './model.js';
export async function validateEntry(
  body: Record<string, unknown>,
  file?: Express.Multer.File,
): Promise<Omit<Entry, 'id' | 'createdAt' | 'updatedAt'>> {
  const { personId, description = '', occurredAt, mediaType } = body;
  if (typeof personId !== 'string' || !people.some((p) => p.id === personId))
    throw new HttpError(400, '请选择一位朋友');
  if (typeof description !== 'string' || Array.from(description).length > 500)
    throw new HttpError(400, '描述请控制在 500 字以内');
  if (
    typeof occurredAt !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.test(occurredAt) ||
    !Number.isFinite(Date.parse(occurredAt))
  )
    throw new HttpError(400, '请填写有效的时间');
  checkDate(occurredAt.slice(0, 10));
  if (Date.parse(occurredAt) > Date.now())
    throw new HttpError(400, '还没发生的事，等到那一刻再记录吧');
  let media: Media;
  if (mediaType === 'photo') {
    if (file) {
      let metadata: Metadata;
      try {
        metadata = await sharp(file.buffer, { limitInputPixels: 80_000_000 }).metadata();
      } catch {
        throw new HttpError(400, '照片无法读取，请使用 JPEG、PNG 或 WebP');
      }
      const formats: Record<string, string> = {
        jpeg: 'image/jpeg',
        png: 'image/png',
        webp: 'image/webp',
      };
      if (
        !metadata.format ||
        !formats[metadata.format] ||
        formats[metadata.format] !== file.mimetype
      )
        throw new HttpError(400, '仅支持 JPEG、PNG、WebP 图片');
      media = {
        type: 'photo',
        filename: `${randomUUID()}.${metadata.format === 'jpeg' ? 'jpg' : metadata.format}`,
        mime: formats[metadata.format],
      };
    } else {
      if (typeof body.filename !== 'string' || !/^[a-f0-9-]+\.(jpg|png|webp)$/.test(body.filename))
        throw new HttpError(400, '请选择照片');
      const extension = body.filename.split('.').pop();
      media = {
        type: 'photo',
        filename: body.filename,
        mime: extension === 'jpg' ? 'image/jpeg' : `image/${extension}`,
      };
    }
  } else if (mediaType === 'emoji') {
    if (typeof body.emoji !== 'string' || !emojiSticker(body.emoji))
      throw new HttpError(400, '请选择一个表情');
    media = { type: 'emoji', emoji: body.emoji };
  } else if (mediaType === 'sticker') {
    if (typeof body.stickerId !== 'string' || !stickerById(body.stickerId))
      throw new HttpError(400, '请选择一张贴纸');
    media = { type: 'sticker', stickerId: body.stickerId };
  } else throw new HttpError(400, '请选择照片、表情或贴纸');
  if (file && mediaType !== 'photo') throw new HttpError(400, '每条动态只能选择一种素材');
  return {
    personId,
    description: description.trim(),
    occurredAt: new Date(occurredAt).toISOString(),
    media,
  };
}
