import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.listeners = {}; this.dataset = {}; this.value = ''; this.textContent = ''; this.attributes = {}; this.hidden = false; }
  get id() { return this._id || this.attributes.id || ''; }
  set id(v) { this._id = v; this.attributes.id = v; }
  append(...children) { for (const c of children) { if (c) { c.parent = this; this.children.push(c); } } }
  replaceChildren(...children) { this.children = [...children]; for (const c of this.children) c.parent = this; }
  setAttribute(name, value) { this.attributes[name] = String(value); if (name === 'id') this._id = String(value); }
  getAttribute(name) { return this.attributes[name]; }
  addEventListener(name, handler) { this.listeners[name] = handler; }
  async fire(name, evt = {}) { await this.listeners[name]?.(evt); }
  focus() {}
  querySelector(sel) {
    if (sel.startsWith('#')) {
      const id = sel.slice(1);
      if (this.id === id) return this;
      for (const child of this.children) {
        if (child.id === id) return child;
        const found = child.querySelector?.(sel);
        if (found) return found;
      }
    }
    return null;
  }
  remove() {
    if (this.parent) {
      this.parent.children = this.parent.children.filter((c) => c !== this);
    }
  }
  all(tag) { return this.children.flatMap((child) => [ ...(child.tagName === tag ? [child] : []), ...child.all(tag) ]); }
}
const popup = await readFile(new URL('../extension/popup.js', import.meta.url), 'utf8');
const popupHtml = await readFile(new URL('../extension/popup.html', import.meta.url), 'utf8');
const dataSource = await readFile(new URL('../extension/experimental-data.js', import.meta.url), 'utf8');
const renderer = popup.slice(popup.indexOf('function renderExperimental('), popup.indexOf('async function experimentalRpc('));
const pendingSync = popup.slice(popup.indexOf('function syncExperimentalPending('), popup.indexOf('function renderMonster('));
const monsterRenderer = popup.slice(popup.indexOf('function renderMonster('), popup.indexOf('function renderExperimental('));
const dashboardActionsStart = popup.indexOf("  const actions = document.createElement('div');", popup.indexOf('function renderDashboard('));
const dashboardActionsEnd = popup.indexOf('  intro.append(heading, subtitle, actions);', dashboardActionsStart) +
  '  intro.append(heading, subtitle, actions);'.length;
const dashboardActions = popup.slice(dashboardActionsStart, dashboardActionsEnd);
const save = popup.slice(popup.indexOf('function saveRaidPreferences('), popup.indexOf("let currentRpcPolicy"));

test('Settings persists 600/950 defaults and serializes capacity changes without overwriting either field', async () => {
  const elements = new Map(); const stored = {};
  const document = { querySelector: (id) => {
    if (!elements.has(id)) elements.set(id, new Element('input'));
    return elements.get(id);
  } };
  const context = vm.createContext({ document, settingsPending: Promise.resolve(), status: {},
    chrome: { storage: { local: { get: async () => stored,
      set: async (values) => Object.assign(stored, JSON.parse(JSON.stringify(values))) } } } });
  vm.runInContext(dataSource, context);
  const start = popup.indexOf("\nfor (const [id, key] of [['default-hero-troop-capacity'");
  vm.runInContext(popup.slice(popup.indexOf('async function renderSettings('), start) +
    popup.slice(start, popup.indexOf("document.querySelector('#socket-refresh-mode').addEventListener", start)), context);
  await context.renderSettings();
  const hero = elements.get('#default-hero-troop-capacity'), base = elements.get('#base-troop-capacity');
  assert.equal(hero.value, '600'); assert.equal(base.value, '950');
  hero.value = '700'; hero.listeners.change({ currentTarget: hero });
  base.value = '1000'; base.listeners.change({ currentTarget: base });
  await context.settingsPending;
  assert.deepEqual(stored.troopCapacitySettings, { defaultHero: 700, base: 1000 });
  base.value = ''; base.listeners.change({ currentTarget: base }); await context.settingsPending;
  assert.equal(stored.troopCapacitySettings.base, 1000);
});

