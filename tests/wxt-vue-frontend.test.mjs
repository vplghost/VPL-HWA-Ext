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

  const header = await readFile(join(root, 'src/components/common/Header.vue'), 'utf8');
  assert.match(header, /normalizeResourceSelection/, 'Header must normalize resourceSelection');
  assert.match(header, /Array\.isArray\(resourceSelection\.value\)/, 'Header must guard Array.isArray');

  const resTab = await readFile(join(root, 'src/components/tabs/ResourcesTab.vue'), 'utf8');
  assert.match(resTab, /normalizeResourceSelection/, 'ResourcesTab must normalize resourceSelection');
  assert.match(resTab, /Array\.isArray\(resourceSelection\.value\)/, 'ResourcesTab must guard Array.isArray');
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
  assert.match(bContent, /completeConstruction/, 'Must have completeConstruction RPC');
  assert.match(bContent, /Auto-Build Queue/, 'Must have Auto-Build Queue');

  const rContent = await readFile(join(root, 'src/components/dialogs/ResearchModal.vue'), 'utf8');
  assert.match(rContent, /id="research-dialog"/, 'Must have #research-dialog');
  assert.match(rContent, /id="research-dialog-title"/, 'Must have #research-dialog-title');
  assert.match(rContent, /id="research-dialog-status"/, 'Must have #research-dialog-status');
  assert.match(rContent, /id="research-dialog-body"/, 'Must have #research-dialog-body');
  assert.match(rContent, /completeResearch/, 'Must have completeResearch RPC');
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
