import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const wasmSymbolsPath = path.join(ROOT, 'src', 'data', 'wasmSymbols.ts');
const interceptorPath = path.join(ROOT, 'src', 'content', 'interceptor.ts');
const bridgePath = path.join(ROOT, 'src', 'content', 'bridge.ts');
const settingsTabPath = path.join(ROOT, 'src', 'components', 'tabs', 'SettingsTab.vue');

// Node 22+ natively strips TypeScript types when importing .ts modules
const wasmMod = await import('../src/data/wasmSymbols.ts');

test('DEFAULT_WASM_PROFILE contains all core required symbols with valid tableIndex and arity', () => {
  const { DEFAULT_WASM_PROFILE, DEFAULT_WASM_PROFILE_VERSION, CORE_REQUIRED_WASM_SYMBOLS } = wasmMod;
  assert.ok(DEFAULT_WASM_PROFILE, 'DEFAULT_WASM_PROFILE should be defined');
  assert.equal(DEFAULT_WASM_PROFILE.gameVersion, DEFAULT_WASM_PROFILE_VERSION);
  assert.ok(DEFAULT_WASM_PROFILE.buildHash.length > 8);

  for (const key of CORE_REQUIRED_WASM_SYMBOLS) {
    const entry = DEFAULT_WASM_PROFILE.symbols[key];
    assert.ok(entry, `Missing core symbol: ${key}`);
    assert.ok(Number.isInteger(entry.tableIndex) && entry.tableIndex > 0, `Invalid tableIndex for ${key}`);
    assert.ok(Number.isInteger(entry.arity) && entry.arity > 0, `Invalid arity for ${key}`);
  }

  // Known verified addresses & offsets for 1.294.1020
  assert.equal(DEFAULT_WASM_PROFILE.symbols.Play_ctor.tableIndex, 291996);
  assert.equal(DEFAULT_WASM_PROFILE.symbols.BattleConfigStorage_get_titan.tableIndex, 285313);
  assert.equal(DEFAULT_WASM_PROFILE.symbols.BattleConfigStorage_get_tower.tableIndex, 285311);
  assert.equal(DEFAULT_WASM_PROFILE.symbols.Presets_manualRaid.tableIndex, 291685);
  assert.equal(DEFAULT_WASM_PROFILE.symbols.Presets_arena.tableIndex, 291682);
  assert.equal(DEFAULT_WASM_PROFILE.staticAddrs.battleConfigHolder, 0x15a3a30);
  assert.equal(DEFAULT_WASM_PROFILE.staticAddrs.battleConfigStaticFieldsOff, 92);
  assert.equal(DEFAULT_WASM_PROFILE.staticAddrs.battleConfigStorageOff, 112);
  assert.equal(DEFAULT_WASM_PROFILE.structOffsets.draftCipherDynamicKey, 8);
  assert.equal(DEFAULT_WASM_PROFILE.structOffsets.draftCipherConstKey, 12);
});

test('getWasmProfileForVersion merges numeric and object overrides cleanly', () => {
  const { getWasmProfileForVersion, DEFAULT_WASM_PROFILE } = wasmMod;
  const merged = getWasmProfileForVersion('1.295.0', {
    gameVersion: '1.295.0',
    symbols: {
      Play_ctor: 300001,
      Play_start: { tableIndex: 300002, arity: 3 },
    },
    staticAddrs: { battleConfigHolder: 0x1600000 },
    structOffsets: { draftCipherConstKey: 16 },
  });

  assert.equal(merged.gameVersion, '1.295.0');
  assert.equal(merged.symbols.Play_ctor.tableIndex, 300001);
  assert.equal(merged.symbols.Play_ctor.arity, DEFAULT_WASM_PROFILE.symbols.Play_ctor.arity);
  assert.equal(merged.symbols.Play_start.tableIndex, 300002);
  assert.equal(merged.symbols.Play_start.arity, 3);
  assert.equal(merged.staticAddrs.battleConfigHolder, 0x1600000);
  assert.equal(merged.staticAddrs.battleConfigStaticFieldsOff, 92);
  assert.equal(merged.structOffsets.draftCipherDynamicKey, 8);
  assert.equal(merged.structOffsets.draftCipherConstKey, 16);
});

