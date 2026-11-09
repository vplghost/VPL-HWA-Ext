import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const interceptCode = await readFile(new URL('../extension/intercept.js', import.meta.url), 'utf8');
const bridgeCode = await readFile(new URL('../extension/bridge.js', import.meta.url), 'utf8');

function setupInterceptContext() {
  const windowMessages = [];
  const postMessage = (data, origin) => {
    windowMessages.push(data);
  };

  const context = vm.createContext({
    window: {
      postMessage,
      addEventListener: () => {},
      sessionStorage: { setItem: () => {}, getItem: () => null }
    },
    location: { origin: 'https://www.hero-wars-alliance.com' },
    document: { addEventListener: () => {} },
    atob: (str) => Buffer.from(str, 'base64').toString('binary'),
    btoa: (str) => Buffer.from(str, 'binary').toString('base64'),
    setTimeout: (fn) => { fn(); return 1; },
    clearTimeout: () => {},
    console: { log: () => {}, warn: () => {}, error: () => {} },
    Uint8Array,
    Uint32Array,
    Int32Array,
    Date,
    JSON,
    performance: { now: () => 0 }
  });

  vm.runInContext(interceptCode, context);
  return { context, windowMessages };
}

test('findSequenceInHeap locates exact 25-byte draft cipher sequence in WASM HEAPU8', () => {
  const { context } = setupInterceptContext();
  const hook = context.window.__hwaLegendDraftHook;
  assert.ok(hook, '__hwaLegendDraftHook must be exposed');

  const heap = new Uint8Array(1024);
  const targetBytes = new Uint8Array([0x6a, 0x2f, 0x48, 0x71, 0x01, 0x5e, 0x47, 0x32, 0x0e, 0x11,
    0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff, 0x12]);
  
  // Place target at offset 200
  heap.set(targetBytes, 200);

  const matches = hook.findSequenceInHeap(heap, targetBytes);
  assert.equal(matches.length, 1);
  assert.equal(matches[0], 200);
});

test('scanCandidateHeroArrays detects 25-hero candidate array with valid hero IDs [1..150]', () => {
  const { context } = setupInterceptContext();
  const hook = context.window.__hwaLegendDraftHook;

  const heapU32 = new Uint32Array(512);

  // Layout: IL2CPP int[] of length 25 at index 50
  heapU32[50] = 25; // Length header
  const heroPool = [
    // Step 1
    78, 49, 44, 12, 6,
    // Step 2
    76, 20, 38, 23, 57,
    // Step 3
    75, 2, 25, 69, 14,
    // Step 4
    37, 73, 28, 55, 10,
    // Step 5
    5, 35, 17, 34, 29
  ];
  for (let i = 0; i < 25; i++) {
    heapU32[51 + i] = heroPool[i];
  }

  const results = hook.scanCandidateHeroArrays(heapU32);
  assert.ok(results.length >= 1, 'Must detect valid candidate array');
  assert.equal(results[0].count, 25);
  assert.deepEqual([...results[0].heroIds], heroPool);
});

test('scanCandidateHeroArrays rejects arrays with invalid numbers outside hero ID bounds', () => {
  const { context } = setupInterceptContext();
  const hook = context.window.__hwaLegendDraftHook;

  const heapU32 = new Uint32Array(512);
  heapU32[50] = 25;
  // Has invalid values like 99999 or 0
  for (let i = 0; i < 25; i++) {
    heapU32[51 + i] = (i === 10) ? 99999 : 5;
  }

  const results = hook.scanCandidateHeroArrays(heapU32);
  assert.equal(results.length, 0, 'Must reject arrays with non-hero values');
});

test('handleLegendDraftRpcResponse triggers scans and discovers candidates from active Unity memory', () => {
  const { context, windowMessages } = setupInterceptContext();
  const hook = context.window.__hwaLegendDraftHook;

  // Setup active Unity instance with WASM Memory
  const buffer = new ArrayBuffer(1024 * 64);
  const heapU32 = new Uint32Array(buffer);
  const heapU8 = new Uint8Array(buffer);

  // Populate candidate array in memory
  heapU32[100] = 25;
  const mockHeroes = [
    69, 23, 57, 21, 6,
    1, 2, 3, 4, 5,
    7, 8, 9, 10, 11,
    12, 13, 14, 15, 16,
    17, 18, 19, 20, 22
  ];
  for (let i = 0; i < 25; i++) heapU32[101 + i] = mockHeroes[i];

  context.window.Module = {
    HEAPU8: heapU8,
    HEAPU32: heapU32,
    UTF8ToString: (ptr) => ''
  };

  const sampleRpcResponse = JSON.stringify({
    results: [
      {
        ident: 'randomDraft_getInfo',
        result: {
          response: {
            stageId: 2,
            draft: 'ai9IcQFeRzJOdkJPJhpIfV5+XTUFRWp8Xg==',
            draftEnemy: 'f3hGfA=='
          }
        }
      }
    ]
  });

  hook.handleLegendDraftRpcResponse(sampleRpcResponse);

  assert.equal(hook.getLastPayload().stageId, 2);
  assert.equal(hook.getLastPayload().draft, 'ai9IcQFeRzJOdkJPJhpIfV5+XTUFRWp8Xg==');

  // Verify memory scan ran and posted result
  const hookResultMsg = windowMessages.find((m) => m.kind === 'legend-draft-hook-result');
  assert.ok(hookResultMsg, 'Must post legend-draft-hook-result message');
  assert.equal(hookResultMsg.payload.stageId, 2);
  assert.deepEqual([...hookResultMsg.payload.topCandidateIds], mockHeroes);
  assert.deepEqual([...context.window.__hwa_legend_draft_candidates], mockHeroes);
});

test('bridge handles legend-draft-hook-result and populates rpcCache.legendDraft.candidates', async () => {
  let storedData = {
    rpcCache: {
      legendDraft: {}
    }
  };

  const listeners = [];
  const window = {
    addEventListener: (name, handler) => { if (name === 'message') listeners.push(handler); },
    postMessage: (data, origin) => {
      for (const h of listeners) h({ source: window, origin, data });
    }
  };

  const chrome = {
    runtime: {
      id: 'test-ext',
      sendMessage: async () => ({})
    },
    storage: {
      local: {
        get: async (key) => (key === 'rpcCache' ? { rpcCache: storedData.rpcCache } : storedData),
        set: async (val) => { Object.assign(storedData, val); }
      }
    }
  };

  vm.runInNewContext(bridgeCode, {
    window,
    chrome,
    document: { readyState: 'complete', getElementById: () => ({}) },
    location: { origin: 'https://www.hero-wars-alliance.com' }
  });

  const sampleCandidates = [78, 49, 44, 76, 20, 38, 75, 2, 25, 37, 73, 28, 5, 35, 69];
  window.postMessage({
    source: 'hwa-helper-api',
    kind: 'legend-draft-hook-result',
    payload: {
      stageId: 2,
      topCandidateIds: sampleCandidates
    }
  }, 'https://www.hero-wars-alliance.com');

  assert.ok(storedData.legendDraftHookTelemetry);
  assert.deepEqual(storedData.legendDraftHookTelemetry.topCandidateIds, sampleCandidates);

  // Allow storage promise to resolve
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(storedData.rpcCache.legendDraft.candidates, sampleCandidates);
});
