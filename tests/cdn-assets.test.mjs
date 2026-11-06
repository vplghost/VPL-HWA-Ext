import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { crc32 } from 'node:zlib';
import { CDN_ORIGIN, versionBase, findIndex, verifyAsset, readZip, hash, download,
  iconCandidates, manifestCandidates, syncIcon, parseOptions, runSync } from '../scripts/sync-cdn-assets.mjs';

const base = versionBase('1.293.0');
const bytes = Buffer.from('raw texture');
const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(30)]);
const entry = { path: 'v0012/extends/icons/inventory/gear_6_new.img', size: bytes.length, md5: hash(bytes, 'md5') };
const manifest = { 'extends/icons/inventory/gear_6_new.img': entry };
const metadata = { icon: { imagePath: 'gear_6_new.png' }, assetTexture: 'gear_6' };
async function temporary(context) {
  const path = await mkdtemp(join(tmpdir(), 'hwa-asset-test-'));
  context.after(async () => {
    assert.equal(dirname(resolve(path)), resolve(tmpdir()));
    assert.ok(path.split(/[\\/]/).at(-1).startsWith('hwa-asset-test-'));
    await rm(path, { recursive: true, force: true });
  });
  return path;
}

test('asset index supports game timelines, selects the latest matching version and rejects truncated/stale sources', () => {
  const row = (version, timestamp, truncated = false) => ({ timestamp, responseBodyTruncated: truncated,
    requestBody: JSON.stringify({ calls: [{ name: 'indexGet', ident: 'index' }] }),
    responseBody: JSON.stringify({ results: [{ ident: 'index', result: { response: { staticVersionUrl: versionBase(version) } } }] }) });
  const input = { timeline: [row('1.292.0', '2026-11-05'), row('1.293.0', '2026-11-06'), row('1.293.0', '2026-11-07', true)] };
  assert.equal(findIndex(input, '1.293.0').timestamp, '2026-11-06');
  assert.throws(() => findIndex(input, '1.294.0'), /No complete indexGet/);
  assert.throws(() => versionBase('../1.293'), /full game version/);
  assert.deepEqual(parseOptions(['--version', '1.293.0', '--index', 'game.json', '--refresh']), { version: '1.293.0', indexPath: 'game.json' });
  assert.throws(() => parseOptions(['--index']), /Invalid option/);
});

test('unknown versions require their own index and invalid sync scopes fail before downloads', async () => {
  await assert.rejects(runSync({ version: '99.999.0' }), /Provide --index/);
  await assert.rejects(runSync({ concurrency: 0 }), /Invalid asset sync/);
  await assert.rejects(runSync({ only: '../outside' }), /Invalid asset sync/);
});

test('item texture IDs are taken from metadata and exact manifest revisions, never guessed from item ID', () => {
  const candidates = iconCandidates(base, 'items/gear', '1', metadata);
  assert.ok(candidates[0].endsWith('/inventory/gear_6_new.img'));
  assert.ok(!candidates.some((url) => /gear_1\./.test(url)));
  assert.equal(iconCandidates(base, 'items/gear', '1').length, 0);
  const found = manifestCandidates(base, candidates, manifest);
  assert.equal(found.length, 1); assert.equal(found[0].url, `${base}${entry.path}`);
  const hero = iconCandidates(base, 'heroes', '4', { icon: { imagePath: 'hero_0004_2.png' } });
  assert.ok(hero[0].endsWith('hero_0004_2.img'));
  assert.throws(() => iconCandidates(base, 'heroes', '4', { icon: { imagePath: '../bad.png' } }), /Unsafe/);
});

test('ambiguous manifest basenames and unsafe paths are not accepted as texture mappings', () => {
  const ambiguous = { 'extends/a/foo.img': { path: 'v0001/extends/a/foo.img' }, 'extends/b/foo.img': { path: 'v0001/extends/b/foo.img' } };
  assert.equal(manifestCandidates(base, [`${base}v0001/extends/icons/inventory/foo.img`], ambiguous).length, 0);
  assert.throws(() => manifestCandidates(base, [`${base}v0001/extends/a/foo.img`], {
    'extends/a/foo.img': { path: 'v0001/../evil.img' }
  }), /Unsafe/);
});

