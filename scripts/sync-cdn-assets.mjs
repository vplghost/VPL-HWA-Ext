import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { inflateRawSync, gunzipSync, crc32 } from 'node:zlib';
import vm from 'node:vm';
import { convertImgBuffer } from './convert-img-asset.mjs';

export const CDN_ORIGIN = 'https://heroesmobile-a-cdn.nextersglobal.com';
export const DEFAULT_VERSION = '1.293.0';
const root = resolve(import.meta.dirname, '..');
export const hash = (buffer, algorithm = 'sha256') => createHash(algorithm).update(buffer).digest('hex');
export function summarizeManifest(manifest) {
  const groups = {};
  for (const [key, entry] of Object.entries(manifest)) {
    const parts = key.split('/');
    const group = parts[0] === 'extends' ? parts.slice(0, 2).join('/') : parts[0];
    groups[group] ||= { entries: 0, bytes: 0 };
    groups[group].entries++; groups[group].bytes += entry.size;
  }
  return Object.fromEntries(Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)));
}
export function versionBase(version) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw Error('Expected a full game version, e.g. 1.293.0');
  return `${CDN_ORIGIN}/v/webgl/${version}/`;
}
export function findIndex(input, version) {
  const rows = Array.isArray(input) ? input : (input.timeline || input.records);
  const candidates = input.staticVersionUrl ? [input] : [];
  for (const row of rows || []) {
    if (row.requestBodyTruncated || row.responseBodyTruncated) continue;
    try {
      const calls = JSON.parse(row.requestBody).calls;
      const results = JSON.parse(row.responseBody).results;
      for (const call of calls || []) if (call.name === 'indexGet') {
        const response = results?.find((result) => result.ident === call.ident)?.result?.response;
        if (response?.staticVersionUrl) candidates.push({ ...response, timestamp: row.timestamp });
      }
    } catch {}
  }
  const found = candidates.filter((index) => index.staticVersionUrl === versionBase(version))
    .sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')))[0];
  if (!found) throw Error(`No complete indexGet for ${version}; refusing a stale catalog`);
  return found;
}
export function verifyAsset(buffer, metadata) {
  if (buffer.length !== metadata.size || hash(buffer, 'md5') !== metadata.md5) throw Error('Asset size/MD5 mismatch');
}
export function assetUrl(index, filename, metadata) {
  if (!/^v\d+\/[a-f0-9]+$/.test(metadata.version) || !/^[a-z]+$/.test(metadata.path) || !/^[\w.-]+$/.test(filename)) {
    throw Error('Unexpected asset index path');
  }
  return new URL(`${metadata.version}/${metadata.path}/${filename}`, index.staticVersionUrl).href;
}

// Central directory parsing supports ZIP data descriptors; never execute/extract paths from a ZIP.
export function readZip(buffer) {
  let end = buffer.length - 22;
  while (end >= Math.max(0, buffer.length - 65557) && buffer.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0 || buffer.readUInt32LE(end) !== 0x06054b50) throw Error('Missing ZIP directory');
  let offset = buffer.readUInt32LE(end + 16);
  const entries = new Map();
  for (let n = 0; n < buffer.readUInt16LE(end + 10); n++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw Error('Invalid ZIP directory');
    const method = buffer.readUInt16LE(offset + 10), checksum = buffer.readUInt32LE(offset + 16);
    const compressed = buffer.readUInt32LE(offset + 20), size = buffer.readUInt32LE(offset + 24);
    const nameSize = buffer.readUInt16LE(offset + 28), extra = buffer.readUInt16LE(offset + 30), comment = buffer.readUInt16LE(offset + 32);
    const local = buffer.readUInt32LE(offset + 42), name = buffer.toString('utf8', offset + 46, offset + 46 + nameSize);
    if (buffer.readUInt32LE(local) !== 0x04034b50 || ![0, 8].includes(method) || size > 32 * 1024 * 1024) throw Error('Unsupported ZIP entry');
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const packed = buffer.subarray(start, start + compressed);
    const data = method === 8 ? inflateRawSync(packed, { maxOutputLength: 32 * 1024 * 1024 }) : packed;
    if (data.length !== size || crc32(data) !== checksum) throw Error(`Corrupt ZIP entry: ${name}`);
    entries.set(name, data);
    offset += 46 + nameSize + extra + comment;
  }
  return entries;
}

