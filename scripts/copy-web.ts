import { cp, mkdir, rm } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const target = new URL('apps/server/dist/', root);
await rm(new URL('public/', target), { recursive: true, force: true });
await cp(new URL('apps/web/dist/', root), new URL('public/', target), { recursive: true });
await mkdir(new URL('config/', target), { recursive: true });
await cp(new URL('apps/web/src/config/', root), new URL('config/', target), { recursive: true });
console.log('Frontend, fonts, stickers and configuration copied to server/dist.');
