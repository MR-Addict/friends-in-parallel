import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const publicDir = path.join(root, 'apps/web/public');
const selections: [code: string, name: string, label: string, category: string][] = [
  ['1f60a', 'Smiling face with smiling eyes', '好开心', '心情'],
  ['1f602', 'Face with tears of joy', '笑出眼泪', '心情'],
  ['1f970', 'Smiling face with hearts', '幸福冒泡', '心情'],
  ['1f62d', 'Loudly crying face', '呜呜呜', '心情'],
  ['1f60e', 'Smiling face with sunglasses', '酷一下', '心情'],
  ['1f914', 'Thinking face', '想一想', '心情'],
  ['1f35c', 'Steaming bowl', '嗦面时间', '吃喝'],
  ['1f354', 'Hamburger', '汉堡时间', '吃喝'],
  ['1f355', 'Pizza', '快乐披萨', '吃喝'],
  ['2615', 'Hot beverage', '咖啡续命', '吃喝'],
  ['1f370', 'Shortcake', '吃点甜的', '吃喝'],
  ['1f9cb', 'Bubble tea', '奶茶快乐', '吃喝'],
  ['1f4bb', 'Laptop', '努力搬砖', '工作学习'],
  ['1f4da', 'Books', '学习一下', '工作学习'],
  ['1f4dd', 'Memo', '写写画画', '工作学习'],
  ['1f3a8', 'Artist palette', '灵感来了', '工作学习'],
  ['1f4a1', 'Light bulb', '有个想法', '工作学习'],
  ['1f525', 'Fire', '干劲满满', '工作学习'],
  ['1f634', 'Sleeping face', '呼呼大睡', '休息玩乐'],
  ['1f3ae', 'Video game', '开一局', '休息玩乐'],
  ['1f3a7', 'Headphone', '听听音乐', '休息玩乐'],
  ['1f697', 'Automobile', '出门兜风', '休息玩乐'],
  ['1f3d5', 'Camping', '去野营', '休息玩乐'],
  ['1f31b', 'First quarter moon face', '晚安啦', '休息玩乐'],
];
const extras: [code: string, name: string][] = [
  ['1f431', 'Cat face'],
  ['1f433', 'Spouting whale'],
  ['1f438', 'Frog'],
  ['1f43c', 'Panda'],
  ['1f98a', 'Fox'],
  ['1f4f7', 'Camera'],
  ['1f33c', 'Blossom'],
  ['2728', 'Sparkles'],
];
async function get(url: string) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status}: ${url}`);
  return r;
}
async function save(url: string, rel: string) {
  const dest = path.join(publicDir, rel);
  try {
    await access(dest);
    return;
  } catch {}
  await mkdir(path.dirname(dest), { recursive: true });
  const r = await get(url);
  await writeFile(dest, Buffer.from(await r.arrayBuffer()));
}
const manifestPath = path.join(root, 'packages/config/src/asset-sources.json');
let versions: Record<string, string>;
try {
  versions = JSON.parse(await readFile(manifestPath, 'utf8'));
} catch {
  versions = {};
  for (const repo of [
    'microsoft/fluentui-emoji',
    'jdecked/twemoji',
    'hfg-gmuend/openmoji',
    'notofonts/noto-cjk',
  ]) {
    const data = (await (
      await get(`https://api.github.com/repos/${repo}/commits?per_page=1`)
    ).json()) as { sha: string }[];
    versions[repo] = data[0].sha;
  }
  await writeFile(manifestPath, JSON.stringify(versions, null, 2) + '\n');
}
const fluent = 'microsoft/fluentui-emoji';
const tree = (await (
  await get(`https://api.github.com/repos/${fluent}/git/trees/${versions[fluent]}?recursive=1`)
).json()) as { tree: { path: string }[] };
function fluentPath(name: string) {
  const found = tree.tree.find(
    (x) => x.path.startsWith(`assets/${name}/3D/`) && x.path.endsWith('.png'),
  );
  if (!found) throw new Error(`Missing Fluent asset ${name}`);
  return found.path;
}
const raw = (repo: string, p: string) =>
  `https://raw.githubusercontent.com/${repo}/${versions[repo]}/${p.split('/').map(encodeURIComponent).join('/')}`;
const packs = [
  {
    id: 'fluent',
    name: '软萌立体',
    brand: 'Fluent Emoji',
    license: 'MIT',
    source: 'https://github.com/microsoft/fluentui-emoji',
    ext: 'png',
  },
  {
    id: 'twemoji',
    name: '糖果扁平',
    brand: 'Twemoji',
    license: 'CC BY 4.0',
    source: 'https://github.com/jdecked/twemoji',
    ext: 'svg',
  },
  {
    id: 'openmoji',
    name: '线条涂鸦',
    brand: 'OpenMoji',
    license: 'CC BY-SA 4.0',
    source: 'https://openmoji.org',
    ext: 'svg',
  },
];
const stickers = [];
for (const [code, name, label, category] of selections) {
  for (const pack of packs) {
    const file = `stickers/${pack.id}/${code}.${pack.ext}`;
    const url =
      pack.id === 'fluent'
        ? raw(fluent, fluentPath(name))
        : pack.id === 'twemoji'
          ? raw('jdecked/twemoji', `assets/svg/${code}.svg`)
          : raw('hfg-gmuend/openmoji', `color/svg/${code.toUpperCase()}.svg`);
    await save(url, file);
    stickers.push({
      id: `${pack.id}-${code}`,
      packId: pack.id,
      name: label,
      category,
      emoji: String.fromCodePoint(parseInt(code, 16)),
      file: `/${file}`,
    });
  }
  console.log(`Downloaded ${label}`);
}
for (const [code, name] of extras)
  await save(raw(fluent, fluentPath(name)), `stickers/fluent/${code}.png`);
await save(raw(fluent, 'LICENSE'), 'licenses/fluent.txt');
await save(raw('jdecked/twemoji', 'LICENSE-GRAPHICS'), 'licenses/twemoji.txt');
await save(raw('hfg-gmuend/openmoji', 'LICENSE.txt'), 'licenses/openmoji.txt');
await save(raw('notofonts/noto-cjk', 'Sans/LICENSE'), 'licenses/font.txt');
await save(
  raw('notofonts/noto-cjk', 'Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf'),
  'fonts/NotoSansCJKsc-Regular.otf',
);
await writeFile(
  path.join(root, 'packages/config/src/stickers.json'),
  JSON.stringify({ packs, stickers }, null, 2) + '\n',
);
await writeFile(
  path.join(publicDir, 'licenses/README.txt'),
  'Fluent Emoji © Microsoft — MIT\nTwemoji © Twitter, Inc. and other contributors — CC BY 4.0\nOpenMoji © HfG Schwäbisch Gmünd and contributors — CC BY-SA 4.0\nNoto Sans CJK © The Noto Project Authors — SIL OFL 1.1\nOriginal assets are redistributed unmodified. See adjacent license files.\n',
);
console.log('All 72 stickers, decorative assets, Chinese font and licenses are ready.');
