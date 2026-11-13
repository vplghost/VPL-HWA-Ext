# Tóm Tắt Dự Án HWA Helper

## 1. Thông Tin Chung
- **Tên dự án**: Chrome Extension Hỗ Trợ Web Game Hero Wars: Alliance
- **Tên extension**: HWA Helper
- **Website mục tiêu**: `https://www.hero-wars-alliance.com/`
- **Công nghệ nền tảng**: WXT Framework (Manifest V3), Vue 3 Composition API (`<script setup lang="ts">`), Tailwind CSS v4, TypeScript.

---

## 2. Mục Tiêu & Tính Năng Cốt Lõi

1. **Hiện Đại Hóa Giao Diện (WXT + Vue 3)**:
   - Kiến trúc module hóa dạng Single File Component (SFC) với reactive state management (`useRpcCache`, `useTroopTraining`, `useTheme`).
   - Giao diện người dùng tuân thủ 100% tiếng Anh quốc tế, hỗ trợ Dark / Light / System theme mượt mà.
2. **Dashboard & Quản Lý Binh Chủng Toàn Diện**:
   - Thống kê sinh động tài nguyên (Gold, Emeralds, Energy, World Energy, City Resources) với đồng hồ đếm ngược hồi phục theo thời gian thực.
   - Thẻ quân đội phân đoạn 3 màu trực quan (Ready, Hospital, Training).
   - Thiết lập ngưỡng Max quân đội tự động lưu trữ và dropdown chọn cấp độ tier huấn luyện (`Lv.1`–`Lv.9`).
   - Cơ chế bảo vệ và giới hạn huấn luyện thông minh: chỉ cho phép luyện vừa đủ đến ngưỡng Max (`unitsToTrain = min(26, maxTarget - currentTotal)`).
   - Nút thu hoạch quân (`Ready / Collect`), cứu chữa toàn viện (`Heal All`), đồng bộ viện binh (`Sync Healed`).
3. **Tự Động Hóa & Tối Ưu Chiến Thuật**:
   - **Auto-Gather**: Tự động phát hiện và gửi đạo quân đi đào mỏ tài nguyên (xoay vòng hoặc chọn lọc mỏ theo cấp độ).
   - **Tower Auto-Climb**: Tự động leo tháp 25 tầng, ưu tiên mua buff chỉ số và mở rương miễn phí không tốn Emeralds.
   - **Dungeon Automation**: Đánh hầm ngục tự động theo thứ tự ưu tiên nguyên tố và dừng an toàn khi Titan hy sinh.
   - **Quests One-Click Claim**: Nhận nhanh toàn bộ nhiệm vụ hàng ngày và sự kiện chỉ với một nút bấm.
4. **Giám Sát & Phân Tích Gói Tin (Network & Telemetry)**:
   - Hai chế độ phát lệnh: `Piggyback` (ẩn mình an toàn đi kèm hành động của người chơi) và `Direct` (phát lệnh trực tiếp nhanh chóng).
   - Lắng nghe và giải mã gói tin thời gian thực qua WebSocket MQTT.
   - Quay log phiên và xuất báo cáo JSON chi tiết.

---

## 3. Tài Liệu Hướng Dẫn & Tham Khảo

- **[Review migration 2026-11-13, extension 0.10.52](MIGRATION-REVIEW-2026-11-13_10-46-35.md)**: Ma trận tương thích nhánh HTML, lỗi đã sửa, task và checklist acceptance.
- **[Quy chuẩn WXT / Vue / Tailwind](WXT-VUE-TAILWIND-CONVENTIONS.md)**: Bắt buộc đọc trước khi bổ sung UI hoặc sửa build/runtime migration. `npm run check` chạy typecheck, test và WXT build; `npm run build` tạo `dist` và không tự tăng version.

- **[Hướng dẫn cài đặt và sử dụng chi tiết](HUONG-DAN.md)**: Hướng dẫn cài đặt Node.js, lệnh build WXT (`npm run wxt:build`), dev server HMR (`npm run wxt:dev`), nạp vào Chrome và chi tiết từng tab tính năng.
- **[Phân tích log API mẫu](PHAN-TICH-API-LOG.md)**: Các nhóm dữ liệu RPC game đã quan sát được và cấu trúc payload.
- **[Báo cáo RPC làm thay đổi số liệu](RPC-NUMERIC-CHANGE-REPORT.md)**: Danh mục các sự kiện RPC làm thay đổi kho đồ, tài nguyên, tướng, titan.
- **[Chi tiết cơ chế tự động đánh hầm ngục](dungeon-automation.md)**: Thuật toán chọn cửa và cơ chế bảo vệ máu Titan.
- **Các bảng snapshot**: [Danh sách Heroes](HEROES.md), [Danh sách Items](ITEMS.md), [Danh mục Titans & đội hình](DATA-CATALOG.md).
- **[Nguồn CDN Asset & Bảng Tên](CDN-ASSETS.md)**: Cách trích xuất và cập nhật tên hiển thị, ảnh đại diện từ CDN game.
