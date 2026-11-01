# Asset CDN và bảng tên hiển thị

## Nguồn đã kiểm tra

Log `temp/tracking-data/hwa-api-2026-11-01_latest.json` chứa response `indexGet`. Response này cung cấp `staticVersionUrl`, phiên bản, kích thước và MD5 của các asset tĩnh. Với bản game `1.292.0`, đường dẫn tìm được là:

| Asset | Nội dung | Kết quả |
| --- | --- | --- |
| `v0092/f11aa6e51569c59486b30f2d3a4415e4/locale/en.json.gz` trên `heroesmobile-a-cdn.nextersglobal.com/v/webgl/1.292.0/` | 32.290 khóa bản địa hóa tiếng Anh | Có `LIB_HERO_NAME_<id>`, `LIB_GEAR_NAME_<id>`, `LIB_CONSUMABLE_NAME_<id>` và các nhóm tên khác. |
| `v0094/f11aa6e51569c59486b30f2d3a4415e4/lib/splitlib.json.zip` trên cùng CDN | 421 file dữ liệu game | Có `hero.json`, `titan.json`, các bảng `inventoryItem_*.json`. Các bảng này chủ yếu chứa ID, chỉ số, biểu tượng; tên tiếng Anh nằm trong locale. |
| `config/legacyLocalization_en/2f67bc575c11aaf9cf1762cbb066290f.json` trên `hwmb-remote-config-cdn.nextersglobal.com` | Chữ giao diện bổ sung | Không chứa bảng tên đầy đủ của heroes/items. |
| `cdn.hero-wars-alliance.com/assets/prod/.../en.js` | Chữ của launcher web | Không chứa tên heroes/items. |

`indexGet` còn trả `locale` và `lib` ngay trong response RPC; các URL locale/lib không nhất thiết xuất hiện thành request `fetch`/XHR trong log extension vì game Unity có cơ chế tải tài nguyên riêng. Không suy luận nội dung từ tên file đơn thuần: bảng tên được lấy từ `en.json.gz` và kiểm tra bằng kích thước cùng MD5 do `indexGet` cung cấp.

## Ánh xạ ID sang tên

`extension/data-names.js` đóng gói các khóa tên số từ locale. `extension/name-map.js` tra cứu theo **nhóm + ID**; cùng ID ở các nhóm item có thể mang nghĩa khác nhau. `fragmentHero` và `fragmentTitan` dùng tên trong `LIB_HERO_NAME_<id>`, `fragmentGear`/`fragmentScroll`/`fragmentArtifact` dùng tên của item gốc và thêm tiền tố `Mảnh`. Heroes và Titans dùng `LIB_HERO_NAME_<id>`.

Trong snapshot mẫu, tên khớp **59/59 heroes**, **20/20 titans**; các nhóm consumable, gear, scroll, fragmentHero, fragmentTitan, fragmentGear, fragmentScroll và fragmentArtifact cũng khớp toàn bộ ID đang có. Coin khớp 24/25. Các nhóm `border`, `patron`, `fragmentSkin` chưa có khóa tên tương ứng trong locale này; bảng vẫn hiển thị ID và dấu `—` ở cột tên. Tên hiển thị bằng tiếng Anh theo asset game, không dịch tự động.

## Cập nhật khi game đổi phiên bản

1. Chơi game bình thường với **Theo dõi API** bật để log chứa response `indexGet` hoàn chỉnh. Xuất JSON từ tab Log.
2. Chạy `npm run names:update -- <đường-dẫn-log.json>`. Script đọc URL locale từ log, tải **một** file locale từ CDN, kiểm tra kích thước/MD5 rồi tạo lại `extension/data-names.js`. Lệnh này chạy trên máy phát triển khi được yêu cầu; extension không tự tải CDN hoặc gọi API game để cập nhật tên.
3. Chạy `npm run docs:data -- <đường-dẫn-log.json>` để tạo lại bảng trong `docs`, rồi `npm run check` và nạp lại extension.

Các file tải về để phân tích trong `temp/` không được commit. Chỉ bảng tên đã lọc và mã tạo bảng được đưa vào extension. Nếu bản game đổi cấu trúc `indexGet` hoặc khóa locale, cần kiểm tra lại trước khi dùng bảng tên mới.
