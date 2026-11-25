import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  hasTeamGetAllRequest,
  sanitizeTeamGetAllRpcPayload,
} from '../src/services/rpcSanitizer.ts';
import { createControlPayload } from '../src/content/bridge.ts';

function makeBatch(teamResponse) {
  const reqText = JSON.stringify({
    calls: [
      { name: 'heroGetAll', args: {}, ident: 'id-hero' },
      { name: 'teamGetAll', args: {}, ident: 'id-team' },
    ],
  });
  const parsed = {
    results: [
      { ident: 'id-hero', result: { response: { '1': { id: 1 } } } },
      { ident: 'id-team', result: { response: teamResponse } },
    ],
  };
  return { reqText, parsed };
}

test('hasTeamGetAllRequest skips unrelated RPC batches', () => {
  assert.equal(hasTeamGetAllRequest('{"calls":[{"name":"userGetInfo"}]}'), false);
  assert.equal(hasTeamGetAllRequest(null), false);
  assert.equal(hasTeamGetAllRequest('{"calls":[{"name":"teamGetAll","ident":"1"}]}'), true);
});

test('does NOT mutate healthy teamGetAll payload (zero interception on valid data)', () => {
  const healthy = {
    mission: [79, 72, 16, 54, 60],
    arena: [16, 54, 79, 72, 60],
    grand: [
      [36, 72, 503, 79, 55],
      [29, 67, 70, 51, 71],
      [60, 54, 502, 16, 501],
    ],
    clan_boss: [
      [56, 37, 17, 29, 7],
      [55, 72, 36, 54, 51],
    ],
    champClanDefence_heroes: [[79, 72, 16, 54, 60]],
    empty_multi: [],
  };
  const snapshot = structuredClone(healthy);
  const { reqText, parsed } = makeBatch(healthy);

  const res = sanitizeTeamGetAllRpcPayload(reqText, parsed);
  assert.equal(res.mutated, false);
  assert.deepEqual(res.fixes, []);
  assert.deepEqual(parsed.results[1].result.response, snapshot);
});

test('wraps corrupted flat 1D array in multi-team key (grand) into 2D array', () => {
  const { reqText, parsed } = makeBatch({
    arena: [16, 54, 79, 72, 60],
    grand: [16, 54, 79, 72, 60],
  });

  const res = sanitizeTeamGetAllRpcPayload(reqText, parsed);
  assert.equal(res.mutated, true);
  assert.deepEqual(res.fixes, ['grand:wrapped-1d-to-2d']);
  assert.deepEqual(parsed.results[1].result.response.grand, [[16, 54, 79, 72, 60]]);
  // Single-team key untouched
  assert.deepEqual(parsed.results[1].result.response.arena, [16, 54, 79, 72, 60]);
});

test('replaces bare scalar corruption in both multi-team and single-team keys', () => {
  const { reqText, parsed } = makeBatch({
    arena: 'corrupted-string',
    clan_boss: 0,
    mission: [1, 2, 3, 4, 5],
  });

  const res = sanitizeTeamGetAllRpcPayload(reqText, parsed);
  assert.equal(res.mutated, true);
  assert.deepEqual(res.fixes, ['arena:replaced-scalar', 'clan_boss:replaced-scalar']);
  assert.deepEqual(parsed.results[1].result.response.arena, []);
  assert.deepEqual(parsed.results[1].result.response.clan_boss, []);
  assert.deepEqual(parsed.results[1].result.response.mission, [1, 2, 3, 4, 5]);
});

test('filters out invalid primitive elements in mixed multi-team array', () => {
  const { reqText, parsed } = makeBatch({
    grand: [[16, 54, 79, 72, 60], 99, null],
  });

  const res = sanitizeTeamGetAllRpcPayload(reqText, parsed);
  assert.equal(res.mutated, true);
  assert.deepEqual(res.fixes, ['grand:filtered-invalid-elements']);
  assert.deepEqual(parsed.results[1].result.response.grand, [[16, 54, 79, 72, 60]]);
});

test('bridge createControlPayload propagates sanitizeTeamEnabled and SettingsTab exposes toggle', () => {
  const defPayload = createControlPayload({ interceptEnabled: true }, true, 'direct', false, null);
  assert.equal(defPayload.sanitizeTeamEnabled, true);

  const offPayload = createControlPayload({ interceptEnabled: true }, true, 'direct', false, null, false);
  assert.equal(offPayload.sanitizeTeamEnabled, false);

  const settingsSrc = fs.readFileSync(new URL('../src/components/tabs/SettingsTab.vue', import.meta.url), 'utf8');
  assert.match(settingsSrc, /id="sanitize-team-enabled"/);
  assert.match(settingsSrc, /sanitizeTeamEnabled/);
});
