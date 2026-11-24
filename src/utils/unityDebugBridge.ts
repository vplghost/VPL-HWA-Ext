/**
 * Tier 1: Unity Debug Bridge Helper (MAIN World Context).
 * Exposes window.__unityBridge for IL2CPP WASM hooks to log telemetry,
 * inspect WASM functions and memory, and execute chained live hot-tweak commands.
 */

import { safeMem } from './safeWasmMemory.ts';

export const UNITY_BRIDGE_NAMESPACE_TO_MAIN = 'wxt-unity-bridge-to-main';
export const UNITY_BRIDGE_NAMESPACE_FROM_MAIN = 'wxt-unity-bridge-from-main';

export type UnityCommandHandler = (payload: any) => Promise<any> | any;

export interface WasmContext {
  wasmTable: WebAssembly.Table | null;
  wasmMemory: WebAssembly.Memory | null;
  buffer: ArrayBuffer | null;
  byteLength: number;
  HEAPU8: Uint8Array | null;
  HEAP32: Int32Array | null;
  HEAPU32: Uint32Array | null;
  HEAPF32: Float32Array | null;
  HEAPF64: Float64Array | null;
  unityInstance: any;
  Module: any;
}

export interface ChainStep {
  name?: string;
  funcIndex?: number;
  args?: any[];
  code?: string;
  readMem?: { ptr: number | string; type: string; count?: number };
  writeMem?: { ptr: number | string; type: string; value: any };
  watchPtr?: number | string;
  watchBytes?: number;
  continueOnError?: boolean;
}

export interface UnityDebugBridge {
  log: (tag: string, data: any) => void;
  onCommand: (handler: UnityCommandHandler) => () => void;
  send: (type: string, data: any) => void;
  status: () => {
    active: boolean;
    commandHandlersCount: number;
    wasmContext: {
      hasWasmTable: boolean;
      tableSize: number;
      hasBuffer: boolean;
      byteLength: number;
    };
    timestamp: string;
  };
  getWasmContext: () => WasmContext;
  inspectWasmFunc: (indexOrName: number | string) => any;
  readMem: (ptr: number, type: string, count?: number) => any;
  writeMem: (ptr: number, type: string, value: any) => any;
  executeChain: (steps: ChainStep[]) => Promise<{ ok: boolean; results: any[]; error?: string }>;
  getLiveDungeonState: () => any;
  safeMem?: typeof safeMem;
}

declare global {
  interface Window {
    __unityBridge?: UnityDebugBridge;
  }
}

const commandHandlers = new Set<UnityCommandHandler>();
let isInitialized = false;

/**
 * Dispatches a message from MAIN world to Content Script (isolated world)
 */
function postToContentScript(data: Record<string, any>) {
  if (typeof window === 'undefined' || typeof window.postMessage !== 'function') return;
  try {
    window.postMessage(
      {
        source: UNITY_BRIDGE_NAMESPACE_FROM_MAIN,
        timestamp: new Date().toISOString(),
        ...data,
      },
      '*'
    );
  } catch (err: any) {
    try {
      window.postMessage(
        {
          source: UNITY_BRIDGE_NAMESPACE_FROM_MAIN,
          timestamp: new Date().toISOString(),
          ...data,
          data: JSON.parse(JSON.stringify(data.data ?? null, getCircularReplacer())),
        },
        '*'
      );
    } catch (_) {}
  }
}

function getCircularReplacer() {
  const seen = new WeakSet();
  return (_key: string, value: any) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[Circular]';
      }
      seen.add(value);
    }
    if (typeof value === 'bigint') {
      return value.toString();
    }
    if (typeof value === 'function') {
      return `[Function: ${value.name || 'anonymous'}]`;
    }
    return value;
  };
}

/**
 * Discovers and caches WebAssembly context from Unity WebGL runtime
 */
