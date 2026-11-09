import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const catalogPath = join(root, 'extension/quest-catalog.json');

async function run() {
  let catalog = {
    dailyTitles: {},
    viewTitles: {},
    hiddenViewIds: [],
    localeTitles: {},
    questTemplates: {}
  };

  try {
    const existing = await readFile(catalogPath, 'utf8');
    catalog = JSON.parse(existing);
  } catch (_) {}

  // 1. Scan splitlib if available
  const splitlibDir = join(root, 'temp/splitlib');
  try {
    const qDailyRaw = await readFile(join(splitlibDir, 'quest_daily.json'), 'utf8');
    const qDaily = JSON.parse(qDailyRaw);
    for (const item of Object.values(qDaily)) {
      if (item?.id && item?.translationMethod && !catalog.questTemplates[item.id]) {
        const human = item.translationMethod
          .replace(/([A-Z])/g, ' $1')
          .toLowerCase()
          .replace(/^./, (c) => c.toUpperCase());
        catalog.questTemplates[String(item.id)] = human;
      }
    }
  } catch (_) {}

  // 2. Scan tracking data logs for active/observed IDs
  const trackingDir = join(root, 'temp/tracking-data');
  try {
    const files = await readdir(trackingDir);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const content = await readFile(join(trackingDir, file), 'utf8');
        const data = JSON.parse(content);
        for (const item of data.timeline || []) {
          if (!item.responseBody) continue;
          if (item.responseBody.includes('getDailyQuests')) {
            try {
              const res = JSON.parse(item.responseBody);
              res.results?.forEach((r) => {
                r.result?.response?.quests?.forEach((q) => {
                  if (q?.id && !catalog.dailyTitles[String(q.id)]) {
                    catalog.dailyTitles[String(q.id)] = `Daily Quest #${q.id}`;
                  }
                });
              });
            } catch (_) {}
          }
          if (item.responseBody.includes('getSpecialQuestState')) {
            try {
              const res = JSON.parse(item.responseBody);
              res.results?.forEach((r) => {
                r.result?.response?.events?.forEach((ev) => {
                  if (ev?.viewId && !catalog.viewTitles[String(ev.viewId)]) {
                    catalog.viewTitles[String(ev.viewId)] = `Event View #${ev.viewId}`;
                  }
                });
              });
            } catch (_) {}
          }
        }
      } catch (_) {}
    }
  } catch (_) {}

  await writeFile(catalogPath, JSON.stringify(catalog, null, 2) + '\n');
  console.log(`Updated quest catalog:
- Daily titles: ${Object.keys(catalog.dailyTitles).length}
- View titles: ${Object.keys(catalog.viewTitles).length}
- Locale titles: ${Object.keys(catalog.localeTitles).length}
- Quest templates: ${Object.keys(catalog.questTemplates).length}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
