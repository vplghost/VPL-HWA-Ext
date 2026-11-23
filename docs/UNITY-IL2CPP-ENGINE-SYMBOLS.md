# Unity IL2CPP Engine Reverse Engineering & Symbol Catalog

Tài liệu này tổng hợp toàn bộ các kết quả dịch ngược (reverse engineering) trên WebAssembly runtime và IL2CPP metadata của game Hero Wars Alliance WebGL (`1.294.1020`), phục vụ cho việc tích hợp trực tiếp giữa extension và game engine.

---

## 1. WebAssembly Runtime & Bảng Hàm (Function Table)

Unity WebGL biên dịch mã nguồn C# sang C++ qua IL2CPP, sau đó biên dịch tiếp sang WebAssembly (.wasm).
- **Điểm truy cập WebAssembly Module**:
  - `window.__hwaUnityInstance.Module` hoặc `window.Module`.
  - Bộ nhớ tuyến tính: `Module.HEAPU8.buffer`, `Module.HEAP32`, v.v.
  - Bảng hàm gián tiếp: `Module.asm` chứa một hoặc nhiều đối tượng `WebAssembly.Table`. Bảng hàm chính chứa toàn bộ các con trỏ hàm (function pointers) đã đăng ký trong IL2CPP.

Trong Tier 1 Content Script (`src/utils/unityDebugBridge.ts`), bảng hàm được tự động trích xuất thông qua hàm `findWasmTable(Module)`:
```javascript
function findWasmTable(mod) {
  if (mod.wasmTable instanceof WebAssembly.Table) return mod.wasmTable;
  const asm = mod.asm || mod;
  for (const key of Object.keys(asm)) {
    if (asm[key] instanceof WebAssembly.Table) return asm[key];
  }
  return null;
}
```

---

## 2. Danh Mục IL2CPP Metadata Runtime APIs

Hệ thống IL2CPP WebGL công khai một số hàm runtime metadata thông qua function table:

| Function Index | Tên Hàm IL2CPP | Chữ Ký (Signature) | Mục Đích |
| :--- | :--- | :--- | :--- |
| **630** | `il2cpp_codegen_resolve_icall` | `(namePtr: int) -> funcPtr: int` | Phân giải địa chỉ hàm internal call (icall) bằng chuỗi C-string |
| **36632** | `il2cpp_class_from_name` | `(imagePtr: int, nsPtr: int, namePtr: int) -> classPtr: int` | Lấy con trỏ `Il2CppClass` từ tên namespace và class |
| **28696** | `il2cpp_class_get_methods` | `(classPtr: int, iterPtr: int) -> methodPtr: int` | Lặp duyệt danh sách phương thức của một Class |
| **91432** | `il2cpp_class_get_fields` | `(classPtr: int, iterPtr: int) -> fieldPtr: int` | Lặp duyệt danh sách thuộc tính/fields của một Class |
| **15559** | `il2cpp_class_get_parent` | `(classPtr: int) -> parentClassPtr: int` | Lấy class cha (kế thừa) |
| **51231** | `il2cpp_class_instance_size` | `(classPtr: int) -> size: int` | Lấy kích thước byte của một instance trong heap |
| **2676** | `il2cpp_object_new` | `(classPtr: int) -> objPtr: int` | Cấp phát một đối tượng mới trên GC heap |
| **568** | `il2cpp_value_box` | `(classPtr: int, valPtr: int) -> boxedObjPtr: int` | Đóng gói kiểu giá trị (struct/primitive) thành boxed object |

---

## 3. Bản Đồ Ký Hiệu Đã Phân Giải (Resolved Symbol Map)

Dữ liệu ký hiệu được phân giải từ file `debug-bridge/symbols.json`:

### 3.1. GameModel & Player Navigation Chain
Để lấy đối tượng quản lý Dungeon hiện tại, chuỗi gọi hàm tiêu chuẩn là:
```text
GameModel.get_instance()  [Index 1797]
          │
          ▼  con trỏ GameModel (instancePtr)
GameModel.get_player(instancePtr)  [Index 707]
          │
          ▼  con trỏ Player (playerPtr)
Player.get_dungeon(playerPtr)  [Index 3831]
          │
          ▼  con trỏ PlayerDungeonManager (dungeonManagerPtr)
```

| Function Index | Full Method Name | Đối Số | Giá Trị Trả Về |
| :--- | :--- | :--- | :--- |
| **1797** | `GameModel_get_instance` | `()` | Con trỏ singleton `GameModel` |
| **707** | `GameModel_get_player` | `(this: GameModel)` | Con trỏ `Player` của người chơi |
| **3831** | `Player_get_dungeon` | `(this: Player)` | Con trỏ `PlayerDungeonManager` |

---

### 3.2. PlayerDungeonManager Methods

Đối tượng `PlayerDungeonManager` nắm giữ toàn bộ trạng thái hầm ngục trong phiên chơi:

