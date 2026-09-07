import { createApp } from './app.js';
const port = Number(process.env.PORT || 4500);
const { app, dispose } = await createApp();
const server = app.listen(port, '0.0.0.0', () =>
  console.log(`和朋友的同一时间 → http://localhost:${port}`),
);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, async () => {
    await dispose();
    server.close(() => process.exit(0));
  });
