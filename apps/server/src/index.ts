import { createApp } from './app.js';
const port = Number(process.env.PORT || 3000);
const { app, dispose } = await createApp();
const server = app.listen(port, '0.0.0.0', () =>
  console.log(`此刻，同频 → http://localhost:${port}`),
);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    dispose();
    server.close(() => process.exit(0));
  });
