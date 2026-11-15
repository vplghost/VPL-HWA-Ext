import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { connectProfile } from './browser-cdp.mjs';
const c = await connectProfile(process.argv[2]);
const report = { localFixtureOnly: true, modes: [], errors: [] };
const pause = () => new Promise(resolve => setTimeout(resolve, 150));
try {
  for (const mode of ['direct', 'piggyback']) {
    for (const ext of (await c.send('Extensions.getExtensions')).extensions) await c.send('Extensions.uninstall', { id: ext.id });
    const { id } = await c.send('Extensions.loadUnpacked', { path: resolve('dist') });
    const popup = await c.page(`chrome-extension://${id}/popup.html`), p = popup.sessionId;
    await pause(); await pause();
    await c.evaluate(p, `chrome.storage.local.set(${JSON.stringify({ popupRpcEnabled: true, socketRefreshMode: mode, captureSettings: { interceptEnabled: true } })})`);
    const game = await c.page('about:blank'); let version = 1, rallyReads = 0, incomingReads = 0;
    const remove = c.onEvent(event => {
      if ([p, game.sessionId].includes(event.sessionId) && event.method === 'Runtime.exceptionThrown') report.errors.push(event.params.exceptionDetails.text);
      if (event.sessionId !== game.sessionId || event.method !== 'Fetch.requestPaused') return;
      const { requestId, request } = event.params;
      let type = 'text/html', body = '<html><body><canvas id="gameCanvas"></canvas>Local world read fixture</body></html>';
      if (request.url.includes('/api/')) {
        type = 'application/json';
        body = JSON.stringify({ results: (JSON.parse(request.postData || '{}').calls || []).map(call => {
          let response = {};
          if (call.name === 'userGetInfo') response = { id: 1, name: 'World read fixture', level: 80, refillable: [] };
          if (call.name === 'getMarches') response = { marches: {} };
          if (call.name === 'getUnitSummary') response = { squads: [], available: [] };
          if (call.name === 'getIncomingMarches') { incomingReads++; response = { attacks: [] }; }
          if (call.name === 'getRallyById') { rallyReads++; response = { rally: { rallyId: 'fixture-rally', mapId: 'map', rallyVersion: version, leader: { userId: 2 }, members: [] } }; }
          return { ident: call.ident, result: { response } };
        }) });
      }
      c.send('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: type }, { name: 'Access-Control-Allow-Origin', value: '*' }, { name: 'Access-Control-Allow-Headers', value: '*' }], body: Buffer.from(body).toString('base64') }, game.sessionId).catch(error => report.errors.push(String(error)));
    });
    await c.send('Fetch.enable', { patterns: [{ urlPattern: '*' }] }, game.sessionId);
    await c.send('Page.navigate', { url: 'https://www.hero-wars-alliance.com/world-read-fixture' }, game.sessionId);
    await pause(); await pause();
    const rpc = calls => c.evaluate(game.sessionId, `fetch('https://api.hero-wars-alliance.com/api/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({calls:${JSON.stringify(calls)}})}).then(r=>r.json())`);
    const carrier = () => rpc([{ name: 'inventoryGet', args: {}, ident: 'native-carrier' }]);
    await rpc([{ name: 'userGetInfo', args: {}, ident: 'account' }]); await pause(); await carrier(); await pause();
    const target = (await c.send('Target.getTargets')).targetInfos.find(target => target.type === 'service_worker' && target.url === `chrome-extension://${id}/background.js`);
    assert.ok(target);
    const { sessionId: worker } = await c.send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
    await c.send('Runtime.enable', {}, worker);
    const optional = (calls, requiredVersion) => c.evaluate(worker, `(async()=>{const stored=await chrome.storage.local.get(['rpcCache','popupRpcEnabled','socketRefreshMode','captureSettings']);const tab=await findActiveGameTab();const calls=await passiveWorldReads(stored.rpcCache,${JSON.stringify(calls)},tab.id,Date.now(),{after:Date.now(),version:${requiredVersion ?? 'null'}});if(calls.length)await chrome.tabs.sendMessage(tab.id,{...rpcMessageForSettings(stored,calls),group:'world-fixture'});return calls.length})()`);
    const incoming = { name: 'getIncomingMarches', feature: 'march', args: {} };
    const beforeIncoming = incomingReads;
    for (let i = 0; i < 10; i++) assert.equal(await optional([incoming]), 0);
    await carrier(); await pause(); assert.equal(incomingReads, beforeIncoming);
    const call = { name: 'getRallyById', feature: 'rally', args: { rallyId: 'fixture-rally' } };
    await optional([call], 1); await pause(); await carrier(); await pause(); assert.equal(rallyReads, 1);
    version = 10;
    for (let required = 2; required <= 10; required++) assert.equal(await optional([call], required), 0);
    for (let step = 0; step < 80 && rallyReads < 2; step++) { await pause(); await carrier(); }
    await pause(); assert.equal(rallyReads, 2, 'one actual Chrome alarm covers the burst');
    assert.equal(await optional([call], 10), 0); await carrier(); await pause(); assert.equal(rallyReads, 2);
    const state = await c.evaluate(p, `chrome.storage.local.get(['worldReadState','rpcCache'])`);
    assert.equal(state.rpcCache.rallyReadStatus.data.rallies['fixture-rally'].version, 10);
    assert.ok(Object.values(state.worldReadState.entries).every(row => !row.pending));
    report.modes.push({ mode, incomingExtraReadsForTenChecks: incomingReads - beforeIncoming, rallyRequestsForTenVersions: rallyReads, trailingAlarmConfirmed: true, latestVersion: 10 });
    remove(); await c.send('Target.closeTarget', { targetId: game.targetId }); await c.send('Target.closeTarget', { targetId: popup.targetId });
  }
  assert.deepEqual(report.errors, []);
} finally {
  await writeFile('temp/browser-world-read-acceptance.json', JSON.stringify(report, null, 2));
  await c.send('Browser.close').catch(() => {}); c.close();
}
console.log(JSON.stringify(report, null, 2));
