import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  formatDraftPhase,
  buildCandidateMatrix,
  parseDraftDto,
  decodeDraftPayload,
  DEFAULT_DRAFT_CONST_KEY
} from '../src/utils/draftHelper.ts';
import { useModals } from '../src/composables/useModals.ts';

const root = resolve(import.meta.dirname, '..');

test('useModals includes legendsDraft in ModalName and initializes as false', () => {
  const { modalState, openModal, closeModal } = useModals();
  assert.equal(typeof modalState.legendsDraft, 'boolean', 'legendsDraft should exist in modalState');
  assert.equal(modalState.legendsDraft, false, 'legendsDraft should default to false');

  openModal('legendsDraft');
  assert.equal(modalState.legendsDraft, true, 'openModal should open legendsDraft');

  closeModal('legendsDraft');
  assert.equal(modalState.legendsDraft, false, 'closeModal should close legendsDraft');
});

test('App.vue imports and mounts LegendsDraftModal component', async () => {
  const appSrc = await readFile(resolve(root, 'entrypoints/popup/App.vue'), 'utf8');
  assert.ok(
    appSrc.includes("import LegendsDraftModal from '@/src/components/dialogs/LegendsDraftModal.vue'"),
    'App.vue must import LegendsDraftModal'
  );
  assert.ok(
    appSrc.includes('<LegendsDraftModal v-model="modalState.legendsDraft" />'),
    'App.vue must mount LegendsDraftModal with v-model="modalState.legendsDraft"'
  );
});

test('formatDraftPhase accurately formats draft stages', () => {
  const stage1 = formatDraftPhase(1);
  assert.equal(stage1.phase, 'idle');
  assert.ok(stage1.label.includes('Matchmaking'));

  const stage2 = formatDraftPhase(2);
  assert.equal(stage2.phase, 'defense');
  assert.ok(stage2.label.includes('Phòng Thủ'));
  assert.ok(stage2.label.includes('Defense Phase'));

  const stage4 = formatDraftPhase(4);
  assert.equal(stage4.phase, 'attack');
  assert.ok(stage4.label.includes('Tấn Công'));
  assert.ok(stage4.label.includes('Attack Phase'));

  const stage5 = formatDraftPhase(5);
  assert.equal(stage5.phase, 'ready');

  const stage7 = formatDraftPhase(7);
  assert.equal(stage7.phase, 'result');
});

test('buildCandidateMatrix builds 5 columns x 3 cards with hero metadata and picked state', () => {
  const mockHeroSteps = [
    [11, 2, 6],      // Step 1: Maya, Galahad, Qing Mao
    [77, 54, 34],    // Step 2: Aidan, Martha, Lars
    [75, 78, 22],    // Step 3
    [56, 59, 36],    // Step 4
    [8, 1, 79]       // Step 5: Phobos, Aurora, Kayla
  ];

  const pickedDefence = [11, 54, 78, 36, 1]; // Picked: Maya, Martha, Hero 78, Hero 36, Aurora

  const matrix = buildCandidateMatrix(mockHeroSteps, pickedDefence);
  assert.equal(matrix.length, 5, 'Matrix must have 5 columns (rounds)');

  // Step 1 check
  assert.equal(matrix[0].length, 3, 'Column 1 must have 3 candidate choices');
  const hero11 = matrix[0][0];
  assert.equal(hero11.id, 11);
  assert.equal(hero11.name, 'Chabba');
  assert.equal(hero11.picked, true, 'Hero 11 (Chabba) was picked');

  const hero2 = matrix[0][1];
  assert.equal(hero2.id, 2);
  assert.equal(hero2.name, 'Galahad');
  assert.equal(hero2.picked, false, 'Hero 2 (Galahad) was not picked');

  // Step 2 check
  const hero54 = matrix[1][1];
  assert.equal(hero54.id, 54);
  assert.equal(hero54.picked, true, 'Hero 54 was picked');

  // Step 5 check
  const aurora = matrix[4][1];
  assert.equal(aurora.id, 1);
  assert.equal(aurora.name, 'Aurora');
  assert.equal(aurora.class, 'Tank');
  assert.equal(aurora.picked, true, 'Aurora was picked');
});

test('parseDraftDto handles valid JSON and reports decoding errors', () => {
  const validJson = JSON.stringify({
    gameTimeTs: 1794228039,
    stageFinishTs: 1794228129,
    playerTeam: {
      heroes: [
        [11, 2, 6],
        [77, 54, 34],
        [75, 78, 22],
        [56, 59, 36],
        [8, 1, 79]
      ]
    },
    chosenDefenceHeroes: [11, 54, 77, 36, 78]
  });

  const parsed = parseDraftDto(validJson);
  assert.equal(parsed.ok, true);
  assert.ok(parsed.draft?.playerTeam?.heroes);
  assert.equal(parsed.draft.playerTeam.heroes.length, 5);

  const invalid = parseDraftDto('{ invalid json ... ');
  assert.equal(invalid.ok, false);
  assert.ok(invalid.error?.includes('JSON parse error'));
});