| Function Index | Method Name | Đối Số | Giá Trị Trả Về | Ý Nghĩa Trong Automation |
| :--- | :--- | :--- | :--- | :--- |
| **334505** | `get_floorNumber` | `(this: PlayerDungeonManager)` | `int32` | Tầng hiện tại đang đứng |
| **334516** | `get_nextFloor` | `(this: PlayerDungeonManager)` | `int32` | Tầng kế tiếp sẽ bước tới |
| **334501** | `get_respawnFloor` | `(this: PlayerDungeonManager)` | `int32` | Tầng hồi sinh nếu thất bại (mốc checkpoint đã lưu) |
| **334498** | `get_saveFloor` | `(this: PlayerDungeonManager)` | `int32` | Tầng checkpoint hợp lệ có thể lưu |
| **334500** | `get_readyToSave` | `(this: PlayerDungeonManager)` | `bool` (0 hoặc 1) | Cờ báo hiệu điểm lưu checkpoint đã sẵn sàng |
| **42400** | `get_floor` | `(this: PlayerDungeonManager)` | Con trỏ `PlayerDungeonFloor` | Đối tượng mô tả chi tiết tầng hiện tại |
| **334507** | `get_doors` | `(this: PlayerDungeonFloor)` | Con trỏ `List<PlayerDungeonDoor>` | Danh sách các cửa lựa chọn của tầng |

---

## 4. Cấu Trúc Bộ Nhớ IL2CPP (Memory Layout & Types)

### 4.1. Cấu trúc Đối Tượng Cơ Bản (Object Header)
Trong IL2CPP 32-bit (WebAssembly WASI/Emscripten target mặc định):
- Offset `0x00`: Con trỏ `Il2CppClass*` (chứa vtable, type info, interfaces).
- Offset `0x04`: `MonitorData*` (thông tin lock/synchronization).
- Offset `0x08+`: Các trường dữ liệu (fields) của instance.

### 4.2. Định Dạng Chuỗi IL2CPP (`System.String`)
- Offset `0x00`: Class pointer (`System.String`).
- Offset `0x04`: Monitor data.
- Offset `0x08`: Chiều dài chuỗi (`int32` - số ký tự UTF-16).
- Offset `0x0C`: Dữ liệu ký tự (`char[]` mã hóa **UTF-16LE**).

Hàm helper đọc chuỗi trong `src/utils/unityDebugBridge.ts`:
```typescript
function readIl2CppString(address: number, heapU8: Uint8Array): string {
  const view = new DataView(heapU8.buffer, address);
  const length = view.getInt32(8, true);
  if (length <= 0 || length > 4096) return '';
  const charBytes = new Uint16Array(heapU8.buffer, address + 12, length);
  return String.fromCharCode(...charBytes);
}
```

---

## 5. Quy Trình Gọi Hàm Liên Hoàn (Call Chaining Protocol)

Endpoint `POST /chain` của Native Host nhận mảng các bước và thực thi liên hoàn trong MAIN world:

```json
{
  "steps": [
    { "type": "call", "func": 1797, "args": [] },
    { "type": "call", "func": 707, "args": ["$step0"] },
    { "type": "call", "func": 3831, "args": ["$step1"] },
    { "type": "call", "func": 334505, "args": ["$step2"] },
    { "type": "call", "func": 334501, "args": ["$step2"] },
    { "type": "call", "func": 334498, "args": ["$step2"] }
  ]
}
```

**Cơ chế giải quyết tham số (`resolveArg`)**:
- `$stepN`: Lấy giá trị trả về của bước thứ `N`.
- Biểu thức số học đơn giản: `$step2 + 16` được phân tích tự động thành `(giá trị $step2) + 16`.
- Giá trị trả về được gói trong JSON:
  ```json
  {
    "ok": true,
    "results": [
      { "step": 0, "result": 15423872 },
      { "step": 1, "result": 18934528 },
      { "step": 2, "result": 22104832 },
      { "step": 3, "result": 134 },
      { "step": 4, "result": 130 },
      { "step": 5, "result": 130 }
    ]
  }
  ```

---

## 6. Phân Biệt Function Index vs Table Index Trong WebAssembly & IL2CPP

Một phát hiện cốt lõi trong quá trình reverse engineering engine Unity WebGL:
1. **WASM Function Index (Code Section)**:
   - Các chỉ số hàm trong file `symbols.json` (từ 0 đến 486,915) đại diện cho chỉ số thứ tự của các hàm trong Code Section (Section 10) của WebAssembly.
   - Các stack trace của V8/Chrome (e.g. `wasm-function[1281]`) cũng tham chiếu đến Function Index này.
2. **WebAssembly Table Index (Function Table)**:
   - `WebAssembly.Table` là bảng con trỏ hàm gián tiếp runtime được nạp qua Element Section (Section 9) của file WASM.
   - Trong `build.wasm` của Hero Wars Alliance, Element Segment 0 bắt đầu từ offset `1` và nạp `805,597` con trỏ hàm.
   - **Do đó, `table.get(funcIdx)` là SAI nếu truyền trực tiếp `funcIdx` từ `symbols.json`!** Cần phải ánh xạ từ Function Index sang Table Index thông qua Element Section.
   - Công cụ giải mã: `debug-bridge/resolve-symbols-table.js`.

