import { cp, rm } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const target = new URL('apps/server/dist/', root);
await rm(new URL('public/', target), { recursive: true, force: true });
await cp(new URL('apps/web/dist/', root), new URL('public/', target), { recursive: true });
console.log('Frontend, fonts and stickers copied to server/dist.');
