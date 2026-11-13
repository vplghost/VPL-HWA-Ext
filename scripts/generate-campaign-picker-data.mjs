import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { findIndex, readZip, verifyAsset, hash } from './sync-cdn-assets.mjs';
import vm from 'node:vm';

if (!process.argv[2]) throw Error('Pass a matching game capture containing indexGet');
const capture = JSON.parse(await readFile(process.argv[2], 'utf8'));
const index = findIndex(capture, '1.293.0');
const library = await readFile('temp/resources-splitlib.json.zip');
const localeBytes = await readFile('temp/items-current-en.json.gz');
verifyAsset(library, index.lib['splitlib.json.zip']);
verifyAsset(localeBytes, index.locale['en.json.gz']);
const files = readZip(library);
const missionBytes = files.get('mission.json');
verifyAsset(missionBytes, index.lib['splitlib.json.zip'].content.find(row => row.path === 'mission.json'));
const locale = JSON.parse(gunzipSync(localeBytes));
const libraryMissions = JSON.parse(missionBytes);
const context = {};
vm.runInNewContext(await readFile('extension/campaign-missions.js', 'utf8'), context);
const missions = {}, chapters = {};
for (const known of Object.values(context.hwaHelperCampaignMissions.missions)) {
  const row = libraryMissions[known.id];
  if (!row || row.world !== known.chapter || row.index !== known.index) throw Error('Mission layout changed: ' + known.id);
  chapters[row.world] = locale['LIB_WORLD_' + row.world] || `Chapter ${row.world}`;
  const drops = new Map();
  for (const wave of row.normalMode?.waves || []) for (const enemy of wave.enemies || []) {
    for (const drop of enemy.drop || []) {
      if (!(Number(drop.chance) > 0)) continue;
      for (const [category, rewards] of Object.entries(drop.reward || {})) {
        if (!rewards || typeof rewards !== 'object') continue;
        for (const [id, amount] of Object.entries(rewards)) {
          if (/^\d+$/.test(id) && Number(amount) > 0) drops.set(`${category}:${id}`, { category, id: Number(id) });
        }
      }
    }
  }
  missions[known.id] = { name: locale['LIB_MISSION_NAME_' + known.id] || `${known.chapter}-${known.index}`, drops: [...drops.values()] };
}
await mkdir('src/data', { recursive: true });
await writeFile('src/data/campaign-picker.json', JSON.stringify({ source: {
  staticVersion: '1.293.0', localeMd5: hash(localeBytes, 'md5'), libraryMd5: hash(library, 'md5'),
  chapterNameKey: 'LIB_WORLD_<id>', missionNameKey: 'LIB_MISSION_NAME_<id>',
}, chapters, missions }, null, 2) + '\n');
console.log(`Generated ${Object.keys(chapters).length} chapters and ${Object.keys(missions).length} mission drop previews`);
