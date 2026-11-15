import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { connectProfile } from './browser-cdp.mjs';
const c = await connectProfile(process.argv[2]);
const report = { localFixtureOnly: true, modes: [], errors: [] };
const pause = () => new Promise(resolve => setTimeout(resolve, 150));
try {
  for (const target of (await c.send('Target.getTargets')).targetInfos) {
    if (target.type === 'page' && (target.url.includes('/mail-fixture') || target.url.startsWith('chrome-extension://'))) await c.send('Target.closeTarget', { targetId: target.targetId });
  }
  for (const mode of ['direct', 'piggyback']) {
    for (const ext of (await c.send('Extensions.getExtensions')).extensions) await c.send('Extensions.uninstall', { id: ext.id });
    const { id } = await c.send('Extensions.loadUnpacked', { path: resolve('dist') });
    const popup = await c.page(`chrome-extension://${id}/popup.html`), p = popup.sessionId;
    await pause(); await pause();
    await c.evaluate(p, `chrome.storage.local.set(${JSON.stringify({ popupRpcEnabled: true, socketRefreshMode: mode, captureSettings: { interceptEnabled: true } })})`);
    const game = await c.page('about:blank');
    let claims = 0, reads = 0, helperMarchReads = 0;
    const observedCalls = [];
    const until = Math.floor(Date.now() / 1000) + 3600;
    const remove = c.onEvent(event => {
      if ([p, game.sessionId].includes(event.sessionId) && event.method === 'Runtime.exceptionThrown') report.errors.push(event.params.exceptionDetails.text);
      if (event.sessionId !== game.sessionId || event.method !== 'Fetch.requestPaused') return;
      const { requestId, request } = event.params;
      let type = 'text/html', body = '<html><body><canvas id="gameCanvas"></canvas>Mail fixture</body></html>';
      if (request.url.includes('/api/')) {
        type = 'application/json';
        body = JSON.stringify({ results: (JSON.parse(request.postData || '{}').calls || []).map(call => {
          observedCalls.push({ name: call.name, ident: call.ident });
          let response = {};
          if (call.name === 'userGetInfo') response = { id: 1, name: 'Mail fixture', level: 80, gold: 100 + 50 * claims, refillable: [] };
          if (call.name === 'mailGetAll') { reads++; response = { letters: claims ? [] : [{ id: 101, reward: { gold: 50 }, availableUntil: until }, { id: 102, reward: { gold: 999 }, availableUntil: 1 }, { id: 103, availableUntil: 0 }] }; }
          if (call.name === 'mailFarm') { assert.deepEqual(call.args.letterIds.map(String), ['101']); assert.match(call.ident, /^[a-f0-9]{32}$/); claims++; response = { 101: { gold: 50 } }; }
          if (call.name === 'getPage') response = { reports: [] };
          if (call.name === 'getMarches') { if (call.ident !== 'native') helperMarchReads++; response = { marches: [] }; }
          if (call.name === 'getUnitSummary') response = { squads: [], available: [] };
          return { ident: call.ident, result: { response } };
        }) });
      }
      c.send('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: type }, { name: 'Access-Control-Allow-Origin', value: '*' }, { name: 'Access-Control-Allow-Headers', value: '*' }], body: Buffer.from(body).toString('base64') }, game.sessionId).catch(error => report.errors.push(String(error)));
    });
    await c.send('Fetch.enable', { patterns: [{ urlPattern: '*' }] }, game.sessionId);
    await c.send('Page.navigate', { url: 'https://www.hero-wars-alliance.com/mail-fixture' }, game.sessionId);
    await pause(); await pause();
    const rpc = calls => c.evaluate(game.sessionId, `fetch('https://api.hero-wars-alliance.com/api/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({calls:${JSON.stringify(calls)}})}).then(r=>r.json())`);
    const carrier = () => rpc([{ name: 'getMarches', feature: 'march', args: {}, ident: 'native' }]);
    await rpc([{ name: 'userGetInfo', args: {}, ident: 'account' }, { name: 'mailGetAll', args: {}, ident: 'mail' }]);
    await pause(); await carrier(); await pause();
    const beforeEnergyRefresh = helperMarchReads;
    await rpc([{ name: 'userGetInfo', args: {}, ident: 'energy-refresh-1' }]);
    await rpc([{ name: 'userGetInfo', args: {}, ident: 'energy-refresh-2' }]);
    await pause(); await carrier(); await pause();
    assert.equal(helperMarchReads, beforeEnergyRefresh, 'energy refresh must not request marches: ' + JSON.stringify(observedCalls));
    const before = reads;
    await c.evaluate(p, `document.querySelector('[aria-label="Open mail"]').click()`); await pause();
    assert.equal(reads, before);
    assert.ok(await c.evaluate(p, `!!document.querySelector('[data-mail-id="101"]')`));
    assert.equal(await c.evaluate(p, `!!document.querySelector('[data-mail-id="102"]')`), false);
    assert.match(await c.evaluate(p, `document.querySelector('[data-mail-id="103"]').innerText`), /Expiry not provided/);
    await c.evaluate(p, `document.querySelector('[data-mail-id="101"] button').click()`);
    for (let i = 0; i < 10; i++) { await pause(); await carrier(); if (claims) break; }
    await pause(); await carrier(); await pause();
    const stored = await c.evaluate(p, `chrome.storage.local.get(['rpcCache','mailClaimState'])`);
    assert.equal(claims, 1); assert.equal(stored.mailClaimState.pending, null);
    assert.equal(stored.rpcCache.mailStatus.data.letters.length, 0);
    await c.evaluate(p, `document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
    const marchAt = Date.now();
    stored.rpcCache.marchStatus = { updatedAt: new Date(marchAt).toISOString(), data: { marches: [1, 2, 3].map(i => ({ squadId: 'gather-' + i, kind: 'food', stage: 'gathering', mineId: 'mine-' + i, startedAt: marchAt - 1800000, durationMs: 3600000, endsAt: marchAt + 1800000, gatheringTotalAmount: 2000000 })) } };
    await c.evaluate(p, `chrome.storage.local.set({rpcCache:${JSON.stringify(stored.rpcCache)}})`); await pause();
    const layout = await c.evaluate(p, `(()=>{const grid=document.querySelector('[data-march-grid]');const cards=[...grid.children].map(el=>el.getBoundingClientRect().toJSON());return {columns:getComputedStyle(grid).gridTemplateColumns,cards,text:grid.innerText,overflow:grid.scrollWidth>grid.clientWidth+1}})()`);
    assert.equal(layout.cards.length, 3); assert.equal(layout.cards[0].y, layout.cards[1].y); assert.ok(layout.cards[1].x > layout.cards[0].x); assert.ok(layout.cards[2].y > layout.cards[0].y); assert.equal(layout.overflow, false);
    assert.match(layout.text, /Est\. [\d.]+[kM] \/ 2M/); assert.doesNotMatch(layout.text, /Est\. [\d.]+[kM] Food/);
    report.modes.push({ mode, claims, openDoesNotRefresh: true, expiredHidden: true, unknownExpiryPreserved: true, receiptSettled: true, marchTwoColumns: true, compactGatherAmounts: true, extraMarchReadsForTwoEnergyRefreshes: helperMarchReads - beforeEnergyRefresh });
    remove(); await c.send('Target.closeTarget', { targetId: game.targetId }); await c.send('Target.closeTarget', { targetId: popup.targetId });
  }
  assert.deepEqual(report.errors, []);
} finally {
  await writeFile('temp/browser-mail-acceptance.json', JSON.stringify(report, null, 2));
  await c.send('Browser.close').catch(() => {}); c.close();
}
console.log(JSON.stringify(report, null, 2));
