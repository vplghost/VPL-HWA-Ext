import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { gunzipSync } from 'node:zlib';
import vm from 'node:vm';
import { findIndex, readZip, verifyAsset, hash, download, assetUrl, CDN_ORIGIN } from './sync-cdn-assets.mjs';
import { convertImgBuffer } from './convert-img-asset.mjs';
import { skinMetadata, patronName, refillableMetadata, selectItemTexture } from './lib/observed-item-metadata.mjs';

const root = resolve(import.meta.dirname, '..');
const read = path => readFile(resolve(root, path));
const json = async path => JSON.parse(await read(path));
const resourcesPath = process.argv[2], inventoryPath = process.argv[3], capturePath = process.argv[4];
if (!capturePath) throw Error('Pass resource export, inventory export and matching current game capture');
const [resources, inventory, capture, catalog] = await Promise.all([
  json(resourcesPath), json(inventoryPath), json(capturePath), json('docs/assets-1.293.0-catalog.json'),
]);
if (!Array.isArray(resources) || !Array.isArray(inventory)) throw Error('Expected resource/inventory export arrays');
const index = findIndex(capture, '1.293.0'), base = index.staticVersionUrl;
const library = await read('temp/resources-splitlib.json.zip');
verifyAsset(library, index.lib['splitlib.json.zip']);
const files = readZip(library);
function tableBytes(name) {
  const bytes = files.get(name), entry = index.lib['splitlib.json.zip'].content.find(entry => entry.path === name);
  if (!bytes || !entry) throw Error('Missing library table: ' + name);
  verifyAsset(bytes, entry); return bytes;
}
const table = name => JSON.parse(tableBytes(name + '.json'));
const compressed = await read('temp/items-current-en.json.gz');
verifyAsset(compressed, index.locale['en.json.gz']);
const locale = JSON.parse(gunzipSync(compressed));
const manifestBytes = await read('temp/live-full-index.json.gz');
verifyAsset(manifestBytes, catalog.source.manifest);
if (catalog.source.base !== base) throw Error('Manifest/static version mismatch');
const manifest = JSON.parse(gunzipSync(manifestBytes));
const previousAudit = await json('docs/observed-item-assets-1.293.1010-audit.json').catch(() => null);
const sameSource = previousAudit?.source?.library?.md5 === hash(library, 'md5') &&
  previousAudit?.source?.manifest?.md5 === hash(manifestBytes, 'md5');
const previousImages = new Map((sameSource ? previousAudit.results : []).map(row => [`${row.category}:${row.id}`, row]));
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
const names = {};
for (const name of ['data-names', 'name-map']) vm.runInNewContext(await readFile(resolve(root, 'extension', name + '.js'), 'utf8'), names);
const skin = skinMetadata(tableBytes('skin.pb'), locale, names.hwaHelperNameData.names.hero);
const pseudo = table('inventoryItem_pseudo'), refillable = table('refillable');
const tables = Object.fromEntries(['border', 'coin', 'consumable', 'gear', 'patron', 'scroll'].map(kind => [kind, table('inventoryItem_' + kind)]));
const aliases = { fragmentHero: 'heroes', fragmentTitan: 'titans', fragmentGear: 'gear', fragmentScroll: 'scroll',
  fragmentArtifact: 'artifact', fragmentSkin: 'skin' };
