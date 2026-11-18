import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getMarchBadgeInfo } from '../src/utils/resourceData.ts';

test('Header march sorting prioritizes category (rally -> monster -> gather) and newer start time on left', () => {
  const now = 1794968500 * 1000;

  const MARCH_CATEGORY_ORDER = {
    raid: 1,
    monster: 2,
    gather: 3,
  };

  function getMarchStartTime(m) {
    return Number(m?.startedAt || m?.gatheringStartedAt || m?.route?.startedAt || m?.plannedStartTime || 0);
  }

  // 4 marches in mixed order:
  // - Gather march (started at 200)
  // - Rally march 1 (started at 100)
  // - Monster march (started at 300)
  // - Rally march 2 (started at 150, newer)
  const marches = [
    { id: 'gather-1', kind: 'mine', startedAt: 200, endsAt: now + 50000 },
    { id: 'rally-1', kind: 'raid', rally: { id: 'r1' }, startedAt: 100, endsAt: now + 50000 },
    { id: 'monster-1', kind: 'attack', mobConfigId: 79, startedAt: 300, endsAt: now + 50000 },
    { id: 'rally-2', kind: 'raid', rally: { id: 'r2' }, startedAt: 150, endsAt: now + 50000 },
  ];

  const sorted = marches
    .map((m, idx) => ({ march: m, index: idx }))
    .sort((a, b) => {
      const catA = MARCH_CATEGORY_ORDER[getMarchBadgeInfo(a.march, now).category] ?? 99;
      const catB = MARCH_CATEGORY_ORDER[getMarchBadgeInfo(b.march, now).category] ?? 99;
      if (catA !== catB) return catA - catB;

      const timeA = getMarchStartTime(a.march);
      const timeB = getMarchStartTime(b.march);
      if (timeA !== timeB) return timeB - timeA; // newer on left, older on right

      return a.index - b.index;
    });

  const ids = sorted.map((s) => s.march.id);
  // Expected order:
  // 1. rally-2 (raid, start: 150 - newer on left)
  // 2. rally-1 (raid, start: 100 - older on right)
  // 3. monster-1 (monster)
  // 4. gather-1 (gather)
  assert.deepEqual(ids, ['rally-2', 'rally-1', 'monster-1', 'gather-1']);
});

test('Header.vue contains march sorting with MARCH_CATEGORY_ORDER and timeB - timeA', async () => {
  const content = await readFile(new URL('../src/components/common/Header.vue', import.meta.url), 'utf8');

  assert.ok(content.includes('MARCH_CATEGORY_ORDER'), 'Header.vue must define MARCH_CATEGORY_ORDER');
  assert.ok(content.includes('timeB - timeA'), 'Header.vue must sort start time descending (newer on left)');
  assert.ok(content.includes('raid: 1'), 'MARCH_CATEGORY_ORDER must rank raid first');
  assert.ok(content.includes('monster: 2'), 'MARCH_CATEGORY_ORDER must rank monster second');
  assert.ok(content.includes('gather: 3'), 'MARCH_CATEGORY_ORDER must rank gather third');
});

test('HeroesTab.vue has Grid view as default and places Grid before Table in switcher', async () => {
  const content = await readFile(new URL('../src/components/tabs/HeroesTab.vue', import.meta.url), 'utf8');

  // Verify default viewMode is 'grid'
  assert.ok(content.includes("const viewMode = ref<'table' | 'grid'>('grid');"), 'viewMode must default to grid');

  // Verify Grid button comes before Table button in the DOM
  const gridIndex = content.indexOf("@click=\"viewMode = 'grid'\"");
  const tableIndex = content.indexOf("@click=\"viewMode = 'table'\"");
  assert.ok(gridIndex !== -1 && tableIndex !== -1, 'Both grid and table buttons must exist');
  assert.ok(gridIndex < tableIndex, 'Grid button must appear before Table button in switcher');

  // Verify refresh button matches ItemsTab & TitansTab
  assert.ok(content.includes('id="btn-toolbar-refresh-heroes"'), 'Refresh button must feature ID btn-toolbar-refresh-heroes');
  assert.ok(content.includes(':disabled="isRefreshing"'), 'HeroesTab refresh button must have :disabled="isRefreshing"');
  assert.ok(content.includes('if (isRefreshing.value) return;'), 'refreshHeroes must guard against concurrent invocation');
  assert.ok(content.includes("class=\"cursor-pointer rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/60 px-2.5 py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300 hover:bg-blue-100 transition-colors disabled:opacity-50\""), 'Refresh button style must match Items & Titans tab');
});

test('All modal and tab refresh buttons have double-call prevention and disabled states', async () => {
  const buildingModal = await readFile(new URL('../src/components/dialogs/BuildingModal.vue', import.meta.url), 'utf8');
  assert.ok(buildingModal.includes(':disabled="isRefreshing"'), 'BuildingModal must have :disabled="isRefreshing"');
  assert.ok(buildingModal.includes('if (isRefreshing.value) return;'), 'BuildingModal must guard refreshBuildings');

  const researchModal = await readFile(new URL('../src/components/dialogs/ResearchModal.vue', import.meta.url), 'utf8');
  assert.ok(researchModal.includes(':disabled="isRefreshing"'), 'ResearchModal must have :disabled="isRefreshing"');
  assert.ok(researchModal.includes('if (isRefreshing.value) return;'), 'ResearchModal must guard refreshResearch');

  const towerModal = await readFile(new URL('../src/components/dialogs/TowerModal.vue', import.meta.url), 'utf8');
  assert.ok(towerModal.includes(':disabled="isRefreshing"'), 'TowerModal must have :disabled="isRefreshing"');
  assert.ok(towerModal.includes('if (isRefreshing.value) return;'), 'TowerModal must guard refreshTower');

  const towerTab = await readFile(new URL('../src/components/tabs/TowerTab.vue', import.meta.url), 'utf8');
  assert.ok(towerTab.includes(':disabled="isRefreshing"'), 'TowerTab must have :disabled="isRefreshing"');
  assert.ok(towerTab.includes('if (isRefreshing.value) return;'), 'TowerTab must guard refreshTower');

  const dungeonTab = await readFile(new URL('../src/components/tabs/DungeonTab.vue', import.meta.url), 'utf8');
  assert.ok(dungeonTab.includes(':disabled="isRefreshing"'), 'DungeonTab must have :disabled="isRefreshing"');
  assert.ok(dungeonTab.includes('if (isRefreshing.value) return;'), 'DungeonTab must guard refreshDungeon');

  const guildChat = await readFile(new URL('../src/components/common/GuildChatPanel.vue', import.meta.url), 'utf8');
  assert.ok(guildChat.includes(':disabled="isRefreshing"'), 'GuildChatPanel must have :disabled="isRefreshing"');
  assert.ok(guildChat.includes('if (isRefreshing.value) return;'), 'GuildChatPanel must guard refreshChat');

  const speedupControl = await readFile(new URL('../src/components/common/SpeedupControl.vue', import.meta.url), 'utf8');
  assert.ok(speedupControl.includes(':disabled="refreshing"'), 'SpeedupControl must have :disabled="refreshing"');
  assert.ok(speedupControl.includes('if (refreshing.value) return;'), 'SpeedupControl must guard refresh');

  const statusAlertBanner = await readFile(new URL('../src/components/common/StatusAlertBanner.vue', import.meta.url), 'utf8');
  assert.ok(statusAlertBanner.includes(':disabled="actionState === \'loading\'"'), 'StatusAlertBanner must have :disabled="actionState === \'loading\'"');
});
