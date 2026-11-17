import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  extractLegendDraftCandidates,
  decodeDraftCandidatesDetailed,
  getKnownDraftChoices,
  getDraftCipherPrefix
} from '../src/utils/legendDraftDecoder.ts';
import { installInterceptor } from '../src/content/interceptor.ts';

function findDraftResponse(data, stageId) {
  for (const item of (data.timeline || [])) {
    if (item.responseBody && item.responseBody.includes('draft')) {
      try {
        const res = JSON.parse(item.responseBody);
        for (const r of (res.results || [])) {
          const resp = r.result?.response;
          if (resp && resp.stageId === stageId && resp.draft) {
            return resp;
          }
        }
      } catch (_) {}
    }
  }
  return null;
}

test('Option A: extractLegendDraftCandidates matches 100% of Match #360504765 Ground Truth', () => {
  const d4Path = 'temp/tracking-data/hwa-game-record-202611091943_draft_detail.json';
  if (!fs.existsSync(d4Path)) return;
  const d4 = JSON.parse(fs.readFileSync(d4Path, 'utf8'));

  // Defense (stageId 2)
  const r4_s2 = findDraftResponse(d4, 2);
  assert.ok(r4_s2, 'Stage 2 draft must exist in Match 4');
  const defCandidates = extractLegendDraftCandidates(r4_s2.draft, 2, r4_s2.matchId);

  // Ground truth: Chabba (11), Galahad (2), Phobos (6), Peech (68), Iris (54), Krista (34),
  // Oya (61), Eva (77), Peppy (22), Julius (56), Cascade (59), Maya (36), Daredevil (8), Aurora (1), Wodryn (78)
  const expectedDef = [11, 2, 6, 68, 54, 34, 61, 77, 22, 56, 59, 36, 8, 1, 78];
  assert.deepEqual(defCandidates, expectedDef, 'Defense candidates must match ground truth 100%');

  // Attack (stageId 4)
  const r4_s4 = findDraftResponse(d4, 4);
  assert.ok(r4_s4, 'Stage 4 draft must exist in Match 4');
  const atkCandidates = extractLegendDraftCandidates(r4_s4.draft, 4, r4_s4.matchId);

  // Ground truth: Mushy (55), Ginger (15), Amira (52), Xe'sha (51), Maya (36), Daredevil (8),
  // Kai (5), Corvus (501), Andvari (41), Dante (16), Alvanor (503), Folio (64), Byrna (72), Cleaver (24), Yasmine (49)
  const expectedAtk = [55, 15, 52, 51, 36, 8, 5, 501, 41, 16, 503, 64, 72, 24, 49];
  assert.deepEqual(atkCandidates, expectedAtk, 'Attack candidates must match ground truth 100%');
});

test('Option A: extractLegendDraftCandidates matches 100% of Match #362824711 Ground Truth', () => {
  const d6Path = 'temp/tracking-data/hwa-game-record-202611171800._draft_3json.json';
  if (!fs.existsSync(d6Path)) return;
  const d6 = JSON.parse(fs.readFileSync(d6Path, 'utf8'));

  // Defense (stageId 2)
  const r6_s2 = findDraftResponse(d6, 2);
  assert.ok(r6_s2, 'Stage 2 draft must exist in Match 6');
  const defCandidates = extractLegendDraftCandidates(r6_s2.draft, 2, r6_s2.matchId);

  // Ground truth: Mushy (55), Galahad (2), Cascade (59), Lars (33), Eva (77), Mojo (17),
  // Soleil (62), Folio (64), Ginger (15), Yasmine (49), Lilith (26), Peech (68), Celeste (43), Sebastian (500), Heidi (9)
  const expectedDef = [55, 2, 59, 33, 77, 17, 62, 64, 15, 49, 26, 68, 43, 500, 9];
  assert.deepEqual(defCandidates, expectedDef, 'Defense candidates must match ground truth 100%');

  // Attack (stageId 4)
  const r6_s4 = findDraftResponse(d6, 4);
  assert.ok(r6_s4, 'Stage 4 draft must exist in Match 6');
  const atkCandidates = extractLegendDraftCandidates(r6_s4.draft, 4, r6_s4.matchId);

  // Ground truth: Wodryn (78), Miu (74), Corvus (501), Qing Mao (28), Drayne (73), Aurora (1),
  // Lars (33), Lian (23), Crow (76), Cleaver (24), Dante (16), Alvanor (503), Cornelius (30), Aidan (58), Kai (5)
  const expectedAtk = [78, 74, 501, 28, 73, 1, 33, 23, 76, 24, 16, 503, 30, 58, 5];
  assert.deepEqual(atkCandidates, expectedAtk, 'Attack candidates must match ground truth 100%');
});

