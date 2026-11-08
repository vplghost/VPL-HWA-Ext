import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.listeners = {}; this.dataset = {}; this.value = ''; this.textContent = ''; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { (this.attributes ||= {})[name] = String(value); }
  addEventListener(name, handler) { this.listeners[name] = handler; }
  async fire(name) { await this.listeners[name]?.(); }
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

test('rally form persists chosen lineup and last searched level, updates troop allocation and restricts waits', async () => {
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

test('Monster dialog searches by level, starts selected team attack and shows recent results', async () => {
  assert.match(popupHtml, /<dialog id="monster-dialog"[\s\S]*id="monster-dialog-body"[\s\S]*<\/dialog>/);
  const body = new Element('div');
  const sent = []; const saved = {};
  const heroes = Object.fromEntries([1, 2, 3, 4, 5].map((id) => [id, { power: id, troopCapacity: 500 }]));
  const cache = { accountStatus: { data: { id: 10 } }, heroGetAll: { data: heroes },
    'getUnitSummary:unit': { data: { available: [7, 17, 27].map((unitId) => ({ unitId, count: 9000 })) } },
    experimentalMapContext: { data: { mapId: 'map', center: { x: 1, y: 2 } } },
    experimentalSoloSearch: { data: { mapId: 'map', mobConfigIds: [37, 67],
      mobs: [{ mobId: 'mob-1', coordinates: { x: 3, y: 4 } }] } },
    soloAttackResults: { data: [{ mobConfigId: 67, result: 'win', createdAt: Date.now() }] } };
  const context = vm.createContext({ document: { createElement: (tag) => new Element(tag),
    querySelector: () => body }, currentCache: cache, popupRpcEnabled: true, experimentalPending: null,
    experimentalMessage: '', monsterMessage: '', monsterQueueState: {
      phase: 'stopped', options: { count: 4 }, reason: 'Stopped by user.' },
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
  const section = () => body.children[0];
  const text = (node) => node.textContent + node.children.map(text).join(' ');
  assert.match(text(section()), /Recent attack results/);
  assert.match(text(section()), /Level 15 · win/);
  assert.match(text(section()), /Previous queue: stopped/);
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

  // Lineup label includes hero names in parentheses
  const labels = section().all('label');
  assert.match(labels[0].textContent, /Lineup \(Hero 1 · Hero 2 · Hero 3 · Hero 4 · Hero 5\)/, 'Monster lineup label contains hero names');

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

test('Raid rally shows Stop queue inline when queue is running, hides Start queue, and updates title status', async () => {
  const sent = [];
  const raidBody = new Element('div');
  const raidStatus = new Element('div');
  const elements = {
    '#raid-dialog-body': raidBody,
    '#raid-dialog-status': raidStatus
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
  const elements = {
    '#gather-dialog-body': gatherBody,
    '#gather-dialog-status': gatherStatus
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

  // Lineup label includes hero names in parentheses and Troops input is on the same row (teamRow)
  const teamRowLabels = gather().children[1].all('label');
  assert.equal(teamRowLabels.length, 2, 'teamRow must have exactly Lineup and Troops labels on same row');
  assert.match(teamRowLabels[0].textContent, /Lineup \(/, 'Lineup label contains lineup parentheses');
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
