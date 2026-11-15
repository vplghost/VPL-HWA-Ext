import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { connectProfile } from './browser-cdp.mjs';
const profile = process.argv[2]; assert(profile && resolve(profile).startsWith(resolve('temp') + '\\'));
const c = await connectProfile(profile), report = { localFixtureOnly: true, errors: [] };
try {
  const { id } = await c.send('Extensions.loadUnpacked', { path: resolve('dist') });
  const { sessionId: p } = await c.page(`chrome-extension://${id}/popup.html`);
  c.onEvent(event => { if (event.sessionId === p && event.method === 'Runtime.exceptionThrown') report.errors.push(event.params.exceptionDetails.text); });
  await new Promise(r => setTimeout(r, 300));
  const ids = [1, 2, 3, 4, 5], cache = { accountStatus: { data: { id: 1 } },
    heroGetAll: { data: Object.fromEntries([...ids, 6, 7, 8, 9, 10].map(id => [id, { id, power: id <= 5 ? 100 : 100000, level: 80, star: 1 }])) },
    'getUnitSummary:unit': { data: { available: [{ unitId: 1, count: 100 }] } },
    experimentalMapContext: { data: { mapId: 'fixture-map', center: { x: 1, y: 1 } } },
    experimentalSoloSearch: { data: { mapId: 'fixture-map', mobConfigIds: [23, 53], mobs: [{ mobId: 'target' }] } } };
  await c.evaluate(p, `chrome.storage.local.set(${JSON.stringify({ rpcCache: cache, popupRpcEnabled: false,
    monsterPreferences: { accountId: 1, teamId: 'custom:weak', mobLevel: 1 },
    customTeams: { 1: [{ id: 'weak', name: 'Weak fixture', heroIds: ids }, { id: 'strong', name: 'Strong fixture', heroIds: [6, 7, 8, 9, 10] }] } })})`);
  await new Promise(r => setTimeout(r, 150));
  await c.evaluate(p, `document.querySelector('#open-monster-dialog').click()`);
  await new Promise(r => setTimeout(r, 250));
  const read = () => c.evaluate(p, `document.querySelector('#monster-power-comparison')?.innerText || ''`);
  report.weak = await read(); assert.match(report.weak, /Risk of defeat/); assert.match(report.weak, /800/); assert.match(report.weak, /Both level presets/);
  await c.evaluate(p, `(()=>{const el=document.querySelector('#monster-team-select');el.value='custom:strong';el.dispatchEvent(new Event('change',{bubbles:true}))})()`);
  await new Promise(r => setTimeout(r, 200));
  report.strong = await read(); assert.match(report.strong, /does not guarantee victory/); assert.doesNotMatch(report.strong, /Risk of defeat/);
  await c.evaluate(p, `(()=>{const el=document.querySelector('#monster-mob-level');el.value='2';el.dispatchEvent(new Event('change',{bubbles:true}))})()`);
  await new Promise(r => setTimeout(r, 100)); assert.equal(await read(), ''); report.staleLevelHidden = true;
  cache.experimentalSoloSearch.data.mobConfigIds = [24, 54];
  cache.heroGetAll.data[6].power = undefined;
  await c.evaluate(p, `chrome.storage.local.set({rpcCache:${JSON.stringify(cache)}})`);
  await new Promise(r => setTimeout(r, 150));
  report.partial = await read(); assert.match(report.partial, /Level 2/); assert.match(report.partial, /Incomplete squad power/); assert.match(report.partial, /400k\+/);
  assert.equal(report.errors.length, 0); report.extension = await c.evaluate(p, 'chrome.runtime.getManifest().version'); report.passed = true;
} catch (error) { report.passed = false; report.failure = String(error.stack || error); process.exitCode = 1; }
finally { await writeFile('temp/browser-monster-power-acceptance.json', JSON.stringify(report, null, 2)); console.log(report); c.close(); }
