const fs = require('fs');
const wasm = fs.readFileSync('hwa-sim/downloads/build.wasm');
const symbols = JSON.parse(fs.readFileSync('hwa-sim/downloads/symbols.json', 'utf8'));

let offset = 8;
const sections = {};
while (offset < wasm.length) {
  const sectionId = wasm[offset++];
  let size = 0, shift = 0;
  while (true) {
    const byte = wasm[offset++];
    size |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) break;
    shift += 7;
  }
  sections[sectionId] = { offset, size };
  offset += size;
}

// 1. Types
let p = sections[1].offset;
let numTypes = 0, shift = 0;
while (true) { const b = wasm[p++]; numTypes |= (b & 0x7f) << shift; if ((b & 0x80) === 0) break; shift += 7; }
const types = [];
for (let i = 0; i < numTypes; i++) {
  const form = wasm[p++]; // 0x60
  let numParams = 0, pshift = 0;
  while (true) { const b = wasm[p++]; numParams |= (b & 0x7f) << pshift; if ((b & 0x80) === 0) break; pshift += 7; }
  const params = [];
  for (let j = 0; j < numParams; j++) params.push(wasm[p++].toString(16));
  let numResults = 0, rshift = 0;
  while (true) { const b = wasm[p++]; numResults |= (b & 0x7f) << rshift; if ((b & 0x80) === 0) break; rshift += 7; }
  const results = [];
  for (let j = 0; j < numResults; j++) results.push(wasm[p++].toString(16));
  types.push({ params, results });
}

// 2. Import functions
p = sections[2].offset;
let numImports = 0; shift = 0;
while (true) { const b = wasm[p++]; numImports |= (b & 0x7f) << shift; if ((b & 0x80) === 0) break; shift += 7; }
const funcTypes = [];
for (let i = 0; i < numImports; i++) {
  let modLen = 0, mshift = 0;
  while (true) { const b = wasm[p++]; modLen |= (b & 0x7f) << mshift; if ((b & 0x80) === 0) break; mshift += 7; }
  p += modLen;
  let fieldLen = 0, fshift = 0;
  while (true) { const b = wasm[p++]; fieldLen |= (b & 0x7f) << fshift; if ((b & 0x80) === 0) break; fshift += 7; }
  p += fieldLen;
  const kind = wasm[p++];
  if (kind === 0) {
    let typeIdx = 0, tshift = 0;
    while (true) { const b = wasm[p++]; typeIdx |= (b & 0x7f) << tshift; if ((b & 0x80) === 0) break; tshift += 7; }
    funcTypes.push(typeIdx);
  } else if (kind === 1) p += 3;
  else if (kind === 2) p += 2;
  else if (kind === 3) p += 2;
}

// 3. Defined functions
p = sections[3].offset;
let numFuncs = 0; shift = 0;
while (true) { const b = wasm[p++]; numFuncs |= (b & 0x7f) << shift; if ((b & 0x80) === 0) break; shift += 7; }
for (let i = 0; i < numFuncs; i++) {
  let typeIdx = 0, tshift = 0;
  while (true) { const b = wasm[p++]; typeIdx |= (b & 0x7f) << tshift; if ((b & 0x80) === 0) break; tshift += 7; }
  funcTypes.push(typeIdx);
}

// Parse element section to find table index for each
p = sections[9].offset;
let numSegments = 0; shift = 0;
while (true) { const b = wasm[p++]; numSegments |= (b & 0x7f) << shift; if ((b & 0x80) === 0) break; shift += 7; }
const flag = wasm[p++];
const op = wasm[p++];
let tableOffset = 0, oshift = 0;
while (true) { const b = wasm[p++]; tableOffset |= (b & 0x7f) << oshift; if ((b & 0x80) === 0) break; oshift += 7; }
const endOp = wasm[p++];
let count = 0, cshift = 0;
while (true) { const b = wasm[p++]; count |= (b & 0x7f) << cshift; if ((b & 0x80) === 0) break; cshift += 7; }

const funcToTable = new Map();
for (let i = 0; i < count; i++) {
  let fidx = 0, fshift = 0;
  while (true) { const b = wasm[p++]; fidx |= (b & 0x7f) << fshift; if ((b & 0x80) === 0) break; fshift += 7; }
  if (!funcToTable.has(fidx)) funcToTable.set(fidx, tableOffset + i);
}

console.log('--- TARGET FUNCTIONS ANALYSIS ---');
const targets = [
  { name: 'Play_ctor', fid: 11594 },
  { name: 'Play_start', fid: 469995 },
  { name: 'Play_get_result', fid: 469999 },
  { name: 'Play_createBattleData', fid: 175082 },
  { name: 'Play_executeBattle', fid: 175078 },
  { name: 'Play_createResult', fid: 175081 },
  { name: 'Play_dispose', fid: 175079 },
  { name: 'Presets_clanWarReplay', fid: 174207 },
  { name: 'JSON_Parse', fid: 1763 },
  { name: 'DataObject_fromObject', fid: 15292 },
  { name: 'Type_GetType', fid: 38793 },
  { name: 'GetUninitializedObject', fid: 26825 }
];

// Type 7f is i32, 7e is i64, 7d is f32, 7c is f64
const typeNames = { '7f': 'i32', '7e': 'i64', '7d': 'f32', '7c': 'f64' };

for (const t of targets) {
  const tid = funcTypes[t.fid];
  const typeObj = types[tid];
  const params = typeObj.params.map(p => typeNames[p] || p);
  const results = typeObj.results.map(r => typeNames[r] || r);
  const symName = symbols[t.fid];
  const tableIdx = funcToTable.get(t.fid);
  console.log(`${t.name.padEnd(24)} Table:${String(tableIdx).padEnd(8)} Params:(${params.join(', ')}) -> (${results.join(', ')}) | ${symName}`);
}
