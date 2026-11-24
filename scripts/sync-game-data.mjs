#!/usr/bin/env node
/**
 * Unified Game Data Sync CLI (`scripts/sync-game-data.mjs`).
 *
 * Usage:
 *   npm run sync:game-data -- --from-bridge [--only=all|city|heroes|artifacts] [--dry-run] [--force]
 *   npm run sync:game-data -- --from-log <path/to/log.json> [--only=all|city|heroes|artifacts] [--dry-run] [--force]
 *   npm run sync:game-data -- --from-index <path/to/index.json> [--only=all|city|heroes|artifacts] [--dry-run] [--force]
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { resilientFetch } from './sync-cdn-assets.mjs';
import {
  HERO_ARTIFACT_CONFIG_KEYS,
  extractGameDataConfigSubset,
  compileHeroRemoteMetadata,
  mergeNamesAdditiveSafe,
  mergeHeroMetadataAdditiveSafe,
  detectGameDataDrift,
} from '../src/services/gameDataSync.ts';
import { heroMetadata } from '../src/data/heroMetadata.ts';
import { nameData } from '../src/data/nameData.ts';

const ROOT = resolve(import.meta.dirname, '..');
const MANIFEST_PATH = resolve(ROOT, 'src/data/gameDataManifest.json');
const CACHE_DIR = resolve(ROOT, 'temp/remote-configs');

function parseArgs(argv) {
  const opts = { fromLog: null, fromIndex: null, fromBridge: false, only: 'all', dryRun: false, force: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--from-log' && argv[i + 1]) opts.fromLog = argv[++i];
    else if (a === '--from-index' && argv[i + 1]) opts.fromIndex = argv[++i];
    else if (a === '--from-bridge') opts.fromBridge = true;
    else if (a.startsWith('--only=')) opts.only = a.slice('--only='.length);
    else if (a === '--only' && argv[i + 1]) opts.only = argv[++i];
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--force') opts.force = true;
  }
  return opts;
}

function extractIndexFromLog(logObj) {
  const rows = Array.isArray(logObj) ? logObj : (logObj.timeline || logObj.records || []);
  let latest = null;
  for (const row of rows) {
    if (!row?.responseBody || !row.responseBody.includes('buildingLevel')) continue;
    try {
      const req = JSON.parse(row.requestBody);
      const res = JSON.parse(row.responseBody);
      for (const call of req.calls || []) {
        if (call.name !== 'remoteConfigInit') continue;
        const r = res.results?.find((x) => x.ident === call.ident)?.result?.response;
        const cfgs = r?.index?.configs || r?.configs;
        if (cfgs?.buildingLevel) latest = cfgs;
      }
    } catch {}
  }
  return latest;
}

async function fetchConfigJson(key, entry) {
  await mkdir(CACHE_DIR, { recursive: true });
  const cacheFile = resolve(CACHE_DIR, `${key}-${entry.md5 || 'latest'}.json`);
  if (existsSync(cacheFile)) {
    const cachedBytes = await readFile(cacheFile);
    if (!entry.md5 || createHash('md5').update(cachedBytes).digest('hex') === entry.md5) {
      return JSON.parse(cachedBytes.toString('utf8'));
    }
  }
  const resp = await resilientFetch(entry.url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching ${key} (${entry.url})`);
  const text = await resp.text();
  const actualMd5 = createHash('md5').update(Buffer.from(text, 'utf8')).digest('hex');
  if (entry.md5 && actualMd5 !== entry.md5) {
    throw new Error(`MD5 mismatch for ${key}: expected ${entry.md5}, got ${actualMd5}`);
  }
  await writeFile(cacheFile, text, 'utf8');
  return JSON.parse(text);
}

async function fetchRawConfigsFromBridge() {
  const bridgeMod = await import('../debug-bridge/bridge-cli.js');
  const evalInGame = bridgeMod.evalInGame || bridgeMod.default?.evalInGame;
  if (typeof evalInGame !== 'function') {
    throw new Error('debug-bridge/bridge-cli.js does not export evalInGame.');
  }
  const kickRes = await evalInGame(
    `if (window.__hwaLastRemoteConfigInit) return { ready: true, data: window.__hwaLastRemoteConfigInit };
    const reqId = 'sync_game_data_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    window.__hwaSyncGameDataPending = { reqId, ready: false, data: null, error: null };
    function onMsg(ev) {
      if (ev.source !== window || ev.data?.source !== 'hwa-helper-api' || ev.data?.kind !== 'refresh-rpc-result') return;
      if (ev.data.requestId !== reqId) return;
      window.removeEventListener('message', onMsg);
      if (!ev.data.ok) {
        window.__hwaSyncGameDataPending = { reqId, ready: true, data: null, error: ev.data.error || ('RPC HTTP ' + ev.data.status) };
        return;
      }
      const first = Array.isArray(ev.data.results) ? ev.data.results[0] : null;
      const resp = first?.result?.response || ev.data.data?.results?.[0]?.result?.response || null;
      if (resp) window.__hwaLastRemoteConfigInit = resp;
      window.__hwaSyncGameDataPending = { reqId, ready: true, data: resp, error: resp ? null : 'Empty remoteConfigInit response' };
    }
    window.addEventListener('message', onMsg);
    window.postMessage({
      source: 'hwa-helper-control',
      kind: 'refresh-rpc',
      direct: true,
      requestId: reqId,
      calls: [{ name: 'remoteConfigInit', args: { lang: 'en' } }]
    }, location.origin);
    return { ready: false, reqId };`,
    8000
  );
  if (!kickRes?.ok) throw new Error(kickRes?.error || 'Live bridge eval failed.');
  let bridgeData = kickRes.result?.ready ? kickRes.result.data : null;
  if (!bridgeData) {
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 350));
      const pollRes = await evalInGame(`window.__hwaSyncGameDataPending || null`, 5000);
      if (pollRes?.ok && pollRes.result?.ready) {
        if (pollRes.result.error) throw new Error(pollRes.result.error);
        bridgeData = pollRes.result.data;
        break;
      }
    }
  }
  return bridgeData?.index?.configs || bridgeData?.configs || null;
}

async function main() {
  const startedAt = Date.now();
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.fromBridge && !opts.fromLog && !opts.fromIndex) {
    console.log('Usage: node scripts/sync-game-data.mjs (--from-bridge | --from-log <file> | --from-index <file>) [--only=all|city|heroes|artifacts] [--dry-run] [--force]');
    process.exit(0);
  }

  // 1. Delegate City Trees when --only is 'all' or 'city'
  if (opts.only === 'all' || opts.only === 'city') {
    const cityArgs = ['scripts/sync-city-trees.mjs'];
    if (opts.fromBridge) cityArgs.push('--from-bridge');
    if (opts.fromLog) cityArgs.push('--from-log', opts.fromLog);
    if (opts.fromIndex) cityArgs.push('--from-index', opts.fromIndex);
    if (opts.dryRun) cityArgs.push('--dry-run');
    if (opts.force) cityArgs.push('--force');
    const res = spawnSync(process.execPath, cityArgs, { cwd: ROOT, stdio: 'inherit' });
    if (res.status !== 0) process.exit(res.status || 1);
  }

  if (opts.only === 'city') {
    console.log(`\n✓ sync:game-data (city) finished in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
    return;
  }

  // 2. Hero & Artifact remote configs
  let rawConfigs = null;
  if (opts.fromIndex) {
    const idxObj = JSON.parse(await readFile(resolve(ROOT, opts.fromIndex), 'utf8'));
    rawConfigs = idxObj.configs || idxObj.index?.configs || idxObj;
  } else if (opts.fromLog) {
    const logObj = JSON.parse(await readFile(resolve(ROOT, opts.fromLog), 'utf8'));
    rawConfigs = extractIndexFromLog(logObj);
  } else if (opts.fromBridge) {
    rawConfigs = await fetchRawConfigsFromBridge();
  }
  if (!rawConfigs) {
    throw new Error('Could not find remoteConfigInit configs in the provided input.');
  }

  const subset = extractGameDataConfigSubset(rawConfigs);
  const manifest = existsSync(MANIFEST_PATH)
    ? JSON.parse(await readFile(MANIFEST_PATH, 'utf8'))
    : { updatedAt: '', configs: {} };

  const drift = detectGameDataDrift({ remoteConfigIndex: subset, manifest });
  console.log(`\n[sync:game-data] Drift check: ${drift.summary}`);

  const keysToFetch = [...HERO_ARTIFACT_CONFIG_KEYS, 'legacyLocalization'];
  const fetched = {};
  for (const key of keysToFetch) {
    if (subset[key]) {
      console.log(`Fetching ${key} (${subset[key].md5 || 'no-md5'})...`);
      fetched[key] = await fetchConfigJson(key, subset[key]);
    }
  }

  const compiled = compileHeroRemoteMetadata({
    rawHero: fetched.hero,
    rawFaction: fetched.heroFaction,
    rawFactionByHero: fetched.heroFactionByHero,
    rawRole: fetched.heroRole,
    rawClass: fetched.heroClass,
    rawLocalization: fetched.legacyLocalization,
  });

  const nameMerge = mergeNamesAdditiveSafe(nameData.names?.hero, compiled.heroNames);
  const metaMerge = mergeHeroMetadataAdditiveSafe(heroMetadata, compiled.heroMetadata);

  console.log('\n=== Game Data Sync Diff Report (Heroes & Artifacts) ===');
  console.log(`New hero metadata IDs (${metaMerge.addedIds.length}):`, metaMerge.addedIds.slice(0, 15));
  console.log(`Enriched hero metadata IDs (${metaMerge.enrichedIds.length}):`, metaMerge.enrichedIds.slice(0, 15));
  console.log(`New hero names (${nameMerge.addedIds.length}):`, nameMerge.addedIds.slice(0, 15));

  if (opts.dryRun) {
    console.log(`\n[dry-run] No files written (${((Date.now() - startedAt) / 1000).toFixed(1)}s).`);
    return;
  }

  // Persist manifest
  const nextManifest = {
    updatedAt: new Date().toISOString(),
    configs: { ...manifest.configs, ...subset },
  };
  await writeFile(MANIFEST_PATH, JSON.stringify(nextManifest, null, 2) + '\n', 'utf8');
  console.log(`✓ Updated src/data/gameDataManifest.json (${((Date.now() - startedAt) / 1000).toFixed(1)}s)`);
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('sync-game-data.mjs')) {
  main().catch((err) => {
    console.error('[sync-game-data] Error:', err?.message || err);
    process.exit(1);
  });
}
