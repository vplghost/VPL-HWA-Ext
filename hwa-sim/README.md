# HWA-SIM: HỆ THỐNG MÔ PHỎNG TRẬN ĐÁNH TỰ ĐỘNG THÔNG QUA UNITY WASM

Thư mục `hwa-sim` chứa toàn bộ tài liệu kỹ thuật, mã nguồn công cụ và kế hoạch thực thi để **giả lập trực tiếp các trận đánh Hero Wars: Alliance (Dungeon Titan & Frontier)** thông qua việc nạp và gọi hàm vào WebAssembly engine (`.wasm`) của game client.

---

## 1. Mục tiêu Dự án

1. **Giả lập kết quả trận đánh trước khi gửi lệnh lên Server (Pre-battle Simulation / Probing)**:
   - Khi nhận thông tin cửa ải từ RPC `dungeonGetInfo`, hệ thống có thể chạy thử nghiệm hàng chục phương án đội hình khác nhau trên mô phỏng ngầm.
   - Chọn ra đội hình có lượng hồi máu cao nhất ($\Delta\text{HP}$ ròng tối đa) hoặc đội hình ít hao tổn máu nhất.
   - Ngăn chặn triệt để tình trạng Titan bị tử trận hoặc tụt máu sâu dẫn đến kẹt ải Dungeon.

2. **Kỹ thuật Né Thua Tuyệt Đối (Zero-Loss Abort)**:
   - Nếu kết quả mô phỏng trận đánh của đội hình hiện tại không an toàn, hệ thống chủ động bỏ qua / hủy trận (abort battle) mà không gửi RPC `dungeonEndBattle`, bảo toàn 100% sinh lực Titan.

3. **Chạy Mô phỏng Linh hoạt trên 2 Môi trường**:
   - **Môi trường In-Game (Browser Injection)**: Đánh chặn đối tượng Unity instance (`window.__hwaUnity`) đang chạy sẵn trong tab game, gọi trực tiếp vào linear memory và function table của WASM với độ trễ siêu thấp (<50ms/trận) và không tốn thêm băng thông tải assets.
   - **Môi trường Standalone (Node.js / Headless Runner)**: Tải bộ tệp `.wasm`, `.data`, `.framework.js`, `.symbols.json` về máy chủ phát triển để chạy mô phỏng ngoại tuyến (offline batch simulations, tối ưu hóa đội hình, kiểm thử hồi quy).

---

## 2. Cấu trúc Thư mục

```text
hwa-sim/
├── README.md                           # Tổng quan dự án và hướng dẫn sử dụng (file này)
├── docs/
│   ├── WASM-ENGINE-REVERSE-ENGINEERING.md   # Phân tích chuyên sâu kiến trúc WASM, IL2CPP memory & danh mục hàm
│   └── STEP-BY-STEP-IMPLEMENTATION-PLAN.md # Kế hoạch thực hiện chi tiết 6 giai đoạn triển khai
├── scripts/
│   ├── download-wasm-assets.mjs        # Script tự động tải bộ tài nguyên WASM từ CDN máy chủ game
│   └── extract-symbols.mjs             # Script phân tích symbols.json và tạo bảng ánh xạ hàm
├── config/
│   ├── unity-symbol-map.json           # Bảng ánh xạ hàm Unity/WASM đã giải mã theo phiên bản game
│   └── battle-preset-config.json       # Cấu hình các preset trận đánh (titan-dungeon, hero-war, etc.)
└── downloads/                          # Thư mục chứa các tệp tải về từ CDN game (.wasm, .data, .symbols)
```

---

## 3. Tài liệu Tham khảo

- [docs/PHAN-TICH-LOGIC-DUNGEON-VA-FRONTIER-PIUPIU.md](file:///C:/Projects/git/vplghost/VPL-HWA-Ext/docs/PHAN-TICH-LOGIC-DUNGEON-VA-FRONTIER-PIUPIU.md): Báo cáo giải mã toàn bộ logic Dungeon, Frontier, và kiến trúc Wasm battle simulation của extension PIUPIU.
- [docs/dungeon-automation.md](file:///C:/Projects/git/vplghost/VPL-HWA-Ext/docs/dungeon-automation.md): Đặc tả phân hệ tự động Dungeon và thuật toán tính toán hồi phục.
- [.knowns/docs/architecture/dungeon-battle-simulation-and-healer-mechanics.md](file:///C:/Projects/git/vplghost/VPL-HWA-Ext/.knowns/docs/architecture/dungeon-battle-simulation-and-healer-mechanics.md): Dữ liệu thực chứng về phân loại Healers, ngưỡng tử trận và cơ chế checkpoint.
