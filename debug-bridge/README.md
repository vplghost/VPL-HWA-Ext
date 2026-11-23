# WXT Unity IL2CPP Native Messaging & Live REPL Bridge

Hệ thống cầu nối 2 chiều giữa **Chrome Extension (WXT)** và **Antigravity CLI (`agy`) / Terminal / HTTP API** thông qua Chrome Native Messaging trên Windows.

Cơ chế này cho phép bạn:
- **Đọc dữ liệu / Telemetry theo thời gian thực** từ các hook IL2CPP WASM chạy trên trang web (lưu vào `.debug-bridge/unity-hook.jsonl` và HTTP `GET /logs`).
- **Gửi lệnh hot-tweak / Eval trực tiếp** từ CLI vào MAIN world của trang game thông qua HTTP `POST /eval` và nhận kết quả tức thì mà không cần reload trang hay mở DevTools thủ công.
- **Hoạt động độc lập trên bản build tĩnh (`npm run wxt:build`)**, không yêu cầu dev server.
- **Tự động cô lập quyền production**: Khi không bật cờ `VITE_DEBUG_BRIDGE=true`, quyền `nativeMessaging` và toàn bộ code bridge sẽ được loại bỏ hoàn toàn.

---

## Kiến trúc 3 tầng (3-Tier Forwarding Stream)

```
[ Antigravity CLI (agy) / curl ]
              ↕ HTTP (http://127.0.0.1:9876)
[ Native Messaging Host (debug-bridge/host.js via host.bat) ]
              ↕ stdio (Binary 32-bit LE uint32 length prefix)
[ Tầng 3: Background Service Worker (src/background/debugBridge.ts) ]
              ↕ browser.runtime.sendMessage / onMessage
[ Tầng 2: Content Script (entrypoints/unityDebugBridge.content.ts) ]
              ↕ window.postMessage ('wxt-unity-bridge-*')
[ Tầng 1: MAIN World / Unity Hook (window.__unityBridge) ]
```

---

## Hướng dẫn từng bước: Cài đặt và Kích hoạt

### Bước 1: Tạm tắt bản Production (nếu đang bật)
1. Mở Chrome và truy cập `chrome://extensions`.
2. Tìm extension **HWA Helper** (bản đã cài từ trước).
3. Gạt nút tắt (Disable) để tránh xung đột content scripts và tabs với bản debug.

---

### Bước 2: Cấu hình biến môi trường & Build Unpacked
File `.env.local` đã được cấu hình cờ debug bridge:
```env
VITE_DEBUG_BRIDGE=true
```

Tiến hành build bản unpacked:
```powershell
npm run wxt:build
```
> Kết quả build sẽ xuất ra thư mục: `.output/chrome-mv3`. Manifest của bản này sẽ tự động chứa quyền `"nativeMessaging"`.

---

### Bước 3: Nạp Extension Unpacked vào Chrome
1. Mở `chrome://extensions`.
2. Bật công tắc **Developer mode** ở góc trên bên phải.
3. Bấm nút **Load unpacked** (Tải tiện ích đã giải nén).
4. Trỏ vào thư mục: `<đường_dẫn_dự_án>\.output\chrome-mv3`.
5. Sau khi load, tìm extension vừa nạp và copy chuỗi **ID** (gồm 32 ký tự, ví dụ: `hbnclgckk...`).

---

### Bước 4: Đăng ký Native Messaging Host vào Windows Registry
Mở PowerShell tại thư mục gốc dự án và chạy script với Extension ID vừa copy:

```powershell
powershell -ExecutionPolicy Bypass -File .\debug-bridge\install-windows.ps1 -ExtensionId "<EXTENSION_ID_CUA_BAN>"
```

Script sẽ tự động:
1. Phát hiện đường dẫn tuyệt đối đến `node.exe` trên máy bạn.
2. Cập nhật `debug-bridge/host.bat` với đường dẫn Node tuyệt đối.
3. Tạo file manifest host `debug-bridge/com.local.wxt_unity_bridge.json` chứa `allowed_origins: ["chrome-extension://<EXTENSION_ID>/"]`.
4. Đăng ký Registry key tại: `HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.local.wxt_unity_bridge`.

---

### Bước 5: Mở trang Web & Bắt đầu sử dụng Bridge

1. Mở tab game Hero Wars: `https://hero-wars-alliance.com/` (hoặc refresh lại tab nếu đã mở trước đó).
2. Khi tab game load, Service Worker của extension sẽ tự động kết nối tới Native Host `com.local.wxt_unity_bridge`.
3. Native Host sẽ mở local HTTP server tại `http://127.0.0.1:9876`.

---

## Cách sử dụng

### 1. Trong Code Hook IL2CPP / Web Console (Tầng 1 - MAIN World)