export function getWasmContext(): WasmContext {
  const win = typeof window !== 'undefined' ? (window as any) : (globalThis as any);
  const unityInstance = win.unityInstance || win._unityInstance || win.__hwaUnityInstance || null;
  const Module = win.Module || unityInstance?.Module || win.__hwaUnityModule || win.unityFramework?.Module || null;
  const asm = Module?.asm || Module || null;

  // 1. Locate wasmTable
  let wasmTable: WebAssembly.Table | null = null;
  if (win.wasmTable instanceof WebAssembly.Table) {
    wasmTable = win.wasmTable;
  } else if (unityInstance?.wasmTable instanceof WebAssembly.Table) {
    wasmTable = unityInstance.wasmTable;
  } else if (unityInstance?.Module?.wasmTable instanceof WebAssembly.Table) {
    wasmTable = unityInstance.Module.wasmTable;
  } else if (Module?.wasmTable instanceof WebAssembly.Table) {
    wasmTable = Module.wasmTable;
  } else if (asm) {
    try {
      const values = Object.values(asm);
      wasmTable = (values.find((v: any) => v instanceof WebAssembly.Table) as WebAssembly.Table) || null;
    } catch (_) {}
  }

  // Scan Module properties if not found yet
  if (!wasmTable && Module) {
    try {
      for (const key of Object.keys(Module)) {
        if (Module[key] instanceof WebAssembly.Table) {
          wasmTable = Module[key];
          break;
        }
      }
    } catch (_) {}
  }

  // 2. Locate buffer / memory
  let buffer: ArrayBuffer | null = null;
  let wasmMemory: WebAssembly.Memory | null = null;

  if (win.HEAPU8?.buffer instanceof ArrayBuffer) {
    buffer = win.HEAPU8.buffer;
  } else if (Module?.HEAPU8?.buffer instanceof ArrayBuffer) {
    buffer = Module.HEAPU8.buffer;
  } else if (unityInstance?.HEAPU8?.buffer instanceof ArrayBuffer) {
    buffer = unityInstance.HEAPU8.buffer;
  } else if (win.wasmMemory instanceof WebAssembly.Memory) {
    wasmMemory = win.wasmMemory;
    buffer = wasmMemory.buffer;
  } else if (Module?.wasmMemory instanceof WebAssembly.Memory) {
    wasmMemory = Module.wasmMemory;
    buffer = wasmMemory.buffer;
  } else if (asm) {
    try {
      const values = Object.values(asm);
      wasmMemory = (values.find((v: any) => v instanceof WebAssembly.Memory) as WebAssembly.Memory) || null;
      if (wasmMemory) buffer = wasmMemory.buffer;
    } catch (_) {}
  }

  const byteLength = buffer ? buffer.byteLength : 0;
  let HEAPU8: Uint8Array | null = null;
  let HEAP32: Int32Array | null = null;
  let HEAPU32: Uint32Array | null = null;
  let HEAPF32: Float32Array | null = null;
  let HEAPF64: Float64Array | null = null;

  if (buffer) {
    HEAPU8 = new Uint8Array(buffer);
    HEAP32 = new Int32Array(buffer);
    HEAPU32 = new Uint32Array(buffer);
    HEAPF32 = new Float32Array(buffer);
    HEAPF64 = new Float64Array(buffer);
  }

  return {
    wasmTable,
    wasmMemory,
    buffer,
    byteLength,
    HEAPU8,
    HEAP32,
    HEAPU32,
    HEAPF32,
    HEAPF64,
    unityInstance,
    Module,
  };
}

/**
 * Inspects a WebAssembly function by table index
 */
export function inspectWasmFunc(indexOrName: number | string): any {
  const ctx = getWasmContext();
  if (!ctx.wasmTable) {
    return { ok: false, error: 'WebAssembly.Table not found in current Unity runtime.' };
  }

  const index = typeof indexOrName === 'string' ? parseInt(indexOrName, 10) : indexOrName;
  if (isNaN(index) || index < 0 || index >= ctx.wasmTable.length) {
    return { ok: false, error: `Invalid table index ${indexOrName}. Table size: ${ctx.wasmTable.length}` };
  }

  try {
    const fn = ctx.wasmTable.get(index);
    if (!fn) {
      return { ok: true, index, found: false, note: 'Entry is null/undefined in table' };
    }

    return {
      ok: true,
      index,
      found: true,
      isFunction: typeof fn === 'function',
      length: typeof fn === 'function' ? fn.length : null,
      typeName: typeof fn,
      name: fn.name || null,
    };
  } catch (err: any) {
    return { ok: false, index, error: err.message };
  }
}

