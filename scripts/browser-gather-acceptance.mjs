import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { connectProfile } from './browser-cdp.mjs';

// Only a NEW caller-created disposable profile; all game requests are fulfilled locally.
const profile = process.argv[2];
const occupiedRace = process.argv[3] === 'occupied-race';
assert(profile && resolve(profile).startsWith(resolve('temp') + '\\'));
const fixture = JSON.parse(await readFile('tests/fixtures/gather-reload-20261115.json', 'utf8'));
const helper = { TextEncoder };
vm.runInNewContext(await readFile('extension/rpc-cache.js', 'utf8'), helper);
const cache = helper.hwaHelperRpcCache.merge({}, fixture.records).cache;
const now = Date.now();
for (const entry of Object.values(cache)) if (entry && typeof entry === 'object' && 'updatedAt' in entry) entry.updatedAt = new Date(now).toISOString();
cache.questResetStatus.data.nextDayAt = now + 3600000;
cache.incomingMineAttacks = { updatedAt: new Date(now).toISOString(), data: { accountId: '1', snapshotAt: now, attacks: {}, ended: {} } };
const observed = name => {
  for (const record of fixture.records.toReversed()) {
    const call = JSON.parse(record.requestBody).calls.find(c => c.name === name);
    if (call) return structuredClone(JSON.parse(record.responseBody).results.find(r => r.ident === call.ident).result.response);
  }
};
const marches = observed('getMarches'), units = observed('getUnitSummary');
const report = { mode: 'direct', scenario: occupiedRace ? 'occupied-resume-and-target-race' : 'vacant-targets', localFixtureOnly: true, calls: [], errors: [], attackTargets: [] };
const c = await connectProfile(profile);
let game;
try {
  report.browser = await c.send('Browser.getVersion');
  const { id } = await c.send('Extensions.loadUnpacked', { path: resolve('dist') });
  const popup = await c.page(`chrome-extension://${id}/popup.html`), p = popup.sessionId;
  await new Promise(r => setTimeout(r, 250));
  await c.evaluate(p, `chrome.storage.local.set(${JSON.stringify({ rpcCache: cache, popupRpcEnabled: true, socketRefreshMode: 'direct', captureSettings: { interceptEnabled: true }, autoGatherSettings: { enabled: false, smartEnabled: true, maxMarches: 3, mineType: 'rotate', mineLevel: 10 } })})`);
  if (occupiedRace) await c.evaluate(p, `chrome.storage.local.set(${JSON.stringify({ smartGatherState: { accountId: 1, interrupted: [{ mineId: 'test-occupied', mapId: cache.experimentalMapContext.data.mapId, configId: 32, coordinates: { x: 607, y: 376 } }] } })})`);
  report.extension = await c.evaluate(p, 'chrome.runtime.getManifest().version');
  game = await c.page('about:blank');
  let attacks = 0, searches = 0, rejectedAttacks = 0;
  c.onEvent(event => {
    if (event.sessionId !== game.sessionId || event.method !== 'Fetch.requestPaused') return;
    const { requestId, request } = event.params;
    let body = '<html><body><canvas id="gameCanvas"></canvas>Controlled gathering acceptance</body></html>', type = 'text/html';
    if (request.url.includes('/api/')) {
      type = 'application/json';
      let calls = []; try { calls = JSON.parse(request.postData || '{}').calls || []; } catch {}
      report.calls.push(calls.map(call => call.name));
      const results = calls.map(call => {
        let response = {};
        if (call.name === 'searchMine') response = { mines: [{ mineId: 'test-mine-' + (++searches), coordinates: { x: 607 + searches, y: 376 } }] };
        else if (call.name === 'getMineById') response = { mineId: call.args.mineId, resourceAmount: 5708965, gathering: { user: { userId: 2 } } };
        else if (call.name === 'attackMine') {
          report.attackTargets.push({ mineId: call.args.mineId, battleType: call.args.battleType });
          if (occupiedRace && rejectedAttacks === 0) {
            rejectedAttacks++;
            return { ident: call.ident, result: { response: { errorCode: 'BattleTypeMismatch' } } };
          }
          const squadId = 'test-gather-' + (++attacks), at = Date.now();
          response = { squadId, route: { type: 'toTargetSolo', startedAt: at, durationMs: 1000 } };
          units.squads.push({ id: squadId, heroes: call.args.squad.heroes.map(h => ({ id: h.heroId })), units: call.args.squad.units.map(u => ({ id: u.unitId, state: { survived: u.count } })) });
          for (const u of call.args.squad.units) units.available.find(row => row.unitId === u.unitId).count -= u.count;
          marches.marches.interactionWithTarget.push({ squadId, mapId: cache.experimentalMapContext.data.mapId, target: { objectId: call.args.mineId, objectType: 'mine', objectConfigId: 32, coordinates: { x: 607 + searches, y: 376 } }, startedAt: at, durationMs: 7200000 });
        } else if (call.name === 'getMarches') response = marches;
        else if (call.name === 'getUnitSummary') response = units;
        else if (call.name === 'getDailyQuests') response = cache['getDailyQuests:quest'].data;
        else if (call.name === 'user_getNextDayTime') response = { nextDayTime: Math.floor((Date.now() + 3600000) / 1000) };
        else if (call.name === 'heroGetAll') response = cache.heroGetAll.data;
        else if (call.name === 'getIncomingMarches') response = { attacks: [], scouts: [] };
        else if (call.name === 'getMineSummary') response = { gatherings: [] };
        return { ident: call.ident, result: { response } };
      });
      body = JSON.stringify({ results });
    }
    c.send('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: type }, { name: 'Access-Control-Allow-Origin', value: '*' }, { name: 'Access-Control-Allow-Headers', value: '*' }], body: Buffer.from(body).toString('base64') }, game.sessionId).catch(e => report.errors.push(String(e)));
  });
  await c.send('Fetch.enable', { patterns: [{ urlPattern: '*' }] }, game.sessionId);
  await c.send('Page.navigate', { url: 'https://www.hero-wars-alliance.com/gather-acceptance' }, game.sessionId);
  await new Promise(r => setTimeout(r, 350));
  await c.evaluate(game.sessionId, `fetch('https://api.hero-wars-alliance.com/api/rpc',{method:'POST',headers:{'Content-Type':'application/json','X-Fixture':'local-only'},body:JSON.stringify({calls:[{name:'getMarches',feature:'march',ident:'baseline'}]})}).then(r=>r.json())`);
  await c.evaluate(p, `chrome.storage.local.set({autoGatherSettings:{enabled:true,smartEnabled:true,maxMarches:3,mineType:'rotate',mineLevel:10}}).then(()=>chrome.runtime.sendMessage({kind:'auto-gather-start'}))`);
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 500));
    report.state = await c.evaluate(p, `chrome.storage.local.get(['rpcCache','smartGatherState']).then(s=>({count:s.rpcCache?.marchStatus?.data?.marches?.length,state:s.smartGatherState}))`);
    if (report.state.count === 3) break;
    if (report.state.state?.error) throw Error(report.state.state.error);
  }
  assert.equal(report.state.count, 3, JSON.stringify(report.state));
  assert.equal(attacks, 2);
  if (occupiedRace) {
    assert.equal(rejectedAttacks, 1);
    assert.equal(report.attackTargets.length, 3);
    assert(!report.attackTargets.some(row => row.mineId === 'test-occupied'));
    assert.equal(new Set(report.attackTargets.map(row => row.mineId)).size, 3, 'Rejected target is never resent');
  }
  assert(report.attackTargets.every(row => row.battleType === 'pve'));
  assert.equal(report.errors.length, 0);
  report.passed = true;
} catch (error) { report.passed = false; report.failure = String(error.stack || error); process.exitCode = 1; }
finally {
  if (game) await c.send('Target.closeTarget', { targetId: game.targetId }).catch(() => {});
  await writeFile(occupiedRace ? 'temp/browser-gather-occupied-acceptance.json' : 'temp/browser-gather-acceptance.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  c.close();
}
