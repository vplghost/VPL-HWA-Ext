import test from 'node:test';
import assert from 'node:assert/strict';
import { extractDropsFromRaidResponse } from '../src/utils/recipeTree.ts';

test('extractDropsFromRaidResponse correctly aggregates real game multi-run raid responses', () => {
  const rawGameResponse = {
    '0': { fragmentGear: { '57': 1 }, gold: 1521, experience: 8 },
    '1': { gear: { '9': 1 }, consumable: { '10': 1 }, gold: 1521, experience: 8 },
    raid: { consumable: { '9': 2 } }
  };

  const drops = extractDropsFromRaidResponse(rawGameResponse);

  assert.equal(drops.gold, 3042);
  assert.equal(drops.experience, 16);
  assert.equal(drops.fragmentGear['57'], 1);
  assert.equal(drops.gear['9'], 1);
  assert.equal(drops.consumable['10'], 1);
  assert.equal(drops.consumable['9'], 2);
});

test('extractDropsFromRaidResponse extracts drops across multiple missionRaid responses in a batch', () => {
  const batchResponses = [
    { '0': { fragmentGear: { '50': 1 }, gold: 500, experience: 6 } },
    { '0': { fragmentGear: { '50': 2 }, gold: 500, experience: 6 } },
    { '0': { fragmentScroll: { '12': 1 }, gold: 500, experience: 6 } }
  ];

  const drops = extractDropsFromRaidResponse(batchResponses);

  assert.equal(drops.gold, 1500);
  assert.equal(drops.experience, 18);
  assert.equal(drops.fragmentGear['50'], 3);
  assert.equal(drops.fragmentScroll['12'], 1);
});

test('extractDropsFromRaidResponse correctly extracts heroic soul stones', () => {
  const heroicResponse = {
    '0': { fragmentHero: { '4000': 1 }, gold: 1000, experience: 8 },
    '1': { fragmentHero: { '4000': 2 }, gold: 1000, experience: 8 }
  };

  const drops = extractDropsFromRaidResponse(heroicResponse);

  assert.equal(drops.fragmentHero['4000'], 3);
  assert.equal(drops.gold, 2000);
  assert.equal(drops.experience, 16);
});

test('extractDropsFromRaidResponse handles wrapped or legacy mock structures', () => {
  const wrapped = { drops: { fragmentGear: { '95': 5 } } };
  const drops1 = extractDropsFromRaidResponse(wrapped);
  assert.equal(drops1.fragmentGear['95'], 5);

  const rpcResult = { result: { response: { '0': { gold: 300, gear: { '4': 1 } } } } };
  const drops2 = extractDropsFromRaidResponse(rpcResult);
  assert.equal(drops2.gold, 300);
  assert.equal(drops2.gear['4'], 1);

  assert.deepEqual(extractDropsFromRaidResponse(null), {
    gold: 0,
    experience: 0,
    fragmentGear: {},
    fragmentScroll: {},
    gear: {},
    scroll: {},
    consumable: {},
    fragmentHero: {}
  });
});
