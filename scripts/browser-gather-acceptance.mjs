import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { connectProfile } from './browser-cdp.mjs';
import { rpcCacheService } from '../src/core/cache/index.ts';

// Only a NEW caller-created disposable profile; all game requests are fulfilled locally.
const profile = process.argv[2];
const occupiedRace = process.argv[3] === 'occupied-race';
assert(profile && resolve(profile).startsWith(resolve('temp') + '\\'));
const fixture = JSON.parse(await readFile('tests/fixtures/gather-reload-20261115.json', 'utf8'));
const cache = rpcCacheService.merge({}, fixture.records).cache;
const now = Date.now();
for (const entry of Object.values(cache)) if (entry && typeof entry === 'object' && 'updatedAt' in entry) entry.updatedAt = new Date(now).toISOString();
cache.questResetStatus.data.nextDayAt = now + 3600000;
cache.incomingMineAttacks = { updatedAt: new Date(now).toISOString(), data: { accountId: '1', snapshotAt: now, attacks: {}, ended: {} } };
const observed = name => {
  for (const record of fixture.records.toReversed()) {
    const call = JSON.parse(record.requestBody).calls.find(c => c.name === name);
    if (call) return structuredClone(JSON.parse(record.responseBody).results.find(r => r.ident === call.ident).result.response);
  }
};
const marches = observed('getMarches'), units = observed('getUnitSummary');
