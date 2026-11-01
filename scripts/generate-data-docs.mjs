import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { runInNewContext } from 'node:vm';

const root = resolve(import.meta.dirname, '..');
const input = resolve(process.argv[2] ?? join(root, 'temp/tracking-data/hwa-api-2026-11-01_latest.json'));
const records = JSON.parse(await readFile(input, 'utf8'));
if (!Array.isArray(records)) throw new Error('Expected a JSON array of API records');

const snapshots = new Map();
for (const record of records) {
  if (record.endpoint !== 'https://api.hero-wars-alliance.com/api/rpc' ||
      record.requestBodyTruncated || record.responseBodyTruncated) continue;
  try {
    const request = JSON.parse(record.requestBody);
    const response = JSON.parse(record.responseBody);
    if (!Array.isArray(request.calls) || !Array.isArray(response.results)) continue;
    for (const call of request.calls) {
      const result = response.results.find((item) => item.ident === call.ident)?.result;
      if (result?.response == null) continue;
      const key = `${call.name}${call.feature ? `:${call.feature}` : ''}`;
      const previous = snapshots.get(key);
      if (!previous || record.timestamp >= previous.timestamp) {
        snapshots.set(key, { data: result.response, timestamp: record.timestamp });
      }
    }
  } catch (_) {
    // Only complete, parseable RPC pairs contribute to the tables.
  }
}

for (const key of ['heroGetAll', 'inventoryGet', 'titanGetAll', 'teamGetAll']) {
  if (!snapshots.has(key)) throw new Error(`Missing required RPC snapshot: ${key}`);
}

const number = (value) => typeof value === 'number' ? value.toLocaleString('en-US') : '—';
const byId = ([a], [b]) => Number(a) - Number(b);
const context = {};
runInNewContext(await readFile(join(root, 'extension/data-names.js'), 'utf8'), context);
runInNewContext(await readFile(join(root, 'extension/name-map.js'), 'utf8'), context);
runInNewContext(await readFile(join(root, 'extension/popup-data.js'), 'utf8'), context);
const nameMap = context.hwaHelperNameMap;
const popupData = context.hwaHelperPopupData;
const cell = (value) => String(value ?? '—').replaceAll('|', '\\|').replaceAll('\n', ' ');
const source = `Source: \`${input.replace(`${root}\\`, '').replaceAll('\\', '/')}\`. This is a single-account snapshot extracted from RPC responses; display names are resolved using the bundled CDN locale; missing names retain the ID. Tokens, player names, chat, and mail are omitted.`;

const heroes = snapshots.get('heroGetAll');
const inventory = snapshots.get('inventoryGet');
const heroRows = Object.entries(heroes.data).sort(byId).map(([id, hero]) => {
  const { owned, needed } = popupData.heroSoulProgress(id, hero, inventory.data);
  return `| ${id} | ${cell(nameMap.hero(id))} | ${number(hero.level)} | ${number(hero.star)} | ${number(owned)} / ${typeof needed === 'number' ? number(needed) : needed ?? '—'} | ${number(hero.power)} | ${number(hero.color)} | ${number(hero.currentSkin)} |`;
});
await writeFile(join(root, 'docs/HEROES.md'), `# Heroes Table\n\n${source}\n\nRPC: \`heroGetAll\` and \`inventoryGet.fragmentHero\`; updated at \`${heroes.timestamp}\` and \`${inventory.timestamp}\`. Keyed by hero ID. Soul stones column shows owned / needed for next star tier; tier 6 is maximum. Evolution star cost is based on \`enum_evolutionStar.json\` from game asset 1.292.0.\n\n| Hero ID | Name | Level | Star | Soul stones | Power | Color | Current skin ID |\n| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |\n${heroRows.join('\n')}\n\nOther fields in response: \`xp\`, \`slots\`, \`skills\`, \`runes\`, \`skins\`, \`artifacts\`, \`skinsInfo\`. To update: export fresh log then run \`npm run docs:data -- <path-to-log.json>\`.\n`);