const items = {}, icons = {}, observed = new Map();
const ensure = (category, id) => (items[category] ||= {})[id] ||= {};
for (const row of Object.values(refillable)) {
  const { icon, ...metadata } = refillableMetadata(row, pseudo, locale);
  ensure('refillable', row.id); Object.assign(items.refillable[row.id], metadata);
}
for (const row of inventory) observed.set(`${row.group}:${row.id}`, { category: row.group, id: String(row.id), providedName: row.name });
for (const row of resources) {
  const parts = row.key?.split(':');
  if (parts?.[0] === 'resource') observed.set(parts.slice(1).join(':'), { category: parts[1], id: parts[2] || '0', providedName: row.name });
}
for (const { category, id } of observed.values()) {
  if (typeof category !== 'string' || !/^[\w-]+$/.test(category) || !/^\d+$/.test(id) ||
      Object.hasOwn(Object.prototype, category) || category === 'prototype') throw Error('Unsafe observed item identity');
}
// Index only images actually bundled; do not make the runtime guess a missing PNG.
for (const category of [...new Set([...Object.keys(tables), 'artifact', 'skin', 'heroes', 'titans',
    ...[...observed.values()].map(row => aliases[row.category] || row.category)])]) {
  const folder = category === 'heroes' || category === 'titans' ? `assets/${category}` : `assets/items/${category}`;
  const entries = await readdir(resolve(root, 'extension', folder)).catch(() => []);
  for (const file of entries) if (/^\d+\.png$/.test(file)) (icons[category] ||= {})[file.slice(0, -4)] = `${folder}/${file}`;
}
const results = [], work = [];
for (const { category, id, providedName } of observed.values()) {
  const kind = aliases[category] || category;
  const row = ensure(kind, id);
  let metadata = tables[kind]?.[id];
  if (kind === 'skin') { metadata = skin[id]; if (metadata?.name) row.name = metadata.name; }
  if (kind === 'patron') { const name = patronName(metadata, locale, names.hwaHelperNameData.names.hero); if (name) row.name = name; }
  if (kind === 'border' && metadata && locale.LIB_BORDER_NAME) row.name = locale.LIB_BORDER_NAME;
  if (kind === 'refillable' && refillable[id]) metadata = refillableMetadata(refillable[id], pseudo, locale).icon;
  if (['gold', 'starMoney', 'energy'].includes(kind)) metadata = Object.values(pseudo).find(p =>
    p.constName === { gold: 'COIN', starMoney: 'STARMONEY', energy: 'STAMINA' }[kind]);
  const inactive = row.internal || row.expiresAt <= Date.now();
  const verifiedName = names.hwaHelperNameMap.item(category, id) || (row.name ? row.name + (category.startsWith('fragment') ? ' fragment' : '') : null);
  const existingLabel = typeof providedName === 'string' && !providedName.includes('#') && providedName !== '—' ? providedName : null;
  const result = { category, id, name: verifiedName || existingLabel,
    nameSource: verifiedName ? 'verified-metadata' : existingLabel ? 'provided-export-label' : 'unresolved',
    ...(inactive ? { visibility: row.internal ? 'internal-counter' : 'expired', expiresAt: row.expiresAt } : {}) };
  const existing = icons[kind]?.[id];
  const selected = selectItemTexture(manifest, kind, id, metadata, names.hwaHelperNameData.names[kind]?.[id]);
  if (existing) {
    result.icon = existing; result.imageStatus = 'existing-bundled';
    const prior = previousImages.get(`${category}:${id}`);
    if (prior?.imageStatus === 'extracted' && prior.icon === existing &&
        hash(await readFile(resolve(root, 'extension', existing))) === prior.pngSha256) {
      for (const key of ['imageStatus', 'url', 'mapping', 'sourceMd5', 'sourceBytes', 'pngSha256', 'width', 'height']) result[key] = prior[key];
    }
  }
  else if (inactive) result.imageStatus = 'skipped-inactive';
  else if (selected) work.push({ kind, id, selected, result });
  else { result.imageStatus = 'unresolved'; result.reason = 'No unambiguous metadata/typed manifest mapping in verified snapshot'; }
  results.push(result);
}
let cursor = 0;
await Promise.all(Array.from({ length: 4 }, async () => {
  while (cursor < work.length) {
    const { kind, id, selected, result } = work[cursor++];
    const entry = manifest[selected.key];
    try {
      const url = new URL(entry.path, base).href;
      if (!url.startsWith(CDN_ORIGIN + '/') || entry.path.includes('..')) throw Error('Unsafe image path');
      const bytes = await download(url); if (!bytes) throw Error('CDN image not found');
      verifyAsset(bytes, entry);
      const { png, width, height } = convertImgBuffer(bytes);
      if (width < 1 || height < 1 || width > 4096 || height > 4096) throw Error('Invalid icon dimensions');
      const path = `assets/items/${kind}/${id}.png`, target = resolve(root, 'extension', path);
      await mkdir(dirname(target), { recursive: true }); await writeFile(target, png);
      (icons[kind] ||= {})[id] = path;
      Object.assign(result, { imageStatus: 'extracted', icon: path, url, mapping: selected.mapping,
        sourceMd5: entry.md5, sourceBytes: entry.size, pngSha256: hash(png), width, height });
    } catch (error) { result.imageStatus = 'unresolved'; result.reason = error.message; }
    if (cursor % 10 === 0) console.log(`Image extraction: ${Math.min(cursor, work.length)}/${work.length}`);
  }
}));
const source = { clientVersion: capture.gameVersion, staticVersion: '1.293.0',
  locale: { url: names.hwaHelperNameData.assetUrl, md5: hash(compressed, 'md5'), size: compressed.length },
  library: { url: assetUrl(index, 'splitlib.json.zip', index.lib['splitlib.json.zip']), md5: hash(library, 'md5'), size: library.length },
  manifest: catalog.source.manifest,
  limitation: 'Latest manifest URL no longer matches captured dffc6e1e901230a6e303f6dcf03c8254. Textures use the cached MD5-verified 1.293.0 manifest snapshot; unsupported/newer mappings remain unresolved.' };
await writeFile(resolve(root, 'extension/item-resources.js'), '// Generated by scripts/sync-observed-item-assets.mjs; do not edit.\n' +
  'globalThis.hwaHelperItemResources = ' + JSON.stringify(canonical({ source, items, icons }), null, 2) + ';\n');
const report = { source, inputs: { resources: { rows: resources.length, sha256: hash(await read(resourcesPath)) },
  inventory: { rows: inventory.length, sha256: hash(await read(inventoryPath)) } },
  counts: results.reduce((counts, row) => { counts[row.imageStatus] = (counts[row.imageStatus] || 0) + 1; return counts; }, {}), results };
await writeFile(resolve(root, 'docs/observed-item-assets-1.293.1010-audit.json'), JSON.stringify(canonical(report), null, 2) + '\n');
console.log(JSON.stringify(report.counts));
