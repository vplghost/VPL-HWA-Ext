#!/usr/bin/env node
/**
 * extract-symbols.mjs
 * Script phân tích tệp symbols.json của Unity IL2CPP để trích xuất danh mục
 * các hàm cốt lõi phục vụ Battle Simulation và lưu vào config/unity-symbol-map.json.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const downloadsDir = path.resolve(__dirname, '../downloads');
const configDir = path.resolve(__dirname, '../config');
const symbolsPath = path.join(downloadsDir, 'symbols.json');
const outputPath = path.join(configDir, 'unity-symbol-map.json');

// Danh mục các hàm mục tiêu cần định vị
const TARGET_FUNCTION_PATTERNS = {
  // BattleInstantPlay
  Play_ctor: [/BattleInstantPlay.*ctor/i, /Play_ctor/i],
  Play_start: [/BattleInstantPlay.*Start/i, /Play_start/i],
  Play_get_result: [/BattleInstantPlay.*get_result/i, /Play_get_result/i],
  Play_createBattleData: [/BattleInstantPlay.*createBattleData/i, /Play_createBattleData/i],
  Play_executeBattle: [/BattleInstantPlay.*executeBattle/i, /Play_executeBattle/i],
  Play_createResult: [/BattleInstantPlay.*createResult/i, /Play_createResult/i],
  Play_dispose: [/BattleInstantPlay.*Dispose/i, /Play_dispose/i],

  // BattlePresets
  BattlePresets_ctor5: [/BattlePresets.*ctor/i],
  Presets_clanWarReplay: [/Presets.*clanWarReplay/i],
  Presets_arenaReplay: [/Presets.*arenaReplay/i],
  Presets_get_isReplay: [/Presets.*get_isReplay/i],

  // BattleData
  BattleData_serializeResult: [/BattleData.*serializeResult/i],
  BattleData_getStars: [/BattleData.*getStars/i],

  // Data & Config Storage
  Config_get_titan: [/BattleConfigStorage.*get_titan/i, /Config_get_titan/i],

  // JSON & DataObject
  JSON_Parse: [/^JSONNode.*Parse/i, /^JSON.*Parse/i, /SimpleJSON.*Parse/i],
  DataObject_fromObject: [/DataObject.*fromObject/i, /DataObject.*fromJSONNode/i],

  // Memory & Type primitives
  Type_GetType: [/Type.*GetType/i],
  GetUninitializedObject: [/FormatterServices.*GetUninitializedObject/i],
  Object_GetType: [/Object.*GetType/i],
  Object_ToString: [/Object.*ToString/i],
  RuntimeType_get_FullName: [/RuntimeType.*get_FullName/i],
  GCHandle_Alloc: [/GCHandle.*Alloc/i],
  GCHandle_FreeHandle: [/GCHandle.*Free/i],
  GC_Collect: [/GC.*Collect/i]
};

async function main() {
  console.log('================================================================');
  console.log(' HWA-SIM: TRÍCH XUẤT KÝ HIỆU HÀM TỪ SYMBOLS.JSON');
  console.log('================================================================');

  if (!fs.existsSync(symbolsPath)) {
    console.error(`[ERROR] Không tìm thấy tệp symbols tại: ${symbolsPath}`);
    console.error('Vui lòng chạy script download-wasm-assets.mjs trước!');
    process.exit(1);
  }

  console.log(`Đang đọc tệp symbols (${(fs.statSync(symbolsPath).size / 1024 / 1024).toFixed(2)} MB)...`);
  const symbolsRaw = fs.readFileSync(symbolsPath, 'utf8');
  console.log('Đang phân tích cú pháp JSON...');
  const symbols = JSON.parse(symbolsRaw);

  const totalSymbols = Object.keys(symbols).length;
  console.log(`Tổng số symbols ghi nhận: ${totalSymbols.toLocaleString()}`);

  const resolved = {};
  const unresolved = [];

  for (const [key, patterns] of Object.entries(TARGET_FUNCTION_PATTERNS)) {
    let found = null;
    for (const [funcIndex, funcName] of Object.entries(symbols)) {
      if (patterns.some(p => p.test(funcName))) {
        found = { index: parseInt(funcIndex, 10), name: funcName };
        break;
      }
    }

    if (found) {
      resolved[key] = found;
      console.log(` [✓] Tìm thấy ${key.padEnd(26)} -> Index: ${found.index} (${found.name})`);
    } else {
      unresolved.push(key);
      console.log(` [✗] Chưa tìm thấy ${key}`);
    }
  }

  const resultPayload = {
    version: '1.294.1020',
    extractedAt: new Date().toISOString(),
    totalSymbolsCount: totalSymbols,
    functions: resolved,
    unresolvedCount: unresolved.length
  };

  fs.writeFileSync(outputPath, JSON.stringify(resultPayload, null, 2), 'utf8');
  console.log(`\nĐã lưu bảng ký hiệu ánh xạ vào: ${outputPath}`);
}

main().catch(console.error);
