import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { convertImgBuffer } from './convert-img-asset.mjs';

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, '..');

const coinConfigPath = join(root, 'temp/coin-config.json');
const indexPath = join(root, 'temp/live-full-index.json');
const outputDir = join(root, 'extension/assets/items/coin');
const tempDir = join(root, 'temp/coin_sync_tmp');

await mkdir(outputDir, { recursive: true });
await mkdir(tempDir, { recursive: true });

async function fileExistsAndNotEmpty(path) {
  try {
    const s = await stat(path);
    return s.size > 0;
  } catch {
    return false;
  }
}

// Ensure coin config exists
let coinConfig;
try {
  coinConfig = JSON.parse(await readFile(coinConfigPath, 'utf8'));
} catch {
  console.log('Downloading coin config from remote CDN...');
  const remoteUrl = 'https://hwmb-remote-config-cdn.nextersglobal.com/config/coin/03bda567bd352d4eb2aeea5c3ab30c30.json';
  await execFileAsync('curl.exe', ['-4', '-s', '--connect-timeout', '10', '--retry', '3', '-o', coinConfigPath, remoteUrl]);
  coinConfig = JSON.parse(await readFile(coinConfigPath, 'utf8'));
}

const index = JSON.parse(await readFile(indexPath, 'utf8'));

// Build lowercase lookup map for index
const lowerMap = new Map();
for (const [k, v] of Object.entries(index)) {
  lowerMap.set(k.toLowerCase(), { key: k, ...v });
}

const tasks = [];
for (const [id, c] of Object.entries(coinConfig)) {
  const candidates = [];
  const addCandidate = (val) => {
    if (!val) return;
    const raw = String(val).replace(/\.png$/i, '').toLowerCase();
    candidates.push(`extends/icons/resourceicons/coins/${raw}.img`);
    candidates.push(`extends/icons/resource_with_background/coin/${raw}.img`);
    candidates.push(`extends/icons/resourceicons/icons_size_184/${raw}.img`);
    candidates.push(`extends/icons/quest/${raw}.img`);
    candidates.push(`extends/icons/bundles_templates_icons/resources/event_resources/${raw}.img`);
  };

  addCandidate(c.resourceIcon?.imagePath);
  addCandidate(c.icon?.imagePath);
  addCandidate(c.assetTexture);
  addCandidate(c.iconAssetTexture);
  addCandidate(`icon_coin_${id}`);

  let hit = candidates.find((k) => lowerMap.has(k));
  if (!hit) {
    const f1 = c.resourceIcon?.imagePath?.replace(/\.png$/i, '')?.toLowerCase();
    const f2 = c.icon?.imagePath?.replace(/\.png$/i, '')?.toLowerCase();
    for (const [k] of lowerMap) {
      if ((f1 && k.endsWith(`/${f1}.img`)) || (f2 && k.endsWith(`/${f2}.img`))) {
        hit = k;
        break;
      }
    }
  }

  // Fallbacks for known edge cases
  if (!hit && id === '11') {
    hit = 'extends/icons/quest/adventure_new_year_snowflake.img';
  } else if (!hit && id === '1031') {
    hit = 'extends/icons/quest/clanboss_supertry_icon.img';
  } else if (!hit && id === '100008') {
    hit = 'extends/icons/resource_with_background/coin/icon_coin_exp_clan_tree_s20.img';
  }

  if (hit && lowerMap.has(hit)) {
    const entry = lowerMap.get(hit);
    const url = `https://heroesmobile-a-cdn.nextersglobal.com/v/webgl/1.293.0/${entry.path}`;
    tasks.push({
      id,
      label: c.label || id,
      hitKey: entry.key,
      url
    });
  }
}

console.log(`Matched ${tasks.length} / ${Object.keys(coinConfig).length} coins to CDN textures.`);

let cursor = 0;
let downloaded = 0;
let skipped = 0;
let failed = 0;
const concurrency = 8;

async function worker() {
  while (cursor < tasks.length) {
    const task = tasks[cursor++];
    const destPng = join(outputDir, `${task.id}.png`);

    if (await fileExistsAndNotEmpty(destPng)) {
      skipped++;
      continue;
    }

    const tempImg = join(tempDir, `${task.id}.img`);
    try {
      await execFileAsync('curl.exe', ['-4', '-s', '--connect-timeout', '10', '--retry', '3', '-o', tempImg, task.url]);
      const imgBuf = await readFile(tempImg);
      const { png } = convertImgBuffer(imgBuf);
      await writeFile(destPng, png);
      downloaded++;
    } catch (err) {
      console.error(`Failed to process coin ${task.id} (${task.label}):`, err.message);
      failed++;
    }
  }
}

console.log(`Starting extraction with ${concurrency} workers...`);
await Promise.all(Array.from({ length: concurrency }, () => worker()));
console.log(`Finished: ${downloaded} downloaded/converted, ${skipped} skipped (already present), ${failed} failed.`);