Đối tượng `window.__unityBridge` tự động được tiêm sẵn vào MAIN world của trang:

#### Gửi Log / Dữ liệu bộ nhớ về CLI:
```javascript
// Gửi log đơn giản
window.__unityBridge.log('il2cpp', {
  event: 'method_called',
  class: 'BattleController',
  method: 'ApplyDamage',
  damage: 250000,
  targetId: 104
});

// Gửi địa chỉ pointer hoặc buffer
window.__unityBridge.log('memory-dump', {
  ptr: '0x12FA4B80',
  values: [1.0, 2.5, 0.0]
});
```

#### Đăng ký bộ lắng nghe lệnh Hot-Tweak từ CLI:
```javascript
window.__unityBridge.onCommand(async (payload) => {
  if (payload.command === 'setSpeed') {
    // Tinh chỉnh tốc độ engine
    const speed = payload.speed || 1.0;
    // Gọi hàm IL2CPP hoặc Unity
    window.unityInstance?.SendMessage('GameController', 'SetTimeScale', speed);
    return { ok: true, currentSpeed: speed };
  }

  if (payload.command === 'killCurrentMonster') {
    // Gọi logic hook của bạn
    return { ok: true, killed: true };
  }
});
```

---

### 2. Từ Antigravity CLI (`agy`) / Terminal / `curl`

#### Kiểm tra trạng thái kết nối:
```bash
curl http://127.0.0.1:9876/status
```
Phản hồi mẫu:
```json
{
  "ok": true,
  "service": "wxt-unity-debug-bridge",
  "chromeConnected": true,
  "lastSeenTabId": 123456,
  "memoryLogCount": 15,
  "uptimeSeconds": 42
}
```

#### Đọc log / telemetry mới nhất:
```bash
# Lấy 10 dòng log mới nhất
curl "http://127.0.0.1:9876/logs?limit=10"
```
Hoặc đọc trực tiếp từ file log `.jsonl` trong dự án:
```powershell
Get-Content -Tail 20 .debug-bridge\unity-hook.jsonl
```

#### Gửi lệnh hot-tweak tùy chỉnh:
```bash
curl -X POST http://127.0.0.1:9876/eval \
  -H "Content-Type: application/json" \
  -d '{"command": "setSpeed", "speed": 3.0}'
```

#### Thực thi code JS / kiểm tra engine trực tiếp trong tab game:
```bash
curl -X POST http://127.0.0.1:9876/eval \
  -H "Content-Type: application/json" \
  -d '{"code": "window.unityInstance ? true : false"}'
```

```bash
curl -X POST http://127.0.0.1:9876/eval \
  -H "Content-Type: application/json" \
  -d '{"code": "document.title"}'
```

#### Xóa logs:
```bash
curl -X DELETE http://127.0.0.1:9876/logs
```

---

## 3. Công cụ tra cứu Symbol & Call Chaining (Dungeon Automation)

### Tra cứu Symbol IL2CPP (`debug-bridge/lookup-symbol.js`)

Để tra cứu nhanh index hàm WASM, mangled name và kiểm tra tính khả dụng của IL2CPP Metadata API:

```bash
# Tra cứu các hàm liên quan đến PlayerDungeon
node debug-bridge/lookup-symbol.js PlayerDungeon --limit 20

# Tra cứu theo tên hàm cụ thể
node debug-bridge/lookup-symbol.js GameModel_get_instance

# Tra cứu ngược từ index hàm trong wasmTable
node debug-bridge/lookup-symbol.js 42400

# Chỉ kiểm tra trạng thái các hàm IL2CPP Metadata API
node debug-bridge/lookup-symbol.js --metadata

# Xuất kết quả dạng JSON
node debug-bridge/lookup-symbol.js PlayerDungeon --json
```

---

### Giả lập xâu chuỗi thực thi hàm (`POST /chain`)

Endpoint `http://127.0.0.1:9876/chain` cho phép gửi một mảng các bước tuần tự (`steps`). Kết quả của bước trước có thể được truyền vào bước sau bằng cú pháp biến `$step0`, `$step1` hoặc `$step0 + offset`:

#### Ví dụ: Chuỗi 3 bước truy xuất Dungeon & thông tin Titan:
```bash
curl -X POST http://127.0.0.1:9876/chain \
  -H "Content-Type: application/json" \
  -d '{
    "steps": [
      {
        "name": "getGameModel",
        "funcIndex": 1797,
        "args": []
      },
      {
        "name": "getPlayer",
        "funcIndex": 707,
        "args": ["$getGameModel"]
      },
      {
        "name": "getDungeonManager",
        "funcIndex": 3831,
        "args": ["$getPlayer"]
      },
      {
        "name": "getCurrentFloor",
        "funcIndex": 334505,
        "args": ["$getDungeonManager"]
      },
      {
        "name": "getFloorNumber",
        "funcIndex": 334516,
        "args": ["$getCurrentFloor"]
      }
    ]
  }'
```

