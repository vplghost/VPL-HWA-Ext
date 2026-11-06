import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.listeners = {}; this.dataset = {}; this.value = ''; this.textContent = ''; }
  append(...children) { this.children.push(...children); }
  addEventListener(name, handler) { this.listeners[name] = handler; }
  async fire(name) { await this.listeners[name]?.(); }
  all(tag) { return this.children.flatMap((child) => [ ...(child.tagName === tag ? [child] : []), ...child.all(tag) ]); }
}
const popup = await readFile(new URL('../extension/popup.js', import.meta.url), 'utf8');
const dataSource = await readFile(new URL('../extension/experimental-data.js', import.meta.url), 'utf8');
const renderer = popup.slice(popup.indexOf('function renderExperimental('), popup.indexOf('async function experimentalRpc('));
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
  const context = vm.createContext({ document: { createElement: (tag) => new Element(tag) },
    view: new Element('div'), status: {}, currentCache: cache, experimentalPending: null, experimentalMessage: '',
    popupRpcEnabled: true, currentRpcPolicy: { mode: 'piggyback', monitor: true }, raidQueueState: null, troopCapacitySettings: { defaultHero: 600, base: 950 },
    hwaHelperNameMap: { hero: (id) => `Hero ${id}` },
    hwaHelperPopupData: { isMarchExpired: () => false },
    chrome: { storage: { local: { set: async (values) => Object.assign(stored, JSON.parse(JSON.stringify(values))) } },
      runtime: { sendMessage: async (message) => { sent.push(message); return { ok: true }; } } },
    experimentalRpc: async (calls) => sent.push({ calls }),
    experimentalSelection: { rallyTeam: 'weakest', gatherTeam: 'weakest', bossLevel: 1, searchedBossLevel: 1,
      waitSeconds: 300, minMembers: 4, raidCount: 2, baseTroops: 200, capacities: {}, units: '', mineType: 'food', mineLevel: 1 } });
  vm.runInContext(dataSource, context);
  context.render = () => { context.view.children = []; context.renderExperimental(cache); };
  vm.runInContext(save + '\n' + renderer, context);
  context.render();
  const rally = () => context.view.children[0];
  const text = (node) => node.textContent + node.children.map(text).join(' ');
  assert.match(text(rally()), /Troops: 3465 \/ 3465/);
  assert.match(text(rally()), /Marksmen: 1155/);
  assert.match(text(rally()), /Spearmen: 1155/);
  assert.match(text(rally()), /Infantry: 1155/);
  assert.equal(rally().all('input').length, 2, 'rally only needs member threshold and raid count inputs');
  let team = rally().all('select')[0]; team.value = 'raid:0'; await team.fire('change');
  assert.equal(stored.raidPreferences.rallyTeam, 'raid:0');
  assert.match(text(rally()), /Troops: 3470 \/ 3470/);
  let level = rally().all('select')[1]; level.value = '3'; await level.fire('change');
  const wait = rally().all('select')[2];
  assert.deepEqual(wait.children.map((option) => Number(option.value)), [60, 300, 900, 1800]);
  wait.value = '900'; await wait.fire('change');
  assert.equal(stored.raidPreferences.bossLevel, 1, 'editing the form must not replace the last searched level');
  await rally().all('button').find((button) => button.textContent === 'Find boss').fire('click');
  assert.equal(stored.raidPreferences.bossLevel, 3);
  assert.equal(sent.at(-1).calls[0].args.mobConfigIds[0], 62);
  assert.equal(stored.raidPreferences.accountId, 10);
});
