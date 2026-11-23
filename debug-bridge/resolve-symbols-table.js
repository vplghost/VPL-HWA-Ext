const fs = require('fs');

console.log('Reading build.wasm...');
const wasm = fs.readFileSync('hwa-sim/downloads/build.wasm');
const symbols = JSON.parse(fs.readFileSync('hwa-sim/downloads/symbols.json', 'utf8'));

// Parse element section
let p = 0x7c63d;
let numSegments = 0, shift = 0;
while (true) { const b = wasm[p++]; numSegments |= (b & 0x7f) << shift; if ((b & 0x80) === 0) break; shift += 7; }
const flag = wasm[p++];
const op = wasm[p++];
let tableOffset = 0, oshift = 0;
while (true) { const b = wasm[p++]; tableOffset |= (b & 0x7f) << oshift; if ((b & 0x80) === 0) break; oshift += 7; }
const endOp = wasm[p++];
let count = 0, cshift = 0;
while (true) { const b = wasm[p++]; count |= (b & 0x7f) << cshift; if ((b & 0x80) === 0) break; cshift += 7; }

console.log(`Element segment: offset=${tableOffset}, count=${count}`);

// Build funcToTable map
// Notice: a func might appear multiple times or once
const funcToTable = new Map();
const tableToFunc = new Int32Array(count + 1);

for (let i = 0; i < count; i++) {
  let fidx = 0, fshift = 0;
  while (true) {
    const b = wasm[p++];
    fidx |= (b & 0x7f) << fshift;
    if ((b & 0x80) === 0) break;
    fshift += 7;
  }
  const tableIdx = tableOffset + i;
  tableToFunc[tableIdx] = fidx;
  if (!funcToTable.has(fidx)) {
    funcToTable.set(fidx, tableIdx);
  }
}

console.log(`Built map: ${funcToTable.size} distinct functions in table.`);

const currentSym = {
  Play_ctor: 11594,
  Play_start: 469995,
  Play_get_result: 469999,
  Play_createBattleData: 175082,
  Play_executeBattle: 175078,
  Play_createResult: 175081,
  Play_dispose: 175079,
  Presets_replay: 14054,
  Presets_manual: 35515,
  Presets_manualRaid: 35516,
  Presets_arena: 35517,
  Presets_clanWarReplay: 174207,
  Presets_challengeAuto: 174208,
  Presets_arenaReplay: 174209,
  Presets_tower: 468118,
  Presets_titanArenaReplay: 468119,
  Presets_titanArenaRaid: 468120,
  Presets_titanArenaManual: 468121,
  Presets_createReplay: 468122,
  Presets_clanWar: 468123,
  Presets_clanBoss: 468124,
  Presets_challengeReplayAuto: 468125,
  Presets_get_isReplay: 468101,
  BattlePresets_ctorDefault: 14053,
  BattlePresets_ctor5: 6579,
  BattleData_serializeResult: 49386,
  BattleData_getStars: 28182,
  JSON_Parse: 1763,
  DataObject_fromObject: 15292,
  Type_GetType: 38793,
  GetUninitializedObject: 26825,
  Object_ToString: 16323,
  GCHandle_Alloc: 2129,
  GCHandle_FreeHandle: 1845
};

const resolved = {};
console.log('\n--- RESOLVING SYMBOLS ---');
for (const [key, funcIdx] of Object.entries(currentSym)) {
  const symName = symbols[funcIdx] || 'UNKNOWN';
  const tableIdx = funcToTable.get(funcIdx);
  console.log(`${key.padEnd(28)} Func: ${String(funcIdx).padEnd(7)} -> Table: ${String(tableIdx || 'NOT IN TABLE').padEnd(10)} | ${symName.substring(0, 60)}`);
  resolved[key] = {
    funcIdx,
    tableIdx: tableIdx || null,
    name: symName
  };
}

// Let's also check if there are better matches for BattleInstantPlay, BattlePresets, etc.
console.log('\n--- SEARCHING FOR SPECIFIC CLASS METHODS ---');
function findFuncs(regex) {
  const matches = [];
  for (const [fidxStr, name] of Object.entries(symbols)) {
    if (regex.test(name)) {
      const fidx = Number(fidxStr);
      matches.push({ funcIdx: fidx, tableIdx: funcToTable.get(fidx) || null, name });
    }
  }
  return matches;
}

console.log('BattleInstantPlay methods:');
findFuncs(/BattleInstantPlay/i).forEach(m => console.log(`  Func: ${m.funcIdx}, Table: ${m.tableIdx}, Name: ${m.name}`));

console.log('\nJSONNode_Parse methods:');
findFuncs(/JSONNode.*Parse/i).forEach(m => console.log(`  Func: ${m.funcIdx}, Table: ${m.tableIdx}, Name: ${m.name}`));

console.log('\nDataObject_fromObject methods:');
findFuncs(/DataObject.*fromObject/i).forEach(m => console.log(`  Func: ${m.funcIdx}, Table: ${m.tableIdx}, Name: ${m.name}`));

console.log('\nType_GetType methods:');
findFuncs(/Type.*GetType/i).slice(0, 10).forEach(m => console.log(`  Func: ${m.funcIdx}, Table: ${m.tableIdx}, Name: ${m.name}`));

console.log('\nFormatterServices GetUninitializedObject:');
findFuncs(/GetUninitializedObject/i).forEach(m => console.log(`  Func: ${m.funcIdx}, Table: ${m.tableIdx}, Name: ${m.name}`));
