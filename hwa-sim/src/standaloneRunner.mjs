/**
 * standaloneRunner.mjs
 * Thử nghiệm chạy mô hình B: Standalone Node.js Runner cho Unity WebGL WebAssembly.
 * 
 * Mục tiêu:
 * 1. Thiết lập môi trường DOM / WebGL Mock tối thiểu cho Node.js.
 * 2. Nạp framework.js và kiểm tra các điều kiện khởi tạo Module Emscripten.
 * 3. Đánh giá khả năng nạp WebAssembly và thực thi BattleInstantPlay ngoài trình duyệt.
 */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const downloadsDir = path.join(rootDir, 'downloads');
const configDir = path.join(rootDir, 'config');

console.log('================================================================');
console.log(' HWA-SIM: THỬ NGHIỆM MÔ HÌNH B (STANDALONE NODE.JS RUNNER)');
console.log('================================================================');

// 1. Kiểm tra tài nguyên đã có
const symbolMapPath = path.join(configDir, 'unity-symbol-map.json');
const frameworkPath = path.join(downloadsDir, 'framework.js');
const wasmPath = path.join(downloadsDir, 'build.wasm.gz');
const dataPath = path.join(downloadsDir, 'build.data.gz');

console.log('1. Kiểm tra tài nguyên:');
console.log(` - unity-symbol-map.json: ${fs.existsSync(symbolMapPath) ? 'SẴN SÀNG' : 'THIẾU'}`);
console.log(` - framework.js:          ${fs.existsSync(frameworkPath) ? 'SẴN SÀNG (' + (fs.statSync(frameworkPath).size / 1024).toFixed(1) + ' KB)' : 'THIẾU'}`);
console.log(` - build.wasm.gz:         ${fs.existsSync(wasmPath) ? 'SẴN SÀNG' : 'CHƯA TẢI (Cần 208 MB)'}`);
console.log(` - build.data.gz:         ${fs.existsSync(dataPath) ? 'SẴN SÀNG' : 'CHƯA TẢI (Cần 129 MB)'}`);

// 2. Thiết lập Mock Môi Trường Trình Duyệt Tối Thiểu
console.log('\n2. Thiết lập Mock Browser Environment trong Node.js...');

class MockCanvas {
  constructor() {
    this.width = 1280;
    this.height = 720;
    this.style = {};
  }
  getContext(type) {
    console.log(`    [MockCanvas] getContext('${type}') được gọi`);
    return {
      canvas: this,
      getExtension: () => null,
      getParameter: () => 0,
      createShader: () => ({}),
      shaderSource: () => {},
      compileShader: () => {},
      getShaderParameter: () => true,
      createProgram: () => ({}),
      attachShader: () => {},
      linkProgram: () => {},
      getProgramParameter: () => true,
      useProgram: () => {},
      createBuffer: () => ({}),
      bindBuffer: () => {},
      bufferData: () => {},
      viewport: () => {},
      clearColor: () => {},
      clear: () => {},
      enable: () => {},
      disable: () => {},
      blendFunc: () => {}
    };
  }
  addEventListener() {}
  removeEventListener() {}
  getBoundingClientRect() {
    return { left: 0, top: 0, width: 1280, height: 720 };
  }
}

const mockWindow = {
  location: { href: 'https://cdn.hero-wars-alliance.com/', protocol: 'https:' },
  document: {
    createElement: (tag) => {
      if (tag === 'canvas') return new MockCanvas();
      return { addEventListener: () => {}, style: {} };
    },
    getElementsByTagName: () => [],
    getElementById: () => new MockCanvas(),
    head: { appendChild: () => {} },
    body: { appendChild: () => {} },
    currentScript: { src: 'https://cdn.hero-wars-alliance.com/framework.js' }
  },
  navigator: {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    platform: 'Win32'
  },
  requestAnimationFrame: (cb) => setTimeout(cb, 16),
  cancelAnimationFrame: (id) => clearTimeout(id),
  performance: globalThis.performance || { now: () => Date.now() },
  addEventListener: () => {},
  removeEventListener: () => {},
  AudioContext: class {
    createGain() { return { connect: () => {} }; }
    createBufferSource() { return { connect: () => {} }; }
  },
  webkitAudioContext: class {},
  WebSocket: class {
    addEventListener() {}
    send() {}
    close() {}
  },
  indexedDB: {
    open: () => ({ addEventListener: () => {} })
  }
};

// 3. Nạp và kiểm tra framework.js trong sandbox
console.log('\n3. Nạp framework.js vào Node VM Context...');
const frameworkCode = fs.readFileSync(frameworkPath, 'utf8');

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

try {
  vm.runInContext(frameworkCode, sandbox);
  console.log(' [✓] Nạp framework.js thành công!');
  console.log(` [i] unityFramework type: ${typeof sandbox.unityFramework}`);
} catch (err) {
  console.error(' [✗] Lỗi khi nạp framework.js:', err.message);
  process.exit(1);
}

// 4. Thử nghiệm khởi động Module với wasmBinary
console.log('\n4. Thử nghiệm khởi tạo unityFramework({ wasmBinary })...');
const wasmBuf = fs.readFileSync(path.join(downloadsDir, 'build.wasm'));
console.log(` - Đã nạp build.wasm vào bộ nhớ: ${(wasmBuf.length / 1024 / 1024).toFixed(1)} MB`);

const canvas = new MockCanvas();
const moduleConfig = {
  canvas: canvas,
  wasmBinary: wasmBuf,
  preRun: [],
  postRun: [],
  deinitializers: [],
  intervals: {},
  locateFile: (url) => {
    console.log(`    [locateFile] yêu cầu: ${url}`);
    if (url.endsWith('.wasm')) return path.join(downloadsDir, 'build.wasm');
    if (url.endsWith('.data')) return path.join(downloadsDir, 'build.data');
    return path.join(downloadsDir, url);
  },
  print: (msg) => console.log(`    [Unity Log] ${msg}`),
  printErr: (msg) => console.warn(`    [Unity Warn] ${msg}`),
  onAbort: (reason) => console.error(`    [Unity Abort] ${reason}`)
};

console.log(' - Đang gọi unityFramework(moduleConfig)...');
try {
  const result = sandbox.unityFramework(moduleConfig);
  console.log(' [✓] unityFramework đã được gọi, kết quả trả về:', typeof result);
  if (result && typeof result.then === 'function') {
    result.then(
      (inst) => console.log(' [✓] Unity instance ready!', Object.keys(inst || {})),
      (err) => console.error(' [✗] Unity instance promise reject:', err)
    );
  }
} catch (err) {
  console.error(' [✗] Ngoại lệ khi gọi unityFramework:', err);
}
