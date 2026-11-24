#!/usr/bin/env node
/**
 * download-wasm-assets.mjs
 * Script tự động tải bộ tài nguyên Unity WebGL / WASM cốt lõi của Hero Wars Alliance từ CDN.
 * 
 * Phiên bản mục tiêu: 1.294.1020 (Client Static 1.294.0)
 * Build release hash: 83d4310c-dded-4bd3-a443-55f22b534671
 */

import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const downloadsDir = path.resolve(__dirname, '../downloads');

// Đảm bảo thư mục downloads tồn tại
if (!fs.existsSync(downloadsDir)) {
  fs.mkdirSync(downloadsDir, { recursive: true });
}

const BUILD_BASE_URL = 'https://cdn.hero-wars-alliance.com/build/release/83d4310c-dded-4bd3-a443-55f22b534671';
const STATIC_LIB_URL = 'https://heroesmobile-a-cdn.nextersglobal.com/v/webgl/1.294.0/v0069/1e8af4ed49f75d2f461962f885ffbaac/lib/splitlib.json.zip';

const ASSETS_TO_DOWNLOAD = [
  {
    name: 'loader.js',
    url: `${BUILD_BASE_URL}/Build/54d2d94adc5081d334c2727860837cc8.loader.js`,
    tier: 'core',
    expectedBytes: 20111,
    desc: 'Unity WebGL Loader script'
  },
  {
    name: 'framework.js',
    url: `${BUILD_BASE_URL}/Build/7a7a5fb4feff519341d18eff5f7fc83e.framework.js.gz`,
    tier: 'core',
    expectedBytes: 566104,
    desc: 'Emscripten Framework runtime glue code'
  },
  {
    name: 'symbols.json',
    url: `${BUILD_BASE_URL}/Build/1e68b42322b805375aa3cb060b79a0e4.symbols.json.gz`,
    tier: 'core',
    expectedBytes: 49732983,
    desc: 'IL2CPP function mapping symbols table (~50 MB)'
  },
  {
    name: 'splitlib.json.zip',
    url: STATIC_LIB_URL,
    tier: 'core',
    expectedBytes: 6031315,
    desc: 'Game configuration library tables (~6 MB)'
  },
  {
    name: 'build.wasm.gz',
    url: `${BUILD_BASE_URL}/Build/632d18ee3062540a3bea5dae3d2f0c5f.wasm.gz`,
    tier: 'binary',
    expectedBytes: 208259221,
    desc: 'WebAssembly engine binary (208 MB compressed)'
  },
  {
    name: 'build.data.gz',
    url: `${BUILD_BASE_URL}/Build/546e27abe3e6e3b10b0e9370429f3ccb.data.gz`,
    tier: 'binary',
    expectedBytes: 129656746,
    desc: 'Unity virtual filesystem data asset (129 MB compressed)'
  }
];

function parseCliArgs(argv) {
  const out = {
    all: false,
    coreWasmOnly: false,
    force: false,
    buildUrl: null,
    symbolsUrl: null,
    wasmUrl: null,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--all') out.all = true;
    else if (a === '--core-wasm-only') out.coreWasmOnly = true;
    else if (a === '--force') out.force = true;
    else if (a === '--build-url' && argv[i + 1]) out.buildUrl = argv[++i].replace(/\/+$/, '');
    else if (a === '--symbols-url' && argv[i + 1]) out.symbolsUrl = argv[++i];
    else if (a === '--wasm-url' && argv[i + 1]) out.wasmUrl = argv[++i];
  }
  return out;
}

function gunzipIfNeeded(srcPath, destPath) {
  const fd = fs.openSync(srcPath, 'r');
  const header = Buffer.alloc(2);
  fs.readSync(fd, header, 0, 2, 0);
  fs.closeSync(fd);
  const isGzip = header[0] === 0x1f && header[1] === 0x8b;
  if (!isGzip) {
    if (srcPath !== destPath) fs.copyFileSync(srcPath, destPath);
    return;
  }
  console.log(`[UNZIP] Giải nén ${path.basename(srcPath)} -> ${path.basename(destPath)}...`);
  const compressed = fs.readFileSync(srcPath);
  const decompressed = zlib.gunzipSync(compressed);
  fs.writeFileSync(destPath, decompressed);
  console.log(`[UNZIP] Hoàn tất (${(decompressed.length / 1024 / 1024).toFixed(2)} MB).`);
}

