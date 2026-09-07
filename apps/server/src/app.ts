import express from 'express';
import { createNotifier } from './notifications.js';
import type { Entry } from './model.js';
import multer from 'multer';
import { optimizePhoto, MAX_PHOTO_BYTES, type PhotoExtension } from './photos.js';
import path from 'node:path';
import { dataDir, publicDir } from './config.js';
import { Store } from './store.js';
import { validateEntry } from './validation.js';
import { checkDate, HttpError } from './model.js';
import { ImageExports, snapshot, streamArchive } from './exports.js';
import { ExportCache } from './export-cache.js';
import { VideoExports } from './video-exports.js';
import { musicBytes, videoMusic, videoSelection } from './video-catalog.js';
export async function createApp(
  dir = dataDir,
  notify: (entry: Entry) => Promise<void> = createNotifier(),
) {
  const store = new Store(dir);
  await store.init();
  const cache = new ExportCache(dir);
  const exports = new ImageExports(cache);
  const videos = new VideoExports(cache);
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: '64kb' }));
  app.use('/api/exports', async (_req, _res, next) => {
    await cache.cleanup();
    next();
  });
  const parseUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_PHOTO_BYTES, files: 1, fields: 10, fieldSize: 8192 },
  }).single('photo');
  const upload: express.RequestHandler = (req, res, next) => {
    parseUpload(req, res, (error: unknown) => {
      // Busboy framing errors are plain Errors, not MulterErrors. Keep this
      // mapping here so unrelated application/storage failures remain 500s.
      if (
        error instanceof Error &&
        [
          'Unexpected end of form',
          'Unexpected end of file',
          'Multipart: Boundary not found',
          'Malformed part header',
        ].includes(error.message)
      ) {
        console.warn('[upload] Invalid or incomplete multipart request', {
          method: req.method,
          reason: error.message,
          contentLength: req.get('content-length'),
          complete: req.complete,
        });
        next(new HttpError(400, '上传内容不完整或格式有误，请重新选择照片并重试'));
        return;
      }
      next(error);
    });
  };
  async function saveEntry(body: Record<string, unknown>, file?: Express.Multer.File, id?: string) {
    const input = await validateEntry(body, file);
    let bytes = file?.buffer;
    if (file && input.media.type === 'photo') {
      const extension = input.media.filename.split('.').pop() as PhotoExtension;
      const optimized = await optimizePhoto(file.buffer, extension);
      bytes = optimized.bytes;
      input.media.filename = input.media.filename.replace(/\.[^.]+$/, `.${optimized.extension}`);
      input.media.mime = optimized.mime;
    }
    return store.save(input, bytes, id);
  }
  app.get('/api/entry-dates', (req, res) => {
    const first = checkDate(`${req.query.month}-01`);
    res.json(store.dateCounts(first.slice(0, 7)));
  });
  app.get('/api/entries', (req, res) => res.json(store.list(checkDate(req.query.date))));
  app.post('/api/entries', upload, async (req, res) => {
    const entry = await saveEntry(req.body || {}, req.file);
    res.status(201).json(entry);
    void Promise.resolve()
      .then(() => notify(entry))
      .catch(() => {
        console.error('[PushPlus] 通知发送失败，动态已保存');
      });
  });
  app.patch('/api/entries/:id', upload, async (req, res) =>
    res.json(await saveEntry(req.body || {}, req.file, String(req.params.id))),
  );
  app.delete('/api/entries/:id', async (req, res) => {
    await store.delete(req.params.id);
    res.sendStatus(204);
  });
  app.post('/api/exports/images', async (req, res) => {
    const date = checkDate(req.body?.date);
    res.json(await exports.generate(await snapshot(store, date), date));
  });
  app.get('/api/exports/video-options', async (_req, res) => res.json(await videos.options()));
  app.post('/api/exports/videos', async (req, res) => {
    const date = checkDate(req.body?.date);
    videoSelection(req.body?.styleId, req.body?.musicId);
    const job = await videos.start(
      await snapshot(store, date),
      date,
      req.body.styleId,
      req.body.musicId,
    );
    res.status(job.status === 'ready' ? 200 : 202).json(job);
  });
  app.get('/api/exports/videos/:jobId', async (req, res) =>
    res.json(await videos.status(req.params.jobId)),
  );
  app.get('/api/exports/music/:musicId', async (req, res) => {
    const music = videoMusic.find((item) => item.id === req.params.musicId);
    if (!music) throw new HttpError(404, '音乐不存在');
    await musicBytes(music);
    res.sendFile(path.join(publicDir, music.file));
  });
  app.get('/api/exports/archive', async (req, res) => {
    const date = checkDate(req.query.date);
    const items = await snapshot(store, date);
    if (req.query.check === '1') {
      res.json({ count: items.length });
      return;
    }
    await streamArchive(res, items, date);
  });
  app.get('/api/exports/files/:token/:name', async (req, res) => {
    const { filename, downloadName, release } = await cache.acquireFile(
      req.params.token,
      req.params.name,
    );
    res.once('finish', release);
    res.once('close', release);
    if (req.params.name.endsWith('.zip') || req.query.download === '1')
      res.attachment(downloadName);
    res.sendFile(filename);
  });
  app.use('/api', (_req, _res, next) => next(new HttpError(404, '接口不存在')));
  app.use(
    '/uploads',
    express.static(store.uploads, { dotfiles: 'deny', fallthrough: false, maxAge: '30d' }),
  );
  app.use(
    express.static(publicDir, {
      maxAge: '30d',
      setHeaders(res, filename) {
        if (path.extname(filename) === '.html') res.setHeader('Cache-Control', 'no-cache');
      },
    }),
  );
  app.get('/', (_req, res) =>
    res.sendFile(path.join(publicDir, 'index.html'), {
      headers: { 'Cache-Control': 'no-cache' },
    }),
  );
  app.use(
    (error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      if (error instanceof multer.MulterError) {
        res.status(400).json({
          error:
            error.code === 'LIMIT_FILE_SIZE' ? '照片不能超过 20 MB' : '上传内容过多，请重新选择',
        });
        return;
      }
      const status =
        error instanceof HttpError ? error.status : (error as { status?: number })?.status || 500;
      if (status >= 500) console.error(error);
      res.status(status).json({
        error:
          error instanceof HttpError
            ? error.message
            : status === 400
              ? '请求内容无法读取'
              : status === 404
                ? '文件不存在'
                : '暂时没能完成，请再试一次',
      });
    },
  );
  return { app, store, dispose: () => cache.dispose() };
}
