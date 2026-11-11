import test from 'node:test';
import assert from 'node:assert/strict';
import { stat, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { getTroopType } from '../src/utils/troops.ts';
import { formatDuration, formatNumber, formatCompact } from '../src/utils/formatters.ts';
import { formatResourceAmount, getAmountAt, getNextRefillSeconds } from '../src/utils/resourceData.ts';

const root = resolve(import.meta.dirname, '..');

test('WXT + Vue 3 formatters and duration helpers work accurately', () => {
  assert.equal(formatDuration(0), 'Ready');
  assert.equal(formatDuration(-5), 'Ready');
  assert.equal(formatDuration(45), '45s');
  assert.equal(formatDuration(125), '2m 5s');
  assert.equal(formatDuration(3665), '1h 1m');

  assert.equal(formatNumber(1234567), '1,234,567');
  assert.equal(formatNumber(0), '0');
  assert.equal(formatNumber(null), '0');

  assert.equal(formatCompact(500), '500');
  assert.equal(formatCompact(15000), '15k');
  assert.equal(formatCompact(2500000), '2.5M');
  assert.equal(formatCompact(3200000000), '3.2B');
});

test('WXT + Vue 3 resource refill logic calculates elapsed regeneration clamped to cap', () => {
  const entry = {
    data: {
      amount: 50,
      cap: 100,
      lastRefillAt: 10000,
      refillEveryMs: 1000,
      refillAmount: 1,
    },
  };

  assert.equal(getAmountAt(entry, 10000), 50);
  assert.equal(getAmountAt(entry, 15000), 55);
  assert.equal(getAmountAt(entry, 70000), 100); // Clamped to cap

  const refillSec = getNextRefillSeconds(entry, 10400);
  assert.equal(refillSec, 1);

  assert.equal(formatResourceAmount(950), '950');
  assert.equal(formatResourceAmount(1500000), '1.5M');
  assert.equal(formatResourceAmount(2400000000), '2.4B');
});

test('WXT + Vue 3 getTroopType maps all 3 categories and 9 levels', () => {
  // Marksmen (type 0)
  assert.deepEqual(getTroopType(1), { type: 0, level: 1 });
  assert.deepEqual(getTroopType(7), { type: 0, level: 7 });
  assert.deepEqual(getTroopType(9), { type: 0, level: 9 });

  // Spearmen (type 1)
  assert.deepEqual(getTroopType(11), { type: 1, level: 1 });
  assert.deepEqual(getTroopType(18), { type: 1, level: 8 });

  // Infantry (type 2)
  assert.deepEqual(getTroopType(21), { type: 2, level: 1 });
  assert.deepEqual(getTroopType(29), { type: 2, level: 9 });

  assert.equal(getTroopType(35), null);
});

test('WXT + Vue 3 Single File Components exist and are non-empty', async () => {
  const components = [
    'entrypoints/popup/App.vue',
    'src/components/common/Header.vue',
    'src/components/common/TabNav.vue',
    'src/components/common/FabDial.vue',
    'src/components/common/HeroHoverCard.vue',
    'src/components/dashboard/DashboardTab.vue',
    'src/components/dashboard/TroopsOverview.vue',
    'src/components/dashboard/ResourceSummary.vue',
    'src/components/dashboard/QueuesOverview.vue',
    'src/components/dashboard/ActivityGoals.vue',
    'src/components/tabs/HeroesTab.vue',
    'src/components/tabs/TitansTab.vue',
    'src/components/tabs/ItemsTab.vue',
    'src/components/tabs/ResourcesTab.vue',
    'src/components/tabs/TeamsTab.vue',
    'src/components/tabs/GatheringTab.vue',
    'src/components/tabs/DungeonTab.vue',
    'src/components/tabs/TowerTab.vue',
    'src/components/tabs/QuestsTab.vue',
    'src/components/tabs/SettingsTab.vue',
    'src/components/tabs/LogTab.vue',
    'src/components/common/ModalDialog.vue',
    'src/components/dialogs/RaidModal.vue',
    'src/components/dialogs/GatheringModal.vue',
    'src/components/dialogs/MonsterModal.vue',
    'src/components/dialogs/BuildingModal.vue',
    'src/components/dialogs/ResearchModal.vue',
    'src/components/dialogs/CampaignRaidModal.vue',
    'src/components/dialogs/HeroDetailModal.vue',
    'src/components/dialogs/TowerModal.vue',
    'src/components/dialogs/DungeonModal.vue',
    'src/components/dialogs/QuestDetailModal.vue',
    'src/components/dialogs/DraftModal.vue',
    'src/components/dialogs/GuildVersusModal.vue',
    'src/components/common/GuildChatPanel.vue',
  ];

  for (const comp of components) {
    const s = await stat(join(root, comp));
    assert.ok(s.isFile(), `${comp} must be a file`);
    assert.ok(s.size > 50, `${comp} must not be empty`);
  }
});

test('DraftModal, GuildVersusModal, and GuildChatPanel have 1:1 ID parity with HTML', async () => {
  const draft = await readFile(join(root, 'src/components/dialogs/DraftModal.vue'), 'utf8');
  assert.match(draft, /id="draft-modal"/, 'Must have #draft-modal');
  assert.match(draft, /id="draft-modal-title"/, 'Must have #draft-modal-title');
  assert.match(draft, /id="draft-modal-stage-badge"/, 'Must have #draft-modal-stage-badge');
  assert.match(draft, /id="draft-modal-close"/, 'Must have #draft-modal-close');
  assert.match(draft, /id="draft-modal-body"/, 'Must have #draft-modal-body');

  const gvs = await readFile(join(root, 'src/components/dialogs/GuildVersusModal.vue'), 'utf8');
  assert.match(gvs, /id="guild-versus-modal"/, 'Must have #guild-versus-modal');
  assert.match(gvs, /id="gvs-modal-title"/, 'Must have #gvs-modal-title');
  assert.match(gvs, /id="gvs-league-badge"/, 'Must have #gvs-league-badge');
  assert.match(gvs, /id="gvs-modal-close"/, 'Must have #gvs-modal-close');
  assert.match(gvs, /id="gvs-modal-body"/, 'Must have #gvs-modal-body');
  assert.match(gvs, /Stacked Deck/, 'Must have Stacked Deck mode');
  assert.match(gvs, /Grid View/, 'Must have Grid View mode');
  assert.match(gvs, /formatRewardItem/, 'Must have reward itemization formatter');

  const chat = await readFile(join(root, 'src/components/common/GuildChatPanel.vue'), 'utf8');
  assert.match(chat, /id="guild-chat-panel"/, 'Must have #guild-chat-panel');
  assert.match(chat, /id="guild-chat-count"/, 'Must have #guild-chat-count');
  assert.match(chat, /id="guild-chat-refresh"/, 'Must have #guild-chat-refresh');
  assert.match(chat, /id="guild-chat-close"/, 'Must have #guild-chat-close');
  assert.match(chat, /id="guild-chat-messages"/, 'Must have #guild-chat-messages');
  assert.match(chat, /id="guild-chat-form"/, 'Must have #guild-chat-form');
  assert.match(chat, /id="guild-chat-input"/, 'Must have #guild-chat-input');
  assert.match(chat, /id="guild-chat-send"/, 'Must have #guild-chat-send');
});

test('TowerModal provides 1:1 HTML parity for buff priorities, team selectors, and run execution', async () => {
  const tower = await readFile(join(root, 'src/components/dialogs/TowerModal.vue'), 'utf8');
  assert.match(tower, /id="tower-modal-badge"/, 'Must have #tower-modal-badge');
  assert.match(tower, /towerAutomationSettings/, 'Must bind towerAutomationSettings');
  assert.match(tower, /tower-run-start/, 'Must dispatch tower-run-start');
  assert.match(tower, /tower-run-stop/, 'Must dispatch tower-run-stop');
  assert.match(tower, /buffPriority/, 'Must include buffPriority');
  assert.match(tower, /data-tower-accordion/, 'Must include data-tower-accordion');
  assert.match(tower, /Auto-fill Top 5 Power/, 'Must have auto-fill button');
});

test('QuestDetailModal and CampaignRaidModal have 1:1 ID parity with HTML dialogs', async () => {
  const questContent = await readFile(join(root, 'src/components/dialogs/QuestDetailModal.vue'), 'utf8');
  assert.match(questContent, /id="quest-detail-dialog"/, 'Must have #quest-detail-dialog');
  assert.match(questContent, /id="quest-detail-dialog-title"/, 'Must have #quest-detail-dialog-title');
  assert.match(questContent, /id="quest-detail-dialog-status"/, 'Must have #quest-detail-dialog-status');
  assert.match(questContent, /id="quest-detail-dialog-body"/, 'Must have #quest-detail-dialog-body');
  assert.match(questContent, /id="quest-detail-search"/, 'Must have search input');
  assert.match(questContent, /id="quest-detail-refresh"/, 'Must have refresh button');
  assert.match(questContent, /id="quest-detail-export"/, 'Must have export button');
  assert.match(questContent, /id="quest-cards-container"/, 'Must have cards container');

  const campContent = await readFile(join(root, 'src/components/dialogs/CampaignRaidModal.vue'), 'utf8');
  assert.match(campContent, /id="campaign-dialog"/, 'Must have #campaign-dialog');
  assert.match(campContent, /id="campaign-dialog-title"/, 'Must have #campaign-dialog-title');
  assert.match(campContent, /id="campaign-dialog-status"/, 'Must have #campaign-dialog-status');
  assert.match(campContent, /id="campaign-dialog-body"/, 'Must have #campaign-dialog-body');
  assert.match(campContent, /id="campaign-mission-input"/, 'Must have mission input');
});

test('DungeonModal has 1:1 ID parity and controls matching HTML dungeon-modal', async () => {
  const content = await readFile(join(root, 'src/components/dialogs/DungeonModal.vue'), 'utf8');
  assert.match(content, /id="dungeon-modal"/, 'Must have #dungeon-modal dialog');
  assert.match(content, /id="dungeon-modal-title"/, 'Must have #dungeon-modal-title');
  assert.match(content, /id="dungeon-floor-badge"/, 'Must have #dungeon-floor-badge');
  assert.match(content, /id="dungeon-auto-btn"/, 'Must have #dungeon-auto-btn');
  assert.match(content, /id="dungeon-refresh-btn"/, 'Must have #dungeon-refresh-btn');
  assert.match(content, /id="dungeon-modal-close"/, 'Must have #dungeon-modal-close');
  assert.match(content, /id="dungeon-modal-body"/, 'Must have #dungeon-modal-body');
  assert.match(content, /dungeon-auto-label/, 'Must have .dungeon-auto-label');
  assert.match(content, /dungeon-refresh-label/, 'Must have .dungeon-refresh-label');
  assert.match(content, /dungeon-clear-active-battle-btn/, 'Must have reset battle button');
  assert.match(content, /dungeon-combat-log-section/, 'Must have #dungeon-combat-log-section');
  assert.match(content, /dungeon-flawless-count/, 'Must have #dungeon-flawless-count');
  assert.match(content, /dungeon-total-battles/, 'Must have #dungeon-total-battles');
  assert.match(content, /dungeon-doors-grid/, 'Must have #dungeon-doors-grid');
  assert.match(content, /dungeon-titan-roster/, 'Must have #dungeon-titan-roster');
});

test('App.vue and index.html support full width and height on browser without fixed max-h constraint', async () => {
  const appContent = await readFile(join(root, 'entrypoints/popup/App.vue'), 'utf8');
  assert.match(appContent, /w-full/, 'App root must use w-full');
  assert.match(appContent, /min-h-screen/, 'App root must use min-h-screen');
  assert.ok(!appContent.includes('w-[780px]'), 'App root must not be locked to fixed w-[780px]');
  assert.ok(!appContent.includes('max-h-[640px]'), 'App root must not be locked to fixed max-h-[640px]');

  const indexContent = await readFile(join(root, 'entrypoints/popup/index.html'), 'utf8');
  assert.match(indexContent, /w-full/, 'index.html must have w-full');
  assert.match(indexContent, /h-full/, 'index.html must have h-full');
});

test('TroopsOverview and resourceSelection have robust runtime guards against TypeError', async () => {
  const troops = await readFile(join(root, 'src/components/dashboard/TroopsOverview.vue'), 'utf8');
  assert.ok(!troops.includes('v-with='), 'TroopsOverview must not use unsupported v-with');
  assert.match(troops, /troopCards/, 'TroopsOverview must compute troopCards');

  const composable = await readFile(join(root, 'src/composables/useResourceSelection.ts'), 'utf8');
  assert.match(composable, /normalizeResourceSelection/, 'useResourceSelection must normalize resourceSelection');
  assert.match(composable, /Array\.isArray\(val\)/, 'useResourceSelection must guard Array.isArray');

  const header = await readFile(join(root, 'src/components/common/Header.vue'), 'utf8');
  assert.match(header, /useResourceSelection/, 'Header must use useResourceSelection');
  assert.match(header, /resourceSelection\.value/, 'Header must reference resourceSelection.value');

  const resTab = await readFile(join(root, 'src/components/tabs/ResourcesTab.vue'), 'utf8');
  assert.match(resTab, /useResourceSelection/, 'ResourcesTab must use useResourceSelection');
  assert.match(resTab, /togglePin/, 'ResourcesTab must provide togglePin');
});

test('HeroDetailModal has 1:1 parity with legacy HTML hero-dialog', async () => {
  const content = await readFile(join(root, 'src/components/dialogs/HeroDetailModal.vue'), 'utf8');
  assert.match(content, /id="hero-dialog"/, 'Must have #hero-dialog');
  assert.match(content, /id="hero-dialog-title"/, 'Must have #hero-dialog-title');
  assert.match(content, /id="hero-dialog-status"/, 'Must have #hero-dialog-status');
  assert.match(content, /id="hero-dialog-switcher"/, 'Must have #hero-dialog-switcher');
  assert.match(content, /id="hero-dialog-body"/, 'Must have #hero-dialog-body');
  assert.match(content, /btn-upgrade-skill/, 'Must have btn-upgrade-skill class');
  assert.match(content, /heroUpgradeSkill/, 'Must call heroUpgradeSkill RPC');
  assert.match(content, /Farm Equipment/, 'Must have Farm Equipment action');
  assert.match(content, /justice-star/, 'Must support 6-star justice star');
  assert.match(content, /craft-fragment/, 'Must support fragment quick-crafting');
});

test('BuildingModal and ResearchModal have 1:1 ID parity and queue controls matching HTML', async () => {
  const bContent = await readFile(join(root, 'src/components/dialogs/BuildingModal.vue'), 'utf8');
  assert.match(bContent, /id="building-dialog"/, 'Must have #building-dialog');
  assert.match(bContent, /id="building-dialog-title"/, 'Must have #building-dialog-title');
  assert.match(bContent, /id="building-dialog-status"/, 'Must have #building-dialog-status');
  assert.match(bContent, /id="building-dialog-body"/, 'Must have #building-dialog-body');
  assert.match(bContent, /id="next-building-count-badge"/, 'Must have #next-building-count-badge');
  assert.match(bContent, /id="next-building-search-input"/, 'Must have #next-building-search-input');
  assert.match(bContent, /id="next-building-sort-select"/, 'Must have #next-building-sort-select');
  assert.match(bContent, /id="next-building-grid"/, 'Must have #next-building-grid');
  assert.match(bContent, /id="building-count-subtitle"/, 'Must have #building-count-subtitle');
  assert.match(bContent, /id="building-search-input"/, 'Must have #building-search-input');
  assert.match(bContent, /id="building-grid-list"/, 'Must have #building-grid-list');
  assert.match(bContent, /completeConstruction/, 'Must have completeConstruction RPC');
  assert.match(bContent, /startConstruction/, 'Must have startConstruction RPC');
  assert.match(bContent, /Auto-Build Queue/, 'Must have Auto-Build Queue');

  const rContent = await readFile(join(root, 'src/components/dialogs/ResearchModal.vue'), 'utf8');
  assert.match(rContent, /id="research-dialog"/, 'Must have #research-dialog');
  assert.match(rContent, /id="research-dialog-title"/, 'Must have #research-dialog-title');
  assert.match(rContent, /id="research-dialog-status"/, 'Must have #research-dialog-status');
  assert.match(rContent, /id="research-dialog-body"/, 'Must have #research-dialog-body');
  assert.match(rContent, /id="next-research-count-badge"/, 'Must have #next-research-count-badge');
  assert.match(rContent, /id="next-research-search-input"/, 'Must have #next-research-search-input');
  assert.match(rContent, /id="next-research-sort-select"/, 'Must have #next-research-sort-select');
  assert.match(rContent, /id="next-research-grid"/, 'Must have #next-research-grid');
  assert.match(rContent, /id="research-count-subtitle"/, 'Must have #research-count-subtitle');
  assert.match(rContent, /id="research-search-input"/, 'Must have #research-search-input');
  assert.match(rContent, /id="research-filter-tabs"/, 'Must have #research-filter-tabs');
  assert.match(rContent, /id="research-grid-list"/, 'Must have #research-grid-list');
  assert.match(rContent, /completeResearch/, 'Must have completeResearch RPC');
  assert.match(rContent, /startResearch/, 'Must have startResearch RPC');
  assert.match(rContent, /Auto-Research Queue/, 'Must have Auto-Research Queue');
});

test('RaidModal and MonsterModal have 1:1 ID parity and queue controls matching HTML', async () => {
  const raid = await readFile(join(root, 'src/components/dialogs/RaidModal.vue'), 'utf8');
  assert.match(raid, /id="raid-dialog"/, 'Must have #raid-dialog');
  assert.match(raid, /id="raid-dialog-header"/, 'Must have #raid-dialog-header');
  assert.match(raid, /id="raid-dialog-icon"/, 'Must have #raid-dialog-icon');
  assert.match(raid, /id="raid-dialog-title"/, 'Must have #raid-dialog-title');
  assert.match(raid, /id="raid-dialog-status"/, 'Must have #raid-dialog-status');
  assert.match(raid, /id="raid-dialog-body"/, 'Must have #raid-dialog-body');
  assert.match(raid, /id="raid-boss-level"/, 'Must have #raid-boss-level');
  assert.match(raid, /id="raid-min-members"/, 'Must have #raid-min-members');
  assert.match(raid, /id="raid-queue-count"/, 'Must have #raid-queue-count');

  const mob = await readFile(join(root, 'src/components/dialogs/MonsterModal.vue'), 'utf8');
  assert.match(mob, /id="monster-dialog"/, 'Must have #monster-dialog');
  assert.match(mob, /id="monster-dialog-header"/, 'Must have #monster-dialog-header');
  assert.match(mob, /id="monster-dialog-icon"/, 'Must have #monster-dialog-icon');
  assert.match(mob, /id="monster-dialog-title"/, 'Must have #monster-dialog-title');
  assert.match(mob, /id="monster-dialog-status"/, 'Must have #monster-dialog-status');
  assert.match(mob, /id="monster-dialog-body"/, 'Must have #monster-dialog-body');
  assert.match(mob, /id="monster-mob-level"/, 'Must have #monster-mob-level');
  assert.match(mob, /id="monster-queue-count"/, 'Must have #monster-queue-count');
});

test('CampaignRaidModal has Recipe Tree hierarchy and candidate mission chips matching HTML', async () => {
  const camp = await readFile(join(root, 'src/components/dialogs/CampaignRaidModal.vue'), 'utf8');
  assert.match(camp, /id="campaign-dialog"/, 'Must have #campaign-dialog');
  assert.match(camp, /id="campaign-dialog-title"/, 'Must have #campaign-dialog-title');
  assert.match(camp, /id="campaign-dialog-status"/, 'Must have #campaign-dialog-status');
  assert.match(camp, /id="campaign-dialog-body"/, 'Must have #campaign-dialog-body');
  assert.match(camp, /id="campaign-mission-input"/, 'Must have #campaign-mission-input');
  assert.match(camp, /buildGearRecipeTree/, 'Must use buildGearRecipeTree');
  assert.match(camp, /candidateMissions/, 'Must compute candidate missions');
  assert.match(camp, /Crafting Recipe Tree/, 'Must have Crafting Recipe Tree');
});

test('EventsTab and GoalsTab have 1:1 parity with HTML events and goals rendering', async () => {
  const events = await readFile(join(root, 'src/components/tabs/EventsTab.vue'), 'utf8');
  assert.match(events, /clanVersus/, 'EventsTab must handle Guild Versus');
  assert.match(events, /titanDungeon/, 'EventsTab must handle Titan Dungeon');
  assert.match(events, /clanWarChamp/, 'EventsTab must handle Guild War Championship');
  assert.match(events, /clanClash/, 'EventsTab must handle Guild Clash');
  assert.match(events, /brawl/, 'EventsTab must handle Hero Brawl');
  assert.match(events, /specialQuest/, 'EventsTab must handle Special Quest Events');
  assert.match(events, /fortress/, 'EventsTab must handle Fortress Event');
  assert.match(events, /clanBoss/, 'EventsTab must handle Hydra Boss');

  const goals = await readFile(join(root, 'src/components/tabs/GoalsTab.vue'), 'utf8');
  assert.match(goals, /extractEventGoals/, 'GoalsTab must extract event goals');
  assert.match(goals, /totalGoals/, 'GoalsTab must display totalGoals KPI');
  assert.match(goals, /synergiesCount/, 'GoalsTab must display synergiesCount KPI');
  assert.match(goals, /readyCount/, 'GoalsTab must display readyCount KPI');
  assert.match(goals, /Activities & Quests/, 'GoalsTab must render Activities group');
  assert.match(goals, /Resources to Spend/, 'GoalsTab must render Resources group');

  const app = await readFile(join(root, 'entrypoints/popup/App.vue'), 'utf8');
  assert.match(app, /EventsTab/, 'App.vue must wire EventsTab');
  assert.match(app, /GoalsTab/, 'App.vue must wire GoalsTab');

  const tabNav = await readFile(join(root, 'src/components/common/TabNav.vue'), 'utf8');
  assert.match(tabNav, /id="events-tab-badge"/, 'TabNav must have #events-tab-badge');
});

test('HeroesTab and HeroHoverCard provide full HTML parity: table view, favorites, hover cards, and tab badge', async () => {
  const heroesTab = await readFile(join(root, 'src/components/tabs/HeroesTab.vue'), 'utf8');
  assert.match(heroesTab, /viewMode/, 'HeroesTab must support viewMode');
  assert.match(heroesTab, /favoriteHeroes/, 'HeroesTab must manage favoriteHeroes');
  assert.match(heroesTab, /toggleFavorite/, 'HeroesTab must provide toggleFavorite');
  assert.match(heroesTab, /handleSort/, 'HeroesTab must provide column sorting');
  assert.match(heroesTab, /HeroHoverCard/, 'HeroesTab must embed HeroHoverCard');
  assert.match(heroesTab, /canEvolve/, 'HeroesTab must track canEvolve status');
  assert.match(heroesTab, /getHeroEquipmentRank/, 'HeroesTab must use getHeroEquipmentRank');
  assert.match(heroesTab, /hero-hover-trigger/, 'HeroesTab must use hero-hover-trigger class');

  const hoverCard = await readFile(join(root, 'src/components/common/HeroHoverCard.vue'), 'utf8');
  assert.match(hoverCard, /hero-hover-card/, 'HeroHoverCard must have hero-hover-card class');
  assert.match(hoverCard, /starGlowClass/, 'HeroHoverCard must use starGlowClass');
  assert.match(hoverCard, /getHeroSoulProgress/, 'HeroHoverCard must calculate soul stone progress');
  assert.match(hoverCard, /equipmentRank/, 'HeroHoverCard must show equipmentRank');
  assert.match(hoverCard, /skillsList/, 'HeroHoverCard must show skills');
  assert.match(hoverCard, /skinsList/, 'HeroHoverCard must show skins');
  assert.match(hoverCard, /glyphsList/, 'HeroHoverCard must show glyphs');
  assert.match(hoverCard, /artifactsList/, 'HeroHoverCard must show artifacts');
  assert.match(hoverCard, /equipmentSlots/, 'HeroHoverCard must show 6 equipment slots');

  const nav = await readFile(join(root, 'src/components/common/TabNav.vue'), 'utf8');
  assert.match(nav, /id="heroes-tab-badge"/, 'TabNav must have id="heroes-tab-badge"');
  assert.match(nav, /countEvolvableHeroes/, 'TabNav must calculate countEvolvableHeroes');
});

test('useTroopTraining exports normalizeArray and guards against non-array payloads', async () => {
  const { normalizeArray } = await import('../src/utils/troops.ts');
  assert.deepEqual(normalizeArray(null), []);
  assert.deepEqual(normalizeArray(undefined), []);
  assert.deepEqual(normalizeArray([1, 2, 3]), [1, 2, 3]);
  assert.deepEqual(normalizeArray({ a: 1, b: 2 }), [1, 2]);

  const overview = await readFile(join(root, 'src/components/dashboard/TroopsOverview.vue'), 'utf8');
  assert.match(overview, /normalizeArray/, 'TroopsOverview must use normalizeArray');
  assert.match(overview, /isSyncLoading/, 'TroopsOverview must handle isSyncLoading');
  assert.match(overview, /isHealLoading/, 'TroopsOverview must handle isHealLoading');
});

test('resourceData resolves human-readable worldMaterialNames instead of raw material codes', async () => {
  const { resourceLabel, worldMaterialNames } = await import('../src/utils/resourceData.ts');
  assert.equal(worldMaterialNames[1], 'Elarite Shards');
  assert.equal(worldMaterialNames[2], 'Iron');
  assert.equal(worldMaterialNames[3], 'Stone');
  assert.equal(worldMaterialNames[4], 'Wood');
  assert.equal(worldMaterialNames[5], 'Food');
  assert.equal(worldMaterialNames[12], 'Honor Marks');

  assert.equal(resourceLabel({ key: 'resource:material:1' }), 'Elarite Shards');
  assert.equal(resourceLabel({ key: 'resource:material:2' }), 'Iron');
  assert.equal(resourceLabel({ key: 'resource:material:5' }), 'Food');
  assert.equal(resourceLabel({ key: 'resource:gold' }), 'Gold');
  assert.equal(resourceLabel({ key: 'resource:starMoney' }), 'Emeralds');
});

test('TeamsTab loads server-saved teams from teamGetAll cache with clone action and refresh', async () => {
  const teams = await readFile(join(root, 'src/components/tabs/TeamsTab.vue'), 'utf8');
  assert.match(teams, /server-teams-section/, 'TeamsTab must have #server-teams-section');
  assert.match(teams, /serverTeams/, 'TeamsTab must compute serverTeams');
  assert.match(teams, /btn-clone-server-team/, 'TeamsTab must have .btn-clone-server-team');
  assert.match(teams, /btn-toolbar-refresh-teams/, 'TeamsTab must have #btn-toolbar-refresh-teams');
  assert.match(teams, /cloneServerTeamToCustom/, 'TeamsTab must implement cloneServerTeamToCustom');
});

test('ItemsTab and TitansTab support unified view switchers, count badges, and export functionality', async () => {
  const items = await readFile(join(root, 'src/components/tabs/ItemsTab.vue'), 'utf8');
  assert.match(items, /categorizedSections/, 'ItemsTab must compute categorizedSections');
  assert.match(items, /btn-toolbar-export-items/, 'ItemsTab must have #btn-toolbar-export-items');
  assert.match(items, /btn-toolbar-refresh-items/, 'ItemsTab must have #btn-toolbar-refresh-items');
  assert.match(items, /getItemName/, 'ItemsTab must resolve in-game names via getItemName');

  const titans = await readFile(join(root, 'src/components/tabs/TitansTab.vue'), 'utf8');
  assert.match(titans, /viewMode/, 'TitansTab must support viewMode');
  assert.match(titans, /btn-toolbar-export-titans/, 'TitansTab must have #btn-toolbar-export-titans');
  assert.match(titans, /btn-toolbar-refresh-titans/, 'TitansTab must have #btn-toolbar-refresh-titans');

  const resources = await readFile(join(root, 'src/components/tabs/ResourcesTab.vue'), 'utf8');
  assert.match(resources, /btn-toolbar-export-resources/, 'ResourcesTab must have #btn-toolbar-export-resources');
  assert.match(resources, /btn-toolbar-refresh-resources/, 'ResourcesTab must have #btn-toolbar-refresh-resources');
});

test('BuildingModal and ResearchModal compute next candidates with simulated levels and dispatch queue actions', async () => {
  const bContent = await readFile(join(root, 'src/components/dialogs/BuildingModal.vue'), 'utf8');
  assert.match(bContent, /simulatedBuildingLevels/, 'BuildingModal must compute simulatedBuildingLevels');
  assert.match(bContent, /SYSTEM_LANDMARK_BUILDING_IDS/, 'BuildingModal must exclude system landmarks');
  assert.match(bContent, /building-queue-action/, 'BuildingModal must dispatch building-queue-action');
  assert.match(bContent, /b\.buildingId \?\? b\.id/, 'BuildingModal must normalize buildingId and id');
  assert.match(bContent, /getMissingRequirements/, 'BuildingModal must check missing requirements');

  const rContent = await readFile(join(root, 'src/components/dialogs/ResearchModal.vue'), 'utf8');
  assert.match(rContent, /researchCenterLevel/, 'ResearchModal must compute researchCenterLevel');
  assert.match(rContent, /simulatedResearchLevels/, 'ResearchModal must compute simulatedResearchLevels');
  assert.match(rContent, /research-queue-action/, 'ResearchModal must dispatch research-queue-action');
  assert.match(rContent, /r\.researchId \?\? r\.id/, 'ResearchModal must normalize researchId and id');
  assert.match(rContent, /isAvailable/, 'ResearchModal must check isAvailable against simulated levels');
});

test('ItemsTab removes redundant list view mode and TitansTab features hover cards, favorites, and element borders', async () => {
  const items = await readFile(join(root, 'src/components/tabs/ItemsTab.vue'), 'utf8');
  assert.doesNotMatch(items, /viewMode === 'list'/, 'ItemsTab must remove redundant list view mode');
  assert.match(items, /viewMode = ref<'grid' \| 'table'>/, 'ItemsTab viewMode must be grid or table');

  const titans = await readFile(join(root, 'src/components/tabs/TitansTab.vue'), 'utf8');
  assert.match(titans, /TitanHoverCard/, 'TitansTab must import and render TitanHoverCard');
  assert.match(titans, /favoriteTitans/, 'TitansTab must track favoriteTitans');
  assert.match(titans, /toggleFavorite/, 'TitansTab must implement toggleFavorite');
  assert.match(titans, /filterFavsOnly/, 'TitansTab must provide favorites filter');
  assert.match(titans, /filterEvolveOnly/, 'TitansTab must provide evolve ready filter');
  assert.match(titans, /ELEMENT_STYLES/, 'TitansTab must style cards and badges by element');
  assert.match(titans, /smallGlow/, 'TitansTab must apply star glow border classes');

  const hoverCard = await readFile(join(root, 'src/components/common/TitanHoverCard.vue'), 'utf8');
  assert.match(hoverCard, /hero-hover-card/, 'TitanHoverCard must use .hero-hover-card styling');
  assert.match(hoverCard, /soulProgress/, 'TitanHoverCard must compute soulProgress');
  assert.match(hoverCard, /skillsList/, 'TitanHoverCard must list titan skills');
  assert.match(hoverCard, /skinsList/, 'TitanHoverCard must list titan skins');
  assert.match(hoverCard, /artifactsList/, 'TitanHoverCard must list titan artifacts');
});

test('TeamsTab supports hero and titan avatars, star glow, hover cards, and mixed power', async () => {
  const teamsTab = await readFile(join(root, 'src/components/tabs/TeamsTab.vue'), 'utf8');

  // Verify component imports
  assert.match(teamsTab, /import HeroHoverCard from/, 'TeamsTab must import HeroHoverCard');
  assert.match(teamsTab, /import TitanHoverCard from/, 'TeamsTab must import TitanHoverCard');
  assert.match(teamsTab, /getTitanMetadata/, 'TeamsTab must import getTitanMetadata');

  // Verify titan differentiation logic
  assert.match(teamsTab, /isTitanId/, 'TeamsTab must define isTitanId helper');
  assert.match(teamsTab, /4000/, 'TeamsTab must check threshold 4000 for titans');
  assert.match(teamsTab, /getMemberSnapshot/, 'TeamsTab must resolve snapshot from heroes or titans');
  assert.match(teamsTab, /getMemberPower/, 'TeamsTab must compute power for both heroes and titans');

  // Verify avatar and star glow rendering with hover cards
  assert.match(teamsTab, /getMemberAvatarUrl/, 'TeamsTab must resolve avatar file for members');
  assert.match(teamsTab, /getMemberStarGlow/, 'TeamsTab must apply star glow aura');
  assert.match(teamsTab, /<TitanHoverCard[\s\S]*?v-if="isTitanId/, 'TeamsTab must render TitanHoverCard for titans');
  assert.match(teamsTab, /<HeroHoverCard[\s\S]*?v-else/, 'TeamsTab must render HeroHoverCard for heroes');
});

test('RaidModal and MonsterModal support team selection, lineup previews, troop capacity and allocation', async () => {
  const raidModal = await readFile(join(root, 'src/components/dialogs/RaidModal.vue'), 'utf8');
  const monsterModal = await readFile(join(root, 'src/components/dialogs/MonsterModal.vue'), 'utf8');
  const squadComposable = await readFile(join(root, 'src/composables/useSquadTeams.ts'), 'utf8');

  // Verify useSquadTeams composable
  assert.match(squadComposable, /export function useSquadTeams/, 'useSquadTeams composable must be exported');
  assert.match(squadComposable, /teamOptions/, 'useSquadTeams must handle teamOptions');
  assert.match(squadComposable, /squadCapacity/, 'useSquadTeams must calculate squad troop capacity');
  assert.match(squadComposable, /allocatedTroops/, 'useSquadTeams must allocate troops across unit types');

  // Verify RaidModal team selection & troops
  assert.match(raidModal, /useSquadTeams/, 'RaidModal must use useSquadTeams');
  assert.match(raidModal, /id="raid-team-select"/, 'RaidModal must feature #raid-team-select');
  assert.match(raidModal, /id="raid-target-select"/, 'RaidModal must feature #raid-target-select');
  assert.match(raidModal, /firstMobId/, 'RaidModal must pass firstMobId in raid-queue-start');
  assert.match(raidModal, /HeroHoverCard/, 'RaidModal must import and render HeroHoverCard');
  assert.match(raidModal, /getHeroGlow/, 'RaidModal must render hero star glow');
  assert.match(raidModal, /troopTypeSummaries/, 'RaidModal must render troop type summary cards');
  assert.match(raidModal, /heroIds,/, 'RaidModal must pass heroIds in raid-queue-start options');
  assert.match(raidModal, /teamId,/, 'RaidModal must pass teamId in raid-queue-start options');

  // Verify MonsterModal team selection & troops
  assert.match(monsterModal, /useSquadTeams/, 'MonsterModal must use useSquadTeams');
  assert.match(monsterModal, /id="monster-team-select"/, 'MonsterModal must feature #monster-team-select');
  assert.match(monsterModal, /id="monster-target-select"/, 'MonsterModal must feature #monster-target-select');
  assert.match(monsterModal, /firstMobId/, 'MonsterModal must pass firstMobId in monster-queue-start');
  assert.match(monsterModal, /HeroHoverCard/, 'MonsterModal must import and render HeroHoverCard');
  assert.match(monsterModal, /getHeroGlow/, 'MonsterModal must render hero star glow');
  assert.match(monsterModal, /troopTypeSummaries/, 'MonsterModal must render troop type summary cards');
  assert.match(monsterModal, /heroIds,/, 'MonsterModal must pass heroIds in monster-queue-start options');
  assert.match(monsterModal, /teamId,/, 'MonsterModal must pass teamId in monster-queue-start options');
});

test('GatheringModal supports mine levels up to 10, real searchMine, found targets dispatch, and march recall', async () => {
  const gather = await readFile(join(root, 'src/components/dialogs/GatheringModal.vue'), 'utf8');

  // Verify 10 mine levels
  assert.match(gather, /v-for="lvl in 10"/, 'GatheringModal must support 10 mine levels');
  assert.match(gather, /11 - lvl/, 'GatheringModal must render descending levels up to 10');

  // Verify searchMine via experimental-rpc
  assert.match(gather, /searchMine/, 'GatheringModal must call searchMine');
  assert.match(gather, /experimental-rpc/, 'GatheringModal must dispatch experimental-rpc');

  // Verify found mines and squad dispatch
  assert.match(gather, /foundMines/, 'GatheringModal must track foundMines');
  assert.match(gather, /dispatchSquadToMine/, 'GatheringModal must implement dispatchSquadToMine');
  assert.match(gather, /attackMine/, 'GatheringModal must call attackMine');

  // Verify march recall
  assert.match(gather, /recallMarch/, 'GatheringModal must implement recallMarch');
  assert.match(gather, /stopMineGathering/, 'GatheringModal must call stopMineGathering');
});

test('SettingsTab supports popupRpcEnabled toggle, socketRefreshMode direct, and piggyback modes', async () => {
  const settings = await readFile(join(root, 'src/components/tabs/SettingsTab.vue'), 'utf8');

  assert.match(settings, /popupRpcEnabled/, 'SettingsTab must track popupRpcEnabled');
  assert.match(settings, /togglePopupRpc/, 'SettingsTab must implement togglePopupRpc');
  assert.match(settings, /id="popup-rpc-enabled"/, 'SettingsTab must feature #popup-rpc-enabled');
  assert.match(settings, /socketRefreshMode/, 'SettingsTab must synchronize socketRefreshMode in chrome.storage');
  assert.match(settings, /id="socket-refresh-mode"/, 'SettingsTab must feature #socket-refresh-mode');
});

test('Header.vue accurately evaluates legend draft and mail indicator states and dispatches mail refresh', async () => {
  const header = await readFile(join(root, 'src/components/common/Header.vue'), 'utf8');

  // Legend Draft checks
  assert.match(header, /stageId >= 1 && stageId <= 6/, 'Header must check stages 1 through 6 for active Legend Draft');
  assert.match(header, /draftStageDescription/, 'Header must describe draft stages');
  assert.match(header, /draftTooltip/, 'Header must provide dynamic tooltip for draft alert');
  assert.doesNotMatch(header, /stageId !== 'finished'/, 'Header must not use naive stageId !== finished condition');

  // Mail checks
  assert.match(header, /unclaimedLetters/, 'Header must compute actual unclaimed letters');
  assert.match(header, /unclaimedReports/, 'Header must compute actual unclaimed reports');
  assert.match(header, /refreshMail/, 'Header must implement refreshMail');
  assert.match(header, /@click="refreshMail"/, 'Header must bind @click="refreshMail" on #mail-badge');
  assert.match(header, /name:\s*'getPage',\s*feature:\s*'report'/, 'refreshMail must request getPage:report');
  assert.match(header, /name:\s*'mailGetAll'/, 'refreshMail must request mailGetAll');
});

test('App.vue and tab toolbars use responsive container widths and balanced toolbar layouts', async () => {
  const app = await readFile(join(root, 'entrypoints/popup/App.vue'), 'utf8');
  assert.match(app, /max-w-7xl/, 'App.vue must constrain layout with max-w-7xl to prevent overly wide stretching on Full HD');
  assert.match(app, /items-center/, 'App.vue wrapper must center container');

  const heroes = await readFile(join(root, 'src/components/tabs/HeroesTab.vue'), 'utf8');
  assert.match(heroes, /flex-col xl:flex-row/, 'HeroesTab must use responsive flex-col xl:flex-row toolbar layout');
  assert.match(heroes, /btn-toolbar-export-heroes/, 'HeroesTab must keep export button');
  assert.match(heroes, /btn-toolbar-refresh-heroes/, 'HeroesTab must keep refresh button');

  const titans = await readFile(join(root, 'src/components/tabs/TitansTab.vue'), 'utf8');
  assert.match(titans, /flex-col xl:flex-row/, 'TitansTab must use responsive flex-col xl:flex-row toolbar layout');
  assert.match(titans, /btn-toolbar-export-titans/, 'TitansTab must keep export button');
  assert.match(titans, /btn-toolbar-refresh-titans/, 'TitansTab must keep refresh button');

  const items = await readFile(join(root, 'src/components/tabs/ItemsTab.vue'), 'utf8');
  assert.match(items, /flex-col xl:flex-row/, 'ItemsTab must use responsive flex-col xl:flex-row toolbar layout');
  assert.match(items, /btn-toolbar-export-items/, 'ItemsTab must keep export button');
  assert.match(items, /btn-toolbar-refresh-items/, 'ItemsTab must keep refresh button');

  const resources = await readFile(join(root, 'src/components/tabs/ResourcesTab.vue'), 'utf8');
  assert.match(resources, /flex-col lg:flex-row/, 'ResourcesTab must use responsive flex-col lg:flex-row toolbar layout');
  assert.match(resources, /btn-toolbar-export-resources/, 'ResourcesTab must keep export button');
  assert.match(resources, /btn-toolbar-refresh-resources/, 'ResourcesTab must keep refresh button');
});

test('Experimental data helpers, mine configurations, and RPC payloads are robust and non-null', async () => {
  const {
    getMineConfigId,
    mineConfigs,
    buildMineSearchCall,
    bossConfigId,
    soloMonsterConfigIds,
    rallyWaitOptions,
    allocateTroops,
  } = await import('../src/utils/experimentalData.ts');

  // Mine levels 1 to 10 for all 4 resources
  for (const type of ['wood', 'food', 'stone', 'iron', 'gold']) {
    for (let lvl = 1; lvl <= 10; lvl++) {
      const cfgId = getMineConfigId(type, lvl);
      assert.ok(Number.isInteger(cfgId) && cfgId > 0, `Mine config for ${type} lvl ${lvl} must be positive integer`);
    }
  }

  // Specifically verify Level 10
  assert.equal(getMineConfigId('food', 10), 68);
  assert.equal(getMineConfigId('gold', 10), 68, 'Gold must map to food configs');
  assert.equal(getMineConfigId('wood', 10), 58);
  assert.equal(getMineConfigId('stone', 10), 78);
  assert.equal(getMineConfigId('iron', 10), 88);

  // buildMineSearchCall must never have [null] in mineConfigIds
  const searchCall = buildMineSearchCall('map-123', { x: 100, y: 200 }, 'gold', 10);
  assert.deepEqual(searchCall, {
    name: 'searchMine',
    feature: 'mine',
    args: {
      mapId: 'map-123',
      mineConfigIds: [68],
      fullOnly: true,
      center: { x: 100, y: 200 },
    },
  });

  // Boss config ID
  assert.equal(bossConfigId(1), 60);
  assert.equal(bossConfigId(30), 89);
  assert.equal(bossConfigId(0), null);

  // Solo monster configs
  assert.deepEqual(soloMonsterConfigIds(1), [23, 53]);
  assert.deepEqual(soloMonsterConfigIds(30), [52, 88]);

  // Rally wait options
  assert.deepEqual(rallyWaitOptions, [60, 300, 900, 1800]);

  // Verify GatheringModal, RaidModal, MonsterModal don't access undefined globals for RPC building
  const gather = await readFile(join(root, 'src/components/dialogs/GatheringModal.vue'), 'utf8');
  assert.doesNotMatch(gather, /\[exp\?\.mineConfigId/, 'GatheringModal must not produce [null] config IDs');
  assert.match(gather, /getMineConfigId\(manualMineType\.value,\s*manualMineLevel\.value\)/);

  const raid = await readFile(join(root, 'src/components/dialogs/RaidModal.vue'), 'utf8');
  assert.match(raid, /bossConfigId\(bossLevel\.value\)/);
  assert.match(raid, /15 minutes \(900s\)/, 'RaidModal must offer valid 15m (900s) rally wait option');
  assert.doesNotMatch(raid, /10 minutes \(600s\)/, 'RaidModal must not offer invalid 600s option');

  const bg = await readFile(join(root, 'extension/background.js'), 'utf8');
  assert.match(
    bg,
    /stored\.rpcCache\?\.accountStatus\?\.data\?\.id\s*\?\?\s*stored\.rpcCache\?\.userGetInfo\?\.data\?\.id/,
    'Background controller.start must fall back to userGetInfo.data.id'
  );
});