test('download retries transient errors, treats 404 as absent and refuses foreign origins', async () => {
  let count = 0;
  const result = await download(`${base}file.img`, { fetcher: async () => ++count === 1 ? new Response('', { status: 503 }) : new Response(bytes) });
  assert.equal(count, 2); assert.deepEqual(result, bytes);
  assert.equal(await download(`${base}file.img`, { fetcher: async () => new Response('', { status: 404 }) }), null);
  await assert.rejects(download('https://example.com/file.img'), /Unexpected CDN/);
  assert.throws(() => verifyAsset(bytes, { size: bytes.length, md5: 'bad' }), /mismatch/);
});

test('sync verifies source MD5 before conversion, writes atomically and preserves old images on failure', async (context) => {
  const outputDir = await temporary(context);
  const task = { base, category: 'items/gear', id: '1', metadata, manifest, outputDir,
    fetcher: async () => new Response(bytes), converter: () => ({ png, width: 1, height: 1, unityFormat: 47 }) };
  let result = await syncIcon(task);
  assert.equal(result.status, 'added'); assert.equal(result.sourceMd5, entry.md5);
  assert.equal(result.url, `${base}${entry.path}`);
  assert.equal((await syncIcon(task)).status, 'unchanged');
  const file = join(outputDir, 'items/gear/1.png');
  assert.deepEqual(await readFile(file), png);
  let converted = false;
  result = await syncIcon({ ...task, fetcher: async () => new Response('corrupt'), converter: () => { converted = true; } });
  assert.equal(result.status, 'retained'); assert.equal(converted, false);
  assert.deepEqual(await readFile(file), png);
  await assert.rejects(syncIcon({ ...task, id: '../escape' }), /Unexpected local asset path/);
  await mkdir(join(outputDir, 'heroes'));
  await writeFile(join(outputDir, 'heroes/4.webp'), bytes);
  result = await syncIcon({ ...task, category: 'heroes', id: '4', manifest: {} });
  assert.equal(result.status, 'retained'); assert.match(result.reason, /No unambiguous standalone/);
});

test('splitlib ZIP validates central-directory entries and CRC without writing archive paths', () => {
  const name = Buffer.from('hero.json'), data = Buffer.from('{}');
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt32LE(data.length, 18); local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt32LE(crc32(data), 16);
  central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(name.length, 28);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 10); end.writeUInt32LE(local.length + name.length + data.length, 16);
  const zip = Buffer.concat([local, name, data, central, name, end]);
  assert.equal(readZip(zip).get('hero.json').toString(), '{}');
  const corrupt = Buffer.from(zip); corrupt[local.length + name.length] = 0;
  assert.throws(() => readZip(corrupt), /Corrupt ZIP/);
  assert.throws(() => readZip(Buffer.from('bad')), /Missing ZIP/);
});

test('1.293 audit covers every catalog ID and all available bundled PNGs match verified hashes', async () => {
  const audit = JSON.parse(await readFile(new URL('../docs/assets-1.293.0-audit.json', import.meta.url)));
  const catalog = JSON.parse(await readFile(new URL('../docs/assets-1.293.0-catalog.json', import.meta.url)));
  assert.equal(audit.manifest.entries, 17360); assert.equal(audit.results.length, 961);
  assert.equal(audit.unmappedHeroes.length + audit.unmappedTitans.length, 0);
  const missing = audit.results.filter((row) => row.status === 'missing');
  assert.deepEqual(missing.map((row) => `${row.category}/${row.id}`), ['items/consumable/103', 'items/consumable/104']);
  const expected = new Map(Object.values(catalog.manifest).map((entry) => [`${audit.base}${entry.path}`, entry]));
  for (const row of audit.results.filter((row) => row.pngSha256)) {
    const png = await readFile(new URL(`../extension/${row.path}`, import.meta.url));
    assert.equal(hash(png), row.pngSha256, row.path);
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(row.sourceMd5, expected.get(row.url)?.md5);
    assert.ok(row.url.startsWith(`${CDN_ORIGIN}/v/webgl/1.293.0/`));
  }
  for (const [category, entries] of Object.entries(catalog.categories)) {
    assert.equal(audit.results.filter((row) => row.category === category).length, Object.keys(entries).length);
  }
});