const itemSections = Object.entries(inventory.data).map(([category, entries]) => {
  const rows = Object.entries(entries ?? {}).sort(byId).map(([id, quantity]) =>
    `| ${id} | ${cell(nameMap.item(category, id))} | ${number(quantity)} |`
  );
  return `## ${category} (${rows.length} ID)\n\n| Item ID | Name | Quantity |\n| ---: | --- | ---: |\n${rows.join('\n')}`;
});
await writeFile(join(root, 'docs/ITEMS.md'), `# Items Table\n\n${source}\n\nRPC: \`inventoryGet\`; updated at \`${inventory.timestamp}\`. Response contains item categories; each category is a map of \`item ID → quantity\`. IDs can repeat across categories, so full key is \`(category, ID)\`.\n\n${itemSections.join('\n\n')}\n\n\`getInventory\` with \`feature=inventory\` has a separate schema and is not mixed into the table above. To update: export fresh log then run \`npm run docs:data -- <path-to-log.json>\`.\n`);

const titans = snapshots.get('titanGetAll');
const titanRows = Object.entries(titans.data).sort(byId).map(([id, titan]) =>
  `| ${id} | ${cell(nameMap.hero(id))} | ${number(titan.level)} | ${number(titan.star)} | ${number(titan.power)} | ${number(titan.currentSkin)} |`
);
const teams = snapshots.get('teamGetAll');
const teamRows = popupData.teamRows(teams.data, nameMap).map(([mode, team, count, names]) =>
  `| \`${mode}\` | ${team} | ${count} | ${cell(names)} |`);
const otherRows = [
  ['questGetAll', 'Quests', (data) => `array of ${data.length} quests`],
  ['missionGetAll', 'Missions', (data) => `array of ${data.length} missions`],
  ['shopGetMany', 'Shop', (data) => `${Object.keys(data).length} shops`],
  ['offerGetAll', 'Offers', (data) => `array of ${data.length} offers`],
  ['artifact_getAll', 'Artifacts', (data) => `${Object.keys(data).length} entries`],
  ['skin_getAll', 'Skins', (data) => `${Object.keys(data).length} entries`],
  ['getInventory:inventory', 'Inventory (other subsystem)', (data) => Object.keys(data).join(', ')],
  ['clanBoss_getAll', 'Clan boss', (data) => Object.keys(data).join(', ')],
  ['clanWarGetBriefInfo', 'Clan war', (data) => Object.keys(data).join(', ')]
].map(([key, label, describe]) => {
  const entry = snapshots.get(key);
  return `| \`${key}\` | ${label} | ${entry ? describe(entry.data) : 'not present in log'} | ${entry?.timestamp ?? '—'} |`;
});
await writeFile(join(root, 'docs/DATA-CATALOG.md'), `# Titans, Teams, and Other Data Catalog\n\n${source}\n\n## Titans\n\nRPC \`titanGetAll\`; updated at \`${titans.timestamp}\`.\n\n| Titan ID | Name | Level | Star | Power | Current skin ID |\n| ---: | --- | ---: | ---: | ---: | ---: |\n${titanRows.join('\n')}\n\n## Teams\n\nRPC \`teamGetAll\`; updated at \`${teams.timestamp}\`. Each nested squad has its own row. Names resolved by ID from bundled locale; missing names shown as \`#ID\`.\n\n| Mode | Team | Members | Hero/Titan names |\n| --- | ---: | ---: | --- |\n${teamRows.join('\n')}\n\n## Other Snapshots\n\n| RPC | Group | Observed Data Shape | Updated UTC |\n| --- | --- | --- | --- |\n${otherRows.join('\n')}\n\n## Data Collection & Update Methodology\n\n1. The extension observes \`POST https://api.hero-wars-alliance.com/api/rpc\`, without sending its own RPC requests. Requests contain \`calls[{name, feature?, args, ident}]\`; responses contain \`results[{ident, result.response}]\`. Calls and results are matched by \`ident\`.\n2. Only complete responses are captured (HTTP 200, readable and untruncated JSON body). Each method retains the latest snapshot by timestamp. Tables are point-in-time snapshots, not canonical dictionaries.\n3. In the extension, cache auto-updates when the game issues matching RPCs. When empty, popup reloads once from saved session logs. The extension only updates cache from passive RPC events; no scheduled requests, polling, or page reloading.\n4. To refresh docs, export JSON log and run \`npm run docs:data -- <path-to-log.json>\`. Only selected fields are documented; review tables before committing.\n\nLimitation: log currently does not capture response body for GET endpoints like \`api.aghanim.com/sdk/v1/items\`.\n`);

console.log(`Generated heroes (${heroRows.length}), item groups (${itemSections.length}), titans (${titanRows.length}), and teams (${teamRows.length})`);
