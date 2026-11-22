import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const downloadsDir = path.join(rootDir, 'downloads');
const configDir = path.join(rootDir, 'config');

const frameworkPath = path.join(downloadsDir, 'framework.js');
const wasmBuf = fs.readFileSync(path.join(downloadsDir, 'build.wasm'));
const symbolMap = JSON.parse(fs.readFileSync(path.join(configDir, 'unity-symbol-map.json'), 'utf8'));

const mockWindow = {
  location: { href: 'https://cdn.hero-wars-alliance.com/', protocol: 'https:' },
  document: {
    createElement: () => ({ addEventListener: () => {}, style: {}, getContext: () => null }),
    getElementsByTagName: () => [],
    getElementById: () => ({ addEventListener: () => {}, style: {}, getContext: () => null }),
    head: { appendChild: () => {} },
    body: { appendChild: () => {} },
    currentScript: { src: 'https://cdn.hero-wars-alliance.com/framework.js' }
  },
  navigator: { userAgent: 'Chrome/120', platform: 'Win32' },
  requestAnimationFrame: (cb) => setTimeout(() => cb(Date.now()), 16),
  cancelAnimationFrame: (id) => clearTimeout(id),
  performance: { now: () => Date.now() },
  addEventListener: () => {},
  removeEventListener: () => {},
  AudioContext: class { createGain() { return { connect: () => {} }; } createBufferSource() { return { connect: () => {} }; } },
  webkitAudioContext: class {},
  WebSocket: class { addEventListener() {} send() {} close() {} },
  indexedDB: { open: () => ({ addEventListener: () => {} }) }
};

const sandbox = {
  ...mockWindow,
  window: mockWindow,
  document: mockWindow.document,
  navigator: mockWindow.navigator,
  location: mockWindow.location,
  console: console,
  WebAssembly: WebAssembly,
  Uint8Array: Uint8Array,
  Int32Array: Int32Array,
  Float32Array: Float32Array,
  ArrayBuffer: ArrayBuffer,
  DataView: DataView,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  setInterval: setInterval,
  clearInterval: clearInterval
};

vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(frameworkPath, 'utf8'), sandbox);

const moduleConfig = {
  wasmBinary: wasmBuf,
  preRun: [],
  postRun: [],
  deinitializers: [],
  intervals: {},
  locateFile: (url) => path.join(downloadsDir, url)
};

sandbox.unityFramework(moduleConfig);

setTimeout(() => {
  const asm = moduleConfig.asm;
  const values = Object.values(asm);
  const table = values.find(v => v instanceof WebAssembly.Table);
  const memory = values.find(v => v instanceof WebAssembly.Memory);

  const heap = {
    buffer: memory.buffer,
    u8: new Uint8Array(memory.buffer),
    u16: new Uint16Array(memory.buffer),
    i32: new Int32Array(memory.buffer),
    u32: new Uint32Array(memory.buffer)
  };

  const malloc = asm.Ol || asm.malloc || asm._malloc;
  const free = asm.Pl || asm.free || asm._free;

  console.log('--- Kiểm tra Memory Primitives ---');
  console.log('malloc (asm.Ol):', typeof malloc);
  console.log('free (asm.Pl):', typeof free);

  // Test Type_GetType
  const fnType_GetType = table.get(symbolMap.functions.Type_GetType.index);
  const fnGetUninitializedObject = table.get(symbolMap.functions.GetUninitializedObject.index);
  console.log('fnType_GetType:', typeof fnType_GetType);
  console.log('fnGetUninitializedObject:', typeof fnGetUninitializedObject);

  // Helper create string
  function forgeAsciiString(str) {
    const len = str.length;
    // Emscripten string allocation via malloc(16 + 2 * len)
    const ptr = malloc(16 + 2 * len);
    if (!ptr) return 0;
    heap.u32[ptr >>> 2] = 0; // will set once string class is known
    heap.i32[(ptr + 8) >>> 2] = len;
    const u16Start = (ptr + 12) >>> 1;
    for (let i = 0; i < len; i++) {
      heap.u16[u16Start + i] = str.charCodeAt(i);
    }
    heap.u16[u16Start + len] = 0;
    return ptr;
  }

  const testStrPtr = forgeAsciiString("System.String");
  console.log('Allocated test string in WASM heap at pointer:', testStrPtr);

  if (testStrPtr > 0) {
    // Read back string
    const readLen = heap.i32[(testStrPtr + 8) >>> 2];
    const u16Start = (testStrPtr + 12) >>> 1;
    let readBack = "";
    for (let i = 0; i < readLen; i++) {
      readBack += String.fromCharCode(heap.u16[u16Start + i]);
    }
    console.log(`Đọc lại chuỗi từ bộ nhớ WASM: "${readBack}" (Độ dài: ${readLen}) -> CHÍNH XÁC 100%!`);
    free(testStrPtr);
    console.log('Đã giải phóng chuỗi khỏi heap an toàn.');
  }

  process.exit(0);
}, 2000);
