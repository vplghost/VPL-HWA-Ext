#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { convertImgBuffer } from './convert-img-asset.mjs';

const root = resolve(import.meta.dirname, '..');
const assetsBase = join(root, 'extension/assets/items');
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
  if (existsSync(targetPath)) return true;

  for (const url of candidateUrls) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      const { png } = convertImgBuffer(buf);
      await writeFile(targetPath, png);
      return true;
    } catch (_) {}
  }
  return false;
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

// 1. Consumables
for (const id of observedConsumables) {
  const c = consumableMeta[id];
  if (!c) continue;
  tasks.push(async () => {
    const names = new Set();
    if (c.assetTexture) {
      names.add(c.assetTexture);
      names.add(c.assetTexture.toLowerCase());
    }
    if (c.icon?.imagePath) {
      const baseName = c.icon.imagePath.replace(/\.png$/i, '');
      names.add(baseName);
      names.add(baseName.toLowerCase());
    }
    const urls = [];
    for (const name of names) {
      urls.push(`${CDN_BASE}/consumable/${name}.img`);
      urls.push(`${CDN_BASE}/inventory/${name}.img`);
    }
    const ok = await downloadAndConvert('consumable', id, urls);
    if (ok) console.log(`✓ Consumable #${id} (${c.assetTexture})`);
    else console.warn(`✗ Consumable #${id} not found`);
  });
}

// 2. Gear
for (const id of observedGear) {
  const g = gearMeta[id];
  if (!g?.assetTexture) continue;
  tasks.push(async () => {
    const urls = [
      `${CDN_BASE}/inventory/${g.assetTexture}.img`,
      `${CDN_BASE}/inventory/${g.assetTexture}_new.img`,
      `${CDN_BASE}/gear/${g.assetTexture}.img`
    ];
    const ok = await downloadAndConvert('gear', id, urls);
    if (ok) console.log(`✓ Gear #${id} (${g.assetTexture})`);
    else console.warn(`✗ Gear #${id} not found`);
  });
}

// 3. Scrolls
for (const id of observedScrolls) {
  const s = scrollMeta[id];
  if (!s?.assetTexture) continue;
  tasks.push(async () => {
    const urls = [
      `${CDN_BASE}/scroll/${s.assetTexture}.img`,
      `${CDN_BASE}/inventory/${s.assetTexture}.img`
    ];
    const ok = await downloadAndConvert('scroll', id, urls);
    if (ok) console.log(`✓ Scroll #${id} (${s.assetTexture})`);
    else console.warn(`✗ Scroll #${id} not found`);
  });
}

await processPool(tasks, 10);
console.log('Done extracting inventory item assets.');
