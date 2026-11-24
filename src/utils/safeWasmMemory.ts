/**
 * Safe WASM Memory Guard Helpers (`safeWasmMemory.ts`).
 * Pure bounds-checked, alignment-checked readers for Unity IL2CPP WebAssembly linear memory.
 * Prevents `RuntimeError: memory access out of bounds` and stale TypedArray views after `memory.grow()`.
 */

export const MIN_VALID_WASM_PTR = 65536;

export interface FreshWasmViews {
  buffer: ArrayBuffer;
  byteLength: number;
  u8: Uint8Array;
  u16: Uint16Array;
  i32: Int32Array;
  u32: Uint32Array;
}

export function isAlignedPtr(
  ptr: number,
  byteLength: number,
  align: number = 4,
  minSize: number = 4
): boolean {
  if (!Number.isInteger(ptr) || !Number.isInteger(byteLength)) return false;
  if (ptr < MIN_VALID_WASM_PTR) return false;
  if (ptr + minSize > byteLength) return false;
  if (align > 1 && ptr % align !== 0) return false;
  return true;
}

export function getFreshViews(memory: { buffer: ArrayBuffer } | ArrayBuffer): FreshWasmViews {
  const buffer = memory instanceof ArrayBuffer ? memory : memory.buffer;
  return {
    buffer,
    byteLength: buffer.byteLength,
    u8: new Uint8Array(buffer),
    u16: new Uint16Array(buffer),
    i32: new Int32Array(buffer),
    u32: new Uint32Array(buffer),
  };
}

export function safeReadU32(buffer: ArrayBuffer, ptr: number): number | null {
  if (!buffer || !isAlignedPtr(ptr, buffer.byteLength, 4, 4)) return null;
  return new Uint32Array(buffer)[ptr >>> 2] >>> 0;
}

export function safeReadI32(buffer: ArrayBuffer, ptr: number): number | null {
  if (!buffer || !isAlignedPtr(ptr, buffer.byteLength, 4, 4)) return null;
  return new Int32Array(buffer)[ptr >>> 2] | 0;
}

export function safeReadCStr(
  buffer: ArrayBuffer,
  ptr: number,
  maxLen: number = 256
): string | null {
  if (!buffer || !isAlignedPtr(ptr, buffer.byteLength, 1, 1)) return null;
  const u8 = new Uint8Array(buffer);
  const limit = Math.min(maxLen, buffer.byteLength - ptr);
  let out = '';
  for (let i = 0; i < limit; i++) {
    const ch = u8[ptr + i];
    if (ch === 0) break;
    out += String.fromCharCode(ch);
  }
  return out;
}

export function safeReadIl2CppStr(
  buffer: ArrayBuffer,
  ptr: number,
  maxLen: number = 4096
): string | null {
  if (!buffer || !isAlignedPtr(ptr, buffer.byteLength, 4, 16)) return null;
  const i32 = new Int32Array(buffer);
  const len = i32[(ptr + 8) >>> 2];
  if (len < 0 || len > maxLen || ptr + 12 + len * 2 > buffer.byteLength) return null;
  const u16 = new Uint16Array(buffer);
  const start = (ptr + 12) >>> 1;
  let out = '';
  for (let i = 0; i < len; i++) {
    out += String.fromCharCode(u16[start + i]);
  }
  return out;
}

export const safeMem = {
  MIN_VALID_WASM_PTR,
  isAlignedPtr,
  getFreshViews,
  safeReadU32,
  safeReadI32,
  safeReadCStr,
  safeReadIl2CppStr,
};

export default safeMem;
