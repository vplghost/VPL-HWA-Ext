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
  assert.match(content, /return 'Neutral'/, 'Must default to official server name Neutral for multi-element doors');
  assert.match(content, /useAccountTeams\(accountId\)/, 'Must initialize useAccountTeams with accountId for custom teams');
  assert.match(content, /availableTeamPresets/, 'Must compute availableTeamPresets');
  assert.match(content, /customTeams/, 'Must include custom titan teams in presets');
  assert.match(content, /autoSelectSquad/, 'Must provide autoSelectSquad quick action');
  assert.match(content, /selectedTitanIds/, 'Must track selectedTitanIds');

  // Error diagnostics and retry controls
  assert.match(content, /showDiagnostics/, 'Must have showDiagnostics state for granular diagnostics');
  assert.match(content, /copyDiagnostics/, 'Must have copyDiagnostics action for clipboard export');
  assert.match(content, /errorDetail/, 'Must track structured errorDetail');
  assert.match(content, /Thử lại/, 'Must have retry simulation action in error banner');
});

test('interceptor captures Unity instance and prepares Model A simulation bridge with granular error diagnostics', async () => {
  const content = await readFile(resolve(root, 'src/content/interceptor.ts'), 'utf8');

  // Must set __hwaUnityInstance and __hwaUnityModule
  assert.match(content, /win\.__hwaUnityInstance\s*=/, 'Must assign __hwaUnityInstance on window');
  assert.match(content, /win\.__hwaUnityModule\s*=/, 'Must assign __hwaUnityModule on window');

  // Must setup simulation bridge
  assert.match(content, /win\.__hwaSimulateBattle\s*=/, 'Must define __hwaSimulateBattle on window');
  assert.match(content, /setupWasmSimulationBridge/, 'Must define setupWasmSimulationBridge');

  // Must have describeWasmException for granular phase tracking and avoiding opaque [object WebAssembly.Exception]
  assert.match(content, /describeWasmException/, 'Must define describeWasmException helper');
  assert.match(content, /currentPhase\s*=/, 'Must track currentPhase during simulation steps');
  assert.match(content, /errorDetail/, 'Must forward errorDetail in simulate-battle-result');
  assert.match(content, /win\.__hwaTestWasmEngine\s*=/, 'Must export __hwaTestWasmEngine on window for in-page WASM diagnostics');
  assert.match(content, /testWasmEngineProbe/, 'Must define testWasmEngineProbe with string roundtrip and table validation');
});

test('SettingsTab integrates Game Engine Diagnostics with Test WASM Engine button and error trap presentation', async () => {
  const content = await readFile(resolve(root, 'src/components/tabs/SettingsTab.vue'), 'utf8');

  // Must have test-wasm-engine button and handlers
  assert.match(content, /id="btn-test-wasm-engine"/, 'Must define #btn-test-wasm-engine button');
  assert.match(content, /testWasmEngine/, 'Must define testWasmEngine handler');
  assert.match(content, /wasmTestPending/, 'Must track wasmTestPending state');
  assert.match(content, /wasmTestResult/, 'Must track wasmTestResult state');
  assert.match(content, /wasmTestError/, 'Must track wasmTestError state');
  assert.match(content, /showWasmDiagnostics/, 'Must have showWasmDiagnostics toggle');
  assert.match(content, /id="engine-wasm-test-container"/, 'Must define #engine-wasm-test-container for result display');
});

test('backgroundRuntime and bridge forward test-wasm-engine messages with error detail preservation', async () => {
  const bgContent = await readFile(resolve(root, 'src/background/backgroundRuntime.ts'), 'utf8');
  assert.match(bgContent, /message\?\.kind === 'test-wasm-engine'/, 'Must permit test-wasm-engine in background sender check');
  assert.match(bgContent, /forwardedMessage\.kind === 'test-wasm-engine'/, 'Must await tab response for test-wasm-engine');

  const bridgeContent = await readFile(resolve(root, 'src/content/bridge.ts'), 'utf8');
  assert.match(bridgeContent, /message\?\.kind === 'test-wasm-engine'/, 'Must forward test-wasm-engine to game window');
  assert.match(bridgeContent, /event\.data\.kind === 'test-wasm-engine-result'/, 'Must resolve test-wasm-engine-result to caller');
});
