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
  assert.ok(stage2.label.includes('Round 1: Defense Phase'));

  const stage4 = formatDraftPhase(4);
  assert.equal(stage4.phase, 'attack');
  assert.ok(stage4.label.includes('Round 2: Attack Phase'));

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

test('LegendsDraftModal template uses unified English labels, diagnostics copy button, and 15-hero grid', async () => {
  const modalSrc = await readFile(resolve(root, 'src/components/dialogs/LegendsDraftModal.vue'), 'utf8');
  assert.ok(modalSrc.includes('Legends Draft'), 'Modal title must mention Legends Draft');
  assert.ok(modalSrc.includes('15 Candidate Heroes'), 'Must state 15 Candidate Heroes in English');
  assert.ok(modalSrc.includes('Draft Decryption Error'), 'Must contain English error reporting section');
  assert.ok(modalSrc.includes('id="btn-copy-draft-diagnostics"'), 'Must include #btn-copy-draft-diagnostics button');
  assert.ok(modalSrc.includes('id="draft-diagnostics-panel"'), 'Must include #draft-diagnostics-panel');
  assert.ok(modalSrc.includes('Close'), 'Must contain English Close button');
  assert.ok(!/Chưa có dữ liệu|Hoàn tất trận đấu|Đối thủ:|Tướng Ứng Viên/.test(modalSrc), 'Must not contain Vietnamese UI strings');
});

test('extractDraftHeroSteps normalizes array and object-shaped candidate pools', async () => {
  const {
    extractDraftHeroSteps,
    extractDraftSwapHeroIds,
    extractDraftHeroDetails,
    buildCandidateMatrix,
  } = await import('../src/utils/draftHelper.ts');

  assert.deepEqual(
    extractDraftHeroSteps({ playerTeam: { heroes: [[1, 2, 3], [4, 5, 6]] } }),
    [[1, 2, 3], [4, 5, 6]]
  );
  assert.deepEqual(
    extractDraftHeroSteps({ playerTeam: { heroes: { '0': [{ id: 11 }, { heroId: 12 }], '1': [21, 22] } } }),
    [[11, 12], [21, 22]]
  );

  // Live Unity DraftsXORCipher decrypted payload format: { base: { [id]: HeroObj }, swap: { ... } }
  const livePayload = {
    base: {
      '501': { id: 501, level: 120, color: 16, star: 4, power: 183180 },
      '12': { id: 12, level: 120, color: 16, star: 3, power: 176262 },
      '13': { id: 13, level: 120, color: 16, star: 3, power: 173428 },
      '23': { id: 23, level: 120, color: 16, star: 3, power: 168000 },
    },
    swap: {
      '55': { id: 55, level: 120, color: 16, star: 4, power: 197683 },
      '60': { id: 60, level: 120, color: 16, star: 3, power: 184057 },
    },
  };

  const steps = extractDraftHeroSteps(livePayload);
  assert.equal(steps.flat().length, 4, 'Must extract all 4 base heroes from { base, swap }');
  assert.ok(steps.flat().includes(501) && steps.flat().includes(12) && steps.flat().includes(13) && steps.flat().includes(23));

  const swaps = extractDraftSwapHeroIds(livePayload);
  assert.deepEqual(swaps.sort((a, b) => a - b), [55, 60]);

  const details = extractDraftHeroDetails(livePayload);
  assert.equal(details[501].power, 183180);
  assert.equal(details[501].star, 4);
  assert.equal(details[55].pool, 'swap');

  const matrix = buildCandidateMatrix(steps, [], details);
  const corvus = matrix.flat().find((h) => h.id === 501);
  assert.ok(corvus, 'Corvus (501) must be present in candidate matrix');
  assert.equal(corvus.name, 'Corvus');
  assert.equal(corvus.avatarFile, 'assets/heroes/501.png');
  assert.equal(corvus.power, 183180);
  assert.equal(corvus.star, 4);

  // Stage 7 result payload: { base: null, swap: null }
  assert.deepEqual(extractDraftHeroSteps({ base: null, swap: null }), []);
  assert.deepEqual(extractDraftSwapHeroIds({ base: null, swap: null }), []);
});