export async function download(url, { fetcher = fetch, attempts = 3 } = {}) {
  if (new URL(url).origin !== CDN_ORIGIN) throw Error('Unexpected CDN origin');
  let error;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetcher(url, { signal: AbortSignal.timeout(20000) });
      if (response.status === 404) return null;
      if (!response.ok) throw Error(`HTTP ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (cause) { error = cause; }
  }
  throw error;
}
async function atomicWrite(path, bytes) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  try { await writeFile(temporary, bytes); await rename(temporary, path); }
  finally { await rm(temporary, { force: true }); }
}
async function optionalRead(path) {
  try { return await readFile(path); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function loadGlobal(filename, key) {
  const context = {}; vm.runInNewContext(await readFile(join(root, 'extension', filename), 'utf8'), context); return context[key];
}
export function iconCandidates(base, category, id, metadata = {}) {
  const icons = `${base}v0001/extends/icons/`;
  const image = metadata.icon?.imagePath?.replace(/\.png$/i, '');
  if (category === 'heroes') {
    const names = image ? [image] : [`hero_${String(id).padStart(4, '0')}_new`, `hero_${String(id).padStart(4, '0')}`];
    return names.map((name) => {
      if (!/^[\w.-]+$/.test(name)) throw Error('Unsafe hero texture name');
      return `${icons}hero/${name}.img`;
    });
  }
  if (category === 'titans') return [`${icons}hero/titan_160_${id}.img`];
  const kind = category.split('/')[1];
  const names = [...new Set([image, metadata.assetTexture && kind === 'gear' ? `${metadata.assetTexture}_new` : null,
    metadata.assetTexture].filter(Boolean))];
  // Item IDs and texture IDs differ (e.g. gear item 1 uses gear_6_new).
  // Never guess a filename from an item ID: it may return a different valid icon.
  if (kind === 'consumable') for (const name of [...names]) if (!names.includes(name.toLowerCase())) names.push(name.toLowerCase());
  return names.flatMap((name) => {
    if (!/^[\w.-]+$/.test(name)) throw Error(`Unsafe texture name: ${name}`);
    return [kind === 'gear' ? 'inventory' : kind, kind === 'gear' ? 'gear' : 'inventory'].map((folder) => `${icons}${folder}/${name}.img`);
  });
}

export function manifestCandidates(base, candidates, manifest) {
  const matches = new Map();
  for (const candidate of candidates) {
    const logical = candidate.slice(base.length).replace(/^v\d+\//, '');
    const exact = manifest[logical];
    const sameName = exact ? [[logical, exact]] : Object.entries(manifest).filter(([key]) =>
      key.startsWith('extends/') && key.endsWith(`/${logical.split('/').at(-1)}`));
    // An ambiguous basename is not evidence of which image belongs to an item.
    if (sameName.length !== 1) continue;
    const [key, entry] = sameName[0];
    if (!/^v\d+\/(?:[\w.-]+\/)*[\w.-]+\.img$/.test(entry.path) || entry.path.includes('..')) throw Error('Unsafe manifest path');
    matches.set(key, { url: new URL(entry.path, base).href, entry, key });
  }
  return [...matches.values()];
}

export async function syncIcon({ base, category, id, metadata, manifest, outputDir, fetcher, converter = convertImgBuffer }) {
  if (!['heroes', 'titans', 'items/consumable', 'items/gear', 'items/scroll'].includes(category) || !/^\d+$/.test(id)) {
    throw Error('Unexpected local asset path');
  }
  const target = join(outputDir, category, `${id}.png`), previous = await optionalRead(target);
  const legacy = !previous && category === 'heroes' ? await optionalRead(join(outputDir, category, `${id}.webp`)) : null;
  const attempts = [];
  const candidates = iconCandidates(base, category, id, metadata);
  const sources = manifest ? manifestCandidates(base, candidates, manifest) : candidates.map((url) => ({ url }));
  for (const { url, entry } of sources) {
    try {
      const bytes = await download(url, { fetcher });
      if (!bytes) { attempts.push({ url, status: 'not-found' }); continue; }
      if (entry) verifyAsset(bytes, entry);
      const { png, width, height, unityFormat } = converter(bytes);
      if (width <= 0 || height <= 0 || width > 4096 || height > 4096 || png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw Error('Invalid converted image');
      const status = previous ? (previous.equals(png) ? 'unchanged' : 'updated') : 'added';
      if (status !== 'unchanged') await atomicWrite(target, png);
      return { category, id, status, path: `assets/${category}/${id}.png`, url,
        ...(entry ? { sourceMd5: entry.md5, sourceBytes: entry.size } : {}),
        sourceSha256: hash(bytes), pngSha256: hash(png), width, height, unityFormat };
    } catch (error) { attempts.push({ url, status: 'error', error: error.message }); }
  }
  return { category, id, status: previous || legacy ? 'retained' : 'missing', attempts,
    ...(!attempts.length ? { reason: manifest ? 'No unambiguous standalone texture in current manifest.' : 'No verified texture mapping; provide current indexGet.',
      requestedTextures: candidates.map((url) => url.split('/').at(-1)) } : {}) };
}

export async function runSync({ version = DEFAULT_VERSION, indexPath, only, concurrency = 4 } = {}) {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 16 ||
      (only && !['heroes', 'titans', 'items', 'items/consumable', 'items/gear', 'items/scroll'].includes(only))) throw Error('Invalid asset sync scope or concurrency');
  const base = versionBase(version), outputDir = join(root, 'extension/assets');
  let metadata = {}, manifest, source = { version, base, catalog: 'bundled IDs only; no current indexGet supplied' };
  const snapshotPath = join(root, `docs/assets-${version}-catalog.json`);
  const snapshot = await optionalRead(snapshotPath);
  if (!indexPath && !snapshot) throw Error('Provide --index with a current game-start log before syncing a new version');
  if (!indexPath && snapshot) {
    const saved = JSON.parse(snapshot);
    if (saved.source.version !== version || saved.source.base !== base || !saved.manifest || !saved.source.manifest) throw Error('Catalog version or manifest mismatch');
    metadata = saved.categories; source = saved.source; manifest = saved.manifest;
  }
  if (indexPath) {
    const index = findIndex(JSON.parse(await readFile(indexPath, 'utf8')), version);
    const manifestUrl = new URL(index.currentVersionIndex);
    if (!manifestUrl.href.startsWith(base) || !/^[a-f0-9]{32}$/.test(manifestUrl.searchParams.get('hash'))) throw Error('Unexpected currentVersionIndex');
    const compressedManifest = await download(manifestUrl.href);
    if (!compressedManifest || hash(compressedManifest, 'md5') !== manifestUrl.searchParams.get('hash')) throw Error('Manifest MD5 mismatch');
    manifest = JSON.parse(gunzipSync(compressedManifest));
    source.manifest = { url: manifestUrl.href, size: compressedManifest.length, md5: hash(compressedManifest, 'md5'),
      entries: Object.keys(manifest).length, iconEntries: Object.keys(manifest).filter((key) => key.startsWith('extends/icons/')).length,
      inventory: summarizeManifest(manifest) };
    await atomicWrite(join(root, 'temp/live-full-index.json'), JSON.stringify(manifest));
    const entry = index.lib?.['splitlib.json.zip'];
    if (!entry) throw Error('Missing splitlib.json.zip in indexGet');
    const url = assetUrl(index, 'splitlib.json.zip', entry), zip = await download(url);
    if (!zip) throw Error('Current splitlib unavailable');
    verifyAsset(zip, entry);
    const files = readZip(zip);
    for (const file of entry.content || []) {
      const bytes = files.get(file.path);
      if (!bytes) throw Error(`Missing splitlib file: ${file.path}`);
      verifyAsset(bytes, file);
      if (/^[\w-][\w.-]*\.(json|pb)$/.test(file.path)) await atomicWrite(join(root, 'temp/splitlib', file.path), bytes);
    }
    for (const kind of ['gear', 'consumable', 'scroll']) metadata[`items/${kind}`] = JSON.parse(files.get(`inventoryItem_${kind}.json`));
    metadata.heroes = Object.fromEntries(Object.entries(JSON.parse(files.get('hero.json')))
      .filter(([id, hero]) => hero.type === 'hero' && Number(id) < 1000));
    metadata.titans = JSON.parse(files.get('titan.json'));
    source.catalog = { url, md5: entry.md5, size: entry.size };
    const categories = Object.fromEntries(Object.entries(metadata).map(([category, entries]) =>
      [category, Object.fromEntries(Object.entries(entries).map(([id, value]) => [id, {
        ...(value.icon?.imagePath ? { icon: { imagePath: value.icon.imagePath } } : {}),
        ...(value.assetTexture ? { assetTexture: value.assetTexture } : {})
      }]))]));
    // Keep a reusable verified index subset, not the game's unrelated bundles/audio.
    const names = new Set();
    for (const [category, entries] of Object.entries(categories)) for (const [id, value] of Object.entries(entries)) {
      for (const url of iconCandidates(base, category, id, value)) names.add(url.split('/').at(-1));
    }
    const selectedManifest = Object.fromEntries(Object.entries(manifest).filter(([key]) =>
      key.startsWith('extends/') && names.has(key.split('/').at(-1))));
    await atomicWrite(snapshotPath, JSON.stringify({ source, categories, manifest: selectedManifest }, null, 2) + '\n');
  }
  const heroes = await loadGlobal('hero-metadata.js', 'hwaHelperHeroMetadata');
  const titans = await loadGlobal('titan-metadata.js', 'hwaHelperTitanMetadata');
  const catalogs = { heroes: metadata.heroes || heroes, titans: metadata.titans || titans,
    ...Object.fromEntries(['consumable', 'gear', 'scroll'].map((kind) => [`items/${kind}`, metadata[`items/${kind}`] || {}])) };
  const tasks = [];
  for (const [category, catalog] of Object.entries(catalogs)) {
    if (only && !category.startsWith(only)) continue;
    const existing = await readdir(join(outputDir, category));
    const ids = [...new Set([...Object.keys(catalog), ...existing.filter((name) => /^\d+\.(png|webp)$/.test(name)).map((name) => name.split('.')[0])])].sort((a, b) => Number(a) - Number(b));
    for (const id of ids) tasks.push({ base, category, id, metadata: catalog[id], manifest, outputDir });
  }
  const results = []; let cursor = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (cursor < tasks.length) {
      const task = tasks[cursor++];
      results.push(await syncIcon(task));
      if (results.length % 25 === 0) console.log(`Assets checked: ${results.length}/${tasks.length}`);
    }
  }));
  results.sort((a, b) => a.category.localeCompare(b.category) || Number(a.id) - Number(b.id));
  // Preserve roles/classes/factions; update only verified local avatar references.
  for (const [category, catalog, filename, globalName] of [['heroes', heroes, 'hero-metadata.js', 'hwaHelperHeroMetadata'],
    ['titans', titans, 'titan-metadata.js', 'hwaHelperTitanMetadata']]) {
    if (only && !category.startsWith(only)) continue;
    for (const result of results.filter((item) => item.category === category)) {
      if (catalog[result.id] && await optionalRead(join(outputDir, category, `${result.id}.png`))) {
        catalog[result.id] = { ...catalog[result.id], hasAvatar: true, avatarFile: `assets/${category}/${result.id}.png` };
        if (category === 'heroes' && ['added', 'updated', 'unchanged'].includes(result.status)) {
          await rm(join(outputDir, category, `${result.id}.webp`), { force: true });
        }
      } else if (catalog[result.id] && category === 'heroes' && await optionalRead(join(outputDir, category, `${result.id}.webp`))) {
        catalog[result.id] = { ...catalog[result.id], hasAvatar: true, avatarFile: `assets/heroes/${result.id}.webp` };
      }
    }
    const current = await readFile(join(root, 'extension', filename), 'utf8');
    const start = current.indexOf(`globalThis.${globalName} = `), end = current.indexOf('\n};', start);
    if (start < 0 || end < 0) throw Error(`Unknown metadata format: ${filename}`);
    await atomicWrite(join(root, 'extension', filename), current.slice(0, start) + `globalThis.${globalName} = ${JSON.stringify(catalog, null, 2)};` + current.slice(end + 3));
  }
  const counts = results.reduce((counts, item) => { counts[item.status] = (counts[item.status] || 0) + 1; return counts; }, {});
  const report = { ...source, scope: only || 'all bundled categories and current catalog IDs', counts,
    unmappedHeroes: Object.keys(catalogs.heroes).filter((id) => !heroes[id]),
    unmappedTitans: Object.keys(catalogs.titans).filter((id) => !titans[id]), results };
  const suffix = only ? `-${only.replace('/', '-')}` : '';
  await atomicWrite(join(root, `docs/assets-${version}${suffix}-audit.json`), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(counts));
  return report;
}
export function parseOptions(args) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === '--refresh') continue; // Legacy items:assets compatibility; sync always verifies current images.
    if (!['--version', '--index', '--only'].includes(flag) || !args[i + 1] || args[i + 1].startsWith('--')) throw Error(`Invalid option: ${flag}`);
    options[{ '--version': 'version', '--index': 'indexPath', '--only': 'only' }[flag]] = args[++i];
  }
  return options;
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  await runSync(parseOptions(process.argv.slice(2)));
}
