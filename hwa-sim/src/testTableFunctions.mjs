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
    createElement: (tag) => ({ addEventListener: () => {}, style: {}, getContext: () => null }),
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
  AudioContext: class {
    createGain() { return { connect: () => {} }; }
    createBufferSource() { return { connect: () => {} }; }
  },
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

console.log('Khởi tạo Unity WebAssembly Framework...');
sandbox.unityFramework(moduleConfig);

setTimeout(() => {
  const asm = moduleConfig.asm;
  const values = Object.values(asm);
  const table = values.find(v => v instanceof WebAssembly.Table);

  console.log('\n--- Kiểm tra truy xuất hàm từ WebAssembly.Table ---');
  let validCount = 0;
  for (const [key, info] of Object.entries(symbolMap.functions)) {
    const fn = table.get(info.index);
    const isValid = typeof fn === 'function';
    if (isValid) validCount++;
    console.log(` [${isValid ? '✓' : '✗'}] ${key.padEnd(28)} (index ${String(info.index).padStart(6)}): ${typeof fn}`);
  }

  console.log(`\nKết quả: ${validCount} / ${Object.keys(symbolMap.functions).length} hàm WebAssembly sẵn sàng gọi trực tiếp!`);
  process.exit(0);
}, 2000);