/**
 * Safe memory reader with bounds check
 */
export function readMem(ptr: number, type: string = 'i32', count: number = 1): any {
  const ctx = getWasmContext();
  if (!ctx.buffer || !ctx.HEAPU8) {
    return { ok: false, error: 'WASM Memory buffer not available' };
  }

  const buf = ctx.buffer;
  const maxLen = buf.byteLength;

  if (ptr < 0 || ptr >= maxLen) {
    return { ok: false, error: `Pointer 0x${ptr.toString(16)} is out of bounds (0..0x${maxLen.toString(16)})` };
  }

  const view = new DataView(buf);

  switch (type.toLowerCase()) {
    case 'i8':
      if (count === 1) return view.getInt8(ptr);
      return Array.from({ length: Math.min(count, maxLen - ptr) }, (_, i) => view.getInt8(ptr + i));

    case 'u8':
      if (count === 1) return view.getUint8(ptr);
      return Array.from({ length: Math.min(count, maxLen - ptr) }, (_, i) => view.getUint8(ptr + i));

    case 'i16':
      if (ptr + 2 > maxLen) return { ok: false, error: 'Out of bounds for i16' };
      if (count === 1) return view.getInt16(ptr, true);
      return Array.from({ length: Math.min(count, Math.floor((maxLen - ptr) / 2)) }, (_, i) => view.getInt16(ptr + i * 2, true));

    case 'u16':
      if (ptr + 2 > maxLen) return { ok: false, error: 'Out of bounds for u16' };
      if (count === 1) return view.getUint16(ptr, true);
      return Array.from({ length: Math.min(count, Math.floor((maxLen - ptr) / 2)) }, (_, i) => view.getUint16(ptr + i * 2, true));

    case 'i32':
      if (ptr + 4 > maxLen) return { ok: false, error: 'Out of bounds for i32' };
      if (count === 1) return view.getInt32(ptr, true);
      return Array.from({ length: Math.min(count, Math.floor((maxLen - ptr) / 4)) }, (_, i) => view.getInt32(ptr + i * 4, true));

    case 'u32':
    case 'ptr':
      if (ptr + 4 > maxLen) return { ok: false, error: 'Out of bounds for u32' };
      if (count === 1) return view.getUint32(ptr, true);
      return Array.from({ length: Math.min(count, Math.floor((maxLen - ptr) / 4)) }, (_, i) => view.getUint32(ptr + i * 4, true));

    case 'f32':
      if (ptr + 4 > maxLen) return { ok: false, error: 'Out of bounds for f32' };
      if (count === 1) return view.getFloat32(ptr, true);
      return Array.from({ length: Math.min(count, Math.floor((maxLen - ptr) / 4)) }, (_, i) => view.getFloat32(ptr + i * 4, true));

    case 'f64':
      if (ptr + 8 > maxLen) return { ok: false, error: 'Out of bounds for f64' };
      if (count === 1) return view.getFloat64(ptr, true);
      return Array.from({ length: Math.min(count, Math.floor((maxLen - ptr) / 8)) }, (_, i) => view.getFloat64(ptr + i * 8, true));

    case 'utf8': {
      const byteLimit = Math.min(count || 256, maxLen - ptr);
      const bytes: number[] = [];
      for (let i = 0; i < byteLimit; i++) {
        const b = ctx.HEAPU8[ptr + i];
        if (b === 0) break;
        bytes.push(b);
      }
      return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
    }

    case 'il2cppstring': {
      // In IL2CPP 32-bit WASM:
      // Offset 0x00: Il2CppClass*
      // Offset 0x04: MonitorData*
      // Offset 0x08: int32_t length (number of UTF-16 chars)
      // Offset 0x0C: uint16_t chars[]
      if (ptr + 12 > maxLen) return { ok: false, error: 'Out of bounds for il2cppString header' };
      const strLen = view.getInt32(ptr + 8, true);
      if (strLen < 0 || strLen > 100000 || ptr + 12 + strLen * 2 > maxLen) {
        return { ok: false, error: `Invalid il2cppString length: ${strLen}` };
      }
      const charBytes = ctx.HEAPU8.subarray(ptr + 12, ptr + 12 + strLen * 2);
      return new TextDecoder('utf-16le').decode(charBytes);
    }

    case 'hexdump': {
      const dumpLen = Math.min(count || 64, maxLen - ptr);
      const lines: string[] = [];
      for (let offset = 0; offset < dumpLen; offset += 16) {
        const chunkLen = Math.min(16, dumpLen - offset);
        const hexParts: string[] = [];
        let asciiPart = '';

        for (let j = 0; j < 16; j++) {
          if (j < chunkLen) {
            const byte = ctx.HEAPU8[ptr + offset + j];
            hexParts.push(byte.toString(16).padStart(2, '0'));
            asciiPart += byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '.';
          } else {
            hexParts.push('  ');
          }
        }

        const addrHex = (ptr + offset).toString(16).padStart(8, '0');
        lines.push(`${addrHex}:  ${hexParts.slice(0, 8).join(' ')}  ${hexParts.slice(8).join(' ')}  |${asciiPart}|`);
      }
      return lines.join('\n');
    }

    default:
      return { ok: false, error: `Unsupported memory read type: ${type}` };
  }
}