test('verifyWasmProfile detects ok, version_mismatch, and arity_mismatch', () => {
  const { DEFAULT_WASM_PROFILE, CORE_REQUIRED_WASM_SYMBOLS, verifyWasmProfile } = wasmMod;

  const makeMockTable = (overrideArity = {}) => {
    const map = new Map();
    for (const key of CORE_REQUIRED_WASM_SYMBOLS) {
      const entry = DEFAULT_WASM_PROFILE.symbols[key];
      const len = overrideArity[key] ?? entry.arity;
      const fn = new Function(...Array.from({ length: len }, (_, i) => `a${i}`), 'return 0;');
      map.set(entry.tableIndex, fn);
    }
    return {
      length: 400000,
      get: (idx) => map.get(idx) ?? null,
    };
  };

  const okRes = verifyWasmProfile(makeMockTable(), DEFAULT_WASM_PROFILE, DEFAULT_WASM_PROFILE.gameVersion);
  assert.equal(okRes.status, 'ok');
  assert.equal(okRes.mismatches.length, 0);

  const verRes = verifyWasmProfile(makeMockTable(), DEFAULT_WASM_PROFILE, '1.295.9999');
  assert.equal(verRes.status, 'version_mismatch');
  assert.equal(verRes.mismatches.length, 0);

  const badRes = verifyWasmProfile(makeMockTable({ Play_ctor: 3 }), DEFAULT_WASM_PROFILE, DEFAULT_WASM_PROFILE.gameVersion);
  assert.equal(badRes.status, 'arity_mismatch');
  assert.equal(badRes.mismatches.length, 1);
  assert.equal(badRes.mismatches[0].key, 'Play_ctor');
  assert.equal(badRes.mismatches[0].expectedArity, 7);
  assert.equal(badRes.mismatches[0].actualArity, 3);
});

test('interceptor.ts uses wasmSymbols profile, verifyWasmProfile guard, and BattleConfigStorage heap fallback', () => {
  const src = fs.readFileSync(interceptorPath, 'utf8');
  assert.match(src, /from '\.\.\/data\/wasmSymbols\.ts'/);
  assert.match(src, /verifyWasmProfile\(/);
  assert.match(src, /arity_mismatch/);
  assert.match(src, /activeProfile\.staticAddrs/);
  assert.match(src, /findClassByName\('BattleConfigStorage'\)/);
  assert.match(src, /draftCipherDynamicKey/);
  assert.match(src, /draftCipherConstKey/);
  assert.ok(!src.includes('0x15a3a30'), 'interceptor.ts should not hardcode 0x15a3a30');
});

test('bridge.ts forwards wasmSymbolOverrides from chrome.storage.local to interceptor', () => {
  const src = fs.readFileSync(bridgePath, 'utf8');
  assert.match(src, /wasmSymbolOverrides/);
  assert.match(src, /if \('wasmSymbolOverrides' in changes\)/);
});

test('SettingsTab.vue exposes WASM Engine Profile status and Symbol Override JSON controls', () => {
  const src = fs.readFileSync(settingsTabPath, 'utf8');
  assert.match(src, /DEFAULT_WASM_PROFILE_VERSION/);
  assert.match(src, /id="wasm-profile-status"/);
  assert.match(src, /id="wasm-version-mismatch-badge"/);
  assert.match(src, /id="wasm-symbol-override-input"/);
  assert.match(src, /id="btn-apply-wasm-override"/);
  assert.match(src, /id="btn-reset-wasm-override"/);
  assert.match(src, /wasmSymbolOverrides/);
});

test('WASM sync automation scripts and AI skill exist', () => {
  assert.ok(fs.existsSync(wasmSymbolsPath), 'src/data/wasmSymbols.ts must exist');
  assert.ok(fs.existsSync(path.join(ROOT, 'hwa-sim', 'scripts', 'resolve-wasm-symbols.mjs')));
  assert.ok(fs.existsSync(path.join(ROOT, 'scripts', 'wasm-sync.ps1')));
  assert.ok(fs.existsSync(path.join(ROOT, '.agents', 'skills', 'wasm-sync', 'SKILL.md')));
});