#### Phản hồi mẫu từ `/chain`:
```json
{
  "ok": true,
  "results": [
    { "stepIndex": 0, "name": "getGameModel", "ok": true, "result": 182746400, "durationMs": 0.12 },
    { "stepIndex": 1, "name": "getPlayer", "ok": true, "result": 201844320, "durationMs": 0.08 },
    { "stepIndex": 2, "name": "getDungeonManager", "ok": true, "result": 210948200, "durationMs": 0.11 },
    { "stepIndex": 3, "name": "getCurrentFloor", "ok": true, "result": 210950000, "durationMs": 0.09 },
    { "stepIndex": 4, "name": "getFloorNumber", "ok": true, "result": 524, "durationMs": 0.06 }
  ]
}
```

---

## 4. Hồ sơ các hàm Dungeon Automation trong `symbols.json`

| Index | Tên hàm (Clean) | Tên Mangled | Chức năng trong Dungeon Automation |
|---|---|---|---|
| `1797` | `GameModel.get_instance()` | `GameModel_get_instance_m00DFE1E05F13FC1B...` | Lấy Singleton `GameModel*` |
| `707` | `GameModel.get_player(gameModel)` | `GameModel_get_player_m7830E02376CDC0A4...` | Lấy đối tượng `Player*` |
| `3831` | `Player.get_dungeon(player)` | `Player_get_dungeon_mB26FC88E13C0C8FE02...` | Lấy `PlayerDungeonManager*` |
| `334505` | `PlayerDungeonManager.get_currentFloor(mgr)` | `PlayerDungeonManager_get_currentFloor_m...` | Lấy tầng Dungeon hiện tại |
| `334516` | `PlayerDungeonFloor.get_number(floor)` | `PlayerDungeonFloor_get_number_m...` | Lấy số thứ tự tầng hiện tại |
| `31824` | `PlayerDungeonFloor.get_type(floor)` | `PlayerDungeonFloor_get_type_m...` | Lấy loại tầng (Titan, Hero, Save, Door) |
| `31825` | `PlayerDungeonBattleFloor.get_enemy1(floor)` | `PlayerDungeonBattleFloor_get_enemy1_m...` | Thông tin kẻ địch cửa 1 |
| `42403` | `PlayerDungeonBattleFloor.get_enemy2(floor)` | `PlayerDungeonBattleFloor_get_enemy2_m...` | Thông tin kẻ địch cửa 2 |
| `42400` | `PlayerDungeonManager.getTitans(mgr)` | `PlayerDungeonManager_getTitans_m...` | Danh sách trạng thái Titans (HP, Energy) |
| `42402` | `PlayerDungeonManager.getHeroes(mgr)` | `PlayerDungeonManager_getHeroes_m...` | Danh sách trạng thái Heroes |
| `67021` | `PlayerDungeonManager.getActiveTitans(mgr)` | `PlayerDungeonManager_getActiveTitans_m...` | Titans còn sống có thể xuất chiến |
| `129015` | `PlayerDungeonManager.getActiveHeroes(mgr)` | `PlayerDungeonManager_getActiveHeroes_m...` | Heroes còn sống có thể xuất chiến |
| `334498` | `PlayerDungeonManager.get_saveFloor(mgr)` | `PlayerDungeonManager_get_saveFloor_m...` | Thông tin tầng điểm lưu (Checkpoint) |
| `334501` | `PlayerDungeonManager.get_readyToSave(mgr)` | `PlayerDungeonManager_get_readyToSave_m...` | Trạng thái có thể kích hoạt đòn bẩy lưu |
| `129017` | `PlayerDungeonManager.action_startBattle(mgr, ...)` | `PlayerDungeonManager_action_startBattle_m...` | Khởi tạo trận chiến Dungeon |
| `129020` | `PlayerDungeonManager.action_instantBattle(mgr, ...)` | `PlayerDungeonManager_action_instantBattle_m...` | Đánh nhanh / Quét tự động tầng |
| `129018` | `PlayerDungeonManager.action_saveProgress(mgr)` | `PlayerDungeonManager_action_saveProgress_m...` | Lưu điểm hồi sinh khi gặp đòn bẩy |


---

## Chuyển đổi lại bản Production (Clean Build)

Khi muốn đóng gói bản production sạch:
1. Đặt `VITE_DEBUG_BRIDGE=false` trong `.env.local` (hoặc xóa file `.env.local`).
2. Chạy `npm run wxt:build`.
3. Kiểm tra manifest xuất ra tại `.output/chrome-mv3/manifest.json`: quyền `nativeMessaging` sẽ được loại bỏ hoàn toàn.
