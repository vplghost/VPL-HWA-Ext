#!/usr/bin/env node
/**
 * resolve-wasm-symbols.mjs
 *
 * Parses hwa-sim/downloads/symbols.json + hwa-sim/downloads/build.wasm
 * (Type, Import, Function, Element, and Code sections) to automatically resolve:
 * - Exact wasmTable indices + WASM function arities for Battle Simulation & Draft
 * - Static BattleConfigStorage holder address & field offsets (from BattlePresetsFactory_titanArenaRaid / tower)
 * - DraftsXORCipher struct offsets (dynamicKey / constKey)
 *
 * Outputs typed TypeScript profile to src/data/wasmSymbols.ts and prints a compact
 * JSON diff summary when --json-summary is passed.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');
const downloadsDir = path.resolve(__dirname, '../downloads');
const symbolsPath = path.join(downloadsDir, 'symbols.json');
const wasmPath = path.join(downloadsDir, 'build.wasm');
const outTsPath = path.join(repoRoot, 'src/data/wasmSymbols.ts');

function parseArgs(argv) {
  const args = {
    gameVersion: '1.294.1020',
    buildHash: '83d4310c-dded-4bd3-a443-55f22b534671',
    jsonSummary: false,
    dryRun: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--game-version' && argv[i + 1]) args.gameVersion = argv[++i];
    else if (a === '--build-hash' && argv[i + 1]) args.buildHash = argv[++i];
    else if (a === '--json-summary') args.jsonSummary = true;
    else if (a === '--dry-run') args.dryRun = true;
  }
  return args;
}

function readLEB(b, pos) {
  let res = 0, shift = 0, byte;
  do {
    byte = b[pos++];
    res |= (byte & 0x7f) << shift;
    shift += 7;
  } while (byte & 0x80);
  return [res >>> 0, pos];
}

function readSLEB(b, pos) {
  let res = 0, shift = 0, byte;
  do {
    byte = b[pos++];
    res |= (byte & 0x7f) << shift;
    shift += 7;
  } while (byte & 0x80);
  if (shift < 32 && (byte & 0x40)) res |= (~0 << shift);
  return [res, pos];
}

// Exact IL2CPP method name patterns (ordered; first match wins)
const TARGET_SYMBOLS = {
  // BattleInstantPlay
  Play_ctor: { pattern: /^BattleInstantPlay__ctor_m[0-9A-F]+$/, required: true },
  Play_start: { pattern: /^BattleInstantPlay_start_m[0-9A-F]+$/, required: true },
  Play_get_result: { pattern: /^BattleInstantPlay_get_result_m[0-9A-F]+$/, required: true },
  Play_createBattleData: { pattern: /^BattleInstantPlay_createBattleData_m[0-9A-F]+$/, required: false },
  Play_executeBattle: { pattern: /^BattleInstantPlay_executeBattle_m[0-9A-F]+$/, required: false },
  Play_createResult: { pattern: /^BattleInstantPlay_createResult_m[0-9A-F]+$/, required: false },
  Play_dispose: { pattern: /^BattleInstantPlay_dispose_m[0-9A-F]+$/, required: true },

  // BattlePresetsFactory
  Presets_replay: { pattern: /^BattlePresetsFactory_replay_m[0-9A-F]+$/, required: false },
  Presets_manual: { pattern: /^BattlePresetsFactory_manual_m[0-9A-F]+$/, required: false },
  Presets_manualRaid: { pattern: /^BattlePresetsFactory_manualRaid_m[0-9A-F]+$/, required: true },
  Presets_arena: { pattern: /^BattlePresetsFactory_arena_m[0-9A-F]+$/, required: true },
  Presets_clanWarReplay: { pattern: /^BattlePresetsFactory_clanWarReplay_m[0-9A-F]+$/, required: true },
  Presets_challengeAuto: { pattern: /^BattlePresetsFactory_challengeAuto_m[0-9A-F]+$/, required: false },
  Presets_arenaReplay: { pattern: /^BattlePresetsFactory_arenaReplay_m[0-9A-F]+$/, required: false },
  Presets_tower: { pattern: /^BattlePresetsFactory_tower_m[0-9A-F]+$/, required: true },
  Presets_titanArenaReplay: { pattern: /^BattlePresetsFactory_titanArenaReplay_m[0-9A-F]+$/, required: false },
  Presets_titanArenaRaid: { pattern: /^BattlePresetsFactory_titanArenaRaid_m[0-9A-F]+$/, required: true },
  Presets_titanArenaManual: { pattern: /^BattlePresetsFactory_titanArenaManual_m[0-9A-F]+$/, required: false },
  Presets_createReplay: { pattern: /^BattlePresetsFactory_createReplay_m[0-9A-F]+$/, required: false },
  Presets_clanWar: { pattern: /^BattlePresetsFactory_clanWar_m[0-9A-F]+$/, required: false },
  Presets_clanBoss: { pattern: /^BattlePresetsFactory_clanBoss_m[0-9A-F]+$/, required: false },
  Presets_challengeReplayAuto: { pattern: /^BattlePresetsFactory_challengeReplayAuto_m[0-9A-F]+$/, required: false },

  // BattleConfigStorage
  BattleConfigStorage_get_titan: { pattern: /^BattleConfigStorage_get_titan_m[0-9A-F]+$/, required: true },
  BattleConfigStorage_get_tower: { pattern: /^BattleConfigStorage_get_tower_m[0-9A-F]+$/, required: true },
  BattleConfigStorage_get_pve: { pattern: /^BattleConfigStorage_get_pve_m[0-9A-F]+$/, required: false },
  BattleConfigStorage_get_pvp: { pattern: /^BattleConfigStorage_get_pvp_m[0-9A-F]+$/, required: false },
  BattleConfigStorage_get_clanBoss: { pattern: /^BattleConfigStorage_get_clanBoss_m[0-9A-F]+$/, required: false },

  // MultiBattleResult & DataObject & JSON
  JSON_Parse: { pattern: /^JSON_Parse_m[0-9A-F]+$/, required: true },
  LazyDataObject_ctor: { pattern: /^LazyDataObject__ctor_m[0-9A-F]+$/, required: true },
  Object_ToString: { pattern: /^Object_ToString_m[0-9A-F]+$/, required: true },
  MultiBattleResult_get_victory: { pattern: /^MultiBattleResult_get_victory_m[0-9A-F]+$/, required: true },
  MultiBattleResult_get_stars: { pattern: /^MultiBattleResult_get_stars_m[0-9A-F]+$/, required: true },
  MultiBattleResult_get_progress: { pattern: /^MultiBattleResult_get_progress_m[0-9A-F]+$/, required: true },
  MultiBattleResult_get_result: { pattern: /^MultiBattleResult_get_result_m[0-9A-F]+$/, required: false },
  DataObject_asJson: { pattern: /^DataObject_asJson_m[0-9A-F]+$/, required: true },
  BattleData_serializeResult: { pattern: /^BattleData_serializeResult_m[0-9A-F]+$/, required: false },
};

const HELPER_SYMBOLS = {
  DraftsXORCipher_ctor: /^DraftsXORCipher__ctor_m[0-9A-F]+$/,
  DraftsXORCipher_get_constKey: /^DraftsXORCipher_get_constKey_m[0-9A-F]+$/,
  BattlePresets_ctorDefault: /^BattlePresets__ctor_m[0-9A-F]+$/,
};

function loadExistingProfile() {
  if (!fs.existsSync(outTsPath)) return null;
  try {
    const text = fs.readFileSync(outTsPath, 'utf8');
    const verMatch = text.match(/gameVersion:\s*'([^']+)'/);
    const symMatches = [...text.matchAll(/(\w+):\s*\{\s*tableIndex:\s*(\d+),\s*funcIndex:\s*(\d+),\s*arity:\s*(\d+)\s*\}/g)];
    const symbols = {};
    for (const m of symMatches) {
      symbols[m[1]] = { tableIndex: Number(m[2]), funcIndex: Number(m[3]), arity: Number(m[4]) };
    }
    return { gameVersion: verMatch ? verMatch[1] : null, symbols };
  } catch {
    return null;
  }
}

function disassembleOps(buf, start, end) {
  let q = start;
  let localDecls;
  [localDecls, q] = readLEB(buf, q);
  for (let l = 0; l < localDecls; l++) {
    [, q] = readLEB(buf, q);
    q++;
  }
  const ops = [];
  while (q < end) {
    const op = buf[q++];
    if (op === 0x10) {
      let c; [c, q] = readLEB(buf, q);
      ops.push({ op: 'call', val: c });
    } else if (op === 0x11) {
      [, q] = readLEB(buf, q); [, q] = readLEB(buf, q);
      ops.push({ op: 'call_indirect' });
    } else if (op === 0x41) {
      let v; [v, q] = readSLEB(buf, q);
      ops.push({ op: 'i32.const', val: v >>> 0 });
    } else if (op === 0x42) {
      [, q] = readSLEB(buf, q);
    } else if (op === 0x43) {
      q += 4;
    } else if (op === 0x44) {
      q += 8;
    } else if (op === 0x02 || op === 0x03 || op === 0x04) {
      q++;
    } else if (op === 0x0c || op === 0x0d) {
      [, q] = readLEB(buf, q);
    } else if (op === 0x0e) {
      let cnt; [cnt, q] = readLEB(buf, q);
      for (let k = 0; k <= cnt; k++) [, q] = readLEB(buf, q);
    } else if (op >= 0x20 && op <= 0x24) {
      let v; [v, q] = readLEB(buf, q);
      ops.push({ op: op === 0x20 ? 'local.get' : 'var', val: v });
    } else if (op >= 0x28 && op <= 0x3e) {
      let al, off; [al, q] = readLEB(buf, q); [off, q] = readLEB(buf, q);
      if (op === 0x28) ops.push({ op: 'i32.load', off });
      else if (op === 0x36) ops.push({ op: 'i32.store', off });
    } else if (op === 0x3f || op === 0x40) {
      [, q] = readLEB(buf, q);
    } else if (op === 0xfc) {
      let sub; [sub, q] = readLEB(buf, q);
      if (sub === 8 || sub === 10) { [, q] = readLEB(buf, q); [, q] = readLEB(buf, q); }
      else if (sub === 9 || sub === 11) { [, q] = readLEB(buf, q); }
    }
  }
  return ops;
}

function extractBattleConfigHolder(ops) {
  // Pattern in BattlePresetsFactory_titanArenaRaid / tower:
  // i32.const <holderAddr> -> i32.load off=0 -> i32.load off=92 -> i32.load off=112
  for (let i = 0; i < ops.length - 3; i++) {
    if (
      ops[i].op === 'i32.const' && ops[i].val > 0x100000 &&
      ops[i + 1].op === 'i32.load' && ops[i + 1].off === 0 &&
      ops[i + 2].op === 'i32.load' && ops[i + 2].off > 0 && ops[i + 2].off < 256 &&
      ops[i + 3].op === 'i32.load' && ops[i + 3].off > 0 && ops[i + 3].off < 512
    ) {
      return {
        battleConfigHolder: ops[i].val,
        battleConfigStaticFieldsOff: ops[i + 2].off,
        battleConfigStorageOff: ops[i + 3].off,
      };
    }
  }
  return null;
}

function extractDraftCipherOffsets(ctorOps, getConstKeyOps) {
  let constKeyOff = 12;
  let dynamicKeyOff = 8;
  // get_constKey: local.get 0 -> i32.load off=12
  for (let i = 0; i < getConstKeyOps.length - 1; i++) {
    if (getConstKeyOps[i].op === 'local.get' && getConstKeyOps[i].val === 0 && getConstKeyOps[i + 1].op === 'i32.load' && getConstKeyOps[i + 1].off >= 8) {
      constKeyOff = getConstKeyOps[i + 1].off;
      break;
    }
  }
  // ctor: local.get 0, local.get 2, i32.store off=8
  for (let i = 0; i < ctorOps.length - 2; i++) {
    if (
      ctorOps[i].op === 'local.get' && ctorOps[i].val === 0 &&
      ctorOps[i + 1].op === 'local.get' && ctorOps[i + 1].val === 2 &&
      ctorOps[i + 2].op === 'i32.store' && ctorOps[i + 2].off >= 8
    ) {
      dynamicKeyOff = ctorOps[i + 2].off;
      break;
    }
  }
  return { draftCipherDynamicKey: dynamicKeyOff, draftCipherConstKey: constKeyOff };
}

function main() {
  const args = parseArgs(process.argv);
  if (!fs.existsSync(symbolsPath) || !fs.existsSync(wasmPath)) {
    const err = { ok: false, error: 'Missing hwa-sim/downloads/symbols.json or build.wasm' };
    console.error(JSON.stringify(err));
    process.exit(1);
  }

  const prev = loadExistingProfile();
  const symbols = JSON.parse(fs.readFileSync(symbolsPath, 'utf8'));
  const funcIndexByKey = {};
  const unresolved = [];

  for (const [key, spec] of Object.entries(TARGET_SYMBOLS)) {
    let matchedFunc = null;
    for (const [fIdxStr, fName] of Object.entries(symbols)) {
      if (spec.pattern.test(fName)) {
        matchedFunc = Number(fIdxStr);
        break;
      }
    }
    if (matchedFunc != null) {
      funcIndexByKey[key] = matchedFunc;
    } else if (spec.required) {
      unresolved.push(key);
    }
  }

  const helperFuncIdx = {};
  for (const [key, pattern] of Object.entries(HELPER_SYMBOLS)) {
    for (const [fIdxStr, fName] of Object.entries(symbols)) {
      if (pattern.test(fName)) {
        helperFuncIdx[key] = Number(fIdxStr);
        break;
      }
    }
  }

  const wantedFuncs = new Set(Object.values(funcIndexByKey));
  const disasmFuncs = new Set([
    funcIndexByKey.Presets_titanArenaRaid,
    funcIndexByKey.Presets_tower,
    helperFuncIdx.DraftsXORCipher_ctor,
    helperFuncIdx.DraftsXORCipher_get_constKey,
  ].filter((x) => Number.isInteger(x)));

  const buf = fs.readFileSync(wasmPath);
  let pos = 8;
  const typeParamCounts = [];
  let numImportedFuncs = 0;
  const funcTypeIndices = [];
  const funcToTable = new Map();
  const disasmMap = new Map();

  while (pos < buf.length) {
    const secId = buf[pos++];
    const [secLen, nextPos] = readLEB(buf, pos);
    pos = nextPos;
    const end = pos + secLen;

    if (secId === 1) {
      // Type section
      let p = pos, count;
      [count, p] = readLEB(buf, p);
      for (let i = 0; i < count; i++) {
        p++; // 0x60 func type
        let pCount, rCount;
        [pCount, p] = readLEB(buf, p);
        p += pCount;
        [rCount, p] = readLEB(buf, p);
        p += rCount;
        typeParamCounts.push(pCount);
      }
    } else if (secId === 2) {
      // Import section
      let p = pos, count;
      [count, p] = readLEB(buf, p);
      for (let i = 0; i < count; i++) {
        let len;
        [len, p] = readLEB(buf, p); p += len;
        [len, p] = readLEB(buf, p); p += len;
        const kind = buf[p++];
        if (kind === 0) { numImportedFuncs++; [, p] = readLEB(buf, p); }
        else if (kind === 1) { p++; const fl = buf[p++]; [, p] = readLEB(buf, p); if (fl & 1) [, p] = readLEB(buf, p); }
        else if (kind === 2) { const fl = buf[p++]; [, p] = readLEB(buf, p); if (fl & 1) [, p] = readLEB(buf, p); }
        else if (kind === 3) { p += 2; }
      }
    } else if (secId === 3) {
      // Function section
      let p = pos, count;
      [count, p] = readLEB(buf, p);
      for (let i = 0; i < count; i++) {
        let tIdx; [tIdx, p] = readLEB(buf, p);
        funcTypeIndices.push(tIdx);
      }
    } else if (secId === 9) {
      // Element section
      let p = pos, segCount;
      [segCount, p] = readLEB(buf, p);
      for (let s = 0; s < segCount; s++) {
        let flags; [flags, p] = readLEB(buf, p);
        if (flags === 0) {
          p++; // 0x41 i32.const
          let offset; [offset, p] = readSLEB(buf, p);
          p++; // 0x0b end
          let cnt; [cnt, p] = readLEB(buf, p);
          for (let j = 0; j < cnt; j++) {
            let fidx; [fidx, p] = readLEB(buf, p);
            if (wantedFuncs.has(fidx) && !funcToTable.has(fidx)) {
              funcToTable.set(fidx, offset + j);
            }
          }
        } else {
          break;
        }
      }
    } else if (secId === 10) {
      // Code section
      let p = pos, fc;
      [fc, p] = readLEB(buf, p);
      for (let i = 0; i < fc; i++) {
        const fidx = numImportedFuncs + i;
        let sz; [sz, p] = readLEB(buf, p);
        const be = p + sz;
        if (disasmFuncs.has(fidx)) {
          disasmMap.set(fidx, disassembleOps(buf, p, be));
        }
        p = be;
      }
    }

    pos = end;
  }

  const resolvedSymbols = {};
  for (const [key, fidx] of Object.entries(funcIndexByKey)) {
    const tIdx = funcToTable.get(fidx);
    const localIdx = fidx - numImportedFuncs;
    const typeIdx = localIdx >= 0 ? funcTypeIndices[localIdx] : -1;
    const arity = typeIdx >= 0 ? (typeParamCounts[typeIdx] ?? 0) : 0;
    if (tIdx == null) {
      if (TARGET_SYMBOLS[key].required) unresolved.push(`${key}(no_table_slot)`);
      continue;
    }
    resolvedSymbols[key] = { tableIndex: tIdx, funcIndex: fidx, arity };
  }

  const staticAddrs =
    extractBattleConfigHolder(disasmMap.get(funcIndexByKey.Presets_titanArenaRaid) || []) ||
    extractBattleConfigHolder(disasmMap.get(funcIndexByKey.Presets_tower) || []) ||
    { battleConfigHolder: 0x15a3a30, battleConfigStaticFieldsOff: 92, battleConfigStorageOff: 112 };

  const structOffsets = extractDraftCipherOffsets(
    disasmMap.get(helperFuncIdx.DraftsXORCipher_ctor) || [],
    disasmMap.get(helperFuncIdx.DraftsXORCipher_get_constKey) || []
  );

  // Compute compact diff against previous profile
  const diff = [];
  for (const [key, entry] of Object.entries(resolvedSymbols)) {
    const oldEntry = prev?.symbols?.[key];
    if (!oldEntry || oldEntry.tableIndex !== entry.tableIndex || oldEntry.arity !== entry.arity) {
      diff.push({
        key,
        prev: oldEntry ? `${oldEntry.tableIndex}(arity=${oldEntry.arity})` : null,
        next: `${entry.tableIndex}(arity=${entry.arity})`,
      });
    }
  }

  if (!args.dryRun && unresolved.length === 0) {
    const symLines = Object.entries(resolvedSymbols)
      .map(([k, v]) => `    ${k}: { tableIndex: ${v.tableIndex}, funcIndex: ${v.funcIndex}, arity: ${v.arity} },`)
      .join('\n');

    const tsContent = `// AUTO-GENERATED by hwa-sim/scripts/resolve-wasm-symbols.mjs — DO NOT EDIT MANUALLY
// Run \`npm run wasm:sync\` or \`scripts/wasm-sync.ps1\` when the game updates its Unity WebGL build.

export interface WasmSymbolEntry {
  tableIndex: number;
  funcIndex: number;
  arity: number;
}

export interface WasmStaticAddrs {
  battleConfigHolder: number;
  battleConfigStaticFieldsOff: number;
  battleConfigStorageOff: number;
}

export interface WasmStructOffsets {
  draftCipherDynamicKey: number;
  draftCipherConstKey: number;
}

export interface WasmSymbolProfile {
  gameVersion: string;
  buildHash: string;
  generatedAt: string;
  symbols: Record<string, WasmSymbolEntry>;
  staticAddrs: WasmStaticAddrs;
  structOffsets: WasmStructOffsets;
}

export interface WasmSymbolOverrides {
  gameVersion?: string;
  symbols?: Record<string, Partial<WasmSymbolEntry> | number>;
  staticAddrs?: Partial<WasmStaticAddrs>;
  structOffsets?: Partial<WasmStructOffsets>;
}

export interface WasmProfileVerification {
  status: 'ok' | 'version_mismatch' | 'arity_mismatch';
  gameVersion: string | null;
  profileVersion: string;
  mismatches: Array<{ key: string; tableIndex: number; expectedArity: number; actualArity: number | null }>;
}

export const CORE_REQUIRED_WASM_SYMBOLS = [
  'Play_ctor',
  'Play_start',
  'Play_get_result',
  'Play_dispose',
  'Presets_manualRaid',
  'Presets_arena',
  'BattleConfigStorage_get_titan',
  'BattleConfigStorage_get_tower',
  'MultiBattleResult_get_victory',
  'MultiBattleResult_get_stars',
  'MultiBattleResult_get_progress',
  'DataObject_asJson',
  'JSON_Parse',
  'LazyDataObject_ctor',
  'Object_ToString',
] as const;

export const DEFAULT_WASM_PROFILE_VERSION = '${args.gameVersion}';

export const WASM_SYMBOL_PROFILES: Record<string, WasmSymbolProfile> = {
  '${args.gameVersion}': {
    gameVersion: '${args.gameVersion}',
    buildHash: '${args.buildHash}',
    generatedAt: '${new Date().toISOString()}',
    symbols: {
${symLines}
    },
    staticAddrs: {
      battleConfigHolder: 0x${staticAddrs.battleConfigHolder.toString(16)},
      battleConfigStaticFieldsOff: ${staticAddrs.battleConfigStaticFieldsOff},
      battleConfigStorageOff: ${staticAddrs.battleConfigStorageOff},
    },
    structOffsets: {
      draftCipherDynamicKey: ${structOffsets.draftCipherDynamicKey},
      draftCipherConstKey: ${structOffsets.draftCipherConstKey},
    },
  },
};

export const DEFAULT_WASM_PROFILE: WasmSymbolProfile = WASM_SYMBOL_PROFILES[DEFAULT_WASM_PROFILE_VERSION];

export function getWasmProfileForVersion(
  gameVersion?: string | null,
  overrides?: WasmSymbolOverrides | null
): WasmSymbolProfile {
  const base =
    (gameVersion && WASM_SYMBOL_PROFILES[gameVersion]) ||
    DEFAULT_WASM_PROFILE;
  if (!overrides || typeof overrides !== 'object') return base;

  const mergedSymbols: Record<string, WasmSymbolEntry> = { ...base.symbols };
  if (overrides.symbols && typeof overrides.symbols === 'object') {
    for (const [k, raw] of Object.entries(overrides.symbols)) {
      const existing = mergedSymbols[k] || { tableIndex: 0, funcIndex: 0, arity: 0 };
      if (typeof raw === 'number' && Number.isInteger(raw) && raw > 0) {
        mergedSymbols[k] = { ...existing, tableIndex: raw };
      } else if (raw && typeof raw === 'object') {
        mergedSymbols[k] = {
          tableIndex: Number.isInteger(raw.tableIndex) ? (raw.tableIndex as number) : existing.tableIndex,
          funcIndex: Number.isInteger(raw.funcIndex) ? (raw.funcIndex as number) : existing.funcIndex,
          arity: Number.isInteger(raw.arity) ? (raw.arity as number) : existing.arity,
        };
      }
    }
  }

  return {
    ...base,
    gameVersion: overrides.gameVersion || base.gameVersion,
    symbols: mergedSymbols,
    staticAddrs: { ...base.staticAddrs, ...(overrides.staticAddrs || {}) },
    structOffsets: { ...base.structOffsets, ...(overrides.structOffsets || {}) },
  };
}

export function verifyWasmProfile(
  table: { length: number; get: (index: number) => any } | null | undefined,
  profile: WasmSymbolProfile,
  liveGameVersion?: string | null
): WasmProfileVerification {
  const mismatches: WasmProfileVerification['mismatches'] = [];
  if (table && typeof table.get === 'function') {
    for (const key of CORE_REQUIRED_WASM_SYMBOLS) {
      const entry = profile.symbols[key];
      if (!entry || entry.tableIndex <= 0 || entry.tableIndex >= table.length) {
        mismatches.push({
          key,
          tableIndex: entry?.tableIndex ?? 0,
          expectedArity: entry?.arity ?? -1,
          actualArity: null,
        });
        continue;
      }
      let fn: any = null;
      try { fn = table.get(entry.tableIndex); } catch (_) {}
      const actualArity = typeof fn === 'function' ? fn.length : null;
      if (actualArity === null || (entry.arity > 0 && actualArity !== entry.arity)) {
        mismatches.push({
          key,
          tableIndex: entry.tableIndex,
          expectedArity: entry.arity,
          actualArity,
        });
      }
    }
  }

  let status: WasmProfileVerification['status'] = 'ok';
  if (mismatches.length > 0) {
    status = 'arity_mismatch';
  } else if (liveGameVersion && profile.gameVersion && liveGameVersion !== profile.gameVersion) {
    status = 'version_mismatch';
  }

  return {
    status,
    gameVersion: liveGameVersion || null,
    profileVersion: profile.gameVersion,
    mismatches,
  };
}
`;
    fs.writeFileSync(outTsPath, tsContent, 'utf8');
  }

  const summary = {
    ok: unresolved.length === 0,
    previousVersion: prev?.gameVersion || null,
    newVersion: args.gameVersion,
    resolvedCount: Object.keys(resolvedSymbols).length,
    changedCount: diff.length,
    unresolved,
    staticAddrs: {
      battleConfigHolder: '0x' + staticAddrs.battleConfigHolder.toString(16),
      battleConfigStaticFieldsOff: staticAddrs.battleConfigStaticFieldsOff,
      battleConfigStorageOff: staticAddrs.battleConfigStorageOff,
    },
    structOffsets,
    diff: diff.slice(0, 20),
  };

  console.log(JSON.stringify(summary, null, args.jsonSummary ? 0 : 2));
  if (unresolved.length > 0) process.exit(2);
}

main();
