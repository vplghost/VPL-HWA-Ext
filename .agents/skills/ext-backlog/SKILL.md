---
name: ext-backlog
description: Quy trình tự động xử lý backlog tệp (mặc định temp/backlogs), tạo task Knowns, điều tra & sửa lỗi tuần tự, xác thực, ghi nhận kết quả và đổi tên tệp hoàn tất (done.*).
---

# Extension Backlog Processing Workflow (ext-backlog)

Skill này chuẩn hóa quy trình tiếp nhận, theo dõi và giải quyết tuần tự các yêu cầu lỗi hoặc backlog được ghi nhận dưới dạng tệp Markdown trong thư mục backlog (mặc định: `temp/backlogs`).

```mermaid
flowchart TD
    A["Quét thư mục Backlog<br/>(Mặc định: temp/backlogs)"] --> B{"Có file chưa làm?<br/>(loại trừ done.*)"}
    B -- "Không" --> C["Báo cáo: Không có backlog tồn đọng"]
    B -- "Có" --> D["Đọc nội dung & Bóc tách lỗi"]
    
    D --> E["Tạo Task Knowns: knowns task create<br/>Chuyển sang in-progress"]
    E --> F["Điều tra nguyên nhân gốc (Root Cause) & Phân tích stack trace"]
    F --> G["Triển khai bản vá (Fix Implementation)"]
    G --> H["Kiểm thử đa tầng:<br/>1. Bridge Test (nếu có)<br/>2. npm test<br/>3. npm run build"]
    
    H --> I["Ghi nhận '# Kết quả' ngay dưới '# Mô tả'"]
    I --> J["Đổi tên tệp: [filename].md -> done.[filename].md"]
    J --> K["Đánh dấu task Knowns: knowns task edit -s done"]
    K --> L["Commit thay đổi bằng kn-commit"]
```

---

## 1. Tham Số Đầu Vào

- **`BacklogDirectory`** (Tùy chọn): Đường dẫn thư mục chứa backlog.
  - **Mặc định**: `temp/backlogs` (hoặc `temp\backlogs` trên Windows).
  - Có thể truyền đường dẫn khác nếu người dùng chỉ định cụ thể.

---

## 2. Quy Trình 6 Bước Chuẩn Hóa

### Bước 1: Quét và Lọc Tệp Backlog

1. Quét toàn bộ tệp `.md` trong thư mục được chỉ định:
   ```powershell
   Get-ChildItem -Path "temp/backlogs" -Filter "*.md"
   ```
2. **Quy tắc lọc**:
   - **Bỏ qua**: Các tệp đã có tiền tố `done.` (ví dụ `done.wasm-log.md`).
   - **Chọn**: Các tệp backlog chưa xử lý (ví dụ `wasm-log.md`, `dungeon-auto.md`, ...).
   - Nếu danh sách rỗng, thông báo cho người dùng và kết thúc lượt.

---

### Bước 2: Tạo Task Knowns & Đánh Dấu In-Progress

Với mỗi tệp backlog cần thực hiện:
1. Đọc nội dung tệp backlog để nắm bắt:
   - **UI / Màn hình**: Vị trí giao diện xảy ra vấn đề.
   - **Chức năng**: Tính năng đang bị ảnh hưởng.
   - **Lỗi & Stack trace**: Chi tiết exception, error code, hoặc context dữ liệu.
2. Tạo task mới trong hệ thống Knowns:
   ```powershell
   knowns task create "<Tiêu đề mô tả ngắn gọn vấn đề/lỗi>" --plain
   ```
   *Ví dụ:* `knowns task create "Fix WebAssembly execution trap in Dungeon simulation START_BATTLE_PLAY" --plain`
3. Lưu lại Task ID trả về (ví dụ `VHE-ZJ2RFB`) và chuyển trạng thái sang `in-progress`:
   ```powershell
   knowns task edit <TASK_ID> -s in-progress
   ```

---

### Bước 3: Điều Tra Nguyên Nhân Gốc & Thực Thi Bản Vá

1. **Phân tích Stack Trace & Luồng Dữ Liệu**:
   - Đối chiếu hàm và vị trí gây lỗi trong source code (`src/`).
   - Với lỗi WebAssembly / IL2CPP: Sử dụng các công cụ trong `debug-bridge/` (`lookup-symbol.js`, `check-signatures.js`) để tra cứu Function Index, Table Index và chữ ký hàm.
   - Chú ý các bẫy phổ biến:
     - Lệch Table Index do khác Function Index.
     - Sai lệch con trỏ do ép kiểu địa chỉ lẻ hoặc vùng nhớ chưa khởi tạo (cần kiểm tra căn chỉnh `ptr % 4 === 0`).
     - Bỏ qua hàm tìm kiếm động do kiểm tra điều kiện fallback không chặt chẽ.
