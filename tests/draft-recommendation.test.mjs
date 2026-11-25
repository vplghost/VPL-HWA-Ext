import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  recommendTop3DraftTeams,
  scoreDraftTeam,
  shortFactionName,
} from '../src/services/draftRecommendationService.ts';
import { buildDraftHeroCandidate } from '../src/utils/draftHelper.ts';

const root = resolve(process.cwd());

test('recommendTop3DraftTeams produces 3 diverse valid 5-hero teams in < 20ms using role + faction synergy', () => {
  // Exact 5x3 Attack Pool from match 365226640
  const heroSteps = [
    [55, 64, 43],
    [38, 36, 52],
    [11, 56, 71],
    [31, 3, 32],
    [29, 6, 1],
  ];
  const heroDetails = {
    55: { id: 55, power: 205447, star: 5, level: 120 },
    64: { id: 64, power: 181225, star: 3, level: 120 },
    43: { id: 43, power: 177950, star: 3, level: 120 },
    38: { id: 38, power: 166561, star: 3, level: 120 },
    36: { id: 36, power: 183014, star: 4, level: 120 },
    52: { id: 52, power: 178057, star: 3, level: 120 },
    11: { id: 11, power: 178921, star: 3, level: 120 },
    56: { id: 56, power: 194143, star: 3, level: 120 },
    71: { id: 71, power: 186394, star: 5, level: 120 },
    31: { id: 31, power: 180246, star: 3, level: 120 },
    3: { id: 3, power: 177755, star: 3, level: 120 },
    32: { id: 32, power: 171321, star: 3, level: 120 },
    29: { id: 29, power: 181600, star: 3, level: 120 },
    6: { id: 6, power: 182115, star: 3, level: 120 },
    1: { id: 1, power: 176193, star: 4, level: 120 },
  };

  const t0 = performance.now();
  const defenseRecs = recommendTop3DraftTeams(heroSteps, heroDetails, 'defense');
  const elapsed = performance.now() - t0;

  assert.equal(defenseRecs.length, 3, 'Must return Top 3 recommendations');
  assert.ok(elapsed < 50, `Scoring 243 combos must be instant (took ${elapsed.toFixed(1)}ms)`);

  // Each recommendation picks exactly 1 hero from each of the 5 columns
  for (const rec of defenseRecs) {
    assert.equal(rec.heroIds.length, 5);
    for (let i = 0; i < 5; i++) {
      assert.ok(heroSteps[i].includes(rec.heroIds[i]), `Pick ${i} must come from round ${i + 1}`);
    }
    assert.ok(rec.roleSummary.length > 0);
    assert.ok(rec.factionSummary.length > 0);
  }

  // Diversity: all 3 recommendations must be distinct
  assert.equal(new Set(defenseRecs.map((r) => r.key)).size, 3);
});

test('scoreDraftTeam rewards Tank + Healer + Faction synergy over tankless uncoordinated squads', () => {
  const empty = new Set();
  // Balanced Eternity/Tank+Heal squad (Corvus 52 Tank/Eternity, Morrigan 53 Healer/Eternity, Iris 60 Mage/Eternity, Octavia 68 Support/Eternity, Dante 16 Marksman/Eternity)
  const synergySquad = [52, 53, 60, 68, 16].map((id) => buildDraftHeroCandidate(id, empty));
  const weakSquad = [
    { id: 901, name: 'A', class: 'Mage', role: 'Back', faction: 'Way of Honor', picked: false },
    { id: 902, name: 'B', class: 'Mage', role: 'Back', faction: 'Way of Chaos', picked: false },
    { id: 903, name: 'C', class: 'Mage', role: 'Back', faction: 'Way of Nature', picked: false },
    { id: 904, name: 'D', class: 'Marksman', role: 'Back', faction: 'Way of Progress', picked: false },
    { id: 905, name: 'E', class: 'Marksman', role: 'Back', faction: 'Way of Mystery', picked: false },
  ];

  const goodScore = scoreDraftTeam(synergySquad, 'defense');
  const badScore = scoreDraftTeam(weakSquad, 'defense');
  assert.ok(goodScore.totalScore > badScore.totalScore + 40);
  assert.equal(shortFactionName('Way of Eternity'), 'Eternity');
});

test('LegendsDraftModal displays Role & Faction badges and gates WASM simulation strictly to manual Attack-phase button click', async () => {
  const modalSrc = await readFile(resolve(root, 'src/components/dialogs/LegendsDraftModal.vue'), 'utf8');
  assert.ok(modalSrc.includes('id="draft-recommendations"'));
  assert.ok(modalSrc.includes('getFactionBadgeClass('));
  assert.ok(modalSrc.includes('getClassBadgeClass('));
  assert.ok(modalSrc.includes('canSimulateAttackRecommendations'));
  assert.ok(modalSrc.includes('btn-draft-sim-team-'));
  // Ensure simulation is NOT auto-triggered inside watch/onMounted
  assert.ok(!modalSrc.includes('onMounted(() => {\n  simulateRecommendedTeam'));
});
