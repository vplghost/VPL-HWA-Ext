import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { connectProfile } from './browser-cdp.mjs';
const profile = process.argv[2]; assert(profile && resolve(profile).startsWith(resolve('temp') + '\\'));
const c = await connectProfile(profile), report = { localFixtureOnly: true, modes: [], errors: [] };
const pause = () => new Promise(resolve => setTimeout(resolve, 100));
try {
  for (const target of (await c.send('Target.getTargets')).targetInfos) {
    if (target.type === 'page' && (target.url.includes('/speedup-fixture') || target.url.startsWith('chrome-extension://') && target.url.endsWith('/popup.html'))) {
      await c.send('Target.closeTarget', { targetId: target.targetId });
    }
  }
  for (const mode of ['direct', 'piggyback']) {
    for (const extension of (await c.send('Extensions.getExtensions')).extensions) await c.send('Extensions.uninstall', { id: extension.id });
    const { id } = await c.send('Extensions.loadUnpacked', { path: resolve('dist') });
    const popup = await c.page(`chrome-extension://${id}/popup.html`), p = popup.sessionId;
    await pause(); await pause();
    const initialDuration = 3600000, startDate = Date.now() - 60000;
    let used = 0, spent = 0;
    await c.evaluate(p, `chrome.storage.local.set(${JSON.stringify({ popupRpcEnabled: true, socketRefreshMode: mode, captureSettings: { interceptEnabled: true } })})`);
    const game = await c.page('about:blank');
    const removeListener = c.onEvent(event => {
      if ([p, game.sessionId].includes(event.sessionId) && event.method === 'Runtime.exceptionThrown') report.errors.push(event.params.exceptionDetails.text);
      if (event.sessionId !== game.sessionId || event.method !== 'Fetch.requestPaused') return;
      const { requestId, request } = event.params;
      let body = '<html><body><canvas id="gameCanvas"></canvas>Local speedup fixture</body></html>', type = 'text/html';
      if (request.url.includes('/api/')) {
        type = 'application/json'; const calls = JSON.parse(request.postData || '{}').calls || [];
        body = JSON.stringify({ results: calls.map(call => {
          let response = {};
          if (call.name === 'userGetInfo') response = { id: 1, name: 'Speedup fixture', level: 80, refillable: [] };
          if (call.name === 'getSummary' && call.feature === 'building') response = { buildings: [{ buildingId: 20, level: 20 }],
            queues: [{ buildingId: 20, nextLevel: 21, startDate, durationMs: initialDuration - spent * 60000 }] };
          if (call.name === 'getSummary' && call.feature === 'personalResearch') response = { completedResearches: [], queues: [] };
          if (call.name === 'getInventory') response = { inventory: { items: [{ type: 'speedUpConstruction', id: 1, quantity: 3 - spent }] } };
          if (call.name.startsWith('speedUp')) {
            assert.equal(call.name, 'speedUpConstructionWithResources'); assert.equal(call.feature, 'building');
            assert.deepEqual(call.args.resourcesToSpend, [{ type: 'speedUpConstruction', id: 1, amount: 3 }]);
            assert.deepEqual(call.args.resourcesToReward, []); assert.equal(call.args.buildingId, 20); assert.equal(call.args.nextLevel, 21);
            assert.match(call.ident, /^[a-f0-9]{32}$/); used++; spent += call.args.resourcesToSpend[0].amount;
          }
          return { ident: call.ident, result: { response } };
        }) });
      }
      c.send('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: type }, { name: 'Access-Control-Allow-Origin', value: '*' }, { name: 'Access-Control-Allow-Headers', value: '*' }], body: Buffer.from(body).toString('base64') }, game.sessionId).catch(error => report.errors.push(String(error)));
    });
    await c.send('Fetch.enable', { patterns: [{ urlPattern: '*' }] }, game.sessionId);
    await c.send('Page.navigate', { url: 'https://www.hero-wars-alliance.com/speedup-fixture' }, game.sessionId);
    await pause(); await pause();
    const rpc = calls => c.evaluate(game.sessionId, `fetch('https://api.hero-wars-alliance.com/api/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({calls:${JSON.stringify(calls)}})}).then(r=>r.json())`);
    const carrier = () => rpc([{ name: 'getMarches', feature: 'march', args: {}, ident: 'native-carrier' }]);
    await rpc([{ name: 'userGetInfo', args: {}, ident: 'account' }, { name: 'getSummary', feature: 'building', args: {}, ident: 'building' }, { name: 'getInventory', feature: 'inventory', args: {}, ident: 'items' }]);
    await pause(); await carrier(); await pause();
    await c.evaluate(p, `document.querySelector('[aria-label="Open Building Queue"]').click()`);
    await pause(); await carrier(); await pause();
    assert.equal(await c.evaluate(p, `!!document.querySelector('[data-speedup-form]')`), false);
    const triggerDetails = await c.evaluate(p, `(()=>{const el=document.querySelector('[data-speedup-control] button');return {border:getComputedStyle(el).borderTopWidth,context:el.parentElement.parentElement.textContent}})()`);
    assert.equal(triggerDetails.border, '0px'); assert.match(triggerDetails.context, /Progress:.*%/s);
    const openForm = async () => {
      if (!await c.evaluate(p, `!!document.querySelector('[data-speedup-form]')`)) {
        await c.evaluate(p, `document.querySelector('[data-speedup-control] button').click()`); await pause();
      }
    };
    await openForm();
    assert.ok(await c.evaluate(p, `Number(getComputedStyle(document.querySelector('[data-speedup-form]').closest('[role="dialog"]')).zIndex) > Number(getComputedStyle(document.querySelector('#building-dialog')).zIndex)`));
    await c.evaluate(p, `document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`); await pause();
    assert.equal(await c.evaluate(p, `!!document.querySelector('[data-speedup-form]')`), false);
    assert.ok(await c.evaluate(p, `!!document.querySelector('#building-dialog')`));
    const clickReview = async () => {
      await openForm();
      assert.equal(await c.evaluate(p, `Number(document.querySelector('[data-speedup-form] input').value)`), 3);
      await c.evaluate(p, `(()=>{const button=[...document.querySelectorAll('[data-speedup-form] button')].find(el=>el.textContent.includes('Review speedup'));if(!button||button.disabled)throw Error('Review disabled: '+document.body.innerText);button.click()})()`);
    };
    await clickReview(); await pause();
    assert.equal(used, 0);
    const confirmation = await c.evaluate(p, `document.querySelector('[aria-label="Confirm speedup use"]').innerText`);
    assert.match(confirmation, /Items will be consumed/); assert.match(confirmation, /3 ×/);
    await c.evaluate(p, `[...document.querySelectorAll('[aria-label="Confirm speedup use"] button')].find(el=>el.textContent==='Cancel').click()`);
    await pause(); assert.equal(used, 0);
    await clickReview(); await pause();
    await c.evaluate(p, `[...document.querySelectorAll('[aria-label="Confirm speedup use"] button')].find(el=>el.textContent.includes('Confirm &')).click()`);
    for (let step = 0; step < 8; step++) { await pause(); await carrier(); if (used) break; }
    await pause(); await carrier(); await pause();
    const state = await c.evaluate(p, `chrome.storage.local.get(['rpcCache','speedupSpendState'])`);
    assert.equal(used, 1); assert.equal(state.speedupSpendState.pending, null);
    assert.equal(state.rpcCache.speedupInventory.data.items[0].quantity, 0);
    assert.equal(state.rpcCache.buildingStatus.data.queues[0].durationMs, initialDuration - 180000);
    await c.evaluate(p, `document.querySelector('[aria-label="Close building dialog"]').click()`);
    const uiCache = state.rpcCache, uiAt = new Date().toISOString();
    uiCache.researchStatus = { updatedAt: uiAt, data: { queues: [{ researchId: 122, level: 4, startDate, durationMs: initialDuration }] } };
    uiCache['getHealing:unit'] = { updatedAt: uiAt, data: { healing: { startDate, duration: initialDuration, units: [{ unitId: 7, count: 5 }] }, injuredUnits: [{ unitId: 7, count: 5 }] } };
    uiCache['getUnitSummary:unit'] = { updatedAt: uiAt, data: { available: [], squads: [] } };
    await c.evaluate(p, `chrome.storage.local.set({rpcCache:${JSON.stringify(uiCache)}})`); await pause();
    assert.ok(await c.evaluate(p, `(()=>{const button=document.querySelector('button[aria-label="Speed up Hospital healing"]');return button && /[0-9]/.test(button.parentElement.parentElement.textContent) && getComputedStyle(button).borderTopWidth==='0px'})()`));
    await c.evaluate(p, `document.querySelector('[aria-label="Open Research Queue"]').click()`); await pause();
    assert.ok(await c.evaluate(p, `(()=>{const button=document.querySelector('#research-dialog [data-speedup-control] button');return button && button.parentElement.parentElement.textContent.includes('Progress:') && getComputedStyle(button).borderTopWidth==='0px'})()`));
    report.modes.push({ mode, confirmationBeforeSpend: true, cancelSpent: 0, speedupRequests: used,
      formHiddenByDefault: true, borderlessProgressIcon: true, escapePreservesParent: true, suggestedQuantity: 3,
      researchIconBesideProgress: true, healingIconBesideTimer: true,
      remainingItems: 0, reducedByMs: 180000, pendingCleared: true });
    report.extension = await c.evaluate(p, 'chrome.runtime.getManifest().version');
    removeListener(); await c.send('Target.closeTarget', { targetId: game.targetId }); await c.send('Target.closeTarget', { targetId: popup.targetId });
  }
  assert.equal(report.errors.length, 0); report.passed = true;
} catch (error) { report.passed = false; report.failure = String(error.stack || error); process.exitCode = 1; }
finally { await writeFile('temp/browser-speedup-compact-acceptance.json', JSON.stringify(report, null, 2)); console.log(report); c.close(); }