test('rally form persists chosen team and last searched level, updates troop allocation and restricts waits', async () => {
  const heroes = Object.fromEntries([1, 2, 3, 4, 5, 6].map((id) => [id, { level: 30, star: 2, power: id, troopCapacity: 500 + id }]));
  const stored = {}; const sent = [];
  const cache = { accountStatus: { data: { id: 10 } }, heroGetAll: { data: heroes },
    teamGetAll: { data: { raid: [2, 3, 4, 5, 6] } },
    'getUnitSummary:unit': { data: { available: [7, 17, 27].map((unitId) => ({ unitId, count: 9000 })) } },
    experimentalMapContext: { data: { mapId: 'map', center: { x: 1, y: 2 } } },
    experimentalRallySearch: { data: { mapId: 'map', mobConfigIds: [60], mobs: [{ mobId: 'boss' }] } } };
  const raidBody = new Element('div');
  const context = vm.createContext({ document: { createElement: (tag) => new Element(tag),
    querySelector: (selector) => selector === '#raid-dialog-body' ? raidBody : null },
    view: new Element('div'), status: {}, currentCache: cache, experimentalPending: null, experimentalMessage: '',
    popupRpcEnabled: true, currentRpcPolicy: { mode: 'piggyback', monitor: true }, raidQueueState: null, troopCapacitySettings: { defaultHero: 600, base: 950 },
    hwaHelperNameMap: { hero: (id) => `Hero ${id}` },
    hwaHelperPopupData: { isMarchExpired: () => false },
    chrome: { storage: { local: { set: async (values) => Object.assign(stored, JSON.parse(JSON.stringify(values))) } },
      runtime: { sendMessage: async (message) => { sent.push(message); return { ok: true }; } } },
    experimentalRpc: async (calls) => sent.push({ calls }),
    experimentalSelection: { rallyTeam: 'weakest', gatherTeam: 'weakest', bossLevel: 1, searchedBossLevel: 1,
      waitSeconds: 300, minMembers: 4, autoCancel: true, raidCount: 2, baseTroops: 200, capacities: {}, units: '', mineType: 'food', mineLevel: 1 } });
  vm.runInContext(dataSource, context);
  context.render = () => context.renderExperimental(cache, true);
  vm.runInContext(save + '\n' + pendingSync + '\n' + renderer, context);
  context.render();
  const rally = () => raidBody.children[0];
  const text = (node) => node.textContent + node.children.map(text).join(' ');
  assert.match(text(rally()), /Troops: 3465 \/ 3465/);
  assert.match(text(rally()), /Marksmen: 1155/);
  assert.match(text(rally()), /Spearmen: 1155/);
  assert.match(text(rally()), /Infantry: 1155/);
  assert.equal(rally().all('input').length, 3, 'rally has auto-cancel, member threshold and raid count inputs');
  let team = rally().all('select')[0]; team.value = 'raid:0'; await team.fire('change');
  assert.equal(stored.raidPreferences.rallyTeam, 'raid:0');
  assert.match(text(rally()), /Troops: 3470 \/ 3470/);
  let level = rally().all('select')[1]; level.value = '3'; await level.fire('change');
  const wait = rally().all('select').find((select) => select.children.some((option) => option.value === '1800'));
  assert.deepEqual(wait.children.map((option) => Number(option.value)), [60, 300, 900, 1800]);
  wait.value = '900'; await wait.fire('change');
  assert.equal(stored.raidPreferences.bossLevel, 1, 'editing the form must not replace the last searched level');
  await rally().all('button').find((button) => button.textContent === 'Find').fire('click');
  assert.equal(stored.raidPreferences.bossLevel, 3);
  assert.equal(sent.at(-1).calls[0].args.mobConfigIds[0], 62);
  assert.equal(stored.raidPreferences.accountId, 10);
  context.experimentalSelection.bossLevel = 1;
  context.render();
  const cancel = rally().all('input')[0];
  assert.equal(cancel.type, 'checkbox');
  assert.equal(cancel.checked, true);
  cancel.checked = false;
  await cancel.fire('change');
  assert.equal(stored.raidPreferences.autoCancel, false);
  assert.equal(rally().all('input')[1].disabled, true);
  await rally().all('button').find((button) => button.textContent === 'Start rally').fire('click');
  assert.equal(sent.at(-1).kind, 'raid-queue-start');
  assert.equal(sent.at(-1).options.count, 1);
  assert.equal(sent.at(-1).options.autoCancel, false);
  assert.equal(sent.at(-1).options.firstMobId, 'boss');
  let raidCount = rally().all('input')[2];
  raidCount.value = '3';
  await rally().all('button').find((button) => button.textContent === 'Start queue').fire('click');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(sent.at(-1).options.count, 3, 'queue reads the current input even before its change event');
  assert.equal(stored.raidPreferences.raidCount, 3);
  raidCount = rally().all('input')[2];
  raidCount.value = '1';
  const sentBeforeInvalid = sent.length;
  await rally().all('button').find((button) => button.textContent === 'Start queue').fire('click');
  assert.equal(sent.length, sentBeforeInvalid);
  assert.match(context.experimentalMessage, /needs 2–100 raids/);
});

