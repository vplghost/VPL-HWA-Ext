import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { connectProfile } from './browser-cdp.mjs';
const profile = process.argv[2]; assert(profile && resolve(profile).startsWith(resolve('temp') + '\\'));
const c = await connectProfile(profile), report = { errors: [] };
try {
  for (const extension of (await c.send('Extensions.getExtensions')).extensions) await c.send('Extensions.uninstall', { id: extension.id });
  const { id } = await c.send('Extensions.loadUnpacked', { path: resolve('dist') });
  const page = await c.page(`chrome-extension://${id}/popup.html`), p = page.sessionId;
  await new Promise(r => setTimeout(r, 300));
  await c.send('Runtime.enable', {}, p);
  c.onEvent(event => { if (event.sessionId === p && event.method === 'Runtime.exceptionThrown') report.errors.push(event.params.exceptionDetails.text); });
  const cache = { accountStatus: { data: { id: 1 } }, heroGetAll: { data: { 1: { power: 1000, level: 80, star: 1 }, 2: { power: 2000, level: 80, star: 1 } } },
    teamGetAll: { data: { arena: { 0: 1, 1: 2 }, grand: { 0: [1, 2], 1: { 0: 2 } }, dungeon: { 0: 4000 } } }, titanGetAll: { data: { 4000: { power: 4000, star: 1, level: 20 } } } };
  await c.evaluate(p, `chrome.storage.local.set(${JSON.stringify({ rpcCache: cache, customTeams: { 1: [{ id: 'legacy', name: 'Legacy Gather', heroIds: { 0: 1, 1: 2 } }] } })})`);
  await c.evaluate(p, `(()=>{[...document.querySelectorAll('nav button')].find(b=>b.innerText.includes('Teams')).click()})()`);
  await new Promise(r => setTimeout(r, 250));
  const text = () => c.evaluate(p, 'document.querySelector("main").innerText');
  const first = await text(); assert(first.includes('Teams Management')); assert(first.includes('Legacy Gather')); assert(/Power:\s*3,000/.test(first));
  cache.heroGetAll.data[1].power = 7000;
  await c.evaluate(p, `chrome.storage.local.set({rpcCache:${JSON.stringify(cache)}})`); await new Promise(r => setTimeout(r, 150));
  const refreshed = await text(); assert(/Power:\s*9,000/.test(refreshed)); assert(refreshed.includes('Arena Defense'));
  assert.equal(report.errors.length, 0); report.passed = true; report.extension = await c.evaluate(p, 'chrome.runtime.getManifest().version'); report.heroCacheRefreshPower = 9000;
} catch (error) { report.passed = false; report.failure = String(error.stack || error); process.exitCode = 1; }
finally { await writeFile('temp/browser-teams-acceptance.json', JSON.stringify(report, null, 2)); console.log(report); c.close(); }
