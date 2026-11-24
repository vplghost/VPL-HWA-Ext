import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import {
  MIN_VALID_WASM_PTR,
  isAlignedPtr,
  safeReadU32,
  safeReadI32,
  safeReadCStr,
  safeReadIl2CppStr,
  getFreshViews,
} from '../src/utils/safeWasmMemory.ts';
import { readTrackingLog } from './helpers/trackingLog.mjs';

const require = createRequire(import.meta.url);
const { extractBattlePairsFromLog, diffBattleOutcome } = require('../debug-bridge/replay-battle-log.js');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

test('safeWasmMemory enforces bounds, alignment, C-string and IL2CPP UTF-16 string reading', () => {
  const buf = new ArrayBuffer(128 * 1024); // 128 KB
  const views = getFreshViews(buf);
  assert.equal(views.byteLength, 128 * 1024);

  // Alignment & bounds checks
  assert.equal(isAlignedPtr(1024, buf.byteLength), false, 'Ptr below MIN_VALID_WASM_PTR must fail');
  assert.equal(isAlignedPtr(MIN_VALID_WASM_PTR + 2, buf.byteLength, 4), false, 'Unaligned ptr must fail');
  assert.equal(isAlignedPtr(buf.byteLength, buf.byteLength), false, 'Out-of-bounds ptr must fail');
  assert.equal(isAlignedPtr(MIN_VALID_WASM_PTR, buf.byteLength, 4), true);

  // U32 / I32 reads
  const ptr = MIN_VALID_WASM_PTR + 16;
  views.u32[ptr >>> 2] = 0xdeadbeef;
  assert.equal(safeReadU32(buf, ptr), 0xdeadbeef);
  assert.equal(safeReadU32(buf, ptr + 1), null);
  assert.equal(safeReadI32(buf, ptr), -559038737);

  // C-string read
  const cstrPtr = MIN_VALID_WASM_PTR + 128;
  const word = 'BattleConfigStorage';
  for (let i = 0; i < word.length; i++) views.u8[cstrPtr + i] = word.charCodeAt(i);
  views.u8[cstrPtr + word.length] = 0;
  assert.equal(safeReadCStr(buf, cstrPtr), 'BattleConfigStorage');
  assert.equal(safeReadCStr(buf, 100), null);

  // IL2CPP UTF-16 System.String (+8: len, +12: chars)
  const ilStrPtr = MIN_VALID_WASM_PTR + 512;
  const text = 'DraftsXORCipher';
  views.i32[(ilStrPtr + 8) >>> 2] = text.length;
  for (let i = 0; i < text.length; i++) {
    views.u16[((ilStrPtr + 12) >>> 1) + i] = text.charCodeAt(i);
  }
  assert.equal(safeReadIl2CppStr(buf, ilStrPtr), 'DraftsXORCipher');
  assert.equal(safeReadIl2CppStr(buf, ilStrPtr + 2), null);
});

test('replay-battle-log extracts paired Dungeon battles and computes accurate diffs', async () => {
  const dungeonLogText = await readTrackingLog('hwa-game-record-202611100940_dungeon.json');
  const dungeonLog = JSON.parse(dungeonLogText);
  const pairs = extractBattlePairsFromLog(dungeonLog, 'dungeon');

  assert.ok(pairs.length > 0, 'Must extract dungeon battle pairs from real tracking log');
  assert.equal(pairs[0].type, 'dungeon');
  assert.equal(pairs[0].startMethod, 'dungeonStartBattle');
  assert.ok(pairs[0].seed > 0);
  assert.ok(pairs[0].expected, 'First battle must pair with ground-truth dungeonEndBattle');
  assert.equal(pairs[0].expected.win, true);

  // Exact match diff
  const exact = diffBattleOutcome(
    { win: true, stars: 3, duration: 30.5, attackers: { '4000': { hp: 1000, energy: 500 } } },
    { win: true, stars: 3, duration: 30.5, attackers: { '4000': { hp: 1000, energy: 500 } } }
  );
  assert.equal(exact.status, 'EXACT_MATCH');
  assert.equal(exact.maxHpDelta, 0);

  // Mismatch diff
  const mismatch = diffBattleOutcome(
    { win: true, stars: 3, duration: 30.5, attackers: {} },
    { win: false, stars: 0, duration: 20.0, attackers: {} }
  );
  assert.equal(mismatch.status, 'MISMATCH');
  assert.equal(mismatch.winMatch, false);
});

test('Live Debug Bridge wires /health, /reload-tab, and window.__unityBridge.safeMem', () => {
  const hostSrc = fs.readFileSync(path.join(ROOT, 'debug-bridge', 'host.js'), 'utf8');
  assert.match(hostSrc, /pathname === '\/health'/);
  assert.match(hostSrc, /pathname === '\/reload-tab'/);
  assert.match(hostSrc, /type: 'reload_tab'/);
  assert.match(hostSrc, /message\.type === 'reload_result'/);

  const cliSrc = fs.readFileSync(path.join(ROOT, 'debug-bridge', 'bridge-cli.js'), 'utf8');
  assert.match(cliSrc, /checkHealth/);
  assert.match(cliSrc, /reloadTab/);

  const bgDebugSrc = fs.readFileSync(path.join(ROOT, 'src', 'background', 'debugBridge.ts'), 'utf8');
  assert.match(bgDebugSrc, /msg\.type === 'reload_tab'/);
  assert.match(bgDebugSrc, /cr\.tabs\.reload/);

  const unityBridgeSrc = fs.readFileSync(path.join(ROOT, 'src', 'utils', 'unityDebugBridge.ts'), 'utf8');
  assert.match(unityBridgeSrc, /safeMem/);
});