test('interceptor decrypts Legends Draft via DraftsXORCipher heap keys without invalid WebAssembly.Table.set', async () => {
  const interceptorSrc = await readFile(resolve(root, 'src/content/interceptor.ts'), 'utf8');
  assert.ok(!interceptorSrc.includes('table.set(TABLE_INDEX_DRAFT_DECRYPT'), 'Must not call invalid WebAssembly.Table.set with JS function');
  assert.ok(interceptorSrc.includes('readDraftCipherKeysFromUnity'), 'Must read DraftsXORCipher keys from Unity WASM heap');
  assert.ok(interceptorSrc.includes('decryptDraftPayloadFromUnity'), 'Must decrypt draft ciphertext directly on RPC response');
});

test('FabDial includes #legend-draft-fab shortcut opening legendsDraft modal', async () => {
  const fabSrc = await readFile(resolve(root, 'src/components/common/FabDial.vue'), 'utf8');
  assert.ok(fabSrc.includes('id="legend-draft-fab"'), 'FabDial must include #legend-draft-fab button');
  assert.ok(fabSrc.includes("openModal('legendsDraft')"), 'FabDial must open legendsDraft modal');
});

test('interceptor, mqttCapture, bridge, and backgroundRuntime wire randomDraft RPC and MQTT auto-open', async () => {
  const interceptorSrc = await readFile(resolve(root, 'src/content/interceptor.ts'), 'utf8');
  assert.ok(
    interceptorSrc.includes('function inspectDraftRpc(reqText: string | null | undefined, resText: string | null | undefined)'),
    'inspectDraftRpc must correlate both request and response payloads'
  );
  assert.ok(interceptorSrc.includes('draftCallsByIdent'), 'Must correlate UUID idents from randomDraft_* requests');

  const mqttSrc = await readFile(resolve(root, 'src/content/mqttCapture.ts'), 'utf8');
  assert.ok(mqttSrc.includes("kind: 'draft-mqtt-event'"), 'mqttCapture must emit draft-mqtt-event on randomDraft_* packets');

  const bridgeSrc = await readFile(resolve(root, 'src/content/bridge.ts'), 'utf8');
  assert.ok(bridgeSrc.includes("'draft-mqtt-event'"), 'bridge must forward draft-mqtt-event to background');

  const bgSrc = await readFile(resolve(root, 'src/background/backgroundRuntime.ts'), 'utf8');
  assert.ok(bgSrc.includes("'draft-mqtt-event'"), 'backgroundRuntime must handle draft-mqtt-event');
  assert.ok(bgSrc.includes('autoOpenNonce'), 'backgroundRuntime must stamp autoOpenNonce when auto-opening draft dialog');
});

test('rpcCache deducts 1 Draft Chip (refillable:60) once per completed Legends Draft match', async () => {
  const { rpcCacheService } = await import('../src/core/cache/rpcCache.ts');
  const cacheHelper = rpcCacheService;

  const endpoint = 'https://api.hero-wars-alliance.com/api/rpc';
  let state = cacheHelper.merge({}, [{
    endpoint,
    method: 'POST',
    status: 200,
    outcome: 'completed',
    timestamp: '2026-11-24T06:00:00.000Z',
    requestBody: JSON.stringify({ calls: [{ name: 'userGetInfo', args: {}, ident: 'u1' }] }),
    responseBody: JSON.stringify({
      results: [{
        ident: 'u1',
        result: {
          response: {
            id: 123,
            refillable: [{ id: 60, amount: 5, lastRefill: 1795413600 }]
          }
        }
      }]
    })
  }]).cache;
  assert.equal(state['resource:refillable:60']?.data?.amount, 5, 'Initial Draft Chips should be 5');

  // Battle starts for match 362806945 -> deducts 1 chip
  state = cacheHelper.merge(state, [{
    endpoint,
    method: 'POST',
    status: 200,
    outcome: 'completed',
    timestamp: '2026-11-24T06:01:00.000Z',
    requestBody: JSON.stringify({ calls: [{ name: 'randomDraft_startBattle', args: {}, ident: 'b1' }] }),
    responseBody: JSON.stringify({
      results: [{
        ident: 'b1',
        result: { response: { battleReplay: { typeId: 362806945 } } }
      }]
    })
  }]).cache;
  assert.equal(state['resource:refillable:60']?.data?.amount, 4, 'Draft Chips should decrement to 4 after startBattle');

  // Match result arrives for the SAME matchId -> must NOT double-deduct
  state = cacheHelper.merge(state, [{
    endpoint,
    method: 'POST',
    status: 200,
    outcome: 'completed',
    timestamp: '2026-11-24T06:02:00.000Z',
    requestBody: JSON.stringify({ calls: [{ name: 'randomDraft_result', args: { matchId: 362806945 }, ident: 'r1' }] }),
    responseBody: JSON.stringify({
      results: [{
        ident: 'r1',
        result: { response: { matchId: 362806945, result: 1, reward: { draftBpExp: 50 } } }
      }]
    })
  }]).cache;
  assert.equal(state['resource:refillable:60']?.data?.amount, 4, 'Same matchId must not double-deduct Draft Chips');

  // Next match completes via randomDraft_result only -> deducts 1 more chip
  state = cacheHelper.merge(state, [{
    endpoint,
    method: 'POST',
    status: 200,
    outcome: 'completed',
    timestamp: '2026-11-24T06:05:00.000Z',
    requestBody: JSON.stringify({ calls: [{ name: 'randomDraft_result', args: { matchId: 362806999 }, ident: 'r2' }] }),
    responseBody: JSON.stringify({
      results: [{
        ident: 'r2',
        result: { response: { matchId: 362806999, result: 1, reward: { draftBpExp: 50 } } }
      }]
    })
  }]).cache;
  assert.equal(state['resource:refillable:60']?.data?.amount, 3, 'New matchId should decrement Draft Chips to 3');
});