2. **Thực thi bản vá**:
   - Sửa đổi mã nguồn trong `src/` (hoặc các components/dialogs tương ứng).
   - Đảm bảo tính tái sử dụng và hiệu năng (áp dụng caching cho các descriptor tốn chi phí tra cứu).
   - Cập nhật đồng bộ các file test/bridge liên quan nếu có sự thay đổi về chữ ký hay cơ chế tra cứu.

---

### Bước 4: Kiểm Thử Đa Tầng (Multi-tier Verification)

Thực hiện kiểm thử theo 3 cấp độ trước khi hoàn tất:

1. **Cấp 1: Live Engine / Bridge Test (nếu lỗi liên quan tới Game Engine/WASM)**:
   - Chạy các script test thực tế qua Native Messaging Bridge:
     ```powershell
     node debug-bridge/test-real-battle.js
     node debug-bridge/test-batch-sim.js
     ```
   - Xác nhận không còn trap hay runtime exception.
2. **Cấp 2: Unit Test Suite**:
   ```powershell
   npm test
   ```
   - Đảm bảo 100% tests pass (`0` fail, không gây regression).
3. **Cấp 3: Extension Build Validation**:
   ```powershell
   npm run build
   ```
   - Xác nhận toàn bộ tệp đầu ra trong thư mục `dist/` được đóng gói và validate hợp lệ.

---

### Bước 5: Ghi Nhận Kết Quả & Đổi Tên Tệp Backlog

1. **Ghi nhận nội dung `# Kết quả`**:
   - Mở tệp backlog gốc.
   - Thêm phần `# Kết quả` **ngay bên dưới phần `# Mô tả`** (trước phần `# Lỗi` hoặc các phần khác) theo cấu trúc chuẩn:
     ```markdown
     # Kết quả
     - **Nguyên nhân cốt lõi (Root Cause)**:
       - [Mô tả chi tiết nguyên nhân gốc rễ gây ra lỗi]
     - **Giải pháp xử lý (Fix Details)**:
       - [Tóm tắt các điểm đã sửa đổi, hàm nâng cấp, logic bổ sung]
     - **Xác thực thực tế (Verification)**:
       - [Kết quả chạy live bridge test / kiểm thử thực tế]
       - [Kết quả npm test: số lượng test pass]
       - [Kết quả build extension ra thư mục dist/]
     ```
2. **Đổi tên tệp backlog**:
   - Thêm tiền tố `done.` vào tên tệp:
     ```powershell
     Move-Item "temp/backlogs/<filename>.md" "temp/backlogs/done.<filename>.md"
     ```
3. **Cập nhật Task Knowns hoàn tất**:
   ```powershell
   knowns task edit <TASK_ID> -s done
   ```

---

### Bước 6: Commit Thay Đổi Bằng `kn-commit`

Áp dụng quy trình của skill `kn-commit`:
1. Kiểm tra trạng thái git:
   ```powershell
   git status
   git diff --staged
   ```
2. Stage các tệp mã nguồn và task tracking:
   ```powershell
   git add src/ .knowns/ debug-bridge/ dist/
   ```
3. Đề xuất commit message theo chuẩn Conventional Commits:
   ```
   fix(<scope>): <tóm tắt ngắn gọn lỗi đã sửa>

   - [Chi tiết nguyên nhân và bản vá]
   - [Kết quả kiểm thử và xác thực]
   - Closes task <TASK_ID>
   ```
4. Hỏi xác nhận từ người dùng và tiến hành commit.

---

## 3. Bảng Tham Chiếu Lệnh Nhanh

| Mục đích | Lệnh PowerShell |
|---|---|
| **Liệt kê backlog chưa làm** | `Get-ChildItem temp/backlogs/*.md \| Where-Object { $_.Name -notlike 'done.*' }` |
| **Tạo task Knowns** | `knowns task create "<Tiêu đề>" --plain` |
| **Chuyển task in-progress** | `knowns task edit <TASK_ID> -s in-progress` |
| **Chuyển task hoàn tất** | `knowns task edit <TASK_ID> -s done` |
| **Đổi tên tệp xong** | `Move-Item "temp/backlogs/<file>.md" "temp/backlogs/done.<file>.md"` |
| **Chạy kiểm thử & build** | `npm test; if ($?) { npm run build }` |
