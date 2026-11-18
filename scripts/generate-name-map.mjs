import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { extractStrategicResourceNames } from './lib/strategic-resource-names.mjs';

const root = resolve(import.meta.dirname, '..');
if (!process.argv[2]) throw new Error('Pass a current game export containing indexGet; refusing a stale default capture');
const input = resolve(process.argv[2]);
const exported = JSON.parse(await readFile(input, 'utf8'));
const records = Array.isArray(exported) ? exported : (exported.timeline || exported.records);
if (!Array.isArray(records)) throw new Error('Expected exported API records or a game timeline');

let index = null;
for (const record of records) {
  if (record.endpoint !== 'https://api.hero-wars-alliance.com/api/rpc' ||
      record.requestBodyTruncated || record.responseBodyTruncated ||
      typeof record.requestBody !== 'string' || typeof record.responseBody !== 'string') continue;
  try {
    const calls = JSON.parse(record.requestBody).calls;
    const results = JSON.parse(record.responseBody).results;
    const call = calls?.find((item) => item.name === 'indexGet');
    const value = results?.find((item) => item.ident === call?.ident)?.result?.response;
    if (value?.locale?.['en.json.gz'] && (!index || record.timestamp > index.timestamp)) {
      index = { ...value, timestamp: record.timestamp };
    }
  } catch (_) {
    // Other RPC records may contain incomplete or non-JSON bodies.
  }
}
if (!index) throw new Error('No complete indexGet response with en.json.gz metadata in log');

const entry = index.locale['en.json.gz'];
const base = new URL(index.staticVersionUrl);
if (base.protocol !== 'https:' || base.hostname !== 'heroesmobile-a-cdn.nextersglobal.com' ||
    !/^v\d+\/[a-f0-9]+$/.test(entry.version) || entry.path !== 'locale') {
  throw new Error('Unexpected CDN asset metadata');
}
const assetUrl = new URL(`${entry.version}/${entry.path}/en.json.gz`, base).href;
let compressed;
if (process.argv[3]) {
  // Cached bytes must pass the same pinned indexGet size/MD5 checks.
  compressed = await readFile(resolve(process.argv[3]));
} else {
  const response = await fetch(assetUrl);
  if (!response.ok) throw new Error(`CDN returned HTTP ${response.status}`);
  compressed = Buffer.from(await response.arrayBuffer());
}
if (compressed.length !== entry.size ||
    createHash('md5').update(compressed).digest('hex') !== entry.md5) {
  throw new Error('CDN locale file does not match indexGet size/hash');
}
const locale = JSON.parse(gunzipSync(compressed).toString('utf8'));
const prefixes = {
  hero: 'LIB_HERO_NAME_',
  consumable: 'LIB_CONSUMABLE_NAME_',
  gear: 'LIB_GEAR_NAME_',
  scroll: 'LIB_SCROLL_NAME_',
  coin: 'LIB_COIN_NAME_',
  artifact: 'LIB_ARTIFACT_NAME_',
  skin: 'LIB_SKIN_NAME_',
  talisman: 'LIB_TALISMAN_NAME_',
  research: 'STRATEGIC_BASE_INTERFACE_RESEARCH_'
};
const names = {};
for (const [group, prefix] of Object.entries(prefixes)) {
  names[group] = {};
  for (const [key, value] of Object.entries(locale)) {
    if (!key.startsWith(prefix)) continue;
    const id = key.slice(prefix.length);
    if (/^\d+$/.test(id) && typeof value === 'string' && value.trim() &&
        !/^LIB_[A-Z0-9_]+$/.test(value.trim())) names[group][id] = value.trim();
  }
}
names.building = {};
for (const [key, value] of Object.entries(locale)) {
  if (key.startsWith('STRATEGIC_BASE_INTERFACE_BUILDING_ID_') && key.endsWith('_NAME')) {
    const id = key.slice('STRATEGIC_BASE_INTERFACE_BUILDING_ID_'.length, -'_NAME'.length);
    if (/^\d+$/.test(id) && typeof value === 'string' && value.trim()) {
      names.building[id] = value.trim();
    }
  }
}
Object.assign(names, extractStrategicResourceNames(locale));