test('P1-05: recoverDynamicKeyFromKnownPlaintext recovers live session key from Stage 1 ciphertext and decrypts live payloads', async () => {
  const {
    recoverDynamicKeyFromKnownPlaintext,
    LIVE_DRAFT_CONST_KEY,
    extractDraftEnemyHeroes,
  } = await import('../src/utils/draftHelper.ts');

  // Exact Stage 1 ciphertext from temp/tracking-data/hwa-game-record-202611242246_draft.json
  const stage1Cipher = 'cx90Pxh9egQ7cVNRLyZRTWIwRBY4cx97Tw==';
  const recovered = recoverDynamicKeyFromKnownPlaintext(stage1Cipher);
  assert.ok(recovered, 'Must recover dynamic key from Stage 1 known-plaintext ciphertext');
  assert.equal(recovered.dynamicKey, 'QqV7Raog2rkLNS');
  assert.equal(recovered.constKey, LIVE_DRAFT_CONST_KEY);

  // Verify Stage 6 phase formatting
  const stage6 = formatDraftPhase(6);
  assert.equal(stage6.phase, 'result');
  assert.ok(stage6.label.includes('Result'));

  // Verify extractDraftEnemyHeroes parses enemy defense team map
  const enemyHeroes = extractDraftEnemyHeroes({
    '55': { id: 55, level: 120, color: 16, star: 3, power: 199507 },
    '60': { id: 60, level: 120, color: 16, star: 3, power: 187359 },
  });
  assert.equal(enemyHeroes.length, 2);
  assert.equal(enemyHeroes[0].id, 55);
  assert.equal(enemyHeroes[0].power, 199507);
});

