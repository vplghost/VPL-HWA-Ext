import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { createHash } from 'node:crypto';
import { parseRemoteDurationSeconds } from './lib/remote-duration.mjs';

const root = resolve(import.meta.dirname, '..');
const bytes = await readFile(resolve(root, 'temp/buildingLevel.json'));
const index = JSON.parse(await readFile(resolve(root, 'temp/remote-config-captured.json'), 'utf8')).index.configs;
const sourceUrl = index.buildingLevel.url;
if (!sourceUrl.endsWith('/' + createHash('md5').update(bytes).digest('hex') + '.json')) {
  throw Error('buildingLevel source MD5 does not match the captured indexGet');
}
const blData = JSON.parse(bytes);

// Compact representation:
// buildingLevels[buildingId] = {
//   [level]: { d: durationSec, r: [[reqId, reqLvl], ...], c: { [matId]: amount } }
// }
const buildingLevels = {};
const legacyDurations = {};

for (const item of Object.values(blData)) {
  const bId = item.buildingId;
  const lvl = item.level;
  if (!bId || !lvl) continue;

  const reqs = [];
  for (const r of item.requirements || []) {
    if (r.name === 'buildingLevel' && r.args?.entityId && r.args?.operands?.[0]) {
      // Omit self requirement (e.g. buildingId >= level - 1) to save space
      if (r.args.entityId !== bId) {
        reqs.push([r.args.entityId, r.args.operands[0]]);
      }
    }
  }

  const cost = {};
  for (const c of item.cost || []) {
    if (c.type === 'material' && Number(c.amount) > 0) {
      cost[c.id] = c.amount;
    }
  }

  const durationSec = parseRemoteDurationSeconds(item.duration);
  // Persist only exact historical bad values for safe migration of queued estimates.
  if (typeof item.duration === 'string' && item.duration.includes('.')) {
    const [hours, minutes, seconds] = item.duration.split(':').map(Number);
    const legacy = hours * 3600 + minutes * 60 + seconds;
    if (legacy !== durationSec) {
      (legacyDurations[bId] ||= {})[lvl] = legacy;
    }
  }

  if (!buildingLevels[bId]) buildingLevels[bId] = {};
  buildingLevels[bId][lvl] = {
    d: durationSec,
    ...(reqs.length > 0 ? { r: reqs } : {}),
    ...(Object.keys(cost).length > 0 ? { c: cost } : {})
  };
}

const header = '// Generated from WebGL buildingLevel remote config.\n// ' + sourceUrl + '\n';
const helperMethods = `
(() => {
  const data = ${JSON.stringify(buildingLevels)};
  const legacyDurations = ${JSON.stringify(legacyDurations)};

  function getBuildingLevelData(buildingId, level) {
    return data[buildingId]?.[level] || null;
  }

  function getMissingRequirements(buildingId, nextLevel, buildingLevelsMap) {
    const meta = getBuildingLevelData(buildingId, nextLevel);
    if (!meta || !meta.r) return [];
    const missing = [];
    for (const [reqBId, minLvl] of meta.r) {
      const curLvl = buildingLevelsMap.get(reqBId) || 0;
      if (curLvl < minLvl) {
        missing.push({ buildingId: reqBId, requiredLevel: minLvl, currentLevel: curLvl });
      }
    }
    return missing;
  }

  function getMissingCosts(buildingId, nextLevel, resourcesMap) {
    const meta = getBuildingLevelData(buildingId, nextLevel);
    if (!meta || !meta.c) return [];
    const missing = [];
    for (const [matId, amount] of Object.entries(meta.c)) {
      const curAmount = resourcesMap.get(Number(matId)) || 0;
      if (curAmount < amount) {
        missing.push({ materialId: Number(matId), required: amount, current: curAmount });
      }
    }
    return missing;
  }

  function calculateEffectiveDurationMs(buildingId, nextLevel, speedBonusMultiplier = 0.58) {
    const meta = getBuildingLevelData(buildingId, nextLevel);
    if (!meta || !meta.d) return 0;
    // Base duration in seconds -> ms with speed reduction
    // Real logs show ~42% reduction (0.58 multiplier)
    const mult = Number.isFinite(speedBonusMultiplier) && speedBonusMultiplier > 0 && speedBonusMultiplier <= 1
      ? speedBonusMultiplier
      : 0.58;
    return Math.round(meta.d * 1000 * mult);
  }

  function normalizeQueuedDuration(item) {
    const legacy = legacyDurations[item?.buildingId]?.[item?.nextLevel];
    if (legacy == null || Number(item.durationMs) !== Math.round(legacy * 1000 * 0.58)) return item;
    return { ...item, durationMs: calculateEffectiveDurationMs(item.buildingId, item.nextLevel) };
  }

  globalThis.hwaHelperBuildingData = {
    data,
    getBuildingLevelData,
    getMissingRequirements,
    getMissingCosts,
    calculateEffectiveDurationMs,
    normalizeQueuedDuration
  };
})();
`;

await writeFile(resolve(root, 'extension/building-data.js'), header + helperMethods);
console.log(`Generated extension/building-data.js for ${Object.keys(buildingLevels).length} buildings.`);