test('Dashboard groups Raid, Gathering and Monster buttons and Gathering keeps live dialog actions', async () => {
  const header = popupHtml.match(/<header[\s\S]*?<\/header>/)?.[0] || '';
  assert.doesNotMatch(header, /open-gather-dialog|open-monster-dialog/);
  assert.match(popupHtml, /<dialog id="gather-dialog"[\s\S]*id="gather-dialog-body"[\s\S]*<\/dialog>/);
  assert.doesNotMatch(popupHtml, /data-tab="experimental"/);

  const body = new Element('div');
  const dialog = { open: false, showModal() { this.open = true; } };
  const monsterDialog = { open: false, showModal() { this.open = true; } };
  const intro = new Element('div');
  const sent = [];
  const cache = { accountStatus: { data: { id: 10 } },
    heroGetAll: { data: Object.fromEntries([1, 2, 3, 4, 5].map((id) => [id, { power: id }])) },
    experimentalMapContext: { data: { mapId: 'map', center: { x: 1, y: 2 } } },
    experimentalMineSearch: { data: { mineConfigId: 27, mines: [{ mineId: 'mine-1', coordinates: { x: 2, y: 3 } }] } },
    marchStatus: { data: { marches: [{ kind: 'food', stage: 'gathering', mineId: 'mine-2', squadId: 'squad-2' }] } } };
  const elements = { '#gather-dialog-body': body, '#gather-dialog': dialog,
    '#monster-dialog': monsterDialog, '#raid-dialog': { showModal() {} } };
  const context = vm.createContext({ document: { createElement: (tag) => new Element(tag),
    querySelector: (selector) => elements[selector] }, currentCache: cache, intro,
    heading: new Element('h2'), subtitle: new Element('p'), renderMonster: () => {},
    experimentalPending: null, experimentalMessage: '', popupRpcEnabled: true,
    currentRpcPolicy: { mode: 'piggyback', monitor: true }, troopCapacitySettings: { defaultHero: 600, base: 950 },
    hwaHelperNameMap: { hero: (id) => `Hero ${id}` },
    hwaHelperPopupData: { isMarchExpired: () => false },
    chrome: { storage: { local: { get: async () => ({ rpcCache: cache }) } } }, CACHE_KEY: 'rpcCache',
    experimentalRpc: async (calls) => sent.push(calls),
    experimentalSelection: { rallyTeam: 'weakest', gatherTeam: 'weakest', bossLevel: 1,
      waitSeconds: 300, minMembers: 4, autoCancel: true, raidCount: 2, units: '7:100',
      mineType: 'food', mineLevel: 1, mineId: 'mine-1' } });
  vm.runInContext(dataSource, context);
  context.render = () => context.renderExperimental(cache);
  vm.runInContext(pendingSync + '\n' + renderer, context);
  vm.runInContext(dashboardActions, context);
  const buttons = intro.children[2].all('button');
  assert.deepEqual(buttons.map((button) => button.textContent), ['Raid', 'Gathering', 'Monster']);
  assert.deepEqual(buttons.map((button) => button.attributes['aria-controls']),
    ['raid-dialog', 'gather-dialog', 'monster-dialog']);
  await buttons[1].fire('click');
  assert.equal(dialog.open, true);
  assert.equal(body.children.length, 1);
  const gather = () => body.children[0];
  const click = async (label) => gather().all('button').find((button) => button.textContent === label).fire('click');
  await click('Find full mines');
  assert.equal(sent.at(-1)[0].name, 'searchMine');
  await click('Send gathering team');
  assert.equal(sent.at(-1)[0].name, 'attackMine');
  await click('Recall');
  assert.equal(sent.at(-1)[0].name, 'stopMineGathering');
  context.experimentalMessage = 'Gathering updated.';
  context.renderExperimental(cache);
  assert.equal(body.children.length, 2, 'live refresh replaces the dialog body and shows feedback');
  assert.equal(body.children[1].textContent, 'Gathering updated.');
  await buttons[2].fire('click');
  assert.equal(monsterDialog.open, true);
});

test('Dashboard Raid and Monster buttons display floating counter badge when queues have remaining count', () => {
  const intro = new Element('div');
  const context = vm.createContext({
    document: { createElement: (tag) => new Element(tag) },
    intro,
    heading: new Element('h2'),
    subtitle: new Element('p'),
    currentCache: {},
    renderExperimental: () => {},
    renderMonster: () => {},
    raidQueueState: { phase: 'active', bossQueue: { remain_raid_count: 7 } },
    monsterQueueState: { phase: 'active', options: { count: 10 }, completed: 4 },
    hwaHelperMonsterQueue: { confirmedWins: (state) => state.completed }
  });

  vm.runInContext(dashboardActions, context);
  const buttons = intro.children[2].all('button');
  const raidBtn = buttons.find((b) => b.attributes['aria-controls'] === 'raid-dialog');
  const monsterBtn = buttons.find((b) => b.attributes['aria-controls'] === 'monster-dialog');

  assert.ok(raidBtn);
  assert.ok(monsterBtn);

  // Check counter badges
  const raidBadge = raidBtn.querySelector('#open-raid-dialog-badge');
  assert.ok(raidBadge, 'Raid button must have floating counter badge');
  assert.equal(raidBadge.textContent, '7');
  assert.equal(raidBadge.dataset.queueCount, '7');

  const monsterBadge = monsterBtn.querySelector('#open-monster-dialog-badge');
  assert.ok(monsterBadge, 'Monster button must have floating counter badge');
  assert.equal(monsterBadge.textContent, '6'); // 10 - 4 = 6
  assert.equal(monsterBadge.dataset.queueCount, '6');
});