### Bảng Ánh Xạ Ký Hiệu Giả Lập Trận Đánh (Battle Simulation Symbols)

| Tên Logic | Func Index | Table Index | Tham Số WASM | Tên Hàm IL2CPP Gốc |
| :--- | :--- | :--- | :--- | :--- |
| **Play_ctor** | 11594 | **291996** | `(i32, i32, i32, i32, i32, i32, i32) -> ()` | `BattleInstantPlay__ctor` |
| **Play_start** | 469995 | **292005** | `(i32, i32) -> ()` | `BattleInstantPlay_start` |
| **Play_get_result** | 469999 | **291998** | `(i32, i32) -> (i32)` | `BattleInstantPlay_get_result` |
| **Play_dispose** | 175079 | **291997** | `(i32, i32) -> ()` | `BattleInstantPlay_dispose` |
| **Presets_clanWarReplay** | 174207 | **291679** | `(i32, i32) -> (i32)` | `BattlePresetsFactory_clanWarReplay` |
| **JSON_Parse** | 1763 | **133378** | `(i32, i32) -> (i32)` | `JSONNode_Parse` |
| **LazyDataObject_ctor** | 18539 | **274399** | `(i32, i32, i32) -> ()` | `LazyDataObject__ctor` |
| **MultiBattleResult_get_victory** | 351002 | **291573** | `(i32, i32) -> (i32)` | `MultiBattleResult_get_victory` |
| **MultiBattleResult_get_stars** | 351004 | **291577** | `(i32, i32) -> (i32)` | `MultiBattleResult_get_stars` |
| **MultiBattleResult_get_progress** | 351007 | **291578** | `(i32, i32) -> (i32)` | `MultiBattleResult_get_progress` |
| **MultiBattleResult_get_result** | 351006 | **291576** | `(i32, i32) -> (i32)` | `MultiBattleResult_get_result` |
| **DataObject_asJson** | 1833 | **274798** | `(i32, i32) -> (i32)` | `DataObject_asJson` |
| **Object_ToString** | 16323 | **337342** | `(i32, i32) -> (i32)` | `Object_ToString` |

---

## 7. Kiến Trúc Giả Lập Trận Đánh Hoàn Chỉnh (Battle Simulation Pipeline)

Quy trình chuẩn để thực thi một trận giả lập Dungeon / Titan / Hero trực tiếp qua Unity Engine mà không gặp WebAssembly execution trap hay exception:

1. **Chuẩn bị Presets (`presetPtr`)**:
   - Titan battle: `callTableFn(sym.Presets_clanWarReplay, 0, 0)` -> trả về con trỏ `BattlePresets` cho Titan.
   - Hero battle: `callTableFn(sym.Presets_clanWarReplay, 1, 0)` -> trả về con trỏ `BattlePresets` cho Hero.
2. **Chuyển đổi Battle JSON sang `LazyDataObject`**:
   - `forgeString(JSON.stringify(rawBattle))` -> cấp phát chuỗi `System.String` trong heap.
   - `jsonNodePtr = callTableFn(sym.JSON_Parse, rawJsonStrPtr, 0)` -> trả về `SimpleJSON.JSONObject`.
   - Cấp phát 128 bytes trong heap, gán `lazyKlass` (`0x15aacd4` hoặc quét metadata tìm `LazyDataObject`).
   - Gọi `callTableFn(sym.LazyDataObject_ctor, lazyPtr, jsonNodePtr, 0)` -> đối tượng `LazyDataObject` hoàn chỉnh.
3. **Khởi tạo và chạy `BattleInstantPlay`**:
   - Cấp phát 1024 bytes trong heap, gán `playKlass` (`0x159ffd0` hoặc quét metadata tìm `BattleInstantPlay`).
   - Khởi tạo: `callTableFn(sym.Play_ctor, playPtr, lazyPtr, presetPtr, 0, 0, 0, 0)`.
   - Khởi chạy vòng lặp giả lập: `callTableFn(sym.Play_start, playPtr, 0)`.
4. **Lấy kết quả từ `MultiBattleResult`**:
   - Polling `resultHandle = callTableFn(sym.Play_get_result, playPtr, 0)`.
   - Kết quả trả về là đối tượng `game.battle.controller.MultiBattleResult`.
   - Thắng/thua: `MultiBattleResult_get_victory(resultHandle, 0)`.
   - Số sao: `MultiBattleResult_get_stars(resultHandle, 0)`.
   - Tiến trình chi tiết (máu, năng lượng từng hero/titan): `MultiBattleResult_get_progress(resultHandle, 0)`.
   - Tuần tự hóa JSON: `progressJson = readString(callTableFn(sym.DataObject_asJson, progressListPtr, 0))`.
5. **Dọn dẹp tài nguyên**:
   - `callTableFn(sym.Play_dispose, playPtr, 0)`.
   - Giải phóng bộ nhớ `free(playPtr)` và `free(lazyPtr)`.
