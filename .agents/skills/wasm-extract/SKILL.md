---
name: wasm-extract
description: Quy trình dịch ngược, phân giải Table Index, kiểm thử tương tác qua Native Bridge, và tạo thư viện wrapper TypeScript cho các hàm Unity WebGL IL2CPP.
---

# WASM Extract: Unity WebGL Reverse Engineering, Verification & TypeScript Wrapper Generation

Skill này hướng dẫn quy trình tiêu chuẩn từng bước để dịch ngược (reverse engineering), phân giải địa chỉ bảng hàm WebAssembly, kiểm thử tương tác trực tiếp với Unity WebGL Engine qua Chrome Native Messaging Bridge, và đóng gói thành các thư viện wrapper TypeScript (`.ts`) an toàn cho extension.

---

## 1. Tổng Quan Kiến Trúc Unity WebGL & WebAssembly

Trong Unity WebGL (biên dịch từ C# qua IL2CPP sang WebAssembly):
1. **Mã nguồn C#**: Được chuyển đổi thành C++ code qua IL2CPP, sau đó Emscripten biên dịch thành binary `build.wasm`.
2. **`symbols.json`**:
   - Ánh xạ tên phương thức C# sang **WASM Function Index** trong Code Section (Section 10).
   - **Lưu ý cốt lõi**: Function Index **KHÔNG PHẢI** là Table Index trong `WebAssembly.Table`.
3. **`WebAssembly.Table` (Bảng Hàm Gián Tiếp)**:
   - Nạp các con trỏ hàm tại runtime thông qua Element Section (Section 9) của file WASM.
   - Mọi lệnh gọi gián tiếp từ JavaScript vào engine qua `table.get(index)(...)` **bắt buộc** phải sử dụng **Table Index**, không được dùng trực tiếp Function Index từ `symbols.json`.

---

## 2. Quy Trình 4 Bước: Từ Khảo Sát Đến Thư Viện Wrapper

```text
[Bước 1: Phân Tích & Phân Giải Ký Hiệu]
       │
       ├── symbols.json ──> Tra cứu tên Class/Method
       ├── build.wasm (Sec 1/3) ──> Giải mã chữ ký hàm (Arity & Types)
       ├── build.wasm (Sec 9) ──> Ánh xạ Function Index -> Table Index
       └── build.wasm (Sec 10) ──> Disassemble call sites để xác định đối số
       │
       ▼
[Bước 2: Kiểm Thử Tương Tác Qua Native Messaging Bridge]
       │
       ├── Host REPL: http://127.0.0.1:9876 (POST /eval)
       ├── Quét Class descriptor động (Il2CppClass* metadata)
       ├── Thử nghiệm từng bước độc lập (Step-by-step probe)
       └── Bắt lỗi & chẩn đoán (Trap vs Managed Exception)
       │
       ▼
[Bước 3: Xây Dựng & Kiểm Thử Luồng Dữ Liệu Hoàn Chỉnh]
       │
       ├── Chuỗi String: forgeString (System.String)
       ├── Cấu trúc Input: LazyDataObject bọc SimpleJSON.JSONObject
       ├── Thực thi: Instance allocation -> Ctor -> Start -> Poll Result
       └── Trích xuất: MultiBattleResult -> DataObject_asJson
       │
       ▼
[Bước 4: Đóng Gói Wrapper TypeScript (.ts)]
       │
       ├── SafeTableCaller: Tự động đệm tham số tránh signature trap
       ├── Quản lý bộ nhớ: Malloc/Free & Dispose trong khối finally
       └── Expose API TypeScript cho UI & Extension Features
```

---

## 3. Bước 1: Phân Tích Chữ Ký & Ánh Xạ Table Index

### 3.1. Phân Giải Table Index từ Element Section (Section 9)
Sử dụng công cụ `debug-bridge/resolve-symbols-table.js`:
```bash
node debug-bridge/resolve-symbols-table.js
```
Nguyên lý:
1. Đọc Section 9 (Element Section) của `build.wasm`.
2. Đọc offset bắt đầu (thường là `1`) và mảng các function index được đưa vào Table.
3. Tạo bảng tra cứu ngược `funcToTableIndexMap.get(funcIdx)` -> trả về vị trí con trỏ trong `table`.

### 3.2. Phân Tích Chữ Ký Hàm (Signature Analysis)
Sử dụng `debug-bridge/check-signatures.js`:
```bash
node debug-bridge/check-signatures.js <func_index>
```
Kiểm tra:
- Số lượng tham số (`params.length`).
- Kiểu dữ liệu (`i32`, `f32`, `i64`, `f64`).
- Tham số cuối cùng trong IL2CPP luôn là con trỏ metadata ẩn `const MethodInfo*` (truyền `0` khi gọi từ JS).

### 3.3. Disassemble Call Sites Trong Code Section (Section 10)
Khi chưa rõ kiểu đối số truyền vào constructor hay phương thức:
1. Tìm opcode gọi hàm: `0x10` (`call`) theo sau là mã LEB128 của `func_index`.
2. Trích xuất các opcode đẩy tham số vào stack ngay trước lệnh gọi:
   - `0x20` (`local.get`), `0x22` (`local.tee`), `0x41` (`i32.const`).
   - Lệnh cấp phát đối tượng: `CALL 555` (`il2cpp::vm::Object::NewAllocSpecific`).
   - Nhận diện class pointer tĩnh nạp từ địa chỉ bộ nhớ (ví dụ: `41 d0 ff e7 0a 28 02 00` -> đọc pointer tại `0x159ffd0`).

---

## 4. Bước 2: Kiểm Thử Trực Tiếp Qua Native Messaging Bridge

Cầu nối Native Messaging Bridge cho phép chạy code trực tiếp trong MAIN world của game đang chạy:

### 4.1. Khởi Chạy & Kiểm Tra Trạng Thái Bridge
```bash
# Kiểm tra trạng thái host và tab game
node debug-bridge/bridge-cli.js "({ title: document.title, hasInstance: !!window.__hwaUnityInstance })"
```

### 4.2. Thăm Dò Động Đối Tượng IL2CPP (Dynamic Probing)
Thay vì hardcode địa chỉ bộ nhớ, sử dụng hàm tìm kiếm `Il2CppClass*` qua metadata name:
```javascript
const findClassByName = (className) => {
  const maxScan = Math.min(memory.buffer.byteLength, 256 * 1024 * 1024);
  const u32 = heap.u32;
  const u8 = heap.u8;
  const cLen = className.length;
  for (let i = 1024; i < maxScan - 64; i += 4) {
    const candKlass = u32[i >>> 2];
    if (candKlass > 65536 && candKlass < memory.buffer.byteLength) {
      const namePtr = u32[(candKlass + 8) >>> 2];
      if (namePtr > 65536 && namePtr + cLen < memory.buffer.byteLength) {
        let match = true;
        for (let c = 0; c < cLen; c++) {
          if (u8[namePtr + c] !== className.charCodeAt(c)) { match = false; break; }
        }
        if (match && u8[namePtr + cLen] === 0) return candKlass;
      }
    }
  }
  return 0;
};
```

### 4.3. Phân Biệt Các Loại Ngoại Lệ
1. **`RuntimeError: function signature mismatch`**:
   - Do gọi sai Table Index (gọi nhầm hàm khác có số tham số khác).
   - Hoặc do truyền thiếu tham số so với định nghĩa WebAssembly (khắc phục bằng padding tham số với 0).
2. **`[object WebAssembly.Exception]`**:
   - Ngoại lệ do C# runtime chủ động ném (`il2cpp_codegen_raise_exception` / `NullReferenceException` / `InvalidCastException`).
   - Thường do truyền object null, sai kiểu dữ liệu input (ví dụ: truyền `NullObject` thay vì `LazyDataObject`), hoặc chưa khởi tạo cấu trúc dữ liệu con.

---

## 5. Bước 3: Mô Hình Chuẩn Bị & Chuyển Đổi Dữ Liệu

### 5.1. Tạo Chuỗi IL2CPP (`System.String`)
```javascript
const forgeString = (str, stringClassPtr, malloc, heap) => {
  const len = str.length;
  const ptr = malloc(16 + 2 * len) >>> 0;
  heap.u32[ptr >>> 2] = stringClassPtr;
  heap.u32[(ptr + 4) >>> 2] = 0;
  heap.i32[(ptr + 8) >>> 2] = len;
  const u16Start = (ptr + 12) >>> 1;
  for (let i = 0; i < len; i++) heap.u16[u16Start + i] = str.charCodeAt(i);
  heap.u16[u16Start + len] = 0;
  return ptr;
};
```

### 5.2. Đọc Chuỗi IL2CPP
```javascript
const readString = (ptr, heap) => {
  if (!ptr) return null;
  const len = heap.i32[(ptr + 8) >>> 2];
  if (len < 0 || len > 2000000) return null;
  const u16Start = (ptr + 12) >>> 1;
  let s = '';
  for (let i = 0; i < len; i += 8192) {
    s += String.fromCharCode.apply(null, Array.from(heap.u16.subarray(u16Start + i, u16Start + Math.min(len, i + 8192))));
  }
  return s;
};
```

### 5.3. Chuyển Đổi Dữ Liệu Vào Game Engine
- **JSON Parser**: Gọi `JSONNode_Parse` (Table: 133378) từ `forgeString(json)`.
- **Data Wrapper**: Cấp phát 128 bytes cho `LazyDataObject`, gán `lazyKlass` (`0x15aacd4` hoặc `findClassByName('LazyDataObject')`), sau đó gọi constructor:
  ```javascript
  table.get(sym.LazyDataObject_ctor)(lazyPtr, jsonNodePtr, 0); // Table: 274399
  ```

---

## 6. Bước 4: Mẫu Thư Viện Wrapper TypeScript (`.ts`)

Mẫu wrapper chuẩn hóa cho extension (tham khảo [src/content/interceptor.ts](file:///C:/Projects/git/vplghost/VPL-HWA-Ext/src/content/interceptor.ts)):

```typescript
export interface WasmCallContext {
  table: WebAssembly.Table;
  memory: WebAssembly.Memory;
  heap: {
    buffer: ArrayBuffer;
    u8: Uint8Array;
    u16: Uint16Array;
    i32: Int32Array;
    u32: Uint32Array;
  };
  malloc: (bytes: number) => number;
  free: (ptr: number) => void;
}

/**
 * Caller an toàn: tự động đệm đối số 0 theo đúng chiều dài chữ ký hàm trong Table
 */
export function callTableFn(table: WebAssembly.Table, index: number, ...args: any[]): number {
  const func = table.get(index);
  if (typeof func !== 'function') return 0;
  const requiredLen = func.length;
  const callArgs = args.slice(0, requiredLen);
  while (callArgs.length < requiredLen) {
    callArgs.push(0);
  }
  return (func(...callArgs) >>> 0);
}

/**
 * Wrapper thực thi hoàn chỉnh một tác vụ Unity Engine
 */
export async function executeWasmTask<T>(
  ctx: WasmCallContext,
  taskFn: (helpers: {
    call: (index: number, ...args: any[]) => number;
    forgeString: (s: string) => number;
    readString: (ptr: number) => string | null;
  }) => Promise<T>
): Promise<T> {
  // Triển khai helpers & quản lý giải phóng bộ nhớ tự động
  // ...
}
```

---

## 7. Checklist Kiểm Thử Trước Khi Release
- [ ] Chạy `resolve-symbols-table.js` để đảm bảo Table Index khớp với phiên bản `build.wasm` hiện tại.
- [ ] Xác nhận toàn bộ hàm được gọi qua `callTableFn` có cơ chế tự động đệm đối số.
- [ ] Khối `finally` luôn giải phóng các con trỏ tạm (`free(ptr)`) và gọi `dispose()` trên các đối tượng engine.
- [ ] Chạy kiểm thử hàng loạt bằng `test-batch-sim.js` trên các sample dữ liệu thực tế.
- [ ] Đảm bảo `npm test` và `npm run wxt:build` thành công 100%.