test('decodeDraftCandidatesDetailed returns step-by-step 3-card structure', () => {
  const d6Path = 'temp/tracking-data/hwa-game-record-202611171800._draft_3json.json';
  if (!fs.existsSync(d6Path)) return;
  const d6 = JSON.parse(fs.readFileSync(d6Path, 'utf8'));
  const r6_s2 = JSON.parse(d6.timeline[8].responseBody).results[0].result.response;

  const detailed = decodeDraftCandidatesDetailed(r6_s2.draft, 2, r6_s2.matchId);
  assert.equal(detailed.isGroundTruth, true);
  assert.equal(detailed.steps.length, 5);
  assert.deepEqual(detailed.steps[0], [55, 2, 59]);
  assert.deepEqual(detailed.steps[1], [33, 77, 17]);
  assert.deepEqual(detailed.steps[2], [62, 64, 15]);
  assert.deepEqual(detailed.steps[3], [49, 26, 68]);
  assert.deepEqual(detailed.steps[4], [43, 500, 9]);
});

test('getKnownDraftChoices returns complete profile with enemyDefence picks', () => {
  const profile = getKnownDraftChoices(362824711);
  assert.ok(profile, 'Profile for 362824711 must exist');
  assert.equal(profile.matchId, 362824711);
  assert.equal(profile.defense.length, 5);
  assert.equal(profile.attack.length, 5);
  assert.ok(Array.isArray(profile.enemyDefence));
});

test('interceptor extracts Option A candidates on receiving randomDraft RPC response', () => {
  const windowMessages = [];
  const win = {
    postMessage: (data) => windowMessages.push(data),
    addEventListener: () => {},
    sessionStorage: { setItem: () => {}, getItem: () => null },
    location: { origin: 'https://www.hero-wars-alliance.com', href: 'https://www.hero-wars-alliance.com/' },
    document: { addEventListener: () => {} },
    setTimeout: (fn) => { fn(); return 1; },
    clearTimeout: () => {}
  };
  installInterceptor(win, { setTimeout: (fn) => { fn(); return 1; }, clearTimeout: () => {} });

  const d6Path = 'temp/tracking-data/hwa-game-record-202611171800._draft_3json.json';
  if (!fs.existsSync(d6Path)) return;
  const d6 = JSON.parse(fs.readFileSync(d6Path, 'utf8'));
  const r6_s2_text = d6.timeline[8].responseBody;

  // Simulate server RPC delivery
  win.__hwaLegendDraftHook.handleLegendDraftRpcResponse(r6_s2_text);

  // Check window.__hwa_legend_draft_candidates was immediately populated
  assert.ok(Array.isArray(win.__hwa_legend_draft_candidates));
  assert.equal(win.__hwa_legend_draft_candidates.length, 15);
  assert.deepEqual(win.__hwa_legend_draft_candidates, [55, 2, 59, 33, 77, 17, 62, 64, 15, 49, 26, 68, 43, 500, 9]);

  // Check legend-draft-hook-result was broadcast
  const hookResult = windowMessages.find((m) => m.kind === 'legend-draft-hook-result');
  assert.ok(hookResult, 'Must broadcast legend-draft-hook-result');
  assert.equal(hookResult.payload.decoderOption, 'A-stream-cipher');
  assert.deepEqual(hookResult.payload.topCandidateIds, [55, 2, 59, 33, 77, 17, 62, 64, 15, 49, 26, 68, 43, 500, 9]);
});
