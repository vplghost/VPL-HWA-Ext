import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { connectProfile } from './browser-cdp.mjs';

// Caller starts Chrome with a NEW disposable profile and unsafe extension debugging.
// Every request from the game fixture is fulfilled locally; no game server is used.
const profile = process.argv[2];
assert(profile && resolve(profile).startsWith(resolve('temp') + '\\'), 'Use a disposable profile inside repo/temp');
const out = resolve('temp/browser-acceptance');
await mkdir(out, { recursive: true });
const c = await connectProfile(profile);
const report = { browser: await c.send('Browser.getVersion'), artifacts: [], limitations: [
  'Game HTML and every network response are local fixtures; no live account or game mutation was used.',
  'Dialogs are opened through their compiled Vue v-model callbacks; this proves rendering, not every UI entry point.',
  'MQTT mode queue routing is exercised; no live broker, encrypted packet or Unity engine is present.',
  'Long-running automation completion, server validation and manual visual/accessibility acceptance remain live checks.'
] };
const wait = (ms = 120) => new Promise(r => setTimeout(r, ms));
const walk = `function walk(v,a=[]){if(!v||typeof v!=='object')return a;if(v.component){a.push(v.component);walk(v.component.subTree,a)}if(Array.isArray(v.children))v.children.forEach(x=>walk(x,a));return a}`;
try {
 for (const artifact of ['dist', '.output/chrome-mv3']) {
  for(const e of (await c.send('Extensions.getExtensions')).extensions) await c.send('Extensions.uninstall',{id:e.id});
  for(const t of (await c.send('Target.getTargets')).targetInfos.filter(t=>t.type==='page'&&t.url!=='about:blank')) await c.send('Target.closeTarget',{targetId:t.targetId});
  const {id}=await c.send('Extensions.loadUnpacked',{path:resolve(artifact)});
  const result={artifact,id,checks:[],requests:[],errors:[]}; report.artifacts.push(result);
  const page=await c.page(`chrome-extension://${id}/popup.html`), s=page.sessionId;
  await wait(400);
  const listener=c.onEvent(m=>{
   if(m.sessionId===s&&m.method==='Runtime.exceptionThrown')result.errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);
  });
  const check=(name,details=true)=>result.checks.push({name,details});
  const set=async values=>{await c.evaluate(s,`chrome.storage.local.set(${JSON.stringify(values)})`);await wait()};
  const text=()=>c.evaluate(s,'document.body.innerText');
  const click=selector=>c.evaluate(s,`(()=>{const b=document.querySelector(${JSON.stringify(selector)});if(!b)throw Error('Missing '+${JSON.stringify(selector)});b.click()})()`);
  const tab=async name=>{await c.evaluate(s,`(()=>{const b=[...document.querySelectorAll('nav button')].find(b=>b.innerText.includes(${JSON.stringify(name)}));if(!b)throw Error('Missing tab '+${JSON.stringify(name)});b.click()})()`);await wait()};
  assert((await text()).includes('HWA Helper')); check('standalone mounted');
  assert((await c.send('Target.getTargets')).targetInfos.some(t=>t.url===`chrome-extension://${id}/background.js`));check('service worker loaded');
  for(const [state,cache] of Object.entries({empty:{},partial:{accountStatus:{data:{id:101,name:'Acceptance A',level:0}},heroGetAll:{data:{1:{id:1,level:1,power:0,star:1,color:1}}},clanVersusStatus:{data:{battle:{clanRoundPoints:0,enemyClanRoundPoints:0},info:{personalRequirementsIsSatisfied:false,guildRequirementsIsSatisfied:false}}}}})){
   await set({rpcCache:cache,popupRpcEnabled:false});
   for(const name of ['Dashboard','Heroes','Items','Resources','Titans','Teams','Events','Goals','Guild']){await tab(name);assert((await text()).trim().length>100);check(`${state}: tab ${name}`)}
   await click('[aria-label="Settings"]');await wait();check(`${state}: settings`,(await text()).includes('Settings'));
   const names=await c.evaluate(s,`(()=>{${walk};return walk(document.querySelector('#app')._vnode).map(x=>x.type.__name).filter(x=>x?.endsWith('Modal')||x==='GuildChatPanel')})()`);
   for(const name of names){
    await c.evaluate(s,`(()=>{${walk};const x=walk(document.querySelector('#app')._vnode).find(x=>x.type.__name===${JSON.stringify(name)});x.vnode.props['onUpdate:modelValue'](true)})()`);await wait();
    const visible=await c.evaluate(s,`[...document.querySelectorAll('[role="dialog"], #guild-chat-panel')].filter(e=>e.getBoundingClientRect().height>0).map(e=>({text:e.innerText.slice(0,100),label:e.getAttribute('aria-label')}))`);
    assert.equal(visible.length,1,`${state}: ${name} must render`); check(`${state}: dialog ${name}`,visible);
    await c.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27},s);await wait(80);
    if(name!=='GuildChatPanel') assert.equal(await c.evaluate(s,`document.querySelectorAll('[role="dialog"]').length`),0,`${name}: Escape must close`);
    await c.evaluate(s,`(()=>{${walk};const x=walk(document.querySelector('#app')._vnode).find(x=>x.type.__name===${JSON.stringify(name)});x.vnode.props['onUpdate:modelValue'](false)})()`);await wait(40);
   }
  }
  await set({rpcCache:{'getDailyQuests:quest':{updatedAt:new Date().toISOString(),data:{quests:[{id:364,state:'inProgress',progress:5,completionCount:0},{id:365,state:'inProgress',progress:0}]}},towerStatus:{data:{isCleared:true}}}});
  await c.evaluate(s,`(()=>{${walk};walk(document.querySelector('#app')._vnode).find(x=>x.type.__name==='QuestDetailModal').vnode.props['onUpdate:modelValue'](true)})()`);await wait();
  const questText=await text();assert(questText.includes('Clear Brigand Camp 10 times'));assert(/Progress: 5\s*\/ 10/.test(questText));assert(!questText.includes('Tower cleared today'));check('quest #364 locale title and progress 5/10; #365 unaffected by tower');
  await c.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27},s);await wait();
  for(const theme of ['light','dark','system']){
   await set({theme});
   await c.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:theme==='light'?'light':'dark'}]},s);await wait();
   assert.equal(await c.evaluate(s,`document.documentElement.classList.contains('dark')`),theme!=='light');check(`theme ${theme}`);
  }
  await set({theme:'system'});await c.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'light'}]},s);await wait();assert.equal(await c.evaluate(s,`document.documentElement.classList.contains('dark')`),false);check('system theme responds to change');
  await click('#fab-trigger');await wait();assert(await c.evaluate(s,`!!document.querySelector('#fab-actions')`));
  await c.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27},s);await wait(200);assert(!await c.evaluate(s,`!!document.querySelector('#fab-actions')`));check('keyboard Escape closes shortcuts');
  await c.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9},s);check('keyboard Tab focus',await c.evaluate(s,`({tag:document.activeElement.tagName,aria:document.activeElement.getAttribute('aria-label')})`));
  await set({customTeams:{101:[{id:'a',name:'ONLY_ACCOUNT_A',heroIds:[1]}],202:[{id:'b',name:'ONLY_ACCOUNT_B',heroIds:[2]}]},rpcCache:{accountStatus:{data:{id:101,name:'Acceptance A'}}}});await tab('Teams');assert((await text()).includes('ONLY_ACCOUNT_A'));
  await set({rpcCache:{accountStatus:{data:{id:202,name:'Acceptance B'}}}});assert((await text()).includes('ONLY_ACCOUNT_B'));assert(!(await text()).includes('ONLY_ACCOUNT_A'));check('account A to B isolates teams');
  await set({rpcCache:{}});assert(!(await text()).includes('ONLY_ACCOUNT_B'));check('cache deletion clears account teams');
  const game=await c.page('about:blank'), g=game.sessionId;
  let reject=false;
  const fixture=c.onEvent(m=>{if(m.method!=='Fetch.requestPaused'||m.sessionId!==g)return;
   const {requestId,request}=m.params;let body='<html><body><canvas id="gameCanvas"></canvas><p>Local fixture</p></body></html>',type='text/html';
   if(request.url.includes('/api/')){type='application/json';let calls=[];try{calls=JSON.parse(request.postData||'{}').calls||[]}catch{}
    result.requests.push(calls.map(x=>x.name));body=JSON.stringify({results:calls.map(call=>({ident:call.ident,result:reject?{error:{message:'Fixture rejection',code:400}}:{response:call.name==='userGetInfo'?{id:202,name:'Acceptance B',level:100}:{}}}))});}
   c.send('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:type},{name:'Access-Control-Allow-Origin',value:'*'},{name:'Access-Control-Allow-Headers',value:'*'}],body:Buffer.from(body).toString('base64')},g).catch(e=>result.errors.push(String(e)));
  });
  await c.send('Fetch.enable',{patterns:[{urlPattern:'*'}]},g);
  await c.send('Page.navigate',{url:'https://www.hero-wars-alliance.com/acceptance-fixture'},g);await wait(500);
  assert(await c.evaluate(g,`!!window[Symbol.for('hwa-helper-api-intercept-installed')]`));assert(await c.evaluate(g,`!!document.querySelector('#hwa-helper-btn')`));check('MAIN intercept and isolated content bridge installed');
  const carrier=()=>c.evaluate(g,`fetch('https://api.hero-wars-alliance.com/api/rpc',{method:'POST',headers:{'Content-Type':'application/json','X-Auth-Session':'acceptance-fixture-only'},body:JSON.stringify({calls:[{name:'userGetInfo',args:{},ident:'fixture-'+Date.now()}]})}).then(r=>r.json())`);
  await set({captureSettings:{interceptEnabled:true},popupRpcEnabled:false});await carrier();await wait();
  const send=message=>c.evaluate(s,`chrome.runtime.sendMessage(${JSON.stringify(message)})`);
  const disabled=await send({kind:'refresh-rpc',calls:[{name:'heroGetAll'}]});assert.equal(disabled.ok,false);check('RPC disabled rejects dispatch',disabled);
  await tab('Heroes');assert.equal(await c.evaluate(s,`chrome.storage.local.get('popupRpcEnabled').then(x=>x.popupRpcEnabled)`),false);check('mount does not enable RPC');
  for(const mode of ['piggyback','mqtt']){
   await set({popupRpcEnabled:true,socketRefreshMode:mode});
   const ack=await send({kind:'refresh-rpc',calls:[{name:'heroGetAll'}]});assert(ack.ok&&ack.queued);await wait();
   const before=await c.evaluate(s,`chrome.storage.local.get('rpcCache').then(x=>!!x.rpcCache?.heroGetAll)`);assert.equal(before,false);check(`${mode}: queued ack does not complete cache`,ack);
   await carrier();await wait(250);assert(await c.evaluate(s,`chrome.storage.local.get('rpcCache').then(x=>!!x.rpcCache?.heroGetAll)`));check(`${mode}: natural carrier resolves read`);
   await set({rpcCache:{accountStatus:{data:{id:202}}}});
  }
  await set({socketRefreshMode:'direct'});reject=true;
  const ack=await send({kind:'refresh-rpc',calls:[{name:'heroGetAll'}]});await wait(250);assert.equal(ack.queued,false);assert(!await c.evaluate(s,`chrome.storage.local.get('rpcCache').then(x=>!!x.rpcCache?.heroGetAll)`));check('direct rejected RPC leaves data unknown',ack);
  reject=false;await set({popupRpcEnabled:false});
  const start=await send({kind:'record-start'});await carrier();await wait(150);const stop=await send({kind:'record-stop'});const exported=await send({kind:'record-export'});check('recorder start/stop/export',{start,stop,exportKeys:Object.keys(exported||{})});
  await tab('Dashboard');await c.send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false},s);
  await writeFile(`${out}/${artifact==='dist'?'dist':'wxt'}-dashboard.png`,Buffer.from((await c.send('Page.captureScreenshot',{format:'png'},s)).data,'base64'));
  await c.evaluate(s,`chrome.action.openPopup()`);await wait(200);check('extension action popup', (await c.send('Target.getTargets')).targetInfos.filter(t=>t.url===`chrome-extension://${id}/popup.html`).map(t=>({type:t.type,url:t.url})));
  await c.send('Page.reload',{},s);await wait(350);assert((await text()).includes('HWA Helper'));check('standalone reload retains mount');
  assert.equal(result.errors.length,0,JSON.stringify(result.errors));fixture();listener();
 }
 report.passed=true;
}catch(error){report.passed=false;report.failure=String(error.stack||error);process.exitCode=1}
finally{await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,artifacts:report.artifacts.map(x=>({artifact:x.artifact,checks:x.checks.length,errors:x.errors})),failure:report.failure},null,2));c.close()}