test('P1-05: handleDraftMessage sequential queue prevents storage race and syncs saveDefence/saveAttack heroes', async () => {
  const { handleDraftMessage, flushDraftMessageQueue } = await import('../src/background/handlers/draftHandler.ts');

  const store = { autoOpenDraftDialog: false, legendsDraftSession: { matchId: 100, heroSteps: [[1, 2, 3]] } };
  const mockChrome = {
    storage: {
      local: {
        get: (keys, cb) => {
          setTimeout(() => cb({ ...store }), 5);
        },
        set: (patch, cb) => {
          setTimeout(() => {
            Object.assign(store, patch);
            cb?.();
          }, 5);
        },
      },
    },
    runtime: { sendMessage: () => Promise.resolve() },
  };

  // Fire draft-rpc-event (new matchId -> resets heroSteps) and draft-decrypted back-to-back in same tick
  handleDraftMessage({
    kind: 'draft-rpc-event',
    data: {
      action: 'randomDraft_getInfo',
      response: { matchId: 364948706, stageId: 2, draft: 'cipher_stage2', draftEnemy: 'cipher_enemy2' },
    },
  }, mockChrome);

  handleDraftMessage({
    kind: 'draft-decrypted',
    data: {
      matchId: 364948706,
      stageId: 2,
      method: 'known-plaintext-stage1',
      draft: {
        base: { '2': { id: 2, power: 180515 }, '15': { id: 15, power: 175000 }, '22': { id: 22, power: 170000 } },
        swap: [{ id: 501, power: 190000 }],
      },
      enemyDraft: { '24': { id: 24, power: 193225 } },
      raw: '{"base":{...}}',
    },
  }, mockChrome);

  // Submit picked defense & attack teams
  handleDraftMessage({
    kind: 'draft-rpc-event',
    data: { action: 'randomDraft_saveDefence', args: { heroes: [2, 15, 22, 56, 67] }, response: [] },
  }, mockChrome);
  handleDraftMessage({
    kind: 'draft-rpc-event',
    data: { action: 'randomDraft_saveAttack', args: { heroes: [71, 54, 10, 46, 16] }, response: [] },
  }, mockChrome);

  // Empty Stage 6 decrypted payload must NOT wipe active heroSteps
  handleDraftMessage({
    kind: 'draft-decrypted',
    data: { matchId: 364948706, stageId: 6, draft: { base: null, swap: null }, raw: '{"base":null,"swap":null}' },
  }, mockChrome);

  await flushDraftMessageQueue();

  assert.equal(store.legendsDraftSession.matchId, 364948706);
  assert.equal(store.legendsDraftSession.heroSteps.length, 1, 'Decrypted heroSteps must survive concurrent rpc + empty Stage 6');
  assert.deepEqual(store.legendsDraftSession.swapHeroIds, [501]);
  assert.equal(store.legendsDraftSession.enemyHeroes.length, 1);
  assert.equal(store.legendsDraftSession.enemyHeroes[0].id, 24);
  assert.deepEqual(store.legendsDraftSession.chosenDefenceHeroes, [2, 15, 22, 56, 67]);
  assert.deepEqual(store.legendsDraftSession.chosenAttackHeroes, [71, 54, 10, 46, 16]);
  assert.equal(store.legendsDraftSession.decryptMethod, 'known-plaintext-stage1');

  // Verify modal exposes #draft-enemy-team and #draft-retry-decrypt-btn
  const modalSrc = await readFile(resolve(root, 'src/components/dialogs/LegendsDraftModal.vue'), 'utf8');
  assert.ok(modalSrc.includes('id="draft-enemy-team"'), 'LegendsDraftModal must include #draft-enemy-team');
  assert.ok(modalSrc.includes('id="draft-retry-decrypt-btn"'), 'LegendsDraftModal must include #draft-retry-decrypt-btn');
});

test('P1-09: extractOrderedHeroIdsFromRawJson preserves exact 5x3 round order before JSON.parse() key sorting and ignores nested skinData.id', async () => {
  const {
    extractOrderedHeroIdsFromRawJson,
    extractDraftHeroSteps,
    extractDraftSwapHeroIds,
    extractDraftEnemyHeroes,
  } = await import('../src/utils/draftHelper.ts');

  // Real Stage 2 order from draft_5.md: R1=[55,38,42], R2=[36,3,31], R3=[34,47,10], R4=[8,51,58], R5=[13,62,502]
  const orderedBaseIds = [55, 38, 42, 36, 3, 31, 34, 47, 10, 8, 51, 58, 13, 62, 502];
  const orderedSwapIds = [24, 53, 30, 26, 7, 9];
  const baseEntriesStr = orderedBaseIds
    .map((id) => `"${id}":{"id":${id},"level":120,"color":16,"star":3,"power":175000,"skinData":{"id":0,"rank":0,"color":0},"patron":0}`)
    .join(',');
  const swapEntriesStr = orderedSwapIds
    .map((id) => `{"id":${id},"level":120,"color":16,"star":3,"power":170000,"skinData":{"id":0,"rank":0,"color":0}}`)
    .join(',');
  const rawDraftJson = `{"base":{${baseEntriesStr}},"swap":[${swapEntriesStr}]}`;
  const parsedDraft = JSON.parse(rawDraftJson);

  // Confirm JSON.parse() scrambled Object.keys(parsedDraft.base) into ascending numeric order
  assert.deepEqual(Object.keys(parsedDraft.base).slice(0, 3), ['3', '8', '10']);

  // Confirm raw JSON extractor restores exact 5x3 round order
  assert.deepEqual(extractOrderedHeroIdsFromRawJson(rawDraftJson, 'base'), orderedBaseIds);
  assert.deepEqual(extractDraftHeroSteps(parsedDraft, rawDraftJson), [
    [55, 38, 42],
    [36, 3, 31],
    [34, 47, 10],
    [8, 51, 58],
    [13, 62, 502],
  ]);
  assert.deepEqual(extractDraftSwapHeroIds(parsedDraft, rawDraftJson), orderedSwapIds);

  // Real Stage 4 draftEnemy order from draft_5: [55, 45, 10, 70, 16]
  const orderedEnemyIds = [55, 45, 10, 70, 16];
  const rawEnemyJson = `{${orderedEnemyIds
    .map((id) => `"${id}":{"id":${id},"level":120,"color":16,"star":3,"power":180000,"skinData":{"id":0}}`)
    .join(',')}}`;
  const parsedEnemy = JSON.parse(rawEnemyJson);
  const extractedEnemy = extractDraftEnemyHeroes(parsedEnemy, rawEnemyJson);
  assert.deepEqual(extractedEnemy.map((h) => h.id), orderedEnemyIds);
});

