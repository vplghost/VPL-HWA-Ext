import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const source = await readFile(new URL('../extension/tracking-filter.js', import.meta.url), 'utf8');
const context = { URL };
runInNewContext(source, context);
const isTracking = context.hwaHelperIsTrackingUrl;

test('filters sampled analytics and advertising endpoints', () => {
  for (const url of [
    'https://analytics.nextersglobal.com/analytics/event/gamebeat',
    'https://wa.appsflyersdk.com/events',
    'https://websdk.appsflyersdk.com/manifest.json',
    'https://www.google.com/ccm/collect',
    'https://www.google.com/rmkt/collect/123',
    'https://www.google-analytics.com/g/collect',
    'https://www.googleadservices.com/pagead/conversion/123'
  ]) assert.equal(isTracking(url), true, url);
});

test('retains game, authentication, and shop endpoints', () => {
  for (const url of [
    'https://api.hero-wars-alliance.com/api/rpc',
    'https://api.hero-wars-alliance.com/oauth/refresh',
    'https://api.aghanim.com/sdk/v1/items',
    'https://www.google.com/search?q=game'
  ]) assert.equal(isTracking(url), false, url);
});