/**
 * Safe memory writer with bounds check
 */
export function writeMem(ptr: number, type: string, value: any): any {
  const ctx = getWasmContext();
  if (!ctx.buffer || !ctx.HEAPU8) {
    return { ok: false, error: 'WASM Memory buffer not available' };
  }

  const buf = ctx.buffer;
  const maxLen = buf.byteLength;
  const view = new DataView(buf);

  switch (type.toLowerCase()) {
    case 'i8':
      if (ptr + 1 > maxLen) return { ok: false, error: 'Out of bounds' };
      view.setInt8(ptr, Number(value));
      return { ok: true, ptr, written: 1 };

    case 'u8':
      if (ptr + 1 > maxLen) return { ok: false, error: 'Out of bounds' };
      view.setUint8(ptr, Number(value));
      return { ok: true, ptr, written: 1 };

    case 'i16':
      if (ptr + 2 > maxLen) return { ok: false, error: 'Out of bounds' };
      view.setInt16(ptr, Number(value), true);
      return { ok: true, ptr, written: 2 };

    case 'u16':
      if (ptr + 2 > maxLen) return { ok: false, error: 'Out of bounds' };
      view.setUint16(ptr, Number(value), true);
      return { ok: true, ptr, written: 2 };

    case 'i32':
      if (ptr + 4 > maxLen) return { ok: false, error: 'Out of bounds' };
      view.setInt32(ptr, Number(value), true);
      return { ok: true, ptr, written: 4 };

    case 'u32':
    case 'ptr':
      if (ptr + 4 > maxLen) return { ok: false, error: 'Out of bounds' };
      view.setUint32(ptr, Number(value), true);
      return { ok: true, ptr, written: 4 };

    case 'f32':
      if (ptr + 4 > maxLen) return { ok: false, error: 'Out of bounds' };
      view.setFloat32(ptr, Number(value), true);
      return { ok: true, ptr, written: 4 };

    case 'f64':
      if (ptr + 8 > maxLen) return { ok: false, error: 'Out of bounds' };
      view.setFloat64(ptr, Number(value), true);
      return { ok: true, ptr, written: 8 };

    default:
      return { ok: false, error: `Unsupported memory write type: ${type}` };
  }
}

/**
 * Resolves argument variables like "$step0", "$step0 + 0x10", "$step0.prop"
 */
