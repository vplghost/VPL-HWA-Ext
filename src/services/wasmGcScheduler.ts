/**
 * Adaptive WebAssembly GC & Memory Pressure Scheduler (`wasmGcScheduler.ts`).
 * Prevents IL2CPP Boehm GC OOM / Use-After-Free traps during large batch battle
 * simulations (e.g., PvP Team Optimizer 80-150 matchups x 10 rounds).
 */

export const WASM_GC_PERIODIC_INTERVAL = 20;
export const WASM_GC_DELTA_MB = 64;
export const WASM_GC_PRESSURE_MB = 1450;
export const WASM_GC_HIGH_WATERMARK_MB = 1750;

export interface WasmGcDecision {
  trigger: boolean;
  reason: 'force' | 'high-watermark' | 'memory-pressure' | 'memory-delta' | 'periodic' | 'none';
  passes: number;
  yieldMs: number;
  highMemoryPressure: boolean;
}

export function shouldTriggerWasmGc(state: {
  simCountSinceGc: number;
  wasmMemoryMb: number;
  lastGcMemoryMb: number;
  force?: boolean;
}): WasmGcDecision {
  const memMb = Math.max(0, Number(state.wasmMemoryMb) || 0);
  const lastMb = Math.max(0, Number(state.lastGcMemoryMb) || 0);
  const simCount = Math.max(0, Math.floor(Number(state.simCountSinceGc) || 0));
  const highMemoryPressure = memMb >= WASM_GC_HIGH_WATERMARK_MB;

  if (state.force) {
    return {
      trigger: true,
      reason: 'force',
      passes: 2,
      yieldMs: 250,
      highMemoryPressure,
    };
  }
  if (highMemoryPressure) {
    return {
      trigger: true,
      reason: 'high-watermark',
      passes: 2,
      yieldMs: 200,
      highMemoryPressure: true,
    };
  }
  if (memMb >= WASM_GC_PRESSURE_MB && simCount >= 5) {
    return {
      trigger: true,
      reason: 'memory-pressure',
      passes: 1,
      yieldMs: 80,
      highMemoryPressure: false,
    };
  }
  if (lastMb > 0 && memMb - lastMb >= WASM_GC_DELTA_MB) {
    return {
      trigger: true,
      reason: 'memory-delta',
      passes: 1,
      yieldMs: 60,
      highMemoryPressure: false,
    };
  }
  if (simCount >= WASM_GC_PERIODIC_INTERVAL) {
    return {
      trigger: true,
      reason: 'periodic',
      passes: 1,
      yieldMs: 30,
      highMemoryPressure: false,
    };
  }
  return {
    trigger: false,
    reason: 'none',
    passes: 0,
    yieldMs: 0,
    highMemoryPressure: false,
  };
}

/**
 * Detects transient WebAssembly memory-access / OOM traps during START_BATTLE_PLAY
 * that can be recovered via an emergency GC + frame-yield retry.
 */
export function isWasmMemoryTrapError(err: any): boolean {
  const msg = typeof err === 'string' ? err : String(err?.message || err || '');
  return /START_BATTLE_PLAY.*memory access out of bounds|memory access out of bounds|RuntimeError.*out of bounds/i.test(msg);
}
