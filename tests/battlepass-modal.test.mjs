import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { getBattlePassName, knownBattlePassNames } from '../src/data/battlepassCatalog.ts';
import { useModals } from '../src/composables/useModals.ts';

const root = resolve(import.meta.dirname, '..');

test('BattlePassModal component defines battlePass modal, levels ladder, and rewards', async () => {
  const modalPath = join(root, 'src/components/dialogs/BattlePassModal.vue');
  const content = await readFile(modalPath, 'utf8');

  // Verify structure and contracts
  assert.match(content, /modal-name="battlePass"/, 'Must specify modal-name battlePass');
  assert.match(content, /availablePasses/, 'Must compute availablePasses');
  assert.match(content, /milestoneTiers/, 'Must compute milestoneTiers');
  assert.match(content, /filteredTiers/, 'Must compute filteredTiers');
  assert.match(content, /claimTierReward/, 'Must define single tier claim');
  assert.match(content, /claimAllReady/, 'Must define batch claimAllReady');
  assert.match(content, /claimBattlepassRewardAll/, 'Must dispatch claimBattlepassRewardAll RPC');
  assert.match(content, /parseRewards/, 'Must parse tier rewards');
  assert.match(content, /Free:/, 'Must render Free track label');
  assert.match(content, /Golden:/, 'Must render Golden track label');
});

test('useModals and App.vue integrate BattlePassModal dialog state and mounting', async () => {
  const appPath = join(root, 'entrypoints/popup/App.vue');
  const appContent = await readFile(appPath, 'utf8');

  assert.ok(appContent.includes("import BattlePassModal from '@/src/components/dialogs/BattlePassModal.vue';"));
  assert.match(appContent, /<BattlePassModal v-model="modalState\.battlePass"/);

  const { modalState, modalContext, openModal, closeModal } = useModals();
  assert.equal(typeof modalState.battlePass, 'boolean');

  openModal('battlePass', { selectedBattlePassId: 1017 });
  assert.equal(modalState.battlePass, true);
  assert.equal(modalContext.selectedBattlePassId, 1017);

  closeModal('battlePass');
  assert.equal(modalState.battlePass, false);
});

test('getBattlePassName maps all known battle passes and falls back gracefully', () => {
  assert.equal(getBattlePassName(1017), "Hero's Way S31");
  assert.equal(getBattlePassName(1016), 'Season Pass S31');
  assert.equal(getBattlePassName(1036), 'Wodryn Relic Pass S31');
  assert.equal(getBattlePassName(1037), 'Glory Pass S31');
  assert.equal(getBattlePassName(1001), 'Glory Pass S29');
  assert.equal(getBattlePassName(1005), 'Ancients Pass S30');
  assert.equal(getBattlePassName(1006), 'Bounty Pass S30');
  assert.equal(getBattlePassName(1007), 'Glory Pass S30');
  assert.equal(getBattlePassName(1008), 'Harmony Pass S30');
  assert.equal(getBattlePassName(1051), 'Team Level Progressive Plan');
  assert.equal(getBattlePassName(186), 'Draft Pass');
  assert.equal(getBattlePassName(188), 'Season Battle Pass');

  // Object shape
  assert.equal(getBattlePassName({ battlepassId: 1017 }), "Hero's Way S31");
  assert.equal(getBattlePassName({ id: 186, type: 'draft' }), 'Draft Pass');
  assert.equal(getBattlePassName({ id: 9999, type: 'regular' }), 'Season Pass (#9999)');

  // Track label fallback
  const mockCatalog = {
    battlepass: {
      tracks: [
        { battlepassId: 7777, label: 'Mythic Ascension Pass Premium' }
      ]
    }
  };
  assert.equal(getBattlePassName(7777, mockCatalog), 'Mythic Ascension Pass');

  // Unknown fallback
  assert.equal(getBattlePassName(88888), 'Battle Pass #88888');
  assert.equal(getBattlePassName(null), 'Battle Pass');
});
