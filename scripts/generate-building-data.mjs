import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

function parseDuration(dStr) {
  if (!dStr) return 0;
  const parts = dStr.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return Number(dStr) || 0;
}

const root = resolve(import.meta.dirname, '..');
const blData = JSON.parse(await readFile(resolve(root, 'temp/buildingLevel.json'), 'utf8'));

// Compact representation:
// buildingLevels[buildingId] = {
//   [level]: { d: durationSec, r: [[reqId, reqLvl], ...], c: { [matId]: amount } }
// }
const buildingLevels = {};

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

  const durationSec = parseDuration(item.duration);

  if (!buildingLevels[bId]) buildingLevels[bId] = {};
  buildingLevels[bId][lvl] = {
    d: durationSec,
    ...(reqs.length > 0 ? { r: reqs } : {}),
    ...(Object.keys(cost).length > 0 ? { c: cost } : {})
  };
}

const header = '// Generated from WebGL buildingLevel remote config.\n';
const helperMethods = `
(() => {
  const data = ${JSON.stringify(buildingLevels)};

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

  globalThis.hwaHelperBuildingData = {
    data,
    getBuildingLevelData,
    getMissingRequirements,
    getMissingCosts,
    calculateEffectiveDurationMs
  };
})();
`;

await writeFile(resolve(root, 'extension/building-data.js'), header + helperMethods);
console.log(`Generated extension/building-data.js for ${Object.keys(buildingLevels).length} buildings.`);
