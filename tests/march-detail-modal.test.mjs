import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { extractMarchSquadDetails } from '../src/utils/marchTooltip.ts';
import { dashboardMarches } from '../src/utils/dashboardState.ts';
import { getTroopType } from '../src/utils/troops.ts';

const root = resolve(process.cwd());

test('useModals and App.vue support marchDetail modal and context', async () => {
  const useModalsRaw = await readFile(resolve(root, 'src/composables/useModals.ts'), 'utf8');
  assert.match(useModalsRaw, /'marchDetail'/, 'useModals must include marchDetail in ModalName');
  assert.match(useModalsRaw, /marchDetail: false/, 'useModals must have marchDetail in modalState');
  assert.match(useModalsRaw, /selectedMarchId\?:/, 'useModals must support selectedMarchId in modalContext');

  const appRaw = await readFile(resolve(root, 'entrypoints/popup/App.vue'), 'utf8');
  assert.match(appRaw, /import MarchDetailModal from '@\/src\/components\/dialogs\/MarchDetailModal\.vue'/, 'App.vue must import MarchDetailModal');
  assert.match(appRaw, /<MarchDetailModal[\s\S]*v-model="modalState\.marchDetail"[\s\S]*:initial-march-id="modalContext\.selectedMarchId"/, 'App.vue must mount MarchDetailModal');
});

test('MarchDetailModal component structure and elements', async () => {
  const modalRaw = await readFile(resolve(root, 'src/components/dialogs/MarchDetailModal.vue'), 'utf8');
  assert.match(modalRaw, /id="march-detail-dialog"/, 'Must have #march-detail-dialog');
  assert.match(modalRaw, /id="march-detail-tabs"/, 'Must have #march-detail-tabs for fast pill switcher');
  assert.match(modalRaw, /id="march-detail-content"/, 'Must have #march-detail-content');
  assert.match(modalRaw, /id="march-detail-status"/, 'Must have #march-detail-status');
  assert.match(modalRaw, /id="march-detail-timer"/, 'Must have #march-detail-timer');
  assert.match(modalRaw, /id="march-detail-heroes"/, 'Must have #march-detail-heroes');
  assert.match(modalRaw, /id="march-detail-troops"/, 'Must have #march-detail-troops');
  assert.match(modalRaw, /id="march-recall-btn"/, 'Must have #march-recall-btn');
  assert.match(modalRaw, /stopMineGathering/, 'Must support stopMineGathering RPC on recall');
});

test('Header.vue and QueuesOverview.vue decouple marches from automation dialogs and open marchDetail', async () => {
  const headerRaw = await readFile(resolve(root, 'src/components/common/Header.vue'), 'utf8');
  assert.match(
    headerRaw,
    /function handleMarchClick\(march: any\) {[\s\S]*openModal\('marchDetail',\s*{\s*selectedMarchId:\s*marchId\s*}\);/,
    'Header.vue must open marchDetail when clicking on an active march pill'
  );

  const queuesRaw = await readFile(resolve(root, 'src/components/dashboard/QueuesOverview.vue'), 'utf8');
  assert.match(
    queuesRaw,
    /function handleMarchClick\(m: any\) {[\s\S]*openModal\('marchDetail',\s*{\s*selectedMarchId:\s*marchId\s*}\);/,
    'QueuesOverview.vue must open marchDetail when clicking on a march card'
  );
  assert.match(
    queuesRaw,
    /@click="handleMarchClick\(m\)"/,
    'QueuesOverview.vue button must pass march object to handleMarchClick'
  );
});

test('extractMarchSquadDetails and getTroopType extract comprehensive troop and hero details', () => {
  const march = {
    squadId: 'squad-99',
    team: {
      heroIds: [101, 102, 103],
      units: [
        { id: 8, count: 2500 },  // Type 0 (Infantry), Level 8
        { id: 17, count: 3500 }, // Type 1 (Spearmen), Level 7
        { id: 26, count: 4000 }, // Type 2 (Marksmen), Level 6
      ]
    }
  };

  const details = extractMarchSquadDetails(march, {});
  assert.equal(details.heroNames.length, 3);
  assert.equal(details.totalTroops, 10000);
  assert.equal(details.troopsText, '10,000 troops');

  const t0 = getTroopType(8);
  assert.deepEqual(t0, { type: 0, level: 8 });

  const t1 = getTroopType(17);
  assert.deepEqual(t1, { type: 1, level: 7 });

  const t2 = getTroopType(26);
  assert.deepEqual(t2, { type: 2, level: 6 });
});

test('dashboardMarches maps active marches cleanly with target, stage and timerText', () => {
  const now = 100000;
  const cache = {
    marchStatus: {
      data: {
        marches: [
          {
            id: 'm1',
            squadId: 's1',
            kind: 'gather',
            stage: 'interactionWithTarget',
            mineId: 'mine-1',
            targetName: 'Wood Mine',
            endsAt: 120000,
          },
          {
            id: 'm2',
            squadId: 's2',
            kind: 'attack',
            stage: 'moveToTargetInSolo',
            mobConfigId: 21,
            targetArrivalAt: 115000,
            endsAt: 130000,
          }
        ]
      }
    }
  };

  const list = dashboardMarches(cache, now);
  assert.equal(list.length, 2);
  assert.equal(list[0].id, 'm1');
  assert.equal(list[0].category, 'gather');
  assert.equal(list[1].id, 'm2');
  assert.equal(list[1].category, 'monster');
});