function resolveArg(arg: any, vars: Map<string, any>): any {
  if (typeof arg !== 'string') return arg;

  const trimmed = arg.trim();
  if (!trimmed.startsWith('$')) return arg;

  // Exact match e.g. "$step0"
  if (vars.has(trimmed)) {
    return vars.get(trimmed);
  }

  // Expression like "$step0 + 0x10" or "$step0 - 4"
  const mathMatch = trimmed.match(/^(\$[a-zA-Z0-9_]+)\s*([+\-])\s*(0x[0-9a-fA-F]+|\d+)$/);
  if (mathMatch) {
    const varName = mathMatch[1];
    const op = mathMatch[2];
    const offset = mathMatch[3].startsWith('0x') ? parseInt(mathMatch[3], 16) : parseInt(mathMatch[3], 10);
    const baseVal = vars.get(varName);

    if (typeof baseVal === 'number') {
      return op === '+' ? baseVal + offset : baseVal - offset;
    }
  }

  // Property lookup like "$step0.address"
  const propMatch = trimmed.match(/^(\$[a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)$/);
  if (propMatch) {
    const baseVal = vars.get(propMatch[1]);
    if (baseVal && typeof baseVal === 'object') {
      return baseVal[propMatch[2]];
    }
  }

  return arg;
}

/**
 * Executes a sequence of calls / memory reads with call chaining
 */
export async function executeChain(steps: ChainStep[]): Promise<{ ok: boolean; results: any[]; error?: string }> {
  const ctx = getWasmContext();
  const vars = new Map<string, any>();
  const results: any[] = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const stepName = step.name || `step${i}`;
    const start = performance.now();

    // Watch memory before step
    let watchBefore: any = null;
    let watchPtrResolved: number | null = null;
    if (step.watchPtr !== undefined && step.watchBytes) {
      watchPtrResolved = Number(resolveArg(step.watchPtr, vars));
      if (!isNaN(watchPtrResolved)) {
        watchBefore = readMem(watchPtrResolved, 'hexdump', step.watchBytes);
      }
    }

    try {
      let stepResult: any = undefined;

      // 1. WASM Table function call
      if (typeof step.funcIndex === 'number') {
        if (!ctx.wasmTable) {
          throw new Error('wasmTable not found in WebGL context');
        }
        const fn = ctx.wasmTable.get(step.funcIndex);
        if (typeof fn !== 'function') {
          throw new Error(`wasmTable[${step.funcIndex}] is not a callable function (type: ${typeof fn})`);
        }

        const resolvedArgs = (step.args || []).map((a) => resolveArg(a, vars));
        stepResult = fn(...resolvedArgs);
      }

      // 2. Read memory step
      else if (step.readMem) {
        const ptr = Number(resolveArg(step.readMem.ptr, vars));
        const type = step.readMem.type || 'i32';
        const count = step.readMem.count || 1;
        stepResult = readMem(ptr, type, count);
      }

      // 3. Write memory step
      else if (step.writeMem) {
        const ptr = Number(resolveArg(step.writeMem.ptr, vars));
        const type = step.writeMem.type || 'i32';
        const val = resolveArg(step.writeMem.value, vars);
        stepResult = writeMem(ptr, type, val);
      }

      // 4. Custom code snippet step
      else if (step.code) {
        const evalFn = new Function('vars', 'readMem', 'writeMem', 'ctx', `return (async () => { ${step.code} })();`);
        stepResult = await evalFn(vars, readMem, writeMem, ctx);
      } else {
        throw new Error('Step must specify funcIndex, readMem, writeMem, or code');
      }

      // Watch memory after step
      let memoryDiff: any = null;
      if (watchPtrResolved !== null && step.watchBytes) {
        const watchAfter = readMem(watchPtrResolved, 'hexdump', step.watchBytes);
        memoryDiff = {
          before: watchBefore,
          after: watchAfter,
          changed: watchBefore !== watchAfter,
        };
      }

      // Store in variable map
      vars.set(`$step${i}`, stepResult);
      vars.set(`$${stepName}`, stepResult);

      const durationMs = Math.round((performance.now() - start) * 100) / 100;
      results.push({
        stepIndex: i,
        name: stepName,
        ok: true,
        result: stepResult,
        durationMs,
        memoryDiff,
      });
    } catch (err: any) {
      const isWasmTrap = err instanceof WebAssembly.RuntimeError;
      const durationMs = Math.round((performance.now() - start) * 100) / 100;

      const stepErr = {
        stepIndex: i,
        name: stepName,
        ok: false,
        isWasmTrap,
        error: err?.message || String(err),
        stack: err?.stack || null,
        durationMs,
      };

      results.push(stepErr);

      if (!step.continueOnError) {
        return {
          ok: false,
          results,
          error: `Chain aborted at step ${i} (${stepName}): ${stepErr.error}`,
        };
      }
    }
  }

  return { ok: true, results };
}

