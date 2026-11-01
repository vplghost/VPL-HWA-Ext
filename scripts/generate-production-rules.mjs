import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// URLs observed in remoteConfigInit for WebGL 1.292.0 on 2026-11-01.
const bonusUrl = 'https://hwmb-remote-config-cdn.nextersglobal.com/config/bonus/ea971ab94960e0606c25e03fedce1bab.json';
const campaignUrl = 'https://hwmb-remote-config-cdn.nextersglobal.com/config/resourceProductionCampaign/88999f0f74ae4bb7e7b1444f046c461a.json';
const [bonuses, campaign] = await Promise.all([bonusUrl, campaignUrl].map(async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url}: ${response.status}`);
  return response.json();
}));
const materialIds = { wood: 4, food: 5, stone: 3, iron: 2 };
const kinds = { ProducerSpeed: 'main', OptionalProducerSpeed: 'optional',
  WorkStationCount: 'stations', ProducerResidentCapacity: 'capacity' };
const rows = Object.values(bonuses).flatMap((bonus) => {
  const match = /^(wood|food|stone|iron)(ProducerSpeed|OptionalProducerSpeed|WorkStationCount|ProducerResidentCapacity)$/.exec(bonus.bonusType || '');
  if (!match || !Number.isFinite(bonus.value)) return [];
  return [[bonus.id, materialIds[match[1]], kinds[match[2]], bonus.value,
    bonus.calculationType === 'percentage' ? 1 : 0]];
}).sort((a, b) => a[0] - b[0]);
const campaignRows = Object.values(campaign).filter((item) =>
  Number.isInteger(item.mission) && Number.isFinite(item.productionPerSecond))
  .map((item) => [item.mission, item.productionPerSecond])
  .sort((a, b) => a[0] - b[0]);
const output = `// Generated from the pinned WebGL 1.292.0 production configs.\n` +
  `globalThis.hwaHelperProductionRules = ${JSON.stringify({ bonusUrl, campaignUrl,
    bonusRows: rows, campaignRows })};\n`;
await writeFile(resolve('extension/production-rules.js'), output);
console.log(`Wrote ${rows.length} production bonuses and ${campaignRows.length} campaign levels.`);
