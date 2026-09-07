import express from 'express';
import { createNotifier } from './notifications.js';
import type { Entry } from './model.js';
import multer from 'multer';
import path from 'node:path';
import { dataDir, publicDir } from './config.js';
import { Store } from './store.js';
import { validateEntry } from './validation.js';
import { checkDate, HttpError } from './model.js';
import { ImageExports, snapshot, streamArchive } from './exports.js';
export async function createApp(
  dir = dataDir,
  notify: (entry: Entry) => Promise<void> = createNotifier(),
) {
  const store = new Store(dir);
  await store.init();
  const exports = new ImageExports(dir);
  await exports.cleanup();
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
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024, files: 1, fields: 10, fieldSize: 8192 },
  }).single('photo');
  app.get('/api/entry-dates', (req, res) => {
    const first = checkDate(`${req.query.month}-01`);
    res.json(store.dateCounts(first.slice(0, 7)));
  });
  app.get('/api/entries', (req, res) => res.json(store.list(checkDate(req.query.date))));
  app.post('/api/entries', upload, async (req, res) => {
    const entry = await store.save(await validateEntry(req.body || {}, req.file), req.file?.buffer);
    res.status(201).json(entry);
    void Promise.resolve()
      .then(() => notify(entry))
      .catch(() => {
        console.error('[PushPlus] 通知发送失败，动态已保存');
      });
  });
  app.patch('/api/entries/:id', upload, async (req, res) =>
    res.json(
      await store.save(
        await validateEntry(req.body || {}, req.file),
        req.file?.buffer,
        String(req.params.id),
      ),
    ),
  );
  app.delete('/api/entries/:id', async (req, res) => {
    await store.delete(req.params.id);
    res.sendStatus(204);
  });
  app.post('/api/exports/images', async (req, res) => {
    const date = checkDate(req.body?.date);
    res.json(await exports.generate(await snapshot(store, date), date));
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
    const filename = await exports.file(req.params.token, req.params.name);
    if (req.params.name.endsWith('.zip') || req.query.download === '1')
      res.attachment(req.params.name);
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
  const cleanupTimer = setInterval(() => void exports.cleanup().catch(console.error), 600_000);
  cleanupTimer.unref();
  return { app, store, dispose: () => clearInterval(cleanupTimer) };
}
