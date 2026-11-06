# Nguồn tên heroes và items

## Nguồn hiện tại: 1.293

Log `temp/tracking-data/hwa-game-record-202611061625_gamestart.json` cung cấp locale tại `1.293.0/v0034/d973530195826f1575a002f97a3f30e9/locale/en.json.gz` trên CDN đã xác định bên dưới. File khớp **682.754 byte**, MD5 `588f2ad19d2ebdb65118dd56c05c362a`. Đây là nguồn hiện tại của `data-names.js`; URL, size và MD5 đều được lưu trong dữ liệu sinh ra và kiểm tra lại khi tạo Tower buffs. Script đọc được cả log mảng RPC cũ và game timeline mới. Xem [báo cáo asset 1.293](assets-1.293.0-audit.json) và [quy trình đồng bộ](ASSET-EXTRACTION.md).

Phần bằng chứng 1.292 bên dưới được giữ làm lịch sử.

## Bằng chứng asset

HAR `temp/tracking-data/api_rpc_har.json` ghi 11 request thành công (HTTP 200) tới `cdn.hero-wars-alliance.com`: `index.js`, `index.css`, `en.js`, font/logo và các file launcher, loader, framework của WebGL. `en.js` là bản dịch của trang web, không phải bảng ID của heroes/items.

Trong log RPC `temp/tracking-data/hwa-api-2026-11-01_latest.json`, response `indexGet` cung cấp `staticVersionUrl` là `https://heroesmobile-a-cdn.nextersglobal.com/v/webgl/1.292.0/` và metadata cho `locale/en.json.gz`: phiên bản `v0092/f11aa6e51569c59486b30f2d3a4415e4`, kích thước **681.890 byte**, MD5 `11eccb72982f5d7df36a550a821b0fcc`. Asset công khai tại [locale tiếng Anh 1.292](https://heroesmobile-a-cdn.nextersglobal.com/v/webgl/1.292.0/v0092/f11aa6e51569c59486b30f2d3a4415e4/locale/en.json.gz) đã khớp cả kích thước lẫn MD5 tại thời điểm kiểm tra; phiên bản này đã được thay thế bởi nguồn 1.293 ở trên.

## Cách ghép ID

Locale dùng các khóa `LIB_HERO_NAME_<ID>`, `LIB_CONSUMABLE_NAME_<ID>`, `LIB_GEAR_NAME_<ID>`, `LIB_SCROLL_NAME_<ID>`, `LIB_COIN_NAME_<ID>`, `LIB_ARTIFACT_NAME_<ID>` và `LIB_SKIN_NAME_<ID>`. ID hero cũng bao gồm titan, nên bảng titan và nhóm `fragmentTitan` dùng cùng map hero. Các nhóm mảnh khác dùng map của vật phẩm gốc và thêm tiền tố “Mảnh”. Khóa tra item luôn gồm cả nhóm và ID vì ID có thể trùng giữa các nhóm.

Script [`generate-name-map.mjs`](../scripts/generate-name-map.mjs) đọc metadata `indexGet` từ log đã xuất, chỉ tải asset HTTPS từ host CDN đã xác định, kiểm tra kích thước và MD5, rồi tạo map tĩnh. Chạy `npm run names:update -- <đường-dẫn-log.json>` để cập nhật khi có log mới phù hợp, sau đó chạy `npm run docs:data -- <đường-dẫn-log.json>` để tạo lại các bảng tài liệu. Các khóa locale chưa được giải nghĩa (`LIB_*`) bị bỏ qua. ID không có tên sẽ hiện `—` trong popup; bảng tài liệu vẫn giữ ID.

Extension chỉ đọc map đã đóng gói. Nó không tải locale khi chạy, không polling và không chủ động gọi API game để tìm tên. Map phản ánh đúng phiên bản asset ở trên; tên mới sau phiên bản đó cần tạo lại map và build extension.
