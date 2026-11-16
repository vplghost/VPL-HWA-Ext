import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import vm from 'node:vm';
const root = resolve(import.meta.dirname, '..');

/** Render only the verified English quest template/parameter forms used by this pack. */
export function conditionTitle(condition, template, locale) {
  const target = condition?.target, args = condition?.args || {};
  if (!Number.isSafeInteger(target) || target <= 0) return null;
  if (typeof template !== 'string' || !template.trim()) return null;
  const n = target.toLocaleString('en-US');
  let second;
  switch (condition.name) {
    case 'buildingCompletedAny':
    case 'personalResearchCompletedAny':
    case 'personalResearchStartAny':
    case 'globalMapCampVictories':
    case 'globalMapResourceGatheringCount':
    case 'globalMapMobRallyKills': break;
    case 'unitsTrained': {
      if (!['front', 'middle', 'back'].includes(args.unitType)) return null;
      second = locale?.['STRATEGIC_UNIT_CLASS_' + args.unitType.toUpperCase()];
      if (!second) return null;
      break;
    }
    case 'globalMapResourceTypeGathered': {
      second = args.resourceType === 'material' && locale?.['STRATEGIC_RESOURCE_' + args.resourceId + '_NAME'];
      if (!second) return null;
      break;
    }
    default: return null;
  }
  if (template.includes('%param2%') && !second) return null;
  const title = template.replace(/%param1%/g, n).replace(/%param2%/g, second || '')
    .replace(/\$m\(([^|()]+)\|([^|()]+)\|([^()]+)\)/g, (_, one, many) => target === 1 ? one : many);
  return /%param|\$m\(/.test(title) ? null : title;
}

export function deriveDailyDefinitions(quests, chains, conditions, packs, locale) {
  const chainIds = new Set(Object.values(packs).flatMap(pack => pack.questChainIds || []));
  const definitions = {}, titles = {};
  for (const quest of Object.values(quests)) {
    if (!chainIds.has(quest.chainId)) continue;
    const chain = chains[quest.chainId], condition = quest.condition;
    if (!chain || !conditions[condition?.name] || !Number.isSafeInteger(quest.chainOrder)) throw Error(`Unverified daily quest: ${quest.id}`);
    const translationMethod = quest.overrideTranslationMethod || conditions[condition.name].translationMethod;
    const localeKey = 'LIB_QUEST_TRANSLATE_' + String(translationMethod).toUpperCase();
    const template = locale?.[localeKey];
    const title = conditionTitle(condition, template, locale);
    if (!title) continue;
    definitions[quest.id] = { chainId: quest.chainId, phase: quest.chainOrder, transferProgress: chain.transferProgress === true,
      condition, translationMethod, localeKey, template, label: quest.label };
    titles[quest.id] = title;
  }
  if (definitions[364]?.condition.name !== 'globalMapCampVictories' || definitions[364]?.condition.target !== 10) throw Error('Quest #364 contract changed; review before generating');
  return { definitions, titles };
}

export async function generateQuestData(configDir = join(root, 'temp'), indexPath = join(root, 'temp/remote-config-captured.json'), localePath = join(root, 'temp/items-current-en.json.gz')) {
  const index = JSON.parse(await readFile(indexPath, 'utf8')).index.configs;
  const sources = {}, configs = {};
  for (const name of ['quest', 'questChain', 'questCondition', 'dailyQuestPack']) {
    const bytes = await readFile(join(configDir, `smart-gather-${name}.json`));
    const md5 = createHash('md5').update(bytes).digest('hex'), url = index[name]?.url;
    if (!url?.endsWith(`/${md5}.json`)) throw Error(`Config hash mismatch: ${name}`);
    sources[name] = { url, md5 }; configs[name] = JSON.parse(bytes);
  }
  const namesContext = {};
  vm.runInNewContext(await readFile(join(root, 'extension/data-names.js'), 'utf8'), namesContext);
  const metadata = namesContext.hwaHelperNameData;
  const compressed = await readFile(localePath);
  if (compressed.length !== metadata.assetSize || createHash('md5').update(compressed).digest('hex') !== metadata.assetMd5) throw Error('Locale size/hash mismatch');
  const locale = JSON.parse(gunzipSync(compressed));
  sources.locale = { url: metadata.assetUrl, md5: metadata.assetMd5, size: metadata.assetSize };
  const { definitions, titles } = deriveDailyDefinitions(configs.quest, configs.questChain, configs.questCondition, configs.dailyQuestPack, locale);
  const catalogPath = join(root, 'extension/quest-catalog.json');
  const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
  // Replace the inferred daily 4X range; preserve unrelated templates and custom metadata.
  for (let id = 346; id <= 370; id++) delete catalog.dailyTitles[id];
  Object.assign(catalog.dailyTitles, titles);
  catalog.dailyDefinitions = definitions; catalog.dailySources = sources;
  const runtimePath = join(root, 'src/data/questData.ts');
  const runtime = await readFile(runtimePath, 'utf8');
  const block = '  // BEGIN GENERATED DAILY QUESTS — npm run quests:update\n' +
    '  const dailyTitles = ' + JSON.stringify(catalog.dailyTitles, null, 2).replace(/\n/g, '\n  ') + ';\n' +
    '  const dailyDefinitions = ' + JSON.stringify(definitions) + ';\n' +
    '  const dailySources = ' + JSON.stringify(sources) + ';\n' +
    '  // END GENERATED DAILY QUESTS';
  const pattern = /  \/\/ BEGIN GENERATED DAILY QUESTS[\s\S]*?  \/\/ END GENERATED DAILY QUESTS|  const dailyTitles = \{[\s\S]*?\n  \};/;
  if (!pattern.test(runtime)) throw Error('Daily runtime generation marker missing');
  await writeFile(catalogPath, JSON.stringify(catalog, null, 2) + '\n');
  await writeFile(runtimePath, runtime.replace(pattern, () => block));
  return { count: Object.keys(definitions).length, sources };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await generateQuestData(process.argv[2], process.argv[3], process.argv[4]);
  console.log(`Generated ${result.count} verified daily quest definitions and titles.`);
}