test('decodeDraftPayload correctly performs XOR decipher with session key', () => {
  const sampleDto = {
    gameTimeTs: 100,
    playerTeam: { heroes: [[1, 2, 3]] }
  };
  const jsonStr = JSON.stringify(sampleDto);
  const constKey = DEFAULT_DRAFT_CONST_KEY;
  const dynKey = 'session_token_12345';

  // Encrypt with same XOR logic
  const cipherChars = [];
  for (let i = 0; i < jsonStr.length; i++) {
    const c = jsonStr.charCodeAt(i);
    const k1 = constKey.charCodeAt(i % constKey.length);
    const k2 = dynKey.charCodeAt(i % dynKey.length);
    cipherChars.push(String.fromCharCode(c ^ k1 ^ k2));
  }
  const base64Cipher = Buffer.from(cipherChars.join(''), 'binary').toString('base64');

  const decrypted = decodeDraftPayload(base64Cipher, dynKey, constKey);
  assert.ok(decrypted);
  assert.equal(decrypted.gameTimeTs, 100);
  assert.deepEqual(decrypted.playerTeam.heroes, [[1, 2, 3]]);
});

test('SettingsTab contains auto-open draft checkbox option', async () => {
  const settingsSrc = await readFile(resolve(root, 'src/components/tabs/SettingsTab.vue'), 'utf8');
  assert.ok(
    settingsSrc.includes('id="setting-auto-open-draft"'),
    'SettingsTab must contain #setting-auto-open-draft checkbox'
  );
  assert.ok(
    settingsSrc.includes('useDraft'),
    'SettingsTab must import useDraft'
  );
});

test('useDraft rebinds state as a new session when new match is received', async () => {
  const { useDraft } = await import('../src/composables/useDraft.ts');
  const { draftSession, bindRpcEvent, bindDecryptedData, bindError } = useDraft();

  // Initial session
  bindRpcEvent({
    matchId: 1001,
    stageId: 2,
    rating: { userRating: 1100, enemyRating: 1050 },
    enemyUser: { name: 'PlayerOne', level: 120 }
  });
  assert.equal(draftSession.matchId, 1001);
  assert.equal(draftSession.stageId, 2);
  assert.equal(draftSession.phase, 'defense');
  assert.equal(draftSession.enemyUser?.name, 'PlayerOne');

  // Bind decrypted data
  bindDecryptedData({
    stageFinishTs: 1794228129,
    playerTeam: { heroes: [[1, 2, 3], [4, 5, 6], [7, 8, 9], [10, 11, 12], [13, 14, 15]] },
    chosenDefenceHeroes: [1, 4, 7, 10, 13]
  });
  assert.equal(draftSession.heroSteps.length, 5);
  assert.equal(draftSession.chosenDefenceHeroes.length, 5);

  // New match arrives while dialog is open -> rebinds as new session
  bindRpcEvent({
    matchId: 1002,
    stageId: 4,
    rating: { userRating: 1110, enemyRating: 1200 },
    enemyUser: { name: 'PlayerTwo', level: 125 }
  });
  assert.equal(draftSession.matchId, 1002);
  assert.equal(draftSession.stageId, 4);
  assert.equal(draftSession.phase, 'attack');
  assert.equal(draftSession.enemyUser?.name, 'PlayerTwo');
  assert.equal(draftSession.heroSteps.length, 0, 'New match resets candidate steps until decrypted');

  // Error binding
  bindError('Test decoding error', 'Stack trace info');
  assert.equal(draftSession.error, 'Test decoding error');
  assert.equal(draftSession.errorDetail, 'Stack trace info');
});

test('LegendsDraftModal template contains 15 hero candidates grid and close button', async () => {
  const modalSrc = await readFile(resolve(root, 'src/components/dialogs/LegendsDraftModal.vue'), 'utf8');
  assert.ok(modalSrc.includes('Legends Draft'), 'Modal title must mention Legends Draft');
  assert.ok(modalSrc.includes('15 Tướng Ứng Viên'), 'Must state 15 candidate heroes');
  assert.ok(modalSrc.includes('Table Hook #330804'), 'Must mention WASM Table Hook #330804');
  assert.ok(modalSrc.includes('Lỗi Giải Mã Dữ Liệu Draft'), 'Must contain error reporting section');
  assert.ok(modalSrc.includes('Đóng'), 'Must contain close button');
});
