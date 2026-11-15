import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { connectProfile } from './browser-cdp.mjs';
const profile = process.argv[2];
assert(profile && resolve(profile).startsWith(resolve('temp') + '\\'));
const c = await connectProfile(profile), report = { localFixtureOnly: true, popupClosed: false, calls: [], errors: [] };
let game;
try {
  for (const extension of (await c.send('Extensions.getExtensions')).extensions) await c.send('Extensions.uninstall', { id: extension.id });
  const { id } = await c.send('Extensions.loadUnpacked', { path: resolve('dist') });
  report.browser = await c.send('Browser.getVersion');
  const popup = await c.page(`chrome-extension://${id}/popup.html`), p = popup.sessionId;
  await new Promise(r => setTimeout(r, 300));
  report.extension = await c.evaluate(p, 'chrome.runtime.getManifest().version');
  await c.evaluate(p, `chrome.storage.local.set({popupRpcEnabled:true,socketRefreshMode:'direct',captureSettings:{interceptEnabled:true},autoFreeSpinEnabled:false})`);
  game = await c.page('about:blank');
  const readyAt = Math.floor((Date.now() + 3000) / 1000) * 1000;
  let spins = 0, lastRefill = Math.floor((readyAt - 28800000) / 1000);
  c.onEvent(event => {
    if (event.sessionId !== game.sessionId || event.method !== 'Fetch.requestPaused') return;
    const { requestId, request } = event.params;
    let body = '<html><body><canvas id="gameCanvas"></canvas>Free spin local fixture</body></html>', type = 'text/html';
    if (request.url.includes('/api/')) {
      type = 'application/json'; let calls = []; try { calls = JSON.parse(request.postData || '{}').calls || []; } catch {}
      report.calls.push(calls.map(call => call.name));
      body = JSON.stringify({ results: calls.map(call => {
        let response = {};
        if (call.name === 'userGetInfo') response = { id: 1, name: 'Free spin fixture', level: 80, gold: 1000 + spins * 73800, refillable: [{ id: 53, amount: !spins && Date.now() >= readyAt ? 1 : 0, lastRefill }] };
        if (call.name === 'user_getNextDayTime') response = Math.floor((Date.now() + 3600000) / 1000);
        if (call.name === 'refillable_alchemyUseVideo') {
          assert.equal(call.args.type, 'alchemy'); assert.equal(Object.keys(call.args).length, 1); assert(!call.feature);
          spins++; lastRefill = Math.floor(Date.now() / 1000); response = [{ reward: { gold: 73800 }, crit: 2 }];
        }
        return { ident: call.ident, result: { response } };
      }) });
    }
    c.send('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: type }, { name: 'Access-Control-Allow-Origin', value: '*' }, { name: 'Access-Control-Allow-Headers', value: '*' }], body: Buffer.from(body).toString('base64') }, game.sessionId).catch(e => report.errors.push(String(e)));
  });
  await c.send('Fetch.enable', { patterns: [{ urlPattern: '*' }] }, game.sessionId);
  await c.send('Page.navigate', { url: 'https://www.hero-wars-alliance.com/free-spin-acceptance' }, game.sessionId);
  await new Promise(r => setTimeout(r, 300));
  await c.evaluate(game.sessionId, `fetch('https://api.hero-wars-alliance.com/api/rpc',{method:'POST',headers:{'Content-Type':'application/json','X-Fixture':'local'},body:JSON.stringify({calls:[{name:'userGetInfo',ident:'baseline'}]})}).then(r=>r.json())`);
  await new Promise(r => setTimeout(r, 200));
  await c.evaluate(p, `(()=>{[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')==='Settings').click()})()`);
  await new Promise(r => setTimeout(r, 150));
  await c.evaluate(p, `document.querySelector('#setting-auto-free-spin').click()`);
  await new Promise(r => setTimeout(r, 150));
  await c.send('Target.closeTarget', { targetId: popup.targetId }); report.popupClosed = true;
  const worker = (await c.send('Target.getTargets')).targetInfos.find(t => t.type === 'service_worker' && t.url.includes(id));
  const { sessionId: w } = await c.send('Target.attachToTarget', { targetId: worker.targetId, flatten: true });
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 250));
    report.state = await c.evaluate(w, `chrome.storage.local.get(['autoFreeSpinState','rpcCache']).then(s=>({automation:s.autoFreeSpinState,receipt:s.rpcCache?.freeAlchemySpinStatus,gold:s.rpcCache?.['resource:gold']?.data?.amount}))`);
    if (report.state.receipt?.data?.success && !report.state.automation?.pending) break;
  }
  assert.equal(spins, 1); assert.equal(report.state.receipt?.data?.success, true); assert.equal(report.state.automation.pending, null);
  assert(report.calls.length < 30, 'Quota refresh must not create an RPC feedback loop');
  assert(report.state.automation.wakeAt > Date.now()); assert.equal(report.state.gold, 74800);
  await new Promise(r => setTimeout(r, 1000)); assert.equal(spins, 1); assert.equal(report.errors.length, 0);
  report.passed = true;
} catch (error) { report.passed = false; report.failure = String(error.stack || error); process.exitCode = 1; }
finally {
  if (game) await c.send('Target.closeTarget', { targetId: game.targetId }).catch(() => {});
  await writeFile('temp/browser-free-spin-acceptance.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, extension: report.extension, popupClosed: report.popupClosed, callCount: report.calls.length, state: report.state, failure: report.failure }, null, 2)); c.close();
}
