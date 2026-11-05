#!/usr/bin/env node
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { convertImgBuffer } from './convert-img-asset.mjs';

const root = resolve(import.meta.dirname, '..');
const assetsBase = join(root, 'extension/assets/items');
const refresh = process.argv.includes('--refresh');
await mkdir(join(assetsBase, 'consumable'), { recursive: true });
await mkdir(join(assetsBase, 'gear'), { recursive: true });
await mkdir(join(assetsBase, 'scroll'), { recursive: true });

const gearMeta = JSON.parse(await readFile(join(root, 'temp/splitlib/inventoryItem_gear.json'), 'utf8'));
const consumableMeta = JSON.parse(await readFile(join(root, 'temp/splitlib/inventoryItem_consumable.json'), 'utf8'));
const scrollMeta = JSON.parse(await readFile(join(root, 'temp/splitlib/inventoryItem_scroll.json'), 'utf8'));

const CDN_BASE = 'https://heroesmobile-a-cdn.nextersglobal.com/v/webgl/1.292.0/v0001/extends/icons';

// Prioritize items observed in user session traces
const observedConsumables = [
  '5', '6', '7', '9', '10', '11', '12', '14', '15', '16', '20', '24', '29', '30', '31', '32',
  '34', '35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46', '48', '50', '51',
  '62', '63', '64', '65', '101', '231', '234', '276', '409', '1001', '40228', '40230', '40252'
];

const observedGear = [
  '1', '2', '3', '4', '5', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '21',
  '22', '23', '24', '25', '26', '27', '28', '29', '30', '31', '32', '47', '49', '50', '51', '57',
  '60', '64', '70', '73', '77', '90', '92', '100', '122', '127', '134', '138', '167', '172'
];

const observedScrolls = [
  '141', '142', '143', '144', '145', '146', '159', '162', '163'
];

async function downloadAndConvert(category, id, candidateUrls) {
  const targetPath = join(assetsBase, category, `${id}.png`);
  if (!refresh && existsSync(targetPath)) return 'skipped';

  for (const url of candidateUrls) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      const { png } = convertImgBuffer(buf);
      const tempPath = `${targetPath}.tmp`;
      try {
        await writeFile(tempPath, png);
        await rename(tempPath, targetPath);
      } finally {
        await rm(tempPath, { force: true });
      }
      return 'updated';
    } catch (_) {}
  }
  return existsSync(targetPath) ? 'retained' : 'missing';
}

async function itemIds(category, observed) {
  if (!refresh) return observed;
  const existing = (await readdir(join(assetsBase, category)))
    .filter((name) => /^\d+\.png$/.test(name)).map((name) => name.slice(0, -4));
  return [...new Set([...observed, ...existing])].sort((a, b) => Number(a) - Number(b));
}

// Process in parallel with concurrency limit
async function processPool(tasks, limit = 8) {
  let idx = 0;
  const executing = [];
  for (const task of tasks) {
    const p = Promise.resolve().then(task);
    executing.push(p);
    p.then(() => executing.splice(executing.indexOf(p), 1));
    if (executing.length >= limit) {
      await Promise.race(executing);
    }
  }
  await Promise.all(executing);
}

console.log('Extracting inventory item icons...');

const tasks = [];
const results = { updated: 0, skipped: 0, retained: 0, missing: 0 };
function report(category, id, result) {
  results[result]++;
  if (result === 'updated' || result === 'skipped') console.log(`✓ ${category} #${id} (${result})`);
  else if (result === 'retained') console.warn(`~ ${category} #${id}: CDN unavailable, kept existing icon`);
  else console.warn(`✗ ${category} #${id}: no icon available`);
}

// 1. Consumables
for (const id of await itemIds('consumable', observedConsumables)) {
  const c = consumableMeta[id];
  if (!c) continue;
  tasks.push(async () => {
    const names = new Set();
    if (c.icon?.imagePath) {
      const baseName = c.icon.imagePath.replace(/\.png$/i, '');
      names.add(baseName);
      names.add(baseName.toLowerCase());
    }
    if (c.assetTexture) {
      names.add(c.assetTexture);
      names.add(c.assetTexture.toLowerCase());
    }
    const urls = [];
    for (const name of names) {
      urls.push(`${CDN_BASE}/consumable/${name}.img`);
      urls.push(`${CDN_BASE}/inventory/${name}.img`);
    }
    report('Consumable', id, await downloadAndConvert('consumable', id, urls));
  });
}

// 2. Gear
for (const id of await itemIds('gear', observedGear)) {
  const g = gearMeta[id];
  if (!g?.assetTexture && !g?.icon?.imagePath) continue;
  tasks.push(async () => {
    const iconName = g.icon?.imagePath?.replace(/\.png$/i, '');
    const names = [...new Set([iconName, g.assetTexture && `${g.assetTexture}_new`, g.assetTexture].filter(Boolean))];
    const urls = names.flatMap((name) => [
      `${CDN_BASE}/inventory/${name}.img`, `${CDN_BASE}/gear/${name}.img`
    ]);
    report('Gear', id, await downloadAndConvert('gear', id, urls));
  });
}

// 3. Scrolls
for (const id of await itemIds('scroll', observedScrolls)) {
  const s = scrollMeta[id];
  if (!s?.assetTexture && !s?.icon?.imagePath) continue;
  tasks.push(async () => {
    const iconName = s.icon?.imagePath?.replace(/\.png$/i, '');
    const names = [...new Set([iconName, s.assetTexture].filter(Boolean))];
    const urls = names.flatMap((name) => [
      `${CDN_BASE}/scroll/${name}.img`, `${CDN_BASE}/inventory/${name}.img`
    ]);
    report('Scroll', id, await downloadAndConvert('scroll', id, urls));
  });
}

await processPool(tasks, 3);
console.log('Done extracting inventory item assets.');
console.log(`Updated: ${results.updated}, skipped: ${results.skipped}, retained: ${results.retained}, missing: ${results.missing}`);
