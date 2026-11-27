import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  registerAutopilotDialogRunner,
  hasAutopilotDialogRunner,
  runAutopilotStepViaDialog,
  stopActiveAutopilotDialogRunner,
} from '../src/composables/useAutopilotDialogBridge.ts';

test('runAutopilotStepViaDialog opens modal when closed, awaits runner, and closes modal afterwards (including on error)', async () => {
  const events = [];
  let modalOpen = false;
  const unregister = registerAutopilotDialogRunner({
    stepId: 'expeditions',
    modalName: 'expeditions',
    async run() {
      events.push(`run:open=${modalOpen}`);
      return { status: 'done', detail: 'Expeditions done' };
    },
  });

  try {
    assert.equal(hasAutopilotDialogRunner('expeditions'), true);
    const res = await runAutopilotStepViaDialog('expeditions', {
      openModal: (name) => { modalOpen = true; events.push(`open:${name}`); },
      closeModal: (name) => { modalOpen = false; events.push(`close:${name}`); },
      isModalOpen: () => modalOpen,
      isAborted: () => false,
      waitTick: async () => {},
    });
    assert.equal(res?.status, 'done');
    assert.deepEqual(events, ['open:expeditions', 'run:open=true', 'close:expeditions']);
    assert.equal(modalOpen, false);
  } finally {
    unregister();
  }

  // Error case must still close modal opened by autopilot
  let errModalOpen = false;
  let closedOnErr = false;
  const unregErr = registerAutopilotDialogRunner({
    stepId: 'tower',
    modalName: 'tower',
    async run() {
      throw new Error('boom');
    },
  });
  try {
    await assert.rejects(
      () =>
        runAutopilotStepViaDialog('tower', {
          openModal: () => { errModalOpen = true; },
          closeModal: () => { errModalOpen = false; closedOnErr = true; },
          isModalOpen: () => errModalOpen,
          isAborted: () => false,
          waitTick: async () => {},
        }),
      /boom/
    );
    assert.equal(closedOnErr, true, 'Modal opened by autopilot must close in finally even on error');
  } finally {
    unregErr();
  }
});

test('runAutopilotStepViaDialog preserves modal open state when user already had it open, and forwards stop()', async () => {
  let modalOpen = true;
  let closeCalled = false;
  let stopped = false;

  const unregister = registerAutopilotDialogRunner({
    stepId: 'soul-sweep',
    modalName: 'campaign',
    async run() {
      return { status: 'done', detail: 'Swept' };
    },
    stop() {
      stopped = true;
    },
  });

  try {
    const res = await runAutopilotStepViaDialog('soul-sweep', {
      openModal: () => { throw new Error('Should not re-open already open modal'); },
      closeModal: () => { closeCalled = true; },
      isModalOpen: () => modalOpen,
      isAborted: () => false,
      waitTick: async () => {},
    });
    assert.equal(res?.status, 'done');
    assert.equal(closeCalled, false, 'Must NOT close modal if user already had it open');

    await stopActiveAutopilotDialogRunner('soul-sweep');
    assert.equal(stopped, true, 'stopActiveAutopilotDialogRunner must invoke runner.stop()');
  } finally {
    unregister();
  }
});

test('ExpeditionsModal, TowerModal, CampaignRaidModal, and useDailyAutopilot wire 1:1 dialog runner parity', () => {
  const expSrc = fs.readFileSync('src/components/dialogs/ExpeditionsModal.vue', 'utf8');
  assert.match(expSrc, /registerAutopilotDialogRunner/);
  assert.match(expSrc, /stepId:\s*'expeditions'/);
  assert.match(expSrc, /await collectAll\(\)/);
  assert.match(expSrc, /await startAvailable\(\)/);

  const towerSrc = fs.readFileSync('src/components/dialogs/TowerModal.vue', 'utf8');
  assert.match(towerSrc, /registerAutopilotDialogRunner/);
  assert.match(towerSrc, /stepId:\s*'tower'/);
  assert.match(towerSrc, /await toggleTowerRun\(\)/);

  const campSrc = fs.readFileSync('src/components/dialogs/CampaignRaidModal.vue', 'utf8');
  assert.match(campSrc, /registerAutopilotDialogRunner/);
  assert.match(campSrc, /stepId:\s*'soul-sweep'/);
  assert.match(campSrc, /await runFavoriteSoulSweep\(\)/);

  const autoSrc = fs.readFileSync('src/composables/useDailyAutopilot.ts', 'utf8');
  assert.match(autoSrc, /runAutopilotStepViaDialog/);
  assert.match(autoSrc, /stopActiveAutopilotDialogRunner/);
});
