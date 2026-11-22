import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

test('DungeonModal template includes interactive simulation button on door cards and mounts DungeonSimModal', async () => {
  const content = await readFile(resolve(root, 'src/components/dialogs/DungeonModal.vue'), 'utf8');

  // Must import DungeonSimModal
  assert.match(content, /import\s+DungeonSimModal\s+from\s+['"]@\/src\/components\/dialogs\/DungeonSimModal\.vue['"]/, 'Must import DungeonSimModal');

  // Must have door simulation button with ID pattern and class
  assert.match(content, /:id="`btn-door-sim-\${idx}`"/, 'Must have dynamic door sim button ID');
  assert.match(content, /dungeon-door-sim-btn/, 'Must have dungeon-door-sim-btn class');
  assert.match(content, /openSimModal\(door,\s*idx\)/, 'Must call openSimModal on click');

  // Must mount DungeonSimModal component
  assert.match(content, /<DungeonSimModal\b/, 'Must mount <DungeonSimModal> component');
  assert.match(content, /v-model="isSimModalOpen"/, 'Must bind isSimModalOpen');
  assert.match(content, /:floor-number="floorNumber"/, 'Must pass floorNumber prop');
});

test('DungeonSimModal Single File Component defines simulation controls, squad picker, and submission actions', async () => {
  const content = await readFile(resolve(root, 'src/components/dialogs/DungeonSimModal.vue'), 'utf8');

  // Modal dialog ID
  assert.match(content, /id="dungeon-sim-modal"/, 'Must define #dungeon-sim-modal container');

  // Simulation run button
  assert.match(content, /id="btn-run-dungeon-sim"/, 'Must define #btn-run-dungeon-sim button');
  assert.match(content, /handleRunSimulation/, 'Must have handleRunSimulation method');

  // Official submit button
  assert.match(content, /id="btn-submit-dungeon-sim-official"/, 'Must define #btn-submit-dungeon-sim-official button');
  assert.match(content, /handleSubmitOfficial/, 'Must have handleSubmitOfficial method');

  // Close / abort button
  assert.match(content, /id="btn-close-dungeon-sim-modal"/, 'Must define #btn-close-dungeon-sim-modal button');

  // Result display section
  assert.match(content, /id="dungeon-sim-result-box"/, 'Must define #dungeon-sim-result-box');

  // Element filtering and healer rules
  assert.match(content, /doorElement/, 'Must evaluate doorElement');
  assert.match(content, /autoSelectSquad/, 'Must provide autoSelectSquad quick action');
  assert.match(content, /selectedTitanIds/, 'Must track selectedTitanIds');
});

test('interceptor captures Unity instance and prepares Model A simulation bridge', async () => {
  const content = await readFile(resolve(root, 'src/content/interceptor.ts'), 'utf8');

  // Must set __hwaUnityInstance and __hwaUnityModule
  assert.match(content, /win\.__hwaUnityInstance\s*=/, 'Must assign __hwaUnityInstance on window');
  assert.match(content, /win\.__hwaUnityModule\s*=/, 'Must assign __hwaUnityModule on window');

  // Must setup simulation bridge
  assert.match(content, /win\.__hwaSimulateBattle\s*=/, 'Must define __hwaSimulateBattle on window');
  assert.match(content, /setupWasmSimulationBridge/, 'Must define setupWasmSimulationBridge');
});
