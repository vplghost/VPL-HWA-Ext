import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mineTypes,
  rallyTargets,
  routeSpeeds,
  getMineResourceType,
  getRallyTargetName,
  getRouteSpeed,
} from '../src/utils/marchRules.ts';
import {
  isTrackingUrl,
  TRACKING_HOSTS,
} from '../src/utils/trackingFilter.ts';
import {
  missionCosts,
  getMissionCosts,
  getMissionStartCost,
  getMissionWinCost,
} from '../src/data/missionCostData.ts';

test('marchRules: mineTypes correctly categorizes all basic resource types', () => {
  assert.equal(getMineResourceType(12), 'wood');
  assert.equal(getMineResourceType('20'), 'wood');
  assert.equal(getMineResourceType(27), 'food');
  assert.equal(getMineResourceType('35'), 'stone');
  assert.equal(getMineResourceType(43), 'iron');
  assert.equal(getMineResourceType(99999), undefined);
  assert.equal(getMineResourceType(null), undefined);

  assert.equal(mineTypes['12'], 'wood');
});

test('marchRules: rallyTargets resolves known PvE and PvP targets', () => {
  assert.equal(getRallyTargetName(25), 'Ork Shaman');
  assert.equal(getRallyTargetName('27'), 'Werewolf');
  assert.equal(getRallyTargetName(60), '[PvP] Boss, level 1');
  assert.equal(getRallyTargetName(89), '[PvP] Boss, level 30');
  assert.equal(getRallyTargetName(99999), undefined);
  assert.equal(getRallyTargetName(undefined), undefined);

  assert.equal(rallyTargets['26'], 'Blood Shaman');
});

test('marchRules: routeSpeeds exports configured route speeds', () => {
  assert.equal(getRouteSpeed('toTargetRallyPve'), 20);
  assert.equal(getRouteSpeed('returnToOutpost'), 15);
  assert.equal(getRouteSpeed('unknownRoute'), undefined);

  assert.equal(routeSpeeds.toTargetRallyPve, 20);
});

test('trackingFilter: identifies tracking, analytics, and ads endpoints', () => {
  assert.equal(isTrackingUrl('https://analytics.nextersglobal.com/collect'), true);
  assert.equal(isTrackingUrl('https://wa.appsflyersdk.com/events'), true);
  assert.equal(isTrackingUrl('https://websdk.appsflyersdk.com/batch'), true);
  assert.equal(isTrackingUrl('https://www.google-analytics.com/g/collect'), true);
  assert.equal(isTrackingUrl('https://googleads.g.doubleclick.net/pagead'), true);
  assert.equal(isTrackingUrl('https://ad.doubleclick.net/ddm/track'), true);
  assert.equal(isTrackingUrl('https://www.googleadservices.com/pagead/conversion'), true);
  assert.equal(isTrackingUrl('https://www.google.com/ccm/collect?v=1'), true);
  assert.equal(isTrackingUrl('https://www.google.com/rmkt/collect/123'), true);

  // Legitimate game traffic and normal URLs should NOT be flagged
  assert.equal(isTrackingUrl('https://www.google.com/search?q=hwa'), false);
  assert.equal(isTrackingUrl('https://hero-wars.com/api/rpc'), false);
  assert.equal(isTrackingUrl('https://nexters.com/about'), false);
  assert.equal(isTrackingUrl('invalid-url-string'), false);
  assert.equal(isTrackingUrl(null), false);

  assert.equal(typeof isTrackingUrl, 'function');
  assert.equal(isTrackingUrl('https://wa.appsflyersdk.com'), true);
});

test('missionCostData: exports accurate mission start and win costs', () => {
  // Mission 1: [1, 5] -> start cost 1, win cost 5
  assert.deepEqual(getMissionCosts(1), [1, 5]);
  assert.equal(getMissionStartCost(1), 1);
  assert.equal(getMissionWinCost(1), 5);

  // Mission 10: [3, 15]
  assert.deepEqual(getMissionCosts('10'), [3, 15]);
  assert.equal(getMissionStartCost('10'), 3);
  assert.equal(getMissionWinCost('10'), 15);

  // Mission 600: [0, 6]
  assert.deepEqual(getMissionCosts(600), [0, 6]);
  assert.equal(getMissionStartCost(600), 0);
  assert.equal(getMissionWinCost(600), 6);

  // Unknown mission
  assert.equal(getMissionCosts(99999), undefined);
  assert.equal(getMissionStartCost(99999), 0);
  assert.equal(getMissionWinCost(99999), 0);

  // Typed mission costs
  assert.ok(missionCosts);
  assert.deepEqual(missionCosts['135'], [2, 6]);
});
