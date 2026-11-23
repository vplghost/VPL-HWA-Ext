# Native Messaging Bridge Architecture & HTTP CLI

Tài liệu này cung cấp hướng dẫn toàn diện về kiến trúc, cơ chế hoạt động và cách sử dụng Native Messaging Bridge trong dự án **VPL-HWA-Ext**. Hệ thống này cho phép tương tác trực tiếp 2 chiều giữa các công cụ CLI bên ngoài (Node.js/cURL/Python) với WebAssembly Unity IL2CPP runtime trong trình duyệt Chrome.

---

## 1. Tổng Quan Kiến Trúc (3-Tier Architecture)

Native Messaging Bridge được thiết kế theo mô hình 3 tầng (3-tier) bảo đảm an toàn, phân tách môi trường thực thi và cho phép bypass các hạn chế về Content Security Policy (CSP) và isolated contexts:

```text
[External CLI / cURL / Scripts]
               │ HTTP REST (127.0.0.1:9876)
               ▼
┌────────────────────────────────────────────────────────┐
│ Tier 3: Native Host (debug-bridge/host.js via host.bat) │
│ - Windows stdio (32-bit LE length-prefixed JSON)       │
│ - Express/HTTP server lắng nghe cổng 9876              │
│ - Lưu buffer 1000 logs, quản lý correlation ID         │
└──────────────────────────────▲─────────────────────────┘
                               │ Chrome Native Messaging Protocol
                               ▼
┌────────────────────────────────────────────────────────┐
│ Tier 3 (Extension): src/background/debugBridge.ts      │
│ - Service Worker quản lý chrome.runtime.connectNative  │
│ - Forwarding messages giữa Native Host và Tabs         │
└──────────────────────────────▲─────────────────────────┘
                               │ chrome.tabs.sendMessage
                               ▼
┌────────────────────────────────────────────────────────┐
│ Tier 2: Content Script (unityDebugBridge.content.ts)   │
│ - Chạy trong ISOLATED world                            │
│ - Nhận lệnh từ Background, dispatch CustomEvent        │
│   'hwa-debug-eval' / 'hwa-debug-chain' vào window      │
│ - Lắng nghe kết quả từ MAIN world qua CustomEvent     │
└──────────────────────────────▲─────────────────────────┘
                               │ window CustomEvent (hwa-debug-*)
                               ▼
┌────────────────────────────────────────────────────────┐
│ Tier 1: In-Page Script (unityDebugMain.content.ts)     │
│ - Chạy trong MAIN world (cùng context với Unity WebGL) │
│ - Truy cập trực tiếp window.__hwaUnityInstance.Module  │
│ - Thực thi asm.table call, đọc/ghi HEAPU8/HEAP32      │
│ - Safe expression evaluator & Call Chaining Runner     │
└────────────────────────────────────────────────────────┘
```

---

## 2. Windows Native Messaging Host & Registry Setup

### 2.1. Cấu hình Windows Registry
Chrome yêu cầu một Registry key tại Hive `HKCU` hoặc `HKLM` trỏ tới file JSON manifest của Native Host:
- **Registry Key**: `HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.local.wxt_unity_bridge`
- **Value**: Đường dẫn tuyệt đối tới `debug-bridge/com.local.wxt_unity_bridge.json`.

Manifest file mẫu (`com.local.wxt_unity_bridge.json`):
```json
{
  "name": "com.local.wxt_unity_bridge",
  "description": "WXT Unity Debug Bridge Native Host",
  "path": "host.bat",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://<EXTENSION_ID>/"
  ]
}
```

### 2.2. Script Cài Đặt Tự Động (`debug-bridge/install-windows.ps1`)
Chạy script PowerShell từ thư mục gốc dự án:
```powershell
powershell -ExecutionPolicy Bypass -File .\debug-bridge\install-windows.ps1
```
Script sẽ tự động:
1. Phát hiện đường dẫn tuyệt đối của thư mục `debug-bridge`.
2. Tạo manifest `com.local.wxt_unity_bridge.json` với đường dẫn tới `host.bat`.
3. Đăng ký Registry key tương ứng vào `HKCU:\Software\Google\Chrome\NativeMessagingHosts`.

### 2.3. Quy Tắc Giao Tiếp stdio trên Windows
- Chrome khởi chạy `host.bat` và giao tiếp qua stdin/stdout.
- Giao thức yêu cầu **4 bytes header Little-Endian** biểu thị độ dài payload JSON, theo sau là dữ liệu JSON dạng UTF-8.
- **QUAN TRỌNG**: `process.stdout` của Node.js bị chiếm hoàn toàn cho giao thức nhị phân của Chrome. Bất kỳ thông tin debug nào in ra stdout (như `console.log`) sẽ làm hỏng khung nhị phân và khiến Chrome ngắt kết nối ngay lập tức (`Native host has exited`). Mọi log chẩn đoán nội bộ bắt buộc phải xuất qua `process.stderr` hoặc file log.

---

## 3. Quản Lý Môi Trường & Tree-Shaking Cho Production

Toàn bộ hệ thống Debug Bridge được cô lập thông qua biến môi trường build:

- **File `.env.local`**:
  ```ini
  VITE_DEBUG_BRIDGE=true
  ```
