import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  parseHydraState,
  planHydraHornTargets,
  simulateHydraHeadDamage,
  formatHydraDamage,
} from '../src/services/hydraService.ts';

const ROOT = path.resolve(import.meta.dirname, '..');

test('parseHydraState parses live clanBoss_getAll schema and hydrates 3 teams from teamGetAll.clan_boss', () => {
  const rawGetAll = {
    tries: 3,
    superTries: 2,
    endDay: 1795485600,
    heads: [
      { bossHeadId: 5, heroId: 8015, attackerId: null, state: { isDead: false, hp: 1101976, energy: 0, maxHp: 5946906 } },
      { bossHeadId: 13, heroId: 8013, attackerId: '999999', state: { isDead: false, hp: 54533157, energy: 0, maxHp: 54533157 } },
      { bossHeadId: 16, heroId: 8014, attackerId: null, state: { isDead: false, hp: 18427071, energy: 0, maxHp: 54533157 } },
      { bossHeadId: 1, heroId: 8013, attackerId: null, state: { isDead: true, hp: 0, energy: 0, maxHp: 5946906 } },
    ],
    headsBestResults: [
      { bossHeadId: 5, damage: 5946906, enableRaid: true, isSelectRaid: false },
      { bossHeadId: 16, damage: 12000000, enableRaid: false, isSelectRaid: false },
    ],
  };
  const teamGetAll = {
    clan_boss: [
      [1, 2, 3, 4, 5],
      [6, 7, 8, 9, 10],
      [11, 12, 13, 14, 15],
    ],
  };

  const state = parseHydraState(rawGetAll, teamGetAll);
  assert.equal(state.regularTries, 3);
  assert.equal(state.superTries, 2);
  assert.equal(state.heads.length, 4);
  assert.equal(state.savedTeams.length, 3);
  assert.deepEqual(state.savedTeams[0], [1, 2, 3, 4, 5]);

  const head5 = state.heads.find((h) => h.bossHeadId === 5);
  assert.equal(head5.tierId, 1);
  assert.equal(head5.element, 'Light');
  assert.equal(head5.canRaid, true);
  assert.equal(head5.isLockedByGuildmate, false);

  const head13 = state.heads.find((h) => h.bossHeadId === 13);
  assert.equal(head13.tierId, 3);
  assert.equal(head13.element, 'Fire');
  assert.equal(head13.isLockedByGuildmate, true);
});

test('planHydraHornTargets enforces Guildmate Lock Guard, Overkill Guard, Raid preference, and Super Horn safety', () => {
  const state = parseHydraState({
    tries: 2,
    superTries: 3,
    heads: [
      { bossHeadId: 5, heroId: 8015, attackerId: null, state: { isDead: false, hp: 1000000, maxHp: 5946906 } },
      { bossHeadId: 13, heroId: 8013, attackerId: 'teammate-1', state: { isDead: false, hp: 54533157, maxHp: 54533157 } },
      { bossHeadId: 16, heroId: 8014, attackerId: null, state: { isDead: false, hp: 18427071, maxHp: 54533157 } },
    ],
    headsBestResults: [
      { bossHeadId: 5, damage: 5946906, enableRaid: true },
      { bossHeadId: 16, damage: 12000000, enableRaid: false },
    ],
  });

  const plan = planHydraHornTargets({
    state,
    predictedDamageByHead: { 5: 5946906, 16: 12000000 },
    config: { overkillGuardPct: 0.25, allowSuperTries: false, preferRaid: true },
  });

  assert.equal(plan.availableHorns, 2, 'Must NOT include Golden Horns when allowSuperTries is false');
  assert.equal(plan.superHornsUsed, 0);
  assert.equal(plan.skippedLockedCount, 1, 'Must skip head locked by guildmate');
  assert.equal(plan.recommendations.length, 2);
  assert.equal(plan.recommendations[0].head.bossHeadId, 16, 'Must prioritize higher effective damage over heavy overkill head');
  assert.equal(plan.recommendations[0].overkillWarning, false);

  const head5Rec = plan.recommendations.find((r) => r.head.bossHeadId === 5);
  assert.equal(head5Rec.overkillWarning, true, 'Head #5 with 1M HP vs 5.9M damage must trigger Overkill Warning');
  assert.equal(head5Rec.recommendedMode, 'raid');
});

test('simulateHydraHeadDamage carries remaining HP across 3 teams and stops early on kill', async () => {
  const head = parseHydraState({
    tries: 1,
    heads: [{ bossHeadId: 5, heroId: 8015, attackerId: null, state: { isDead: false, hp: 5000000, maxHp: 5946906 } }],
  }).heads[0];

  let simCalls = 0;
  const res = await simulateHydraHeadDamage({
    head,
    teams: [[1, 2, 3, 4, 5], [6, 7, 8, 9, 10], [11, 12, 13, 14, 15]],
    simulateTeamFn: async (_team, _rem, idx) => {
      simCalls++;
      return idx === 0 ? 3000000 : 2500000;
    },
  });

  assert.equal(simCalls, 2, 'Must stop before Team 3 once head HP reaches 0');
  assert.equal(res.killsHead, true);
  assert.equal(res.totalDamage, 5500000);
  assert.equal(res.overkillDamage, 500000);
  assert.equal(formatHydraDamage(5500000), '5.50M');
});

test('HydraModal is wired into useModals, ActivityGoals, and App.vue with required sections', () => {
  const modalSrc = fs.readFileSync(path.join(ROOT, 'src', 'components', 'dialogs', 'HydraModal.vue'), 'utf8');
  const appSrc = fs.readFileSync(path.join(ROOT, 'entrypoints', 'popup', 'App.vue'), 'utf8');
  const goalsSrc = fs.readFileSync(path.join(ROOT, 'src', 'components', 'dashboard', 'ActivityGoals.vue'), 'utf8');

  assert.match(modalSrc, /id="hydra-status-bar"/);
  assert.match(modalSrc, /id="hydra-heads-grid"/);
  assert.match(modalSrc, /id="hydra-teams-panel"/);
  assert.match(modalSrc, /id="hydra-auto-controls"/);
  assert.match(appSrc, /<HydraModal v-model="modalState\.hydra" \/>/);
  assert.match(goalsSrc, /act\.id === 'hydra'.*openModal\('hydra'\)/);
});
