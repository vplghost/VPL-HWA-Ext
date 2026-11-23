#!/usr/bin/env node
/**
 * CLI Tool to search and inspect Unity WASM (IL2CPP) symbols from debug-bridge/symbols.json.
 * Usage:
 *   node debug-bridge/lookup-symbol.js <query> [--limit 50] [--json]
 * Examples:
 *   node debug-bridge/lookup-symbol.js PlayerDungeon
 *   node debug-bridge/lookup-symbol.js 42400
 *   node debug-bridge/lookup-symbol.js --metadata
 */

const fs = require('node:fs');
const path = require('node:path');

const SYMBOLS_FILE = path.resolve(__dirname, 'symbols.json');

const KNOWN_IL2CPP_METADATA_FUNCS = [
  'il2cpp_method_get_param_count',
  'il2cpp_method_get_param',
  'il2cpp_method_get_return_type',
  'il2cpp_string_new',
  'il2cpp_string_new_utf16',
  'il2cpp_class_get_methods',
  'il2cpp_class_get_fields',
  'il2cpp_class_from_name',
  'il2cpp_class_get_parent',
  'il2cpp_class_instance_size',
  'il2cpp_object_new',
  'il2cpp_value_box',
  'il2cpp_codegen_resolve_icall'
];

function main() {
  const args = process.argv.slice(2);
  const jsonOutput = args.includes('--json');
  const metadataOnly = args.includes('--metadata');

  let limit = 50;
  const limitIdx = args.indexOf('--limit');
  if (limitIdx !== -1 && args[limitIdx + 1]) {
    limit = parseInt(args[limitIdx + 1], 10) || 50;
  }

  const queryArg = args.find((a) => !a.startsWith('--') && a !== args[limitIdx + 1]);

  if (!fs.existsSync(SYMBOLS_FILE)) {
    console.error(`[Error] symbols.json not found at: ${SYMBOLS_FILE}`);
    process.exit(1);
  }

  let symbols;
  try {
    symbols = JSON.parse(fs.readFileSync(SYMBOLS_FILE, 'utf8'));
  } catch (err) {
    console.error(`[Error] Failed to parse symbols.json: ${err.message}`);
    process.exit(1);
  }

  // Check IL2CPP metadata functions presence
  const metadataStatus = {};
  for (const name of KNOWN_IL2CPP_METADATA_FUNCS) {
    metadataStatus[name] = null;
  }

  for (const [idx, symName] of Object.entries(symbols)) {
    for (const target of KNOWN_IL2CPP_METADATA_FUNCS) {
      if (symName === target || symName.startsWith(target + '(') || symName.startsWith(target + '_')) {
        metadataStatus[target] = { index: parseInt(idx, 10), name: symName };
      }
    }
  }

  if (metadataOnly) {
    if (jsonOutput) {
      console.log(JSON.stringify(metadataStatus, null, 2));
    } else {
      printMetadataSummary(metadataStatus);
    }
    return;
  }

  if (!queryArg) {
    console.log('Usage: node debug-bridge/lookup-symbol.js <query_or_index> [--limit 50] [--json] [--metadata]');
    console.log('\n--- IL2CPP Metadata Functions Status ---');
    printMetadataSummary(metadataStatus);
    process.exit(0);
  }

  const matches = [];
  const isNumeric = /^\d+$/.test(queryArg);

  if (isNumeric) {
    const idx = queryArg;
    if (symbols[idx]) {
      matches.push({
        index: parseInt(idx, 10),
        mangledName: symbols[idx],
        cleanName: cleanSymbolName(symbols[idx])
      });
    }
  } else {
    const regex = new RegExp(queryArg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    for (const [idx, symName] of Object.entries(symbols)) {
      if (regex.test(symName)) {
        matches.push({
          index: parseInt(idx, 10),
          mangledName: symName,
          cleanName: cleanSymbolName(symName)
        });
        if (matches.length >= limit) break;
      }
    }
  }

  if (jsonOutput) {
    console.log(JSON.stringify({
      query: queryArg,
      matchCount: matches.length,
      matches,
      metadataStatus
    }, null, 2));
    return;
  }

  console.log(`\n=== IL2CPP Symbol Lookup: "${queryArg}" (Found: ${matches.length}) ===`);
  for (const m of matches) {
    console.log(`[#${m.index.toString().padEnd(6)}] ${m.cleanName}`);
    if (m.mangledName !== m.cleanName) {
      console.log(`         Mangled: ${m.mangledName}`);
    }
  }

  console.log('\n--- IL2CPP Metadata API Availability ---');
  printMetadataSummary(metadataStatus);
}

function printMetadataSummary(metadataStatus) {
  for (const [func, info] of Object.entries(metadataStatus)) {
    if (info) {
      console.log(`  [+] ${func.padEnd(32)} -> wasmTable[${info.index}] (${info.name})`);
    } else {
      console.log(`  [-] ${func.padEnd(32)} -> NOT FOUND`);
    }
  }
}

/**
 * Extracts a cleaner C# method name from IL2CPP mangled names
 * e.g. "PlayerDungeonManager_getTitans_mA88B71E37265FEF978E698DE5A4F15729914403B"
 *   -> "PlayerDungeonManager.getTitans"
 */
function cleanSymbolName(name) {
  if (!name) return '';
  // Pattern: Class_Method_m[HEX]
  const match = name.match(/^([A-Za-z0-9_]+?)_([A-Za-z0-9_]+?)_m[0-9A-F]{30,}/i);
  if (match) {
    return `${match[1]}.${match[2]}()`;
  }
  return name;
}

if (require.main === module) {
  main();
}

module.exports = { cleanSymbolName, KNOWN_IL2CPP_METADATA_FUNCS };