- **Cấu hình `wxt.config.ts`**:
  Khi `process.env.VITE_DEBUG_BRIDGE === 'true'`, WXT mới chèn thêm quyền:
  ```typescript
  permissions: [
    // ...,
    ...(isDebugBridge ? ['nativeMessaging', 'declarativeNetRequest'] : [])
  ]
  ```
- **Tree-shaking**:
  Trong mã nguồn (`entrypoints/background.ts`, `unityDebugBridge.content.ts`, v.v.), toàn bộ code được bọc trong điều kiện:
  ```typescript
  if (import.meta.env.VITE_DEBUG_BRIDGE === 'true') {
    // Debug bridge logic
  }
  ```
  Trong các bản build production (`npm run build`), Vite/Rollup loại bỏ hoàn toàn mã nguồn này khỏi artifact đầu ra, không phát sinh quyền nhạy cảm hay dư thừa dung lượng.

---

## 4. Cơ Chế Bypass Content Security Policy (CSP)

Trang game `hero-wars-alliance.com` thiết lập CSP nghiêm ngặt không có `'unsafe-eval'`. Khi chạy `eval()` hoặc `new Function()` trong MAIN world, trình duyệt ném lỗi:
```text
EvalError: Evaluating a string as JavaScript violates the following Content Security Policy directive...
```

Để khắc phục triệt để, hệ thống tích hợp giải pháp kép:
1. **Dynamic DeclarativeNetRequest Session Rules**:
   Khi Service Worker khởi động trong chế độ Debug Bridge, nó tạo dynamic rule để strip (xóa) 2 header phản hồi từ server game:
   - `Content-Security-Policy`
   - `Content-Security-Policy-Report-Only`
2. **Safe Expression Evaluator Fallback**:
   Nếu CSP vẫn còn hiệu lực (trước khi reload trang), hàm `evaluateSimpleExpression()` trong Tier 1 sẽ phân tích cú pháp AST đơn giản hoặc chuỗi property access (ví dụ `document.title`, `window.__hwaUnityInstance`) mà không cần kích hoạt `eval()`.

---

## 5. Danh Sách HTTP REST Endpoints (Port 9876)

Host HTTP lắng nghe tại `http://127.0.0.1:9876`:

### 5.1. `GET /status`
Kiểm tra trạng thái kết nối giữa Host và Extension.
- **Request**:
  ```bash
  curl.exe http://127.0.0.1:9876/status
  ```
- **Response**:
  ```json
  {
    "connected": true,
    "lastPing": 1732328000000,
    "bufferedLogs": 25
  }
  ```

### 5.2. `GET /logs?limit=50`
Lấy danh sách log mới nhất được ghi lại từ Content Script và Unity Engine.
- **Query params**: `limit` (số log tối đa, mặc định 100), `filter` (từ khóa lọc text).
- **Request**:
  ```bash
  curl.exe http://127.0.0.1:9876/logs?limit=10
  ```

### 5.3. `DELETE /logs`
Xóa toàn bộ buffer logs trong bộ nhớ Host.

### 5.4. `POST /eval`
Thực thi biểu thức JavaScript trực tiếp trong MAIN world của trang game.
- **Request Body**:
  ```json
  {
    "code": "window.__hwaUnityInstance ? 'Connected' : 'Not Loaded'"
  }
  ```
- **Response**:
  ```json
  {
    "ok": true,
    "result": "Connected"
  }
  ```

### 5.5. `POST /chain` (WASM Call Chaining Engine)
Thực thi chuỗi lệnh gọi hàm WASM và đọc bộ nhớ liên hoàn với cơ chế phân giải biến trung gian (intermediate variables).
- **Request Body**:
  ```json
  {
    "steps": [
      {
        "type": "call",
        "func": 1797,
        "args": []
      },
      {
        "type": "call",
        "func": 707,
        "args": ["$step0"]
      },
      {
        "type": "readMem",
        "address": "$step1 + 16",
        "length": 4,
        "format": "int32"
      }
    ]
  }
  ```
- **Các loại step được hỗ trợ**:
  - `call`: Gọi hàm tại chỉ mục function index trong `asm.table` với các đối số `args`.
  - `readMem`: Đọc bộ nhớ HEAPU8 tại `address`, hỗ trợ format: `bytes`, `int32`, `uint32`, `float32`, `il2cppString` (UTF-16LE có tiền tố độ dài tại offset 0x08/0x0C).
  - `hexdump`: Xuất bảng dump hexa 16-byte dòng cho vùng nhớ chỉ định.
  - `memoryDiff`: So sánh snapshot vùng nhớ trước và sau khi gọi hàm để xác định thay đổi offset.

---

## 6. Hướng Dẫn CLI Nhanh

1. **Khởi động Chrome với extension và tab game**:
   Mở game tại `https://hero-wars-alliance.com/`.
2. **Kiểm tra kết nối**:
   ```powershell
   curl.exe http://127.0.0.1:9876/status
   ```
3. **Đọc URL hiện tại của tab**:
   ```powershell
   curl.exe -X POST http://127.0.0.1:9876/eval -H "Content-Type: application/json" -d "{\"code\": \"location.href\"}"
   ```
4. **Kiểm tra trạng thái Dungeon hiện tại qua WASM**:
   ```powershell
   curl.exe -X POST http://127.0.0.1:9876/eval -H "Content-Type: application/json" -d "{\"code\": \"window.__hwaUnityDebugBridge.getLiveDungeonState()\"}"
   ```