/**
 * Safely evaluates simple property paths without triggering CSP unsafe-eval
 */
function evaluateSimpleExpression(expr: string): { success: boolean; value?: any } {
  const clean = expr.trim().replace(/^return\s+/, '').replace(/;$/, '').trim();

  if (clean === 'true') return { success: true, value: true };
  if (clean === 'false') return { success: true, value: false };
  if (clean === 'null') return { success: true, value: null };
  if (clean === 'undefined') return { success: true, value: undefined };
  if (/^-?\d+(\.\d+)?$/.test(clean)) return { success: true, value: Number(clean) };
  if (/^(['"]).*\1$/.test(clean)) return { success: true, value: clean.slice(1, -1) };

  const pathParts = clean.split('.');
  if (pathParts.length > 0 && pathParts.every((p) => /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(p))) {
    let current: any = typeof window !== 'undefined' ? window : globalThis;
    const first = pathParts[0];

    if (first === 'document' && typeof document !== 'undefined') {
      current = document;
      pathParts.shift();
    } else if (first === 'window' || first === 'globalThis') {
      pathParts.shift();
    }

    for (const part of pathParts) {
      if (current === null || current === undefined) {
        return { success: true, value: undefined };
      }
      current = current[part];
    }
    return { success: true, value: current };
  }

  return { success: false };
}

/**
 * Reads live Dungeon state directly from IL2CPP WASM memory via PlayerDungeonManager
 */
export function getLiveDungeonState(): any {
  const ctx = getWasmContext();
  if (!ctx.wasmTable) return { ok: false, error: 'WASM Table not found' };

  try {
    const fnGetInstance = ctx.wasmTable.get(1797); // GameModel_get_instance
    const fnGetPlayer = ctx.wasmTable.get(707); // GameModel_get_player
    const fnGetDungeon = ctx.wasmTable.get(3831); // Player_get_dungeon
    const fnGetCurrentFloor = ctx.wasmTable.get(334505); // PlayerDungeonManager_get_currentFloor
    const fnGetFloorNum = ctx.wasmTable.get(334516); // PlayerDungeonFloor_get_number
    const fnGetFloorType = ctx.wasmTable.get(31824); // PlayerDungeonFloor_get_type
    const fnGetReadyToSave = ctx.wasmTable.get(334501); // PlayerDungeonManager_get_readyToSave
    const fnGetSaveFloor = ctx.wasmTable.get(334498); // PlayerDungeonManager_get_saveFloor
    const fnGetRespawnFloor = ctx.wasmTable.get(334500); // PlayerDungeonManager_get_respawnFloor

    if (typeof fnGetInstance !== 'function' || typeof fnGetPlayer !== 'function' || typeof fnGetDungeon !== 'function') {
      return { ok: false, error: 'Core IL2CPP functions not available in table' };
    }

    const gameModel = fnGetInstance();
    if (!gameModel) return { ok: false, error: 'GameModel instance is null' };

    const player = fnGetPlayer(gameModel);
    if (!player) return { ok: false, error: 'Player instance is null' };

    const dungeonMgr = fnGetDungeon(player);
    if (!dungeonMgr) return { ok: false, error: 'PlayerDungeonManager is null' };

    const currentFloor = typeof fnGetCurrentFloor === 'function' ? fnGetCurrentFloor(dungeonMgr) : null;
    const floorNumber = (currentFloor && typeof fnGetFloorNum === 'function') ? fnGetFloorNum(currentFloor) : null;
    const floorType = (currentFloor && typeof fnGetFloorType === 'function') ? fnGetFloorType(currentFloor) : null;
    const readyToSave = typeof fnGetReadyToSave === 'function' ? Boolean(fnGetReadyToSave(dungeonMgr)) : false;
    const saveFloor = typeof fnGetSaveFloor === 'function' ? fnGetSaveFloor(dungeonMgr) : null;
    const respawnFloor = typeof fnGetRespawnFloor === 'function' ? fnGetRespawnFloor(dungeonMgr) : null;

    return {
      ok: true,
      pointers: {
        gameModel,
        player,
        dungeonMgr,
        currentFloor,
      },
      floorNumber,
      floorType,
      readyToSave,
      saveFloor,
      respawnFloor,
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * Initializes Tier 1 Bridge in MAIN world
 */
export function initUnityMainBridge(): UnityDebugBridge | null {
  if (typeof window === 'undefined') return null;

  if (window.__unityBridge && isInitialized) {
    return window.__unityBridge;
  }

  const bridge: UnityDebugBridge = {
    log(tag: string, data: any) {
      postToContentScript({
        type: 'log',
        tag,
        data,
      });
    },

    onCommand(handler: UnityCommandHandler) {
      commandHandlers.add(handler);
      return () => {
        commandHandlers.delete(handler);
      };
    },

    send(type: string, data: any) {
      postToContentScript({
        type,
        data,
      });
    },

    status() {
      const ctx = getWasmContext();
      return {
        active: true,
        commandHandlersCount: commandHandlers.size,
        wasmContext: {
          hasWasmTable: Boolean(ctx.wasmTable),
          tableSize: ctx.wasmTable?.length || 0,
          hasBuffer: Boolean(ctx.buffer),
          byteLength: ctx.byteLength,
        },
        timestamp: new Date().toISOString(),
      };
    },

    getWasmContext,
    inspectWasmFunc,
    readMem,
    writeMem,
    executeChain,
    getLiveDungeonState,
    safeMem,
  };

  window.addEventListener('message', async (event: MessageEvent) => {
    if (event.source !== window || !event.data || event.data.source !== UNITY_BRIDGE_NAMESPACE_TO_MAIN) {
      return;
    }

    const { id, action, payload } = event.data;

    // Handle 'eval'
    if (action === 'eval' && id) {
      try {
        let result: any = undefined;
        let handled = false;

        // 1. Try registered custom command handlers first
        if (commandHandlers.size > 0) {
          for (const handler of Array.from(commandHandlers)) {
            const hRes = await handler(payload);
            if (hRes !== undefined) {
              result = hRes;
              handled = true;
            }
          }
        }

        // 2. If not handled by custom handlers and code string is provided, evaluate in MAIN world
        if (!handled && typeof payload?.code === 'string') {
          const trimmedCode = payload.code.trim();
          try {
            const codeToEval = trimmedCode.includes('return ')
              ? `return (async () => { ${trimmedCode} })();`
              : `return (async () => { return (${trimmedCode}); })();`;

            const evalFn = new Function('payload', 'bridge', codeToEval);
            result = await evalFn(payload, bridge);
            handled = true;
          } catch (evalErr: any) {
            if (evalErr instanceof EvalError || /Content Security Policy|unsafe-eval/i.test(evalErr?.message || '')) {
              const safeResult = evaluateSimpleExpression(trimmedCode);
              if (safeResult.success) {
                result = safeResult.value;
                handled = true;
              } else {
                throw evalErr;
              }
            } else {
              throw evalErr;
            }
          }
        }

        if (!handled && result === undefined) {
          result = {
            ok: true,
            message: 'No handler returned a value and no payload.code was provided.',
            receivedPayload: payload,
          };
        }

        postToContentScript({
          id,
          ok: true,
          result: result ?? null,
        });
      } catch (err: any) {
        postToContentScript({
          id,
          ok: false,
          error: err?.message || String(err),
          stack: err?.stack || null,
        });
      }
    }

    // Handle 'chain'
    if (action === 'chain' && id) {
      try {
        const steps = Array.isArray(payload?.steps) ? payload.steps : [];
        const chainRes = await executeChain(steps);
        postToContentScript({
          id,
          action: 'chain_result',
          ok: chainRes.ok,
          results: chainRes.results,
          error: chainRes.error || null,
        });
      } catch (err: any) {
        postToContentScript({
          id,
          action: 'chain_result',
          ok: false,
          error: err?.message || String(err),
        });
      }
    }
  });

  window.__unityBridge = bridge;
  isInitialized = true;

  bridge.log('bridge-ready', {
    message: 'WXT Unity Debug Bridge initialized in MAIN world with call chaining & memory inspector',
    origin: window.location.origin,
  });

  return bridge;
}

export default initUnityMainBridge;