function downloadFile(asset, { force = false } = {}) {
  return new Promise((resolve, reject) => {
    const destPath = path.join(downloadsDir, asset.name);
    
    // Nếu tệp đã tồn tại và đủ kích thước, bỏ qua để tiết kiệm thời gian
    if (!force && fs.existsSync(destPath)) {
      const stats = fs.statSync(destPath);
      if (stats.size > 0 && (!asset.expectedBytes || Math.abs(stats.size - asset.expectedBytes) < 50000)) {
        console.log(`[SKIP] ${asset.name} đã tồn tại (${(stats.size / 1024 / 1024).toFixed(2)} MB).`);
        return resolve({ name: asset.name, status: 'skipped', path: destPath });
      }
    }

    console.log(`[START] Đang tải ${asset.name} (${asset.desc})...`);
    console.log(`        URL: ${asset.url}`);

    const req = https.get(asset.url, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`Tải ${asset.name} thất bại: HTTP ${res.statusCode} ${res.statusMessage}`));
      }

      const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
      let downloadedBytes = 0;
      let lastReport = 0;

      const writeStream = fs.createWriteStream(destPath);

      res.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        const now = Date.now();
        if (now - lastReport > 2000) {
          lastReport = now;
          const mb = (downloadedBytes / 1024 / 1024).toFixed(2);
          const totalMb = totalBytes ? (totalBytes / 1024 / 1024).toFixed(2) : '?';
          console.log(`       -> ${asset.name}: ${mb} MB / ${totalMb} MB...`);
        }
      });

      res.pipe(writeStream);

      writeStream.on('finish', () => {
        const finalMb = (downloadedBytes / 1024 / 1024).toFixed(2);
        console.log(`[DONE]  ${asset.name} tải thành công (${finalMb} MB) -> ${destPath}`);
        resolve({ name: asset.name, status: 'downloaded', path: destPath });
      });

      writeStream.on('error', reject);
    });

    req.on('error', reject);
  });
}

async function main() {
  const cli = parseCliArgs(process.argv);
  const assets = ASSETS_TO_DOWNLOAD.map((a) => {
    const next = { ...a };
    if (cli.buildUrl && next.url.startsWith(BUILD_BASE_URL)) {
      next.url = next.url.replace(BUILD_BASE_URL, cli.buildUrl);
      next.expectedBytes = 0;
    }
    if (cli.symbolsUrl && next.name === 'symbols.json') {
      next.url = cli.symbolsUrl;
      next.expectedBytes = 0;
    }
    if (cli.wasmUrl && next.name === 'build.wasm.gz') {
      next.url = cli.wasmUrl;
      next.expectedBytes = 0;
    }
    return next;
  });

  let targetAssets;
  if (cli.coreWasmOnly) {
    targetAssets = assets.filter((a) => a.name === 'symbols.json' || a.name === 'build.wasm.gz');
  } else if (cli.all) {
    targetAssets = assets;
  } else {
    targetAssets = assets.filter((a) => a.tier === 'core');
  }

  const modeLabel = cli.coreWasmOnly
    ? 'CORE WASM ONLY (Chỉ tải symbols.json & build.wasm.gz — bỏ qua build.data.gz)'
    : cli.all
      ? 'TOÀN BỘ (gồm cả WASM 208MB & Data 129MB)'
      : 'CỐT LÕI (Loader, Framework, Symbols, Splitlib - Dùng cho In-Game Injection)';

  console.log('================================================================');
  console.log(' HWA-SIM: CÔNG CỤ TẢI TÀI NGUYÊN UNITY WASM BATTLE SIMULATOR');
  console.log('================================================================');
  console.log(`Chế độ: ${modeLabel}`);
  console.log(`Thư mục lưu trữ: ${downloadsDir}\n`);

  for (const asset of targetAssets) {
    await downloadFile(asset, { force: cli.force || Boolean(cli.symbolsUrl || cli.wasmUrl || cli.buildUrl) });
  }

  // Giải nén tự động cho resolver nếu có build.wasm.gz hoặc symbols.json dạng gzip
  const wasmGz = path.join(downloadsDir, 'build.wasm.gz');
  const wasmOut = path.join(downloadsDir, 'build.wasm');
  if (fs.existsSync(wasmGz) && (cli.coreWasmOnly || cli.force || !fs.existsSync(wasmOut))) {
    gunzipIfNeeded(wasmGz, wasmOut);
  }
  const symFile = path.join(downloadsDir, 'symbols.json');
  if (fs.existsSync(symFile)) {
    gunzipIfNeeded(symFile, symFile);
  }

  console.log('\n[HOÀN TẤT] Quá trình tải assets đã hoàn thành!');
}

main().catch((err) => {
  console.error('[ERROR]', err?.message || err);
  process.exit(1);
});