test('P1-09: Stage 5/6/7 empty payloads preserve rawDecrypted, rawEnemyDecrypted, and rawCiphertext; UI exposes player teams and full diagnostics', async () => {
  const { handleDraftMessage, flushDraftMessageQueue } = await import('../src/background/handlers/draftHandler.ts');

  const store = { autoOpenDraftDialog: false, legendsDraftSession: {} };
  const mockChrome = {
    storage: {
      local: {
        get: (_keys, cb) => cb({ ...store }),
        set: (patch, cb) => {
          Object.assign(store, patch);
          cb?.();
        },
      },
    },
    runtime: { sendMessage: () => Promise.resolve() },
  };

  const activeCipher = 'A'.repeat(2200);
  const activeEnemyCipher = 'B'.repeat(750);
  const activeRaw = '{"base":{"55":{"id":55},"38":{"id":38},"42":{"id":42}},"swap":null}';
  const activeRawEnemy = '{"70":{"id":70},"16":{"id":16}}';

  handleDraftMessage({
    kind: 'draft-rpc-event',
    data: {
      action: 'randomDraft_getInfo',
      response: { matchId: 999001, stageId: 4, draft: activeCipher, draftEnemy: activeEnemyCipher },
    },
  }, mockChrome);

  handleDraftMessage({
    kind: 'draft-decrypted',
    data: {
      matchId: 999001,
      stageId: 4,
      draft: JSON.parse(activeRaw),
      enemyDraft: JSON.parse(activeRawEnemy),
      raw: activeRaw,
      rawEnemy: activeRawEnemy,
      method: 'known-plaintext-stage1',
    },
  }, mockChrome);

  // Stage 6 empty RPC & decrypted payload arrive -> must NOT overwrite active raw/ciphertext
  handleDraftMessage({
    kind: 'draft-rpc-event',
    data: {
      action: 'randomDraft_getInfo',
      response: { matchId: 999001, stageId: 6, draft: 'x'.repeat(36), draftEnemy: 'y'.repeat(8) },
    },
  }, mockChrome);
  handleDraftMessage({
    kind: 'draft-decrypted',
    data: {
      matchId: 999001,
      stageId: 6,
      draft: { base: null, swap: null },
      raw: '{"base":null,"swap":null}',
      rawEnemy: null,
    },
  }, mockChrome);

  await flushDraftMessageQueue();

  assert.deepEqual(store.legendsDraftSession.heroSteps, [[55, 38, 42]]);
  assert.deepEqual(store.legendsDraftSession.enemyHeroes.map((h) => h.id), [70, 16]);
  assert.equal(store.legendsDraftSession.rawDecrypted, activeRaw);
  assert.equal(store.legendsDraftSession.rawEnemyDecrypted, activeRawEnemy);
  assert.equal(store.legendsDraftSession.rawCiphertext, activeCipher);
  assert.equal(store.legendsDraftSession.rawEnemyCiphertext, activeEnemyCipher);

  const modalSrc = await readFile(resolve(root, 'src/components/dialogs/LegendsDraftModal.vue'), 'utf8');
  assert.ok(modalSrc.includes('id="draft-player-teams"'), 'LegendsDraftModal must include #draft-player-teams');
  assert.ok(modalSrc.includes('Your Defense Team'), 'Must render Your Defense Team');
  assert.ok(modalSrc.includes('Your Attack Team'), 'Must render Your Attack Team');
  assert.ok(modalSrc.includes('Enemy Attack Candidate Pool'), 'Must distinguish Stage 2 Enemy Attack Candidate Pool');
  assert.ok(modalSrc.includes('id="btn-toggle-draft-full-raw"'), 'Must include full raw JSON toggle in diagnostics');
  assert.ok(modalSrc.includes('rawEnemyDecrypted'), 'Diagnostics must include rawEnemyDecrypted');
});