test('Monster dialog searches by level, starts selected team attack and shows recent results', async () => {
  assert.match(popupHtml, /<dialog id="monster-dialog"[\s\S]*id="monster-dialog-body"[\s\S]*<\/dialog>/);
  const body = new Element('div');
  const titleStatus = new Element('div');
  const monsterIcon = new Element('span');
  const elements = {
    '#monster-dialog-body': body,
    '#monster-dialog-status': titleStatus,
    '#monster-dialog-icon': monsterIcon
  };
  const sent = []; const saved = {};
  const heroes = Object.fromEntries([1, 2, 3, 4, 5].map((id) => [id, { power: id, troopCapacity: 500 }]));
  const cache = { accountStatus: { data: { id: 10 } }, heroGetAll: { data: heroes },
    'getUnitSummary:unit': { data: { available: [7, 17, 27].map((unitId) => ({ unitId, count: 9000 })) } },
    experimentalMapContext: { data: { mapId: 'map', center: { x: 1, y: 2 } } },
    experimentalSoloSearch: { data: { mapId: 'map', mobConfigIds: [37, 67],
      mobs: [{ mobId: 'mob-1', coordinates: { x: 3, y: 4 } }] } },
    soloAttackResults: { data: [{ mobConfigId: 67, result: 'win', createdAt: Date.now() }] },
    marchStatus: {
      data: {
        marches: [
          {
            kind: 'attack',
            mobConfigId: 37,
            targetArrivalAt: Date.now() + 5000,
            endsAt: Date.now() + 10000
          }
        ]
      }
    } };
  const context = vm.createContext({ document: { createElement: (tag) => new Element(tag),
    querySelector: (sel) => elements[sel] || body }, currentCache: cache, popupRpcEnabled: true, experimentalPending: null,
    experimentalMessage: '', monsterMessage: '', monsterQueueState: {
      phase: 'stopped', options: { count: 4 }, reason: 'Stopped by user.',
      recentResults: [{ mobConfigId: 67, result: 'win', at: Date.now() }] },
    currentRpcPolicy: { mode: 'piggyback', monitor: true },
    monsterSelection: { teamId: '', level: 15, count: 2, targetMobId: '' },
    troopCapacitySettings: { defaultHero: 600, base: 950 },
    hwaHelperNameMap: { hero: (id) => `Hero ${id}` },
    hwaHelperMonsterQueue: { confirmedWins: () => 0 },
    formatNumber: (value) => String(value), saveMonsterPreferences: () => Object.assign(saved, { saved: true }),
    chrome: { runtime: { sendMessage: async (message) => { sent.push(message); return { ok: true }; } } },
    experimentalRpc: async (calls) => sent.push({ calls }) });
  vm.runInContext(dataSource, context);
  context.render = () => context.renderMonster(cache);
  vm.runInContext(pendingSync + '\n' + monsterRenderer, context);
  context.render();

  // Title status displays active monster attack march badge with timer and header icon
  assert.equal(monsterIcon.textContent, '🏃‍♂️', 'Marching monster attack must set icon to 🏃‍♂️');
  const statusText = titleStatus.children.map((c) => c.textContent + c.children.map((k) => k.textContent).join(' ')).join(' ');
  assert.match(statusText, /Lv\.15 Monster: Marching/);

  // Test returning stage icon
  cache.marchStatus.data.marches[0].kind = 'return';
  context.render();
  assert.equal(monsterIcon.textContent, '↩️', 'Returning monster attack must set icon to ↩️');

  // Test fighting stage icon
  cache.marchStatus.data.marches[0].kind = 'attack';
  cache.marchStatus.data.marches[0].targetArrivalAt = Date.now() - 1000;
  context.render();
  assert.equal(monsterIcon.textContent, '💥', 'Fighting monster attack must set icon to 💥');

  // Test idle icon
  cache.marchStatus.data.marches = [];
  context.render();
  assert.equal(monsterIcon.textContent, '👾', 'Idle monster attack must set icon to 👾');

  // Restore active march
  cache.marchStatus.data.marches = [{
    kind: 'attack',
    mobConfigId: 37,
    targetArrivalAt: Date.now() + 5000,
    endsAt: Date.now() + 10000
  }];
  context.render();

  const section = () => body.children[0];
  const text = (node) => node.textContent + node.children.map(text).join(' ');

  // Troops breakdown: Infantry, Marksmen, Spearmen with counts and Lv tiers
  assert.match(text(section()), /Infantry:/);
  assert.match(text(section()), /Marksmen:/);
  assert.match(text(section()), /Spearmen:/);
  const refreshTroopsBtn = section().all('button').find((item) => item.textContent === '↻');
  assert.ok(refreshTroopsBtn, 'Troops refresh button must exist');
  await refreshTroopsBtn.fire('click');
  assert.equal(sent.at(-1).kind, 'refresh-rpc');
  assert.deepEqual(JSON.parse(JSON.stringify(sent.at(-1).calls)), [{ name: 'heroGetAll' }, { name: 'getUnitSummary', feature: 'unit' }]);

  // Only Recent attack results is used; monsterQueueState.recentResults does not render duplicates
  assert.match(text(section()), /Recent attack results/);
  assert.match(text(section()), /Level 15 · win/);
  assert.match(text(section()), /Previous queue: stopped/);
  assert.doesNotMatch(text(section()), /Previous queue[\s\S]*Level 15 · win[\s\S]*Recent attack results/);

  await section().all('button').find((item) => item.textContent === 'Find monsters').fire('click');
  assert.deepEqual(Array.from(sent.at(-1).calls[0].args.mobConfigIds), [37, 67]);
  context.experimentalPending = { name: 'searchMob', sentAt: Date.now() - 1000, queued: true };
  context.experimentalMessage = 'Queued for the next game RPC (up to two minutes).';
  cache.experimentalActionStatus = { data: { name: 'searchMob', ok: true },
    updatedAt: new Date().toISOString() };
  context.render();
  assert.equal(context.experimentalPending, null);
  assert.equal(section().all('button').find((item) => item.textContent === 'Attack once').disabled, false);
  assert.match(text(section()), /searchMob completed/);
  assert.doesNotMatch(text(section()), /Queued for the next game RPC/);
  await section().all('button').find((item) => item.textContent === 'Attack once').fire('click');
  assert.equal(sent.at(-1).kind, 'monster-queue-start');
  assert.equal(sent.at(-1).options.count, 1);
  assert.equal(sent.at(-1).options.firstMobId, 'mob-1');
  assert.deepEqual(Array.from(sent.at(-1).options.heroIds), [1, 2, 3, 4, 5]);
  const count = section().all('input')[0]; count.value = '3';
  await section().all('button').find((item) => item.textContent === 'Start queue').fire('click');
  assert.equal(sent.at(-1).options.count, 3);
  assert.equal(saved.saved, true);

  // Team label includes hero names in parentheses
  const labels = section().all('label');
  assert.match(labels[0].textContent, /Team \(Hero 1 · Hero 2 · Hero 3 · Hero 4 · Hero 5\)/, 'Monster team label contains hero names');

  // When queue is running, Start queue is hidden and Stop queue is shown inline
  context.monsterQueueState = { phase: 'active', options: { count: 5 } };
  context.render();
  const runningButtons = section().all('button');
  assert.equal(runningButtons.find((item) => item.textContent === 'Start queue'), undefined, 'Start queue must be hidden when running');
  const stopQueueBtn = runningButtons.find((item) => item.textContent === 'Stop queue');
  assert.ok(stopQueueBtn, 'Stop queue button must be visible inline when running');
  await stopQueueBtn.fire('click');
  assert.equal(sent.at(-1).kind, 'monster-queue-stop');
});

