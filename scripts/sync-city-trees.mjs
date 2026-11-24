#!/usr/bin/env node
/**
 * Reusable CLI Sync Pipeline for Building & Research Trees (`scripts/sync-city-trees.mjs`).
 *
 * Usage:
 *   node scripts/sync-city-trees.mjs --from-log <path/to/tracking-log.json> [--dry-run] [--force]
 *   node scripts/sync-city-trees.mjs --from-index <path/to/remote-config-index.json> [--dry-run] [--force]
 *   node scripts/sync-city-trees.mjs --from-bridge [--dry-run] [--force]
 *
 * Works even when gameVersion does NOT bump (silent remote-config MD5 hotfixes).
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { resilientFetch } from './sync-cdn-assets.mjs';
import {
  CITY_TREE_CONFIG_KEYS,
  extractRemoteConfigSubset,
  compileBuildingLevels,
  compileResearchData,
  extractStrategicNames,
  detectCityTreeDrift,
  diffCityTreeData,
} from '../src/services/cityTreeSync.ts';
import { buildingLevelsData } from '../src/data/buildingData.ts';
import { researchData } from '../src/data/researchData.ts';

const ROOT = resolve(import.meta.dirname, '..');
const MANIFEST_PATH = resolve(ROOT, 'src/data/cityTreeManifest.json');
const CACHE_DIR = resolve(ROOT, 'temp/remote-configs');

function parseArgs(argv) {
  const opts = { fromLog: null, fromIndex: null, fromBridge: false, dryRun: false, force: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--from-log' && argv[i + 1]) opts.fromLog = argv[++i];
    else if (a === '--from-index' && argv[i + 1]) opts.fromIndex = argv[++i];
    else if (a === '--from-bridge') opts.fromBridge = true;
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

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const manifest = existsSync(MANIFEST_PATH)
    ? JSON.parse(await readFile(MANIFEST_PATH, 'utf8'))
    : { updatedAt: '', configs: {} };

  let rawConfigs = null;
  if (opts.fromIndex) {
    const idxObj = JSON.parse(await readFile(resolve(ROOT, opts.fromIndex), 'utf8'));
    rawConfigs = idxObj.configs || idxObj.index?.configs || idxObj;
  } else if (opts.fromLog) {
    const logObj = JSON.parse(await readFile(resolve(ROOT, opts.fromLog), 'utf8'));
    rawConfigs = extractIndexFromLog(logObj);
  } else if (opts.fromBridge) {
    const bridgeMod = await import('../debug-bridge/bridge-cli.js');
    const evalInGame = bridgeMod.evalInGame || bridgeMod.default?.evalInGame;
    if (typeof evalInGame !== 'function') {
      throw new Error('debug-bridge/bridge-cli.js does not export evalInGame.');
    }
    // Step 1: Check cached or kick off live remoteConfigInit RPC (stored on window to avoid Chrome sendMessage port-close on async eval)
    const kickRes = await evalInGame(
      `if (window.__hwaLastRemoteConfigInit) return { ready: true, data: window.__hwaLastRemoteConfigInit };
      const reqId = 'sync_city_trees_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      window.__hwaSyncCityTreesPending = { reqId, ready: false, data: null, error: null };
      function onMsg(ev) {
        if (ev.source !== window || ev.data?.source !== 'hwa-helper-api' || ev.data?.kind !== 'refresh-rpc-result') return;
        if (ev.data.requestId !== reqId) return;
        window.removeEventListener('message', onMsg);
        if (!ev.data.ok) {
          window.__hwaSyncCityTreesPending = { reqId, ready: true, data: null, error: ev.data.error || ('RPC HTTP ' + ev.data.status) };
          return;
        }
        const first = Array.isArray(ev.data.results) ? ev.data.results[0] : null;
        const resp = first?.result?.response || ev.data.data?.results?.[0]?.result?.response || null;
        if (resp) window.__hwaLastRemoteConfigInit = resp;
        window.__hwaSyncCityTreesPending = { reqId, ready: true, data: resp, error: resp ? null : 'Empty remoteConfigInit response' };
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
    if (!kickRes?.ok) {
      throw new Error(kickRes?.error || 'Live bridge eval failed.');
    }
    let bridgeData = kickRes.result?.ready ? kickRes.result.data : null;
    if (!bridgeData) {
      const deadline = Date.now() + 12000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 350));
        const pollRes = await evalInGame(`window.__hwaSyncCityTreesPending || null`, 5000);
        if (pollRes?.ok && pollRes.result?.ready) {
          if (pollRes.result.error) throw new Error(pollRes.result.error);
          bridgeData = pollRes.result.data;
          break;
        }
      }
    }
    rawConfigs = bridgeData?.index?.configs || bridgeData?.configs || null;
    if (!rawConfigs) {
      throw new Error('No remoteConfigInit configs returned from live tab. Use --from-index (exported from SettingsTab) or --from-log.');
    }
  } else {
    console.log('Usage: node scripts/sync-city-trees.mjs (--from-log <file> | --from-index <file> | --from-bridge) [--dry-run] [--force]');
    process.exit(0);
  }

  if (!rawConfigs) {
    throw new Error('Could not find remoteConfigInit configs in the provided input.');
  }

  const subset = extractRemoteConfigSubset(rawConfigs);
  const drift = detectCityTreeDrift({ remoteConfigIndex: subset, manifest });
  console.log(`Drift check: ${drift.summary}`);
  if (!drift.hasDrift && !opts.force) {
    console.log('All tracked Building & Research remote configs match cityTreeManifest.json. Use --force to rebuild anyway.');
    return;
  }

  const fetched = {};
  for (const key of CITY_TREE_CONFIG_KEYS) {
    if (subset[key]) {
      console.log(`Fetching ${key} (${subset[key].md5 || 'no-md5'})...`);
      fetched[key] = await fetchConfigJson(key, subset[key]);
    }
  }

  const { buildingLevels, legacyDurations } = fetched.buildingLevel
    ? compileBuildingLevels(fetched.buildingLevel)
    : { buildingLevels: buildingLevelsData, legacyDurations: {} };

  const compiledResearch =
    fetched.personalResearchLevel
      ? compileResearchData(fetched.personalResearch, fetched.personalResearchLevel, fetched.personalResearchType)
      : researchData;

  const mergedLocalization =
    fetched.legacyLocalization || fetched.strategicLocalization
      ? {
          ...(fetched.strategicLocalization && typeof fetched.strategicLocalization === 'object' ? fetched.strategicLocalization : {}),
          ...(fetched.legacyLocalization && typeof fetched.legacyLocalization === 'object' ? fetched.legacyLocalization : {}),
        }
      : null;

  const { buildingNames, researchNames } = mergedLocalization
    ? extractStrategicNames(fetched.building, fetched.personalResearch, mergedLocalization)
    : { buildingNames: {}, researchNames: {} };

  const diff = diffCityTreeData({
    prevBuildings: buildingLevelsData,
    nextBuildings: buildingLevels,
    prevResearch: researchData,
    nextResearch: compiledResearch,
    nextBuildingNames: buildingNames,
    nextResearchNames: researchNames,
  });

  console.log('\n=== City Tree Sync Diff Report ===');
  console.log(`Added buildings (${diff.addedBuildings.length}):`, diff.addedBuildings.slice(0, 15));
  console.log(`Modified buildings (${diff.modifiedBuildings.length}):`, diff.modifiedBuildings.slice(0, 15));
  console.log(`Added researches (${diff.addedResearches.length}):`, diff.addedResearches.slice(0, 15));
  console.log(`Modified researches (${diff.modifiedResearches.length}):`, diff.modifiedResearches.slice(0, 15));

  if (opts.dryRun) {
    console.log('\n[dry-run] No files written.');
    return;
  }

  // Update src/data/buildingData.ts in-place (preserving helpers & types)
  if (fetched.buildingLevel) {
    const bPath = resolve(ROOT, 'src/data/buildingData.ts');
    let bSrc = await readFile(bPath, 'utf8');
    bSrc = bSrc.replace(
      /export const buildingLevelsData: BuildingLevelsDict = \{[\s\S]*?\};/,
      `export const buildingLevelsData: BuildingLevelsDict = ${JSON.stringify(buildingLevels)};`
    );
    if (Object.keys(legacyDurations).length > 0) {
      bSrc = bSrc.replace(
        /export const legacyBuildingDurations: Record<string \| number, Record<string \| number, number>> = \{[\s\S]*?\};/,
        `export const legacyBuildingDurations: Record<string | number, Record<string | number, number>> = ${JSON.stringify(legacyDurations)};`
      );
    }
    await writeFile(bPath, bSrc, 'utf8');
    console.log(`✓ Updated src/data/buildingData.ts (${Object.keys(buildingLevels).length} buildings)`);
  }

  // Update src/data/researchData.ts in-place (preserving helpers & types)
  if (fetched.personalResearchLevel) {
    const rPath = resolve(ROOT, 'src/data/researchData.ts');
    let rSrc = await readFile(rPath, 'utf8');
    rSrc = rSrc.replace(
      /export const researchData: ResearchDataDict = \{[\s\S]*?\};/,
      `export const researchData: ResearchDataDict = ${JSON.stringify(compiledResearch)};`
    );
    await writeFile(rPath, rSrc, 'utf8');
    console.log(`✓ Updated src/data/researchData.ts (${Object.keys(compiledResearch).length} researches)`);
  }

  // Merge new names into src/data/nameData.ts without dropping custom overrides
  if (Object.keys(buildingNames).length > 0 || Object.keys(researchNames).length > 0) {
    const nPath = resolve(ROOT, 'src/data/nameData.ts');
    let nSrc = await readFile(nPath, 'utf8');
    if (Object.keys(buildingNames).length > 0) {
      nSrc = nSrc.replace(/"building":\s*\{([\s\S]*?)\}/, (match) => {
        try {
          const existing = JSON.parse(`{${match.slice(match.indexOf('{') + 1, match.lastIndexOf('}'))}}`);
          const merged = { ...buildingNames, ...existing };
          return `"building": ${JSON.stringify(merged, null, 2).replace(/\n/g, '\n    ')}`;
        } catch {
          return match;
        }
      });
    }
    if (Object.keys(researchNames).length > 0) {
      nSrc = nSrc.replace(/"research":\s*\{([\s\S]*?)\}/, (match) => {
        try {
          const existing = JSON.parse(`{${match.slice(match.indexOf('{') + 1, match.lastIndexOf('}'))}}`);
          const merged = { ...researchNames, ...existing };
          return `"research": ${JSON.stringify(merged, null, 2).replace(/\n/g, '\n    ')}`;
        } catch {
          return match;
        }
      });
    }
    await writeFile(nPath, nSrc, 'utf8');
    console.log(`✓ Updated src/data/nameData.ts (+${Object.keys(buildingNames).length} building names, +${Object.keys(researchNames).length} research names)`);
  }

  // Persist updated manifest
  const nextManifest = {
    updatedAt: new Date().toISOString(),
    configs: { ...manifest.configs, ...subset },
  };
  await writeFile(MANIFEST_PATH, JSON.stringify(nextManifest, null, 2) + '\n', 'utf8');
  console.log('✓ Updated src/data/cityTreeManifest.json');
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('sync-city-trees.mjs')) {
  main().catch((err) => {
    console.error('[sync-city-trees] Error:', err?.message || err);
    process.exit(1);
  });
}
