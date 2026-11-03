# Tóm tắt dự án

## Thông tin chung
- Tên dự án: Chrome extension cho web game Hero Wars: Alliance
- Tên extension: HWA Helper
- Website ảnh hưởng: https://www.hero-wars-alliance.com/

## Mục tiêu cơ sở
Xây dựng web extension để hỗ trợ một số tính năng trên web game, tối ưu trình duyệt, bao gồm nhưng không giới hạn:
- Tối ưu CSS, thay đổi một số tính năng trên giao diện.
- Tự động hóa một số tính năng.
- Bật tính năng cảnh báo bằng hình ảnh / popup / windows notification.
- Hỗ trợ các tiện ích cho cá nhân như: bảng tính nhanh, cache thông tin số liệu inventory, heroes, heroes line up

## Một số lưu ý
- Các tài liệu cho người dùng đầu cuối được lưu trong thư mục "docs" dưới định dạng .md.

## Bắt đầu sử dụng

Xem [hướng dẫn cài đặt và sử dụng](HUONG-DAN.md) để build, nạp extension vào Chrome và xem log API.

Xem [phân tích log API mẫu](PHAN-TICH-API-LOG.md) để biết các nhóm dữ liệu game đã quan sát được và giới hạn của bản ghi.

Xem [báo cáo RPC làm thay đổi số liệu](RPC-NUMERIC-CHANGE-REPORT.md) để tra các sự kiện được extension nhận diện có thể làm thay đổi items, resources, heroes, titans và các số liệu liên quan.

Các bảng snapshot từ log: [heroes](HEROES.md), [items](ITEMS.md), [titans, đội hình và nhóm khác](DATA-CATALOG.md).

Nguồn và cách xác minh tên hiển thị: [locale CDN](CDN-NAMES.md).

Xem [nguồn asset CDN và phương pháp ánh xạ tên](CDN-ASSETS.md) để biết cách hiển thị tên heroes/items và cập nhật bảng tên khi game đổi phiên bản.
