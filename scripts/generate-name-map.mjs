import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { gunzipSync } from 'node:zlib';

const root = resolve(import.meta.dirname, '..');
const input = resolve(process.argv[2] ?? join(root, 'temp/tracking-data/hwa-api-2026-11-01_latest.json'));
const records = JSON.parse(await readFile(input, 'utf8'));
if (!Array.isArray(records)) throw new Error('Expected an exported API log array');

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
const response = await fetch(assetUrl);
if (!response.ok) throw new Error(`CDN returned HTTP ${response.status}`);
const compressed = Buffer.from(await response.arrayBuffer());
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
  skin: 'LIB_SKIN_NAME_'
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
// The upstream English locale currently contains these non-English entries.
const englishCorrections = {
  hero: { 5016: 'Golem' },
  consumable: { 2001: "Captain's Coin" },
  coin: { 40094: 'Ancient Coin' }
};
for (const [group, corrections] of Object.entries(englishCorrections)) {
  Object.assign(names[group], corrections);
}
const output = `// Generated from ${assetUrl}\n` +
  `globalThis.hwaHelperNameData = ${JSON.stringify({ assetUrl, names })};\n`;
await writeFile(join(root, 'extension/data-names.js'), output);
console.log(`Generated name map from ${assetUrl}: ${Object.entries(names).map(([k, v]) => `${k}=${Object.keys(v).length}`).join(', ')}`);