test('Dashboard tower and dungeon cards are interactive and open respective modals', async () => {
  const questSource = await readFile(new URL('../extension/quest-data.js', import.meta.url), 'utf8');
  const dashDataSrc = await readFile(new URL('../extension/dashboard-data.js', import.meta.url), 'utf8');
  const dashRenderer = popup.slice(popup.indexOf('function renderDashboard('), popup.indexOf('function renderEvents('));

  const dashboardContainer = new Element('div');
  const towerModal = new Element('div');
  towerModal.hidden = true;
  const towerCloseBtn = new Element('button');
  const dungeonModal = new Element('div');

  const elements = {
    '#dashboard': dashboardContainer,
    '#tower-modal': towerModal,
    '#tower-modal-close': towerCloseBtn,
    '#dungeon-modal': dungeonModal
  };

  let renderedTower = false;
  let openedDungeon = false;

  const context = vm.createContext({
    Date,
    Number,
    Array,
    String,
    globalThis: {},
    status: new Element('div'),
    view: dashboardContainer,
    document: {
      createElement: (tag) => new Element(tag),
      querySelector: (sel) => elements[sel] || null
    },
    renderTowerModal: () => { renderedTower = true; },
    openDungeonModal: () => { openedDungeon = true; },
    openQuestDetailDialog: () => {},
    renderCampaignDialog: () => {},
    updateDashboardGameStatus: () => {}
  });

  vm.runInContext(questSource, context);
  vm.runInContext(dashDataSrc, context);
  vm.runInContext(dashRenderer, context);

  const cache = {
    towerStatus: { data: { floorNumber: 10 } },
    dungeonStatus: { data: { dungeonActivity: 50, floorNumber: 25 } }
  };

  context.renderDashboard(cache);

  const cards = dashboardContainer.all('div').filter((d) => d.attributes?.role === 'button');
  const towerCard = cards.find((c) => c.attributes?.['aria-controls'] === 'tower-modal');
  const dungeonCard = cards.find((c) => c.attributes?.['aria-controls'] === 'dungeon-modal');

  assert.ok(towerCard, 'Tower card must have role=button and aria-controls=tower-modal');
  assert.ok(dungeonCard, 'Dungeon card must have role=button and aria-controls=dungeon-modal');

  // Click tower card opens tower modal
  await towerCard.fire('click');
  assert.equal(renderedTower, true, 'Clicking tower card must call renderTowerModal');
  assert.equal(towerModal.hidden, false, 'Tower modal must become unhidden');

  // Click dungeon card opens dungeon modal
  await dungeonCard.fire('click');
  assert.equal(openedDungeon, true, 'Clicking dungeon card must call openDungeonModal');
});

