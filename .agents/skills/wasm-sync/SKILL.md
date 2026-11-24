---
name: wasm-sync
description: Quy trình tự động cập nhật WASM Table Indices, Static Addresses và Struct Offsets khi game Hero Wars Alliance ra bản cập nhật Unity WebGL mới — gom gọn trong 1 lệnh PowerShell để tối thiểu chi phí thời gian và token cho AI.
---

# Skill: `wasm-sync` — One-Shot WASM Symbol Sync & Dual-Build

## Khi nào sử dụng
Kích hoạt skill này khi:
- Người dùng báo game Hero Wars Alliance vừa có bản cập nhật mới (`x-application-version` đổi hoặc Settings hiện badge `Version Mismatch`).
- Battle Simulator (`__hwaSimulateBattle`) báo lỗi `WASM symbol profile arity mismatch` hoặc Legends Draft không giải mã được key.
- Người dùng cung cấp link CDN mới (`build/release/<hash>`, `symbols.json.gz`, hoặc `build.wasm.gz`).

## Quy tắc tiết kiệm token (BẮT BUỘC)
- **KHÔNG** đọc `hwa-sim/downloads/symbols.json` (~50MB) hay dump disassembly của `build.wasm` (~208MB) vào context.
- **CHỈ** chạy 1 lệnh `scripts/wasm-sync.ps1 -JsonSummary` và đọc duy nhất 1 dòng JSON summary trả về (< 1 KB).

## Quy trình thực thi (3 bước)

### Bước 1: Chạy Pipeline Local (`scripts/wasm-sync.ps1`)
- Nếu đã có sẵn `hwa-sim/downloads/build.wasm` & `symbols.json` (tái sinh profile / xác thực):
  ```powershell
  pwsh -File scripts/wasm-sync.ps1 -SkipDownload -JsonSummary
  ```
- Nếu có bản cập nhật mới từ CDN (chỉ tải `symbols.json` + `build.wasm.gz`, bỏ qua `build.data.gz` 129MB):
  ```powershell
  pwsh -File scripts/wasm-sync.ps1 -BuildUrl "<BUILD_BASE_URL>" -SymbolsUrl "<SYMBOLS_URL>" -WasmUrl "<WASM_URL>" -GameVersion "<NEW_VERSION>" -BumpPatch -JsonSummary
  ```
  *(Hoặc dùng `npm run wasm:sync -- --version <NEW_VERSION> --json-summary` khi chỉ cần chạy bước resolve).*

### Bước 2: Đọc Exit Code & JSON Summary
- **Exit code `0`**:
  - Toàn bộ symbol cốt lõi đã được resolve vào `src/data/wasmSymbols.ts`, `npm test` pass (`0` fail), và dual-build (`dist/` + `.output/chrome-mv3/`) đã hoàn tất.
  - Cập nhật `CHANGELOG.md` (nếu có `-BumpPatch`) và chuyển sang bước xác nhận commit (`kn-commit`).
- **Exit code `2` (`unresolved` không rỗng)**:
  - Đọc mảng `unresolved` trong JSON summary (chỉ gồm tên 1–2 hàm bị đổi tên/signature).
  - Chạy lệnh node tra cứu hẹp trong `symbols.json` theo prefix class (tối đa 10 dòng output), cập nhật regex trong `hwa-sim/scripts/resolve-wasm-symbols.mjs`, rồi chạy lại Bước 1 với `-SkipDownload`.
- **Exit code `3` (lỗi test hoặc build)**:
  - Đọc trường `stage` & `error` trong JSON summary để xử lý đúng điểm lỗi.

### Bước 3: Phát hành / Commit
- Thực hiện kiểm tra `git status` và hỏi xác nhận người dùng trước khi commit theo chuẩn `kn-commit` (hoặc dùng `ext-build` nếu cần release đầy đủ).