// The upstream English locale currently contains these non-English entries or omissions.
const englishCorrections = {
  hero: { 5016: 'Golem' },
  consumable: { 2001: "Captain's Coin" },
  coin: { 40094: 'Ancient Coin' },
  building: {
    163: 'Garrison Wall',
    166: 'Zeppelin',
    167: 'Hero Chest',
    168: 'Events Area',
    169: 'Adventure',
    170: 'Food Warehouse',
    171: 'Stone Warehouse',
    172: 'Iron Warehouse',
    173: 'Wood Warehouse',
    174: 'Infirmary 2',
    175: 'Infirmary 3',
    177: 'Lighthouse',
    182: 'Headquarters 1',
    183: 'Headquarters 2',
    184: 'Headquarters 3'
  },
  research: {
    633: 'Additional Infirmary I',
    634: 'Additional Infirmary II',
    635: 'New Drill Ground I'
  }
};
for (const [group, corrections] of Object.entries(englishCorrections)) {
  Object.assign(names[group], corrections);
}
const payload = {
  assetUrl,
  assetMd5: entry.md5,
  assetSize: entry.size,
  clientVersion: typeof exported.gameVersion === 'string' ? exported.gameVersion : null,
  indexCapturedAt: index.timestamp,
  names
};


const tsHelpers = `
const itemGroups: Record<string, string> = {
  consumable: 'consumable',
  gear: 'gear',
  scroll: 'scroll',
  coin: 'coin',
  fragmentHero: 'hero',
  fragmentTitan: 'hero',
  fragmentGear: 'gear',
  fragmentScroll: 'scroll',
  fragmentArtifact: 'artifact',
  fragmentSkin: 'skin'
};

export function lookupName(group: string, id: string | number): string | null {
  const strId = String(id);
  const localNames = nameData.names?.[group];
  if (localNames && Object.hasOwn(localNames, strId)) {
    return localNames[strId] ?? null;
  }
  const extra = itemResources?.items;
  const rows = extra && Object.hasOwn(extra, group) ? extra[group] : null;
  return rows && Object.hasOwn(rows, strId) && typeof rows[strId]?.name === 'string' ? (rows[strId].name as string) : null;
}

export function getHeroName(id: string | number): string | null {
  return lookupName('hero', id);
}

export function getArtifactName(id: string | number): string | null {
  return lookupName('artifact', id);
}

export function getBuildingName(id: string | number): string | null {
  const found = lookupName('building', id);
  if (found) return found;
  return id ? \`Building #\${id}\` : '';
}

export function getResearchName(id: string | number): string | null {
  const found = lookupName('research', id);
  if (found) return found;
  return id ? \`Research #\${id}\` : '';
}

export function getItemName(category: string, id: string | number): string | null {
  const group = itemGroups[category] || category;
  const name = group ? lookupName(group, id) : null;
  return name ? (category.startsWith('fragment') ? \`\${name} fragment\` : name) : null;
}

export const nameMap = {
  hero: getHeroName,
  item: getItemName,
  building: getBuildingName,
  research: getResearchName,
  artifact: getArtifactName
};

if (typeof globalThis !== 'undefined') {
  (globalThis as any).hwaHelperNameData = nameData;
  (globalThis as any).hwaHelperNameMap = nameMap;
}
`;

const tsContent = `// Generated from ${assetUrl}
import type { NameDataGroup } from '../types/game/item.ts';
import { itemResources } from './itemData.ts';

export const nameData: NameDataGroup = ${JSON.stringify(payload, null, 2)};
${tsHelpers}`;

await writeFile(join(root, 'src/data/nameData.ts'), tsContent, 'utf8');
console.log(`Generated name map from ${assetUrl}: ${Object.entries(names).map(([k, v]) => `${k}=${Object.keys(v).length}`).join(', ')}`);