test('Raid rally shows Stop queue inline when queue is running, hides Start queue, and updates title status', async () => {
  const sent = [];
  const raidBody = new Element('div');
  const raidStatus = new Element('div');
  const raidIcon = new Element('span');
  const elements = {
    '#raid-dialog-body': raidBody,
    '#raid-dialog-status': raidStatus,
    '#raid-dialog-icon': raidIcon
  };

  const cache = {
    teamGetAll: { data: { raid: [2, 3, 4, 5, 6] } },
    'getUnitSummary:unit': { data: { available: [7, 17, 27].map((unitId) => ({ unitId, count: 9000 })) } },
    experimentalMapContext: { data: { mapId: 'map', center: { x: 1, y: 2 } } },
    experimentalRallySearch: { data: { mapId: 'map', mobConfigIds: [60], mobs: [{ mobId: 'boss' }] } },
    marchStatus: {
      data: {
        marches: [{
          rally: { target: 'Boss 5' },
          stage: 'moving',
          until: Date.now() + 60000
        }]
      }
    }
  };

  const context = vm.createContext({
    document: {
      createElement: (tag) => new Element(tag),
      querySelector: (selector) => elements[selector] || null
    },
    status: {},
    currentCache: cache,
    experimentalPending: null,
    experimentalMessage: '',
    popupRpcEnabled: true,
    currentRpcPolicy: { mode: 'piggyback', monitor: true },
    raidQueueState: { phase: 'active', bossQueue: { remain_raid_count: 5, queue: ['b1', 'b2'] } },
    troopCapacitySettings: { defaultHero: 600, base: 950 },
    hwaHelperNameMap: { hero: (id) => `Hero ${id}` },
    hwaHelperPopupData: { isMarchExpired: () => false },
    hwaHelperRaidQueue: { confirmedWins: () => 1 },
    chrome: {
      storage: { local: { set: async () => {} } },
      runtime: { sendMessage: async (message) => { sent.push(message); return { ok: true }; } }
    },
    experimentalRpc: async (calls) => sent.push({ calls }),
    experimentalSelection: {
      rallyTeam: 'weakest', gatherTeam: 'weakest', bossLevel: 1, searchedBossLevel: 1,
      waitSeconds: 300, minMembers: 4, autoCancel: true, raidCount: 2, baseTroops: 200, capacities: {}, units: '', mineType: 'food', mineLevel: 1
    }
  });

  vm.runInContext(dataSource, context);
  context.render = () => context.renderExperimental(cache, true);
  vm.runInContext(save + '\n' + pendingSync + '\n' + renderer, context);
  context.render();

  const rally = () => raidBody.children[0];
  const buttons = rally().all('button');

  // Start rally should be present (disabled)
  const startRallyBtn = buttons.find((b) => b.textContent === 'Start rally');
  assert.ok(startRallyBtn, 'Start rally button must exist');
  assert.equal(startRallyBtn.disabled, true);

  // Start queue button must be HIDDEN when queueRunning is true
  const startQueueBtn = buttons.find((b) => b.textContent === 'Start queue');
  assert.equal(startQueueBtn, undefined, 'Start queue button must be hidden when queue is running');

  // Stop queue button must be PRESENT on the actions row
  const stopQueueBtn = buttons.find((b) => b.textContent === 'Stop queue');
  assert.ok(stopQueueBtn, 'Stop queue button must be present when queue is running');

  // Clicking Stop queue sends raid-queue-stop
  await stopQueueBtn.fire('click');
  assert.equal(sent.at(-1).kind, 'raid-queue-stop');

  // Verify status in #raid-dialog-status on dialog title bar
  const statusBadges = raidStatus.all('span');
  assert.ok(statusBadges.length > 0, 'Raid dialog title status must be populated');
  const statusText = raidStatus.children.map((c) => c.textContent + c.children.map((k) => k.textContent).join(' ')).join(' ');
  assert.match(statusText, /Boss 5/);
  assert.match(statusText, /Queue: active/);

  // Verify header icon updates based on phase
  // Phase 'Battle / awaiting result' sets 💥
  assert.equal(raidIcon.textContent, '💥');

  // Test 'Waiting' phase sets ⏳
  cache.marchStatus.data.marches[0].rally.waitUntil = Date.now() + 10000;
  context.render();
  assert.equal(raidIcon.textContent, '⏳', 'Waiting rally must set icon to ⏳');

  // Test 'Returning' phase sets ↩️
  cache.marchStatus.data.marches[0].stage = 'returnToOutpost';
  context.render();
  assert.equal(raidIcon.textContent, '↩️', 'Returning rally must set icon to ↩️');

  // Test Idle sets default ⚔️ when no active march and no queue
  cache.marchStatus.data.marches = [];
  context.raidQueueState = null;
  context.render();
  assert.equal(raidIcon.textContent, '⚔️', 'Idle raid must set icon to ⚔️');

  // Active rally status must NOT be duplicated inside dialog body
  assert.equal(rally().all('p').some((p) => p.className?.includes('bg-orange-50')), false,
    'Active rally status should not be inside dialog body since it is in title bar');

  // experimentalMessage must be rendered INSIDE the section card, not outside in dialog body
  context.experimentalMessage = 'Rally creation sent. Waiting for game confirmation.';
  context.render();
  assert.equal(raidBody.children.length, 1, 'Only section card must exist in dialog body');
  assert.equal(raidBody.children[0].tagName.toUpperCase(), 'SECTION');
  assert.ok(rally().all('p').some((p) => p.textContent.includes('Rally creation sent. Waiting for game confirmation.')),
    'experimentalMessage must be inside the section card');
});

