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
  assert.match(bContent, /Execution Logs/, 'Must have Execution Logs');
  assert.match(bContent, /clearLogs/, 'Must have clearLogs in BuildingModal');

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
  assert.match(rContent, /Execution Logs/, 'Must have Execution Logs');
  assert.match(rContent, /clearLogs/, 'Must have clearLogs in ResearchModal');
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

test('CampaignRaidModal has Recipe Tree hierarchy, loop controls, auto-stop, max button, and drops sync', async () => {
  const camp = await readFile(join(root, 'src/components/dialogs/CampaignRaidModal.vue'), 'utf8');
  assert.match(camp, /id="campaign-dialog"/, 'Must have #campaign-dialog');
  assert.match(camp, /id="campaign-dialog-title"/, 'Must have #campaign-dialog-title');
  assert.match(camp, /id="campaign-dialog-status"/, 'Must have #campaign-dialog-status');
  assert.match(camp, /id="campaign-dialog-body"/, 'Must have #campaign-dialog-body');
  assert.match(camp, /id="campaign-mission-input"/, 'Must have #campaign-mission-input');
  assert.match(camp, /buildGearRecipeTree/, 'Must use buildGearRecipeTree');
  assert.match(camp, /candidateMissions/, 'Must compute candidate missions');
  assert.match(camp, /Crafting Recipe Tree/, 'Must have Crafting Recipe Tree');

  // Loop & Max & Stop controls
  assert.match(camp, /id="campaign-raid-sequential"/, 'Must feature #campaign-raid-sequential checkbox');
  assert.match(camp, /campaignRaidSequential/, 'Must track campaignRaidSequential');
  assert.match(camp, /id="campaign-raid-max"/, 'Must feature #campaign-raid-max button');
  assert.match(camp, /maxPossibleTimes/, 'Must calculate maxPossibleTimes based on current energy and unit cost');
  assert.match(camp, /id="campaign-raid-stop"/, 'Must feature #campaign-raid-stop button when loop is running');
  assert.match(camp, /abortCampaignRaidLoop/, 'Must support abortCampaignRaidLoop flag');

  // RPC method and arguments
  assert.match(camp, /name:\s*'missionRaid'/, 'Must dispatch missionRaid RPC name');
  assert.match(camp, /id:\s*Number\(missionId\.value\)/, 'Must specify id argument instead of missionId');

  // Target item stop logic
  assert.match(camp, /wasInitiallyFulfilled/, 'Must check wasInitiallyFulfilled to permit intentional extra raids');
  assert.match(camp, /isNodeRequirementMet/, 'Must check isNodeRequirementMet for recipe target');

  // Rewards card matching HTML
  assert.match(camp, /id="campaign-raid-results"/, 'Must feature #campaign-raid-results card');
  assert.match(camp, /latestRaidResult/, 'Must evaluate latestRaidResult from cache and local results');
  assert.match(camp, /mergeDropsToInventory/, 'Must merge raid drops into inventory locally');

  // Direct mode and RPC enablement
  assert.match(camp, /ensureRpcEnabled/, 'Must ensure RPC is enabled before raid loop');
  assert.match(camp, /switchToDirectMode/, 'Must provide 1-click switch to Direct mode');
  assert.match(camp, /playable_getAvailable/, 'Must dispatch playable_getAvailable');
  assert.match(camp, /worldStars_getAvailable/, 'Must dispatch worldStars_getAvailable');

  // Intercept & RPC cache verification
  const intercept = await readFile(join(root, 'extension/intercept.js'), 'utf8');
  assert.match(intercept, /'missionRaid'/, 'intercept.js helperActionMethods must include missionRaid');
  assert.match(intercept, /'mission_raid'/, 'intercept.js helperActionMethods must include mission_raid');
  assert.match(intercept, /'playable_getAvailable'/, 'intercept.js piggybackMethods must include playable_getAvailable');
  assert.match(intercept, /'worldStars_getAvailable'/, 'intercept.js piggybackMethods must include worldStars_getAvailable');

  const rpcCache = await readFile(join(root, 'extension/rpc-cache.js'), 'utf8');
  assert.match(rpcCache, /entry\.key === 'lastCampaignRaidResult'[\s\S]*?next\.inventoryGet/, 'rpc-cache must synchronize lastCampaignRaidResult drops into next.inventoryGet');
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
  assert.match(heroesTab, /bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden/, 'HeroesTab must render soul progress track in grid cards');
  assert.match(heroesTab, /h\.soulProg\.canEvolve \? 'bg-emerald-500' : 'bg-blue-500'/, 'HeroesTab must render soul progress bar with canEvolve highlight');

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
  const { normalizeArray, calculateTroopMax, CAMP_BUILDING_IDS } = await import('../src/utils/troops.ts');
  assert.deepEqual(normalizeArray(null), []);
  assert.deepEqual(normalizeArray(undefined), []);
  assert.deepEqual(normalizeArray([1, 2, 3]), [1, 2, 3]);
  assert.deepEqual(normalizeArray({ a: 1, b: 2 }), [1, 2]);

  // Camp Building mappings
  assert.equal(CAMP_BUILDING_IDS[0], 41, 'Marksmen Camp is building 41');
  assert.equal(CAMP_BUILDING_IDS[1], 42, 'Spearmen Camp is building 42');
  assert.equal(CAMP_BUILDING_IDS[2], 40, 'Infantry Camp is building 40');

  // Dynamic capacity from Camp Level + Expansion Researches
  const mockCache = {
    buildingStatus: {
      data: {
        buildings: [
          { buildingId: 41, level: 10 }, // Marksmen Camp Lv.10
          { buildingId: 42, level: 5 },  // Spearmen Camp Lv.5
          { buildingId: 40, level: 8 },  // Infantry Camp Lv.8
        ]
      }
    },
    researchStatus: {
      data: {
        researches: [
          { researchId: 3, level: 4 }, // Camp Expansion I Lv.4 (+2000)
        ]
      }
    }
  };

  // Marksmen: 5000 + 10 * 1500 + 4 * 500 = 22,000
  assert.equal(calculateTroopMax(0, mockCache, 12000), 22000);
  // Spearmen: 5000 + 5 * 1500 + 4 * 500 = 14,500
  assert.equal(calculateTroopMax(1, mockCache, 5000), 14500);
  // Fallback when current total exceeds capacity:
  assert.equal(calculateTroopMax(1, mockCache, 18000), 18000);
  // Fallback when no buildings:
  assert.equal(calculateTroopMax(0, {}, 3000), 10000);

  const overview = await readFile(join(root, 'src/components/dashboard/TroopsOverview.vue'), 'utf8');
  assert.match(overview, /normalizeArray/, 'TroopsOverview must use normalizeArray');
  assert.match(overview, /isSyncLoading/, 'TroopsOverview must handle isSyncLoading');
  assert.match(overview, /isHealLoading/, 'TroopsOverview must handle isHealLoading');
  assert.doesNotMatch(overview, /<input[\s\S]*?troop-max-input/, 'TroopsOverview must not have user input for troop max target');
  assert.match(overview, /Cap:\s*<strong/, 'TroopsOverview must render read-only Cap limit');
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
  assert.match(squadComposable, /rallyAction/, 'useSquadTeams must incorporate rallyAction into mapContext');

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
  assert.match(raidModal, /refreshMapCoordinates/, 'RaidModal must provide refreshMapCoordinates');

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
  assert.match(monsterModal, /refreshMapCoordinates/, 'MonsterModal must provide refreshMapCoordinates');
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

test('Header march tooltips provide comprehensive details on time, stage, heroes, and troops for gather, raid, and monster', async () => {
  const {
    formatMarchDuration,
    formatMarchTooltip,
    formatRaidQueueTooltip,
    formatMonsterQueueTooltip,
    formatAutoGatherTooltip,
  } = await import('../src/utils/marchTooltip.ts');

  const now = 1000000000;

  // 1. Duration formatting
  assert.equal(formatMarchDuration(0), 'Due now');
  assert.equal(formatMarchDuration(-500), 'Due now');
  assert.equal(formatMarchDuration(45000), '0m 45s');
  assert.equal(formatMarchDuration(90000), '1m 30s');
  assert.equal(formatMarchDuration(3700000), '1h 1m');

  // 2. Gathering march tooltip
  const gatherMarch = {
    mineId: 'mine-1',
    kind: 'wood',
    mineConfigId: 58, // Wood Level 10
    stage: 'gathering',
    endsAt: now + 120000,
    team: {
      heroIds: [16, 67],
      units: [
        { id: 7, count: 5000 },
        { id: 17, count: 5000 },
      ],
    },
  };
  const gatherTooltip = formatMarchTooltip(gatherMarch, now, {});
  assert.match(gatherTooltip, /Gathering · Wood Mine \(Lv\.10\)/);
  assert.match(gatherTooltip, /Status: Gathering resources · 2m 00s/);
  assert.match(gatherTooltip, /Heroes \(2\/5\):/);
  assert.match(gatherTooltip, /Troops: 10,000 troops/);
  assert.match(gatherTooltip, /\(Click to view Gathering dialog\)/);

  // 3. Raid march tooltip
  const raidMarch = {
    kind: 'raid',
    rally: {
      mobConfigId: 80, // Level 21 Boss (80 - 59 = 21)
      leaderName: 'HeroKing',
      target: 'Boss Level 21',
      arrivalAt: now + 65000,
      team: {
        heroIds: [16, 67, 14, 33, 38],
        units: [{ id: 7, count: 125000 }],
      },
    },
    stage: 'moveToTargetInRally',
    endsAt: now + 65000,
  };
  const raidTooltip = formatMarchTooltip(raidMarch, now, {});
  assert.match(raidTooltip, /Rally Raid · Level 21 Boss/);
  assert.match(raidTooltip, /Leader: HeroKing/);
  assert.match(raidTooltip, /Status: Traveling to boss · 1m 05s to arrival/);
  assert.match(raidTooltip, /Heroes \(5\/5\):/);
  assert.match(raidTooltip, /Troops: 125,000 troops/);
  assert.match(raidTooltip, /\(Click to view Raid dialog\)/);

  // 4. Monster march tooltip
  const monsterMarch = {
    kind: 'attack',
    mobConfigId: 37, // Level 15 Monster (37 - 22 = 15)
    stage: 'moveToTargetInSolo',
    targetArrivalAt: now + 30000,
    endsAt: now + 30000,
    team: {
      heroIds: [16, 67, 14],
      units: [{ id: 7, count: 80000 }],
    },
  };
  const monsterTooltip = formatMarchTooltip(monsterMarch, now, {});
  assert.match(monsterTooltip, /Monster Attack · Level 15 Monster/);
  assert.match(monsterTooltip, /Status: Marching to monster · 0m 30s to arrival/);
  assert.match(monsterTooltip, /Heroes \(3\/5\):/);
  assert.match(monsterTooltip, /Troops: 80,000 troops/);
  assert.match(monsterTooltip, /\(Click to view Monster dialog\)/);

  // 5. Standing queue tooltips
  const raidQTooltip = formatRaidQueueTooltip({
    phase: 'searching',
    options: { level: 25, count: 5, heroIds: [16, 67] },
    bossQueue: { remain_raid_count: 4 },
  });
  assert.match(raidQTooltip, /Raid Queue Active \(Level 25 Boss\)/);
  assert.match(raidQTooltip, /Status: searching · Rounds left: 4/);
  assert.match(raidQTooltip, /Lineup \(2\/5\):/);

  const monsterQTooltip = formatMonsterQueueTooltip({
    phase: 'attacking',
    options: { level: 12, count: 3, heroIds: [16] },
  });
  assert.match(monsterQTooltip, /Monster Queue Active \(Level 12 Monster\)/);
  assert.match(monsterQTooltip, /Status: attacking · Target level: 12/);

  const autoGatherTooltip = formatAutoGatherTooltip({
    enabled: true,
    mineType: 'iron',
    mineLevel: 10,
    maxMarches: 4,
  });
  assert.match(autoGatherTooltip, /Auto-Gathering Active/);
  assert.match(autoGatherTooltip, /Target: IRON \(Lv\.10\) · Max Marches: 4/);

  // 6. Header template bindings
  const header = await readFile(join(root, 'src/components/common/Header.vue'), 'utf8');
  assert.match(header, /formatMarchTooltip\(item\.march,\s*now,\s*cache\)/, 'Header must bind rich formatMarchTooltip');
  assert.match(header, /formatRaidQueueTooltip/, 'Header must bind formatRaidQueueTooltip on standing raid queue');
  assert.match(header, /formatMonsterQueueTooltip/, 'Header must bind formatMonsterQueueTooltip on standing monster queue');
  assert.match(header, /formatAutoGatherTooltip/, 'Header must bind formatAutoGatherTooltip on standing auto gather');
});

test('Hover cards teleport to body with viewport-aware positioning and next candidate cards use icon-only buttons', async () => {
  // 1. Hover cards teleport and composable integration
  const heroHoverCard = await readFile(join(root, 'src/components/common/HeroHoverCard.vue'), 'utf8');
  assert.match(heroHoverCard, /<Teleport to="body">/, 'HeroHoverCard must teleport to body to escape dialog overflow');
  assert.match(heroHoverCard, /useHoverCardPosition/, 'HeroHoverCard must use useHoverCardPosition');

  const titanHoverCard = await readFile(join(root, 'src/components/common/TitanHoverCard.vue'), 'utf8');
  assert.match(titanHoverCard, /<Teleport to="body">/, 'TitanHoverCard must teleport to body to escape dialog overflow');
  assert.match(titanHoverCard, /useHoverCardPosition/, 'TitanHoverCard must use useHoverCardPosition');

  const usePos = await readFile(join(root, 'src/composables/useHoverCardPosition.ts'), 'utf8');
  assert.match(usePos, /spaceBelow < 340 && spaceAbove > spaceBelow/, 'useHoverCardPosition must flip upward when bottom space is constrained');
  assert.match(usePos, /position:\s*'fixed'/, 'useHoverCardPosition must position with fixed coordinates');
  assert.match(usePos, /Math\.max\(8,\s*Math\.min\(winW - cardWidth/, 'useHoverCardPosition must clamp within viewport horizontally');

  // 2. Building next candidate icon-only buttons
  const buildingModal = await readFile(join(root, 'src/components/dialogs/BuildingModal.vue'), 'utf8');
  assert.match(buildingModal, /locateBuilding/, 'BuildingModal must define locateBuilding');
  assert.match(buildingModal, /<span[^>]*>🔍<\/span>/, 'BuildingModal must provide icon-only search/locate button');
  assert.match(buildingModal, /<span[^>]*>➕<\/span>/, 'BuildingModal must provide icon-only queue button');
  assert.match(buildingModal, /<span[^>]*>🔨<\/span>/, 'BuildingModal must provide icon-only upgrade button');

  // 3. Research next candidate icon-only buttons and label
  const researchModal = await readFile(join(root, 'src/components/dialogs/ResearchModal.vue'), 'utf8');
  assert.match(researchModal, /locateResearch/, 'ResearchModal must define locateResearch');
  assert.match(researchModal, /<span[^>]*>🔍<\/span>/, 'ResearchModal must provide icon-only search/locate button');
  assert.match(researchModal, /<span[^>]*>➕<\/span>/, 'ResearchModal must provide icon-only queue button');
  assert.match(researchModal, /<span[^>]*>🔬<\/span>/, 'ResearchModal must provide icon-only research button');
  assert.match(researchModal, /:\s*`Lv\.\s*1\$\{r\.maxLevel/, 'ResearchModal candidate label must omit the word Research');
  assert.doesNotMatch(researchModal, /:\s*`Research Lv\.\s*1/, 'ResearchModal candidate label must not contain "Research Lv."');
});

test('Resilient object-array handling and healing RPC dispatch permissions prevent TypeError regressions', async () => {
  // 1. Intercept methods for healing and training
  const intercept = await readFile(join(root, 'extension/intercept.js'), 'utf8');
  assert.match(intercept, /'startHealing'/, 'intercept.js must register startHealing in helperActionMethods');
  assert.match(intercept, /'completeTraining'/, 'intercept.js must register completeTraining in helperActionMethods');
  assert.match(intercept, /'startTraining'/, 'intercept.js must register startTraining in helperActionMethods');
  assert.match(intercept, /'getHealing'/, 'intercept.js must register getHealing in piggybackMethods');
  assert.match(intercept, /'getTrainings'/, 'intercept.js must register getTrainings in piggybackMethods');

  // 2. Experimental data helpers resilient against object/dictionary payloads
  const { availableHeroIds, allocateTroops, buildSquad, teamOptions } = await import('../src/utils/experimentalData.ts');

  // Object-shaped squads and marches (e.g. PHP sparse array or dictionary)
  const objectSummary = {
    squads: {
      '0': { id: 'sq-1', heroes: { '0': { id: 16 } } },
      '1': { id: 'sq-2', heroes: { '0': { id: 67 } } },
    },
    available: {
      '0': { unitId: 7, count: 500 },
      '1': { unitId: 17, count: 500 },
    },
  };
  const objectMarches = {
    '1': { team: { heroIds: { '0': 14 } } },
  };

  // Must not throw "TypeError: ((intermediate value) || []).flatMap is not a function" or "object is not iterable"
  const avail = availableHeroIds({ 16: { power: 100 }, 67: { power: 200 }, 14: { power: 300 }, 33: { power: 400 } }, objectSummary, objectMarches);
  assert.deepEqual(avail, [33], 'Available hero IDs must exclude busy heroes even with object payloads');

  const allocated = allocateTroops(objectSummary, 200);
  assert.ok(allocated.length > 0, 'allocateTroops must succeed with object-shaped available inventory');

  const squad = buildSquad({ '0': 16, '1': 67, '2': 14, '3': 33, '4': 38 }, { '0': { unitId: 7, count: 50 } });
  assert.ok(squad && squad.heroes.length === 5, 'buildSquad must succeed with object-shaped hero and unit inputs');

  const customTeamsObj = { '0': { id: 't1', name: 'Team Alpha', heroIds: { '0': 16, '1': 67, '2': 14, '3': 33, '4': 38 } } };
  const opts = teamOptions({}, { 16: { power: 10 }, 67: { power: 20 }, 14: { power: 30 }, 33: { power: 40 }, 38: { power: 50 } }, customTeamsObj);
  assert.ok(opts.some((o) => o.id === 'custom:t1'), 'teamOptions must process object-shaped custom teams');

  // 3. Raid modal mobConfigIds safe check
  const raidModal = await readFile(join(root, 'src/components/dialogs/RaidModal.vue'), 'utf8');
  assert.match(raidModal, /if \(Array\.isArray\(mobCfgs\)\)/, 'RaidModal must guard mobConfigIds array check');
  assert.doesNotMatch(raidModal, /searchData\.value\?\.mobConfigIds\?\.includes/, 'RaidModal must not use unguarded mobConfigIds.includes');

  // 4. Header activeMarches normalizeArray usage
  const header = await readFile(join(root, 'src/components/common/Header.vue'), 'utf8');
  assert.match(header, /normalizeArray\(cache\.value\.marchStatus\?\.data\?\.marches\)/, 'Header must use normalizeArray for marchStatus.data.marches');
});

test('Prevent TypeError Symbol(Symbol.iterator) regressions on startup with object-shaped storage/cache', async () => {
  // 1. GuildVersusModal chestNumbers safe normalization
  const guildVersusModal = await readFile(join(root, 'src/components/dialogs/GuildVersusModal.vue'), 'utf8');
  assert.match(guildVersusModal, /const raw = vsStatus\.value\.chestNumbers;/, 'GuildVersusModal must safely extract raw chestNumbers');
  assert.match(guildVersusModal, /Object\.keys\(raw\)\.map\(Number\)/, 'GuildVersusModal must handle object dictionary chestNumbers');

  // 2. TowerModal buff order safe normalization
  const towerModal = await readFile(join(root, 'src/components/dialogs/TowerModal.vue'), 'utf8');
  assert.match(towerModal, /Array\.isArray\(\(globalThis as any\)\.hwaHelperTowerAutomation\?\.DEFAULT_BUFF_PRIORITY\)/, 'TowerModal must verify DEFAULT_BUFF_PRIORITY is array');
  assert.match(towerModal, /const savedList = Array\.isArray\(saved\) \? saved : \[\];/, 'TowerModal must ensure savedList is array');

  // 3. useSquadTeams availableHeroIds safe spread
  const squadTeams = await readFile(join(root, 'src/composables/useSquadTeams.ts'), 'utf8');
  assert.match(squadTeams, /\[\.\.\.normalizeArray\(availableHeroIds\.value\)\]/, 'useSquadTeams must normalize availableHeroIds before spread');

  // 4. QueuesOverview must not mount duplicate dialog instances
  const queuesOverview = await readFile(join(root, 'src/components/dashboard/QueuesOverview.vue'), 'utf8');
  assert.doesNotMatch(queuesOverview, /<BuildingModal/, 'QueuesOverview must not duplicate BuildingModal instance');
  assert.doesNotMatch(queuesOverview, /<ResearchModal/, 'QueuesOverview must not duplicate ResearchModal instance');
  assert.match(queuesOverview, /openModal\('building'\)/, 'QueuesOverview must use openModal for building dialog');
  assert.match(queuesOverview, /openModal\('research'\)/, 'QueuesOverview must use openModal for research dialog');

  // 5. BuildingModal & ResearchModal queue iterations
  const buildingModal = await readFile(join(root, 'src/components/dialogs/BuildingModal.vue'), 'utf8');
  assert.match(buildingModal, /for \(const q of normalizeArray\(rawQueues\.value\)\)/, 'BuildingModal must normalize rawQueues');
  assert.match(buildingModal, /for \(const item of normalizeArray\(buildingQueue\.value\?\.items\)\)/, 'BuildingModal must normalize buildingQueue.items');

  const researchModal = await readFile(join(root, 'src/components/dialogs/ResearchModal.vue'), 'utf8');
  assert.match(researchModal, /for \(const q of normalizeArray\(rawQueues\.value\)\)/, 'ResearchModal must normalize rawQueues');
  assert.match(researchModal, /for \(const item of normalizeArray\(researchQueue\.value\?\.items\)\)/, 'ResearchModal must normalize researchQueue.items');

  // 6. QuestDetailModal safe normalization
  const questDetailModal = await readFile(join(root, 'src/components/dialogs/QuestDetailModal.vue'), 'utf8');
  assert.match(questDetailModal, /normalizeArray\(rawQAll\)/, 'QuestDetailModal must normalize rawQAll');
  assert.match(questDetailModal, /normalizeArray\(ev\.groups\)/, 'QuestDetailModal must normalize ev.groups');
  assert.match(questDetailModal, /\[\.\.\.normalizeArray\(list\)\]/, 'QuestDetailModal must normalize list before spread');
});

test('Header tooltips use BaseTooltip to avoid browser native title flicker during countdown updates', async () => {
  const header = await readFile(join(root, 'src/components/common/Header.vue'), 'utf8');
  assert.match(header, /import BaseTooltip from '@\/src\/components\/common\/BaseTooltip\.vue'/, 'Header must import BaseTooltip');
  assert.match(header, /<BaseTooltip[\s\S]*?formatMarchTooltip\(item\.march,\s*now,\s*cache\)/, 'Header must wrap marches in BaseTooltip');
  assert.match(header, /<BaseTooltip[\s\S]*?formatRaidQueueTooltip\(raidQueue\)/, 'Header must wrap raid queue in BaseTooltip');
  assert.match(header, /<BaseTooltip[\s\S]*?formatMonsterQueueTooltip\(monsterQueue\)/, 'Header must wrap monster queue in BaseTooltip');
  assert.match(header, /<BaseTooltip[\s\S]*?formatAutoGatherTooltip\(autoGatherSettings\)/, 'Header must wrap auto gather in BaseTooltip');
  assert.match(header, /<BaseTooltip[\s\S]*?draftTooltip/, 'Header must wrap draft alert in BaseTooltip');

  const baseTooltip = await readFile(join(root, 'src/components/common/BaseTooltip.vue'), 'utf8');
  assert.match(baseTooltip, /<Teleport to="body">/, 'BaseTooltip must teleport tooltip to body');
  assert.match(baseTooltip, /role="tooltip"/, 'BaseTooltip must provide role="tooltip"');
  assert.match(baseTooltip, /coords\.left/, 'BaseTooltip must dynamically calculate position');
});

test('BuildingModal and ResearchModal support queuing upgrades with projected prerequisites and special resource badge', async () => {
  const bContent = await readFile(join(root, 'src/components/dialogs/BuildingModal.vue'), 'utf8');
  // Must NOT filter out isUpgrading buildings from upgrade candidates
  assert.doesNotMatch(bContent, /if\s*\(b\.isUpgrading\)\s*return\s*false;/, 'BuildingModal must not exclude isUpgrading from candidates');
  assert.match(bContent, /if\s*\(b\.id\s*!==\s*20\s*&&\s*b\.nextLevel\s*>\s*hallLevel\)\s*return\s*false;/, 'BuildingModal must check nextLevel > hallLevel');
  assert.match(bContent, /v-if="activeQueues\.length === 0 && !b\.isUpgrading && hasEnoughBuildingResources\(b\)"/, 'Building direct upgrade button must check !b.isUpgrading');

  const rContent = await readFile(join(root, 'src/components/dialogs/ResearchModal.vue'), 'utf8');
  // Must NOT filter out isResearching tech from upgrade candidates
  assert.doesNotMatch(rContent, /if\s*\(r\.isResearching\)\s*return\s*false;/, 'ResearchModal must not exclude isResearching from candidates');
  assert.match(rContent, /v-if="activeQueues\.length === 0 && !r\.isResearching && hasEnoughResearchResources\(r\)"/, 'Research direct upgrade button must check !r.isResearching');
  assert.match(rContent, /buildingQueueItems/, 'ResearchModal must track buildingQueueItems for projected Research Center level');
  assert.match(rContent, /special-resource-icon/, 'ResearchModal must render special-resource-icon');
  assert.match(rContent, /🎖️/, 'ResearchModal must render medal badge for special resource requirements');

  // Verify requiresSpecialResource helper in extension/research-data.js
  await import('../extension/research-data.js');
  const rHelper = globalThis.hwaHelperResearchData;
  assert.equal(typeof rHelper?.requiresSpecialResource, 'function', 'hwaHelperResearchData must export requiresSpecialResource');

  // Find a research requiring honor marks or special material
  let specialFound = false;
  let regularFound = false;
  for (const [idStr, levels] of Object.entries(rHelper.data || {})) {
    const rId = Number(idStr);
    for (const [lvlStr, meta] of Object.entries(levels || {})) {
      const lvl = Number(lvlStr);
      if (meta?.c && Object.keys(meta.c).some((m) => Number(m) === 12 || Number(m) > 5)) {
        assert.equal(rHelper.requiresSpecialResource(rId, lvl), true, `Research ${rId} Lv.${lvl} must require special resource`);
        specialFound = true;
      } else if (meta?.c && Object.keys(meta.c).length > 0) {
        assert.equal(rHelper.requiresSpecialResource(rId, lvl), false, `Research ${rId} Lv.${lvl} must not require special resource`);
        regularFound = true;
      }
      if (specialFound && regularFound) break;
    }
    if (specialFound && regularFound) break;
  }
  assert.ok(specialFound, 'At least one tech must require special resource');
  assert.ok(regularFound, 'At least one tech must require only standard resources');
});

test('Raid queue allows creation during active guild raid and Dashboard displays queue badges for raid and monster', async () => {
  // 1. Check DashboardTab badges
  const dashboard = await readFile(join(root, 'src/components/dashboard/DashboardTab.vue'), 'utf8');
  assert.match(dashboard, /id="open-raid-dialog-badge"/, 'DashboardTab must render open-raid-dialog-badge');
  assert.match(dashboard, /id="open-monster-dialog-badge"/, 'DashboardTab must render open-monster-dialog-badge');
  assert.match(dashboard, /data-queue-count="raidQueueCount"/, 'open-raid-dialog-badge must bind data-queue-count');
  assert.match(dashboard, /data-queue-count="monsterQueueCount"/, 'open-monster-dialog-badge must bind data-queue-count');
  assert.match(dashboard, /raidQueueCount/, 'DashboardTab must compute raidQueueCount');
  assert.match(dashboard, /monsterQueueCount/, 'DashboardTab must compute monsterQueueCount');

  // 2. Check RaidModal status and active raid phase support
  const raidModal = await readFile(join(root, 'src/components/dialogs/RaidModal.vue'), 'utf8');
  assert.match(raidModal, /waiting_rally/, 'RaidModal must handle waiting_rally phase');
  assert.match(raidModal, /currentRaidPhase/, 'RaidModal must compute currentRaidPhase');
  assert.match(raidModal, /currentRaidStageIcon/, 'RaidModal must compute currentRaidStageIcon');
  assert.match(raidModal, /queueStatusLabel/, 'RaidModal must compute queueStatusLabel');

  // 3. Test extension/raid-queue.js active raid handling
  await import('../extension/experimental-data.js');
  await import('../extension/raid-queue.js');
  const controller = globalThis.hwaHelperRaidQueue;
  assert.equal(typeof controller.start, 'function');
  assert.equal(typeof controller.advance, 'function');

  const heroes = { 1: { id: 1 }, 2: { id: 2 }, 3: { id: 3 }, 4: { id: 4 }, 5: { id: 5 } };
  const baseCache = {
    heroGetAll: { data: heroes },
    'getUnitSummary:unit': {
      data: {
        squads: [],
        available: [{ unitId: 7, count: 5000 }, { unitId: 17, count: 5000 }, { unitId: 27, count: 5000 }]
      }
    },
    experimentalRallySearch: {
      data: { mapId: 'map1', mobConfigIds: [60], mobs: [{ mobId: 'boss_1' }] }
    },
    marchStatus: {
      data: {
        marches: [
          {
            id: 'march_active_1',
            rally: { id: 'rally_active_1', waitUntil: Date.now() + 180000, outboundMs: 30000 },
            endsAt: Date.now() + 210000
          }
        ]
      }
    }
  };

  const options = {
    mapId: 'map1',
    center: { x: 10, y: 20 },
    level: 1,
    heroIds: [1, 2, 3, 4, 5],
    waitSeconds: 60,
    minMembers: 4,
    autoCancel: true,
    count: 3,
    firstMobId: 'boss_1'
  };

  const now = Date.now();
  // With active raid in progress, start() must succeed and enter waiting_rally!
  const transition = controller.start(options, 1, 100, now, baseCache, { defaultHero: 600, base: 950 });
  assert.ok(transition, 'start() must return a transition even with active raid');
  assert.equal(transition.state.phase, 'waiting_rally', 'Phase must be waiting_rally while active raid is pending');
  assert.equal(transition.state.bossQueue.remain_raid_count, 3, 'remain_raid_count must match options.count');
  assert.equal(transition.calls[0].name, 'getMarches', 'Must poll getMarches while waiting');

  // Advance while raid still in progress: stays in waiting_rally
  const advance1 = controller.advance(transition.state, null, baseCache, now + 1000, { defaultHero: 600, base: 950 });
  assert.equal(advance1.state.phase, 'waiting_rally', 'Must remain in waiting_rally while active raid has not attacked');

  // Simulate active raid has attacked ("tiến công thành công" -> returning to outpost)
  const returningCache = {
    ...baseCache,
    marchStatus: {
      data: {
        marches: [
          {
            id: 'march_active_1',
            stage: 'returnToOutpost',
            result: 'win',
            rally: { id: 'rally_active_1', returnAt: now + 30000 },
            endsAt: now + 30000
          }
        ]
      }
    }
  };

  // Advance now that active raid has attacked: transitions to refreshing to start the queue!
  const advance2 = controller.advance(transition.state, null, returningCache, now + 2000, { defaultHero: 600, base: 950 });
  assert.equal(advance2.state.phase, 'refreshing', 'Must transition to refreshing once previous raid has attacked');
  assert.equal(advance2.calls[0].name, 'heroGetAll', 'Must request fresh heroGetAll');
  assert.equal(advance2.calls[1].name, 'getUnitSummary', 'Must request fresh getUnitSummary');
});

test('ResourceSummary and HeroDetailModal use accurate RPC keys and payload conventions', async () => {
  const resourceSummaryContent = await readFile(join(root, 'src/components/dashboard/ResourceSummary.vue'), 'utf8');
  assert.match(resourceSummaryContent, /resource:starMoney/, 'Must query resource:starMoney for emeralds');
  assert.match(resourceSummaryContent, /resource:material:5/, 'Must query resource:material:5 for food');
  assert.match(resourceSummaryContent, /resource:material:4/, 'Must query resource:material:4 for wood');
  assert.match(resourceSummaryContent, /resource:material:3/, 'Must query resource:material:3 for stone');
  assert.match(resourceSummaryContent, /resource:material:2/, 'Must query resource:material:2 for iron');
  assert.match(resourceSummaryContent, /cache\.value\.userGetInfo\?\.data\?\.user\?\.starMoney/, 'Must have starMoney fallback');
  assert.match(resourceSummaryContent, /cache\.value\.inventoryGet\?\.data\?\.material\?\.\[['"]5['"]\]/, 'Must have food fallback');

  const heroDetailModalContent = await readFile(join(root, 'src/components/dialogs/HeroDetailModal.vue'), 'utf8');
  assert.match(heroDetailModalContent, /name:\s*['"]heroUpgradeSkill['"]/, 'Must dispatch heroUpgradeSkill');
  assert.doesNotMatch(heroDetailModalContent, /name:\s*['"]heroUpgradeSkill['"][\s\S]*?feature:\s*['"]hero['"]/, 'heroUpgradeSkill must not contain feature: hero');

  const interceptContent = await readFile(join(root, 'extension/intercept.js'), 'utf8');
  assert.match(interceptContent, /'heroUpgradeSkill'/, 'intercept.js helperActionMethods must include heroUpgradeSkill');
  assert.match(interceptContent, /'heroInsertItem'/, 'intercept.js helperActionMethods must include heroInsertItem');
  assert.match(interceptContent, /'inventoryCraftFragments'/, 'intercept.js helperActionMethods must include inventoryCraftFragments');
  assert.match(heroDetailModalContent, /name:\s*['"]heroInsertItem['"]/, 'HeroDetailModal must dispatch heroInsertItem');
  assert.match(heroDetailModalContent, /handleEquip/, 'HeroDetailModal must have handleEquip function');
});

test('RaidModal and MonsterModal update title status with dynamic timer countdown and data-experimental-until', async () => {
  const raidModal = await readFile(join(root, 'src/components/dialogs/RaidModal.vue'), 'utf8');
  assert.match(raidModal, /currentRaidCountdown/, 'RaidModal must compute currentRaidCountdown');
  assert.match(raidModal, /id="raid-dialog-timer"/, 'RaidModal must feature #raid-dialog-timer on title bar');
  assert.match(raidModal, /:data-experimental-until="currentRaidPhase\?\.until/, 'RaidModal timer must bind data-experimental-until');
  assert.match(raidModal, /remainRaidCount/, 'RaidModal must compute remainRaidCount for queue');

  const monsterModal = await readFile(join(root, 'src/components/dialogs/MonsterModal.vue'), 'utf8');
  assert.match(monsterModal, /currentMonsterAttack/, 'MonsterModal must compute currentMonsterAttack');
  assert.match(monsterModal, /id="monster-dialog-timer"/, 'MonsterModal must feature #monster-dialog-timer on title bar');
  assert.match(monsterModal, /:data-experimental-until="currentMonsterAttack\.endsAt/, 'MonsterModal timer must bind data-experimental-until');
});

test('ResearchModal accurately loads completedResearches and excludes max-level techs from Next candidates', async () => {
  const researchModal = await readFile(join(root, 'src/components/dialogs/ResearchModal.vue'), 'utf8');
  assert.match(researchModal, /cache\.value\?\.researchStatus\?\.data\?\.completedResearches/, 'Must query completedResearches from researchStatus');
  assert.match(researchModal, /isMaxLevel/, 'Must compute isMaxLevel for completed techs');
  assert.match(researchModal, /r\.maxLevel > 0 && \(r\.currentLevel >= r\.maxLevel \|\| r\.nextLevel > r\.maxLevel\)/, 'Must filter out maxed-out techs from Next candidates');

  const troopsUtil = await readFile(join(root, 'src/utils/troops.ts'), 'utf8');
  assert.match(troopsUtil, /cache\?\.researchStatus\?\.data\?\.completedResearches/, 'troops.ts must query completedResearches');
});

test('Session recording, MQTT capture, and building/research controls operate seamlessly', async () => {
  const researchModal = await readFile(join(root, 'src/components/dialogs/ResearchModal.vue'), 'utf8');
  assert.match(researchModal, /completeDate:\s*Date\.now\(\)/, 'ResearchModal must pass completeDate: Date.now() to completeResearch');

  const settingsTab = await readFile(join(root, 'src/components/tabs/SettingsTab.vue'), 'utf8');
  assert.match(settingsTab, /'record-stop'\s*:\s*'record-start'/, 'SettingsTab must send record-start / record-stop');
  assert.match(settingsTab, /interceptEnabled/, 'SettingsTab must support interceptEnabled toggle');

  const header = await readFile(join(root, 'src/components/common/Header.vue'), 'utf8');
  assert.match(header, /:content="buildingTooltipText"/, 'Header must use dynamic buildingTooltipText');
  assert.match(header, /:content="researchTooltipText"/, 'Header must use dynamic researchTooltipText');
  assert.match(header, /return 'Ready'/, 'Header countdown must display Ready when completed queues exist');

  const bg = await readFile(join(root, 'extension/background.js'), 'utf8');
  assert.match(bg, /start-recording/, 'Background must support start-recording alias');
  assert.match(bg, /recordingState:\s*next/, 'Background must persist recordingState to local storage for reactive UI');

  const mqtt = await readFile(join(root, 'extension/mqtt-capture.js'), 'utf8');
  assert.match(mqtt, /interceptEnabled\s*!==\s*false/, 'MQTT capture must activate when interceptEnabled is not false');
});

test('Game connection monitoring, warning banner, and browser refresh button operate across Dashboard and Header', async () => {
  const dashboard = await readFile(join(root, 'src/components/dashboard/DashboardTab.vue'), 'utf8');
  assert.match(dashboard, /id="dashboard-game-status-alert"/, 'Dashboard must render #dashboard-game-status-alert');
  assert.match(dashboard, /id="dashboard-actions"/, 'Dashboard must have #dashboard-actions container');
  assert.match(dashboard, /id="btn-refresh-browser"/, 'Dashboard must render #btn-refresh-browser when refresh needed');
  assert.match(dashboard, /reloadGameTab/, 'Dashboard must bind reloadGameTab to refresh buttons');

  const header = await readFile(join(root, 'src/components/common/Header.vue'), 'utf8');
  assert.match(header, /id="game-connection-badge"/, 'Header must feature #game-connection-badge');
  assert.match(header, /headerConnectionTooltip/, 'Header must provide dynamic connection tooltip');
  assert.match(header, /handleConnectionClick/, 'Header must support click to reload or check game tab');
  assert.match(header, /socketRefreshMode/, 'Header must observe socketRefreshMode for RPC queue visibility');
  assert.match(header, /isRpcQueueVisible/, 'Header must compute isRpcQueueVisible when queue is active');
  assert.match(header, /v-if="isRpcQueueVisible"[\s\S]*?id="rpc-queue-badge"/, 'Header must conditionally hide #rpc-queue-badge');

  const connectionComposable = await readFile(join(root, 'src/composables/useGameConnection.ts'), 'utf8');
  assert.match(connectionComposable, /get-game-tab-status/, 'Must query get-game-tab-status');
  assert.match(connectionComposable, /reload-game-tab/, 'Must dispatch reload-game-tab');
  assert.match(connectionComposable, /isVersionChanged/, 'Must detect extension version changes');
  assert.match(connectionComposable, /isRefreshRequired/, 'Must detect refreshRequired and needsRefresh');

  const settingsTab = await readFile(join(root, 'src/components/tabs/SettingsTab.vue'), 'utf8');
  assert.match(settingsTab, /Game Tab Connection/, 'SettingsTab must feature Game Tab Connection diagnostic');
  assert.match(settingsTab, /Refresh Game Tab/, 'SettingsTab must feature Refresh Game Tab button');
});

test('HeroDetailModal adjusts skill 3 and 4 display level by delta offsets', async () => {
  const heroDetail = await readFile(join(root, 'src/components/dialogs/HeroDetailModal.vue'), 'utf8');
  assert.match(heroDetail, /delta:\s*20/, 'Skill 3 must define delta: 20');
  assert.match(heroDetail, /delta:\s*40/, 'Skill 4 must define delta: 40');
  assert.match(heroDetail, /getSkillDisplayLevel/, 'Must use getSkillDisplayLevel to compute level minus delta');
  assert.match(heroDetail, /isSkillMax/, 'Must use isSkillMax based on adjusted display level');
  assert.match(heroDetail, /getSkillProgressPercent/, 'Must compute progress percent using adjusted level');
});

test('EventsTab uses normalizeArray for rounds, chestNumbers, lanes, and boss heads', async () => {
  const eventsTab = await readFile(join(root, 'src/components/tabs/EventsTab.vue'), 'utf8');
  assert.match(eventsTab, /import\s*\{\s*normalizeArray\s*\}\s*from\s*['"]@\/src\/utils\/troops['"]/, 'EventsTab must import normalizeArray');
  assert.match(eventsTab, /normalizeArray\(battle\.rounds\)/, 'EventsTab must normalize battle.rounds');
  assert.match(eventsTab, /normalizeArray\(vsStatus\.chestNumbers\)/, 'EventsTab must normalize vsStatus.chestNumbers');
  assert.match(eventsTab, /normalizeArray\(clashStatus\.lanes\)/, 'EventsTab must normalize clashStatus.lanes');
  assert.match(eventsTab, /normalizeArray\(clanBoss\?\.heads\)/, 'EventsTab must normalize clanBoss.heads');
  assert.doesNotMatch(eventsTab, /\(battle\.rounds \|\| \[\]\)\.find/, 'EventsTab must not use unsafe (battle.rounds || []).find');
});

test('GatheringModal and GatheringTab align with Header.vue using isMarchExpired and getMarchBadgeInfo', async () => {
  const gatherModal = await readFile(join(root, 'src/components/dialogs/GatheringModal.vue'), 'utf8');
  assert.match(gatherModal, /import\s*\{[^}]*isMarchExpired[^}]*\}\s*from\s*['"]@\/src\/utils\/resourceData['"]/, 'GatheringModal must import isMarchExpired and getMarchBadgeInfo');
  assert.match(gatherModal, /isMarchExpired\(m,\s*now\.value\)/, 'GatheringModal must filter out expired returning marches');
  assert.match(gatherModal, /badge\.category === 'gather'/, 'GatheringModal must match gather category with Header');
  assert.doesNotMatch(gatherModal, /!m\.endsAt \|\| m\.endsAt > now\.value/, 'GatheringModal must not exclude arrived gathering marches with endsAt <= now');

  const gatherTab = await readFile(join(root, 'src/components/tabs/GatheringTab.vue'), 'utf8');
  assert.match(gatherTab, /isMarchExpired\(m,\s*now\.value\)/, 'GatheringTab must use isMarchExpired');
});

test('GuildVersusModal synchronizes all 6 sections with legacy HTML', async () => {
  const gvs = await readFile(join(root, 'src/components/dialogs/GuildVersusModal.vue'), 'utf8');

  // Section 1: Matchup Banner
  assert.match(gvs, /Theme:\s*\{\{\s*currentTheme\s*\}\}/, 'GuildVersusModal must dynamically display currentTheme');
  assert.match(gvs, /clanRoundPoints\.toLocaleString\(\)/, 'GuildVersusModal must format clan round points');
  assert.match(gvs, /enemyRoundPoints\.toLocaleString\(\)/, 'GuildVersusModal must format enemy round points');

  // Section 2: Personal Points
  assert.match(gvs, /isStaleVersusDay/, 'GuildVersusModal must evaluate isStaleVersusDay');
  assert.match(gvs, /personalRoundPoints/, 'GuildVersusModal must display personalRoundPoints');
  assert.match(gvs, /personalBattlePoints/, 'GuildVersusModal must display personalBattlePoints');
  assert.match(gvs, /personalSeasonPoints/, 'GuildVersusModal must display personalSeasonPoints');

  // Section 3: Milestone Chests
  assert.match(gvs, /isStackMode/, 'GuildVersusModal must provide Stacked Deck view toggle');
  assert.match(gvs, /targetChestNum/, 'GuildVersusModal must highlight targetChestNum');
  assert.match(gvs, /formatRewardItem/, 'GuildVersusModal must itemize chest rewards');

  // Section 4: 6-Round Battle Schedule & Quests
  assert.match(gvs, /6-Round Battle Schedule & Quests/, 'GuildVersusModal must include 6-round schedule section');
  assert.match(gvs, /roundQuestsMap/, 'GuildVersusModal must map round quests');
  assert.match(gvs, /getQuestDisplayName/, 'GuildVersusModal must render quest names with resource stock');

  // Section 5: Guild Requirements
  assert.match(gvs, /Guild Participation & Requirements/, 'GuildVersusModal must include guild participation section');
  assert.match(gvs, /Active Members/, 'GuildVersusModal must render active members card');
  assert.match(gvs, /Weekly Activity/, 'GuildVersusModal must render weekly activity card');

  // Section 6: Daily Challenges
  assert.match(gvs, /Daily Challenges/, 'GuildVersusModal must include daily challenges section');
  assert.match(gvs, /totalChallengePts/, 'GuildVersusModal must compute total challenge points');
  assert.match(gvs, /getChallengeConvertedPts/, 'GuildVersusModal must convert challenge progress to points');
  assert.match(gvs, /pts \/.*units/, 'GuildVersusModal must display rate formula in daily challenges');
});