test('P1-12: normalizeDraftHeroIdList handles empty objects, indexed objects, and arrays from live diagnostics and merges heroDetails within same match', async () => {
  const { normalizeDraftHeroIdList } = await import('../src/utils/draftHelper.ts');
  const { handleDraftMessage, flushDraftMessageQueue } = await import('../src/background/handlers/draftHandler.ts');

  // Exact live diagnostic shapes from match 365226640 (Stage 4 & Stage 7)
  assert.deepEqual(normalizeDraftHeroIdList({}), []);
  assert.deepEqual(
    normalizeDraftHeroIdList({ '0': 7, '1': 503, '2': 37, '3': 75, '4': 67 }),
    [7, 503, 37, 75, 67]
  );
  assert.deepEqual(normalizeDraftHeroIdList([55, 36, 11, 32, 29]), [55, 36, 11, 32, 29]);
  assert.deepEqual(normalizeDraftHeroIdList(null), []);

  // Verify draftHandler preserves merged heroDetails and normalizes object-shaped chosen teams within same matchId
  const store = {
    autoOpenDraftDialog: false,
    legendsDraftSession: {
      matchId: 365226640,
      stageId: 2,
      heroDetails: {
        7: { id: 7, power: 190000, star: 5, level: 120 },
        503: { id: 503, power: 185000, star: 4, level: 120 },
      },
      chosenDefenceHeroes: { '0': 7, '1': 503, '2': 37, '3': 75, '4': 67 },
      chosenAttackHeroes: {},
    },
  };
  const mockChrome = {
    storage: {
      local: {
        get: (_keys, cb) => cb({ ...store }),
        set: (obj, cb) => {
          Object.assign(store, obj);
          cb?.();
        },
      },
    },
    runtime: { sendMessage: () => Promise.resolve() },
  };

  handleDraftMessage({
    kind: 'draft-decrypted',
    data: {
      matchId: 365226640,
      stageId: 4,
      draft: {
        base: {
          '55': { id: 55, power: 205447, star: 5, level: 120 },
          '36': { id: 36, power: 183014, star: 4, level: 120 },
        },
        swap: null,
        chosenAttackHeroes: [55, 36, 11, 32, 29],
      },
      raw: '{"base":{"55":{"id":55,"power":205447},"36":{"id":36,"power":183014}},"swap":null}',
    },
  }, mockChrome);

  await flushDraftMessageQueue();

  assert.deepEqual(store.legendsDraftSession.chosenDefenceHeroes, [7, 503, 37, 75, 67]);
  assert.deepEqual(store.legendsDraftSession.chosenAttackHeroes, [55, 36, 11, 32, 29]);
  assert.equal(store.legendsDraftSession.heroDetails[7]?.power, 190000, 'Must preserve Defense hero stats in same match');
  assert.equal(store.legendsDraftSession.heroDetails[55]?.power, 205447, 'Must merge Attack hero stats in same match');

  const modalSrc = await readFile(resolve(root, 'src/components/dialogs/LegendsDraftModal.vue'), 'utf8');
  assert.ok(modalSrc.includes('normalizeDraftHeroIdList('), 'LegendsDraftModal must normalize chosen hero ID lists');
  assert.ok(modalSrc.includes('playerDefensePower') && modalSrc.includes('playerAttackPower'), 'LegendsDraftModal must compute Defense & Attack team power');
});
