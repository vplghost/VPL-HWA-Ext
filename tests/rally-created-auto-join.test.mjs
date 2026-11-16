import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { socketRefreshCalls } from '../src/background/backgroundRuntime.ts';
import { worldReadService } from '../src/services/worldReadService.ts';

test('intercept.js strictly limits lastRpcUrl and lastRpcHeaders to /api/rpc', () => {
  const content = readFileSync('extension/intercept.js', 'utf8');
  // Ensure /oauth/refresh or generic api.hero-wars-alliance.com does not match rpc capture
  assert.ok(!content.includes("urlStr.includes('/api/rpc') || urlStr.includes('api.hero-wars-alliance.com')"),
    'Must not capture all api.hero-wars-alliance.com endpoints as RPC');
  assert.ok(content.includes("if (urlStr.includes('/api/rpc'))"),
    'Must strictly match /api/rpc');
  assert.ok(content.includes("lastRpcUrl.includes('/api/rpc')"),
    'Dispatch fallback must check for /api/rpc');
});

test('socketRefreshCalls includes getUnitSummary alongside getRallyById and getMarches on rallyCreated', async () => {
  const calls = socketRefreshCalls({
    transport: 'websocket',
    direction: 'received',
    encoding: 'utf8',
    payload: JSON.stringify({ result: { type: 'rallyCreated', body: { rallyId: 'test-rally-123' } } })
  }, {});

  assert.deepEqual(Array.from(calls, c => c.name), ['getRallyById', 'getMarches', 'getUnitSummary']);
  assert.equal(calls.find(c => c.name === 'getRallyById')?.args?.rallyId, 'test-rally-123');
});

test('world-read plan allows getRallyById immediately when isRallyCreated is true even if recently queried', () => {
  const worldRead = worldReadService;

  const now = 1700000000000;
  const cache = {
    accountStatus: { data: { id: 12345 } },
    rallyReadStatus: { data: { accountId: '12345', rallies: { 'r-1': { at: now - 1000, version: 1 } } } }
  };
  const calls = [{ name: 'getRallyById', feature: 'rally', args: { rallyId: 'r-1' } }];

  // Without isRallyCreated, recent entry is considered fresh and skipped
  const planSuppressed = worldRead.plan(null, cache, calls, now, { after: now - 5000, version: 1 });
  assert.equal(planSuppressed.calls.length, 0);

  // With isRallyCreated, getRallyById is permitted immediately
  const planFresh = worldRead.plan(null, cache, calls, now, { after: now - 5000, version: 1, isRallyCreated: true });
  assert.equal(planFresh.calls.length, 1);
  assert.equal(planFresh.calls[0].name, 'getRallyById');
});