test('Gathering dialog groups inputs into rows and displays title status', async () => {
  const gatherBody = new Element('div');
  const gatherStatus = new Element('div');
  const gatherIcon = new Element('span');
  const elements = {
    '#gather-dialog-body': gatherBody,
    '#gather-dialog-status': gatherStatus,
    '#gather-dialog-icon': gatherIcon
  };

  const cache = {
    heroGetAll: { data: { 1: { heroId: 1, level: 10 } } },
    teamGetAll: { data: { gather: [1, 2, 3, 4, 5] } },
    'getUnitSummary:unit': { data: { available: [{ unitId: 7, count: 500 }] } },
    experimentalMapContext: { data: { mapId: 'map', center: { x: 1, y: 2 } } },
    experimentalMineSearch: { data: { mineConfigId: 27, mines: [{ mineId: 'mine-1', coordinates: { x: 5, y: 8 } }] } },
    marchStatus: {
      data: {
        marches: [{ kind: 'wood', stage: 'gathering', mineId: 'mine-1', squadId: 'sq-1' }]
      }
    }
  };

  const context = vm.createContext({
    document: {
      createElement: (tag) => new Element(tag),
      querySelector: (selector) => elements[selector] || null
    },
    status: {},
    currentCache: cache,
    experimentalPending: null,
    experimentalMessage: '',
    popupRpcEnabled: true,
    currentRpcPolicy: { mode: 'piggyback', monitor: true },
    troopCapacitySettings: { defaultHero: 600, base: 950 },
    hwaHelperNameMap: { hero: (id) => `Hero ${id}` },
    hwaHelperPopupData: { isMarchExpired: () => false },
    hwaHelperRaidQueue: { confirmedWins: () => 1 },
    chrome: {
      storage: { local: { set: async () => {}, get: async () => ({}) } },
      runtime: { sendMessage: async () => ({ ok: true }) }
    },
    experimentalRpc: async () => {},
    experimentalSelection: {
      rallyTeam: 'weakest', gatherTeam: 'weakest', bossLevel: 1, searchedBossLevel: 1,
      mineType: 'wood', mineLevel: 1, mineId: 'mine-1', units: '7:500'
    }
  });

  vm.runInContext(dataSource, context);
  context.render = () => context.renderExperimental(cache, false);
  vm.runInContext(save + '\n' + pendingSync + '\n' + renderer, context);
  context.render();

  const gather = () => gatherBody.children[0];
  const buttons = gather().all('button');
  assert.ok(buttons.find((b) => b.textContent === 'Find full mines'), 'Find full mines button must exist');
  assert.ok(buttons.find((b) => b.textContent === 'Send gathering team'), 'Send gathering team button must exist');
  assert.ok(buttons.find((b) => b.textContent === 'Recall'), 'Recall button must exist');

  // Verify status in #gather-dialog-status on dialog title bar
  const statusText = gatherStatus.children.map((c) => c.textContent + c.children.map((k) => k.textContent).join(' ')).join(' ');
  assert.match(statusText, /1 team\(s\) gathering/);
  assert.equal(gatherIcon.textContent, '⛏️', 'Mining gathering must set icon to ⛏️');

  // Test marching to mine sets 🚶‍♂️
  cache.marchStatus.data.marches[0].targetArrivalAt = Date.now() + 30000;
  context.render();
  assert.equal(gatherIcon.textContent, '🚶‍♂️', 'Marching to mine must set icon to 🚶‍♂️');

  // Test returning from mine sets ↩️
  cache.marchStatus.data.marches[0].stage = 'returnToOutpost';
  context.render();
  assert.equal(gatherIcon.textContent, '↩️', 'Returning team must set icon to ↩️');

  // Test idle sets ⛏️
  cache.marchStatus.data.marches = [];
  context.render();
  assert.equal(gatherIcon.textContent, '⛏️', 'Idle gathering must set icon to ⛏️');

  // Team label includes hero names in parentheses and Troops input is on the same row (teamRow)
  const teamRowLabels = gather().children[1].all('label');
  assert.equal(teamRowLabels.length, 2, 'teamRow must have exactly Team and Troops labels on same row');
  assert.match(teamRowLabels[0].textContent, /Team \(/, 'Team label contains team parentheses');
  assert.match(teamRowLabels[1].textContent, /Troops \(unit ID:count\)/, 'Troops label is on same row');
});

test('Priority auto-join section exists in popup.html and settings persist', async () => {
  assert.ok(popupHtml.includes('id="config-priority-autojoin-section"'));
  assert.ok(popupHtml.includes('id="setting-priority-autojoin-enabled"'));
  assert.ok(popupHtml.includes('id="setting-priority-autojoin-min-level"'));
  assert.ok(popupHtml.includes('id="priority-autojoin-status"'));

  const elements = new Map();
  const document = {
    querySelector: (id) => {
      if (!elements.has(id)) elements.set(id, new Element('div'));
      return elements.get(id);
    }
  };
  const stored = {};
  const context = vm.createContext({
    document,
    chrome: {
      storage: {
        local: {
          set: async (val) => Object.assign(stored, val),
          get: async () => stored
        }
      }
    }
  });

  const uiCode = popup.slice(popup.indexOf('function renderPriorityAutoJoin('), popup.indexOf('function renderEngineStatus('));
  vm.runInContext(uiCode, context);

  // Initial render with settings
  context.renderPriorityAutoJoin({ enabled: true, minLevel: 25 });
  const chk = elements.get('#setting-priority-autojoin-enabled');
  const num = elements.get('#setting-priority-autojoin-min-level');
  const badge = elements.get('#priority-autojoin-status');

  assert.equal(chk.checked, true);
  assert.equal(num.value, 25);
  assert.equal(badge.textContent, 'Active (≥ Lv25)');

  // Set up listeners and trigger change
  context.setupPriorityAutoJoinListeners();
  chk.checked = false;
  num.value = 18;
  await chk.fire('change');

  assert.equal(stored.priorityAutoJoin.enabled, false);
  assert.equal(stored.priorityAutoJoin.minLevel, 18);
  assert.equal(badge.textContent, 'Disabled');
});

test('Raid, gather, and monster dialog headers use distinct background colors and stage icons in popup.html', () => {
  assert.match(popupHtml, /<div id="raid-dialog-header"[^>]*bg-indigo-50/);
  assert.match(popupHtml, /<div id="raid-dialog-header"[^>]*border-indigo-200/);
  assert.match(popupHtml, /<span id="raid-dialog-icon"[^>]*>⚔️<\/span>/);

  assert.match(popupHtml, /<div id="gather-dialog-header"[^>]*bg-emerald-50/);
  assert.match(popupHtml, /<div id="gather-dialog-header"[^>]*border-emerald-200/);
  assert.match(popupHtml, /<span id="gather-dialog-icon"[^>]*>⛏️<\/span>/);

  assert.match(popupHtml, /<div id="monster-dialog-header"[^>]*bg-amber-50/);
  assert.match(popupHtml, /<div id="monster-dialog-header"[^>]*border-amber-200/);
  assert.match(popupHtml, /<span id="monster-dialog-icon"[^>]*>👾<\/span>/);
});

test('header #marches badges use distinct category background colors and dynamic stage icons for raid, gather, and monster', () => {
  const marchesWrap = new Element('div');
  const now = 1731230000000;
  const context = vm.createContext({
    document: {
      querySelector: (sel) => sel === '#marches' ? marchesWrap : null,
      createElement: (tag) => new Element(tag)
    },
    isMarchExpired: () => false,
    Date: { now: () => now },
    globalThis: {
      hwaHelperPopupData: { isMarchExpired: () => false },
      hwaHelperExperimentalData: {
        rallyPhase: (march, t) => {
          if (march.stage === 'returnToOutpost') return { phase: 'Returning' };
          if (march.stage === 'battle') return { phase: 'Battle / awaiting result' };
          if (march.stage === 'moveToTargetInRally') return { phase: 'Traveling to boss' };
          if (march.stage === 'waitingForRallyStart') return { phase: 'Waiting' };
          return null;
        }
      }
    }
  });

  const marchRenderer = popup.match(/function getMarchBadgeInfo\([\s\S]*?\n\}\n\nfunction renderMarches\([\s\S]*?\n\}/)[0];
  vm.runInContext(marchRenderer, context);

  // 1. Raid marches across stages
  const raidWaiting = { squadId: 'r1', kind: 'raid', stage: 'waitingForRallyStart', rally: { id: 'rally-1', waitUntil: now + 5000 } };
  const raidTraveling = { squadId: 'r2', kind: 'raid', stage: 'moveToTargetInRally', rally: { id: 'rally-2' } };
  const raidBattle = { squadId: 'r3', kind: 'raid', stage: 'battle', rally: { id: 'rally-3' } };
  const raidReturning = { squadId: 'r4', kind: 'return', stage: 'returnToOutpost', previousKind: 'raid', rally: { id: 'rally-4' } };

  // 2. Gather marches across stages
  const gatherTraveling = { squadId: 'g1', kind: 'wood', stage: 'moveToTargetInSolo', targetArrivalAt: now + 5000 };
  const gatherMining = { squadId: 'g2', kind: 'food', stage: 'gathering' };
  const gatherReturning = { squadId: 'g3', kind: 'return', stage: 'returnToOutpost', previousKind: 'stone' };

  // 3. Monster marches across stages
  const monsterTraveling = { squadId: 'm1', kind: 'attack', stage: 'moveToTargetInSolo', targetArrivalAt: now + 5000 };
  const monsterFighting = { squadId: 'm2', kind: 'attack', targetArrivalAt: now - 1000 };
  const monsterReturning = { squadId: 'm3', kind: 'return', stage: 'returnToOutpost', previousKind: 'attack' };

  const cache = {
    marchStatus: {
      data: {
        marches: [
          raidWaiting, raidTraveling, raidBattle, raidReturning,
          gatherTraveling, gatherMining, gatherReturning,
          monsterTraveling, monsterFighting, monsterReturning
        ]
      }
    }
  };

  context.renderMarches(cache, marchesWrap);
  assert.equal(marchesWrap.children.length, 10);

  // Check Raid badges (indices 0-3)
  for (let i = 0; i < 4; i++) {
    assert.ok(marchesWrap.children[i].className.includes('bg-indigo-100'), `Raid badge ${i} must have indigo background`);
    assert.ok(marchesWrap.children[i].className.includes('march-raid-pulse'), `Raid badge ${i} must pulse`);
  }
  assert.equal(marchesWrap.children[0].textContent, '⏳', 'Waiting raid must show ⏳');
  assert.equal(marchesWrap.children[1].textContent, '🏹', 'Traveling raid must show 🏹');
  assert.equal(marchesWrap.children[2].textContent, '💥', 'Battle raid must show 💥');
  assert.equal(marchesWrap.children[3].textContent, '↩️', 'Returning raid must show ↩️');

  // Check Gather badges (indices 4-6)
  for (let i = 4; i < 7; i++) {
    assert.ok(marchesWrap.children[i].className.includes('bg-emerald-100'), `Gather badge ${i} must have emerald background`);
    assert.equal(marchesWrap.children[i].className.includes('march-raid-pulse'), false, 'Gather badge must not have raid pulse');
  }
  assert.equal(marchesWrap.children[4].textContent, '🚶‍♂️', 'Traveling to mine must show 🚶‍♂️');
  assert.equal(marchesWrap.children[5].textContent, '⛏️', 'Mining gather must show ⛏️');
  assert.equal(marchesWrap.children[6].textContent, '↩️', 'Returning gather must show ↩️');

  // Check Monster badges (indices 7-9)
  for (let i = 7; i < 10; i++) {
    assert.ok(marchesWrap.children[i].className.includes('bg-amber-100'), `Monster badge ${i} must have amber background`);
    assert.equal(marchesWrap.children[i].className.includes('march-raid-pulse'), false, 'Monster badge must not have raid pulse');
  }
  assert.equal(marchesWrap.children[7].textContent, '🏃‍♂️', 'Traveling to monster must show 🏃‍♂️');
  assert.equal(marchesWrap.children[8].textContent, '💥', 'Fighting monster must show 💥');
  assert.equal(marchesWrap.children[9].textContent, '↩️', 'Returning monster must show ↩️');
});
