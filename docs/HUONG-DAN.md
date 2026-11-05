# Cài đặt HWA Helper

## Yêu cầu

- Chrome có hỗ trợ extension Manifest V3.
- Node.js 20.11 trở lên để chạy lệnh build.

## Build và nạp vào Chrome

1. Tại thư mục gốc của dự án, chạy `npm ci` rồi `npm run build`. Tailwind CSS được biên dịch vào `dist/popup.css` trên máy phát triển; extension không tải CSS từ CDN.
2. Mở `chrome://extensions`, bật **Developer mode**.
3. Chọn **Load unpacked** và trỏ tới thư mục `dist` vừa được tạo.
4. Mở hoặc tải lại `https://www.hero-wars-alliance.com/`. Phần tử `#header` sẽ được ẩn.

Sau khi sửa mã, chạy lại `npm run build`, nhấn **Reload** tại thẻ extension trong `chrome://extensions`, rồi tải lại trang game. `npm run check` chạy kiểm thử và build.

Kiểm tra số phiên bản trong popup sau khi reload; bản **0.8.0** dùng tiếng Anh cho toàn bộ giao diện và tên asset game hiển thị. Nút cạnh tên **HWA Helper** mở giao diện trong một tab trình duyệt; trang này cuộn được khi bảng dài. Tailwind CSS được đóng gói trong extension.

## Xem log API

Nhấn biểu tượng HWA Helper trên thanh công cụ, vào tab **Log** và nhấn **Record** để bắt đầu ghi. Nhấn **Stop** để dừng; bản ghi vẫn xem và xuất được. Nhấn **Record** lần nữa bắt đầu phiên ghi mới và xóa log phiên trước. **Xuất JSON** tải toàn bộ bản ghi hiện có; nút **Xóa log** nằm trong tab Cấu hình và cũng dừng ghi. Log thô nằm trong `chrome.storage.session`, chỉ tồn tại tạm thời trong bộ nhớ trình duyệt, mất khi trình duyệt khởi động lại hoặc extension được reload/cập nhật. Không có giới hạn số bản ghi do extension đặt ra; nếu chạm hạn mức bộ nhớ phiên của Chrome, Record tự dừng và hiện thông báo để xuất log hiện có.

Extension không ghi request tới các endpoint analytics, AppsFlyer và Google Ads/Analytics đã xác định từ log mẫu. Khi Record bật, tab Log cũng ghi các gói MQTT `PUBLISH` gửi/nhận trên WebSocket `wss://emqx-hwmb-wss.nextersglobal.com/mqtt`, gồm topic, QoS và payload. Với payload JSON theo cấu trúc game đã quan sát, Log hiển thị thêm `method` và `result.type` để lọc sự kiện. Payload văn bản được giữ ở dạng UTF-8; payload nhị phân được ghi Base64. Gói `CONNECT` chứa thông tin đăng nhập không được lưu. Tên file xuất dùng giờ địa phương theo mẫu `hwa-api-YYYYMMDDHHmm.json`; nếu xuất nhiều lần trong cùng một phút, file sau có hậu tố `-2`, `-3`, v.v.

## Các tab dữ liệu và cache

Popup có các tab **Heroes**, **Items**, **Resources**, **Titans**, **Teams**, **Other**, **Log** và tab bánh răng **Settings** ở cuối. Nhấn tiêu đề cột để sắp xếp tăng/giảm; tab Log có lựa chọn sắp xếp theo thời gian hoặc thời lượng. Tab Items có dropdown nhóm bên cạnh ô tìm kiếm. Tab Resources liệt kê mọi số dư quan sát được nhưng chỉ có checkbox cho resource tăng theo thời gian. Các resource chọn hiện dưới Energy bằng icon và màu riêng; rê chuột để xem tên và nguồn cập nhật. Energy và World Energy đã cố định trên header nên không có checkbox riêng. Tab Heroes hiển thị soul stone đang có / số cần để nâng sao; hero 6 sao hiện `Max`. Cột Star của Heroes và Titans dùng các icon sao màu trắng, xanh lá, xanh, tím, cam kèm shadow. Tab Teams hiển thị cả ID lẫn tên, tách từng đội lồng nhau thành dòng riêng.

Tab **Settings** chứa công tắc **Monitor API** và hai nút **Clear cache**, **Clear log**. **Record / Stop** và **Export JSON** nằm ở tab Log. Cache nằm trong `chrome.storage.local` dưới khóa riêng `rpcCache`, nên xóa log không xóa cache và ngược lại. Cache chỉ giữ các response RPC đã chọn, tối đa khoảng 2 MB; dữ liệu đăng nhập, chat, mail và analytics không được đưa vào cache.

Góc phải của header hiển thị Energy và World Energy bằng biểu tượng. Energy lấy từ `userGetInfo.refillable[id=1]` hoặc `refillableGetAll.refillables[refillableId=1]` khi có; World Energy lấy từ `refillableGetAll.refillables[refillableId=2]`. Energy tự hồi 1 điểm mỗi 6 phút, tối đa `60 + team level` (riêng level 1: 60); header hiện số hiện tại / mức tối đa và đồng hồ `+1 in MM:SS`. World Energy tự hồi 1 điểm mỗi 5 phút, tối đa 200. Số vượt mức hồi tự nhiên do phần thưởng/mua vẫn được giữ; snapshot API mới luôn thay thế ước tính cũ. Skill Points hồi 1 điểm mỗi 5 phút, tối đa 20 theo cấu hình hiện quan sát được. Đồng hồ trên popup cập nhật mỗi giây. Bên phải tên extension hiện tên account từ `userGetInfo.name`; trước hai số Energy là thời gian building và research còn lại dạng `giờ:phút` lấy từ `getSummary.queues`. Khi chưa quan sát được dữ liệu hoặc không có hàng đợi đang chạy, hiện `—`.

Resources lấy số dư Gold, Emeralds và refillables từ `userGetInfo`; World Energy và refillables của bản đồ từ `refillableGetAll`; nguyên liệu, speedup, teleporter, lootbox từ `getInventory:inventory`; và các nhóm coin/scroll/consumable khi `inventoryGet` có dữ liệu. Checkbox chỉ xuất hiện ở refillable có quy tắc hồi xác minh và nguyên liệu có nhà sản xuất tự động (Elarite Shards, Iron, Stone, Wood, Food). Số dư kho nguyên liệu chỉ cập nhật khi game trả API mới sau thu hoạch, không cộng giả sản lượng chưa thu. ID chưa có tên xác minh hiện dưới dạng loại và ID. Lựa chọn checkbox được lưu trong `chrome.storage.local` dưới khóa `resourceSelection`; lựa chọn cũ không đủ điều kiện sẽ không hiện trên header. Cache chỉ giữ số lượng, mốc hồi cần thiết, tên account và thời gian hàng đợi; không lưu các định danh tài khoản từ `userGetInfo` vào phần snapshot này.

Các tab Heroes, Items và Titans hiển thị thêm cột **Tên**, có thể lọc theo tên hoặc ID. Bảng tên tiếng Anh được đóng gói sẵn trong extension, không làm phát sinh request khi mở popup. ID chưa có tên xác thực vẫn được giữ lại với dấu `—` ở cột Tên. Xem [nguồn asset CDN và cách cập nhật bảng tên](CDN-ASSETS.md).

Cache tự cập nhật khi extension quan sát được RPC do game phát sinh trong quá trình sử dụng bình thường, ngay cả khi chưa nhấn Record. Khi mở popup mà cache còn rỗng, extension thử nạp lại một lần từ log tạm trong phiên hiện tại. Cả hai thao tác chỉ xử lý dữ liệu đã quan sát được; extension không gọi API game theo lịch, không gửi request để làm mới dữ liệu và không tải lại trang. Nếu chưa có snapshot, mở màn hình tương ứng trong game để game phát sinh RPC.

Công tắc **Theo dõi API** được lưu qua các lần mở trình duyệt. Khi tắt, extension không thu nhận request/response và không cập nhật cache hoặc log mới; bản ghi trong phiên vẫn xem được. Nhấn **Record** sẽ bật Theo dõi API nếu trước đó đã tắt. Khi mở trang, hook chờ cài đặt từ extension trước khi bắt đầu theo dõi. Thay đổi công tắc áp dụng cho request tiếp theo; request đang xử lý khi tắt có thể bị bỏ qua. Lần nạp cache từ log phiên khi cache rỗng không phụ thuộc trạng thái Theo dõi API.

Các bảng tài liệu có thể được tạo lại từ một file log đã xuất bằng `npm run docs:data -- <đường-dẫn-log.json>`. Chúng chứa trạng thái của tài khoản tại thời điểm ghi, không phải danh mục chính thức; kiểm tra trước khi commit.

Tên hiển thị lấy từ [locale CDN đã xác minh](CDN-NAMES.md) và được đóng gói trong extension. Ba mục còn ký tự Cyrillic trong asset `en.json.gz` đã được chuẩn hóa sang tiếng Anh trong script sinh bảng tên. ID chưa có tên hiện `—`; khi có log `indexGet` mới, chạy `npm run names:update -- <đường-dẫn-log.json>` rồi build lại. Extension không tải locale trong lúc sử dụng.

Mỗi bản ghi có thời điểm, phương thức, endpoint, kiểu gọi (`fetch` hoặc `xhr`), mã HTTP nếu có, thời lượng (ms) và kết quả. Với `POST`, popup và file JSON còn chứa `requestBody` và `responseBody` khi dữ liệu có thể đọc dưới dạng văn bản; nhấn **Request / Response data** trong popup để xem. Mỗi body giữ tối đa 524.288 ký tự; trường `requestBodyTruncated` hoặc `responseBodyTruncated` cho biết dữ liệu đã bị cắt. Body nhị phân, stream không đọc được và response không thể truy cập có giá trị `null`. Bản ghi đã bị cắt không thể khôi phục từ extension.

Query string, fragment, header và cookie không được ghi trực tiếp, nhưng POST body có thể chứa thông tin nhạy cảm. Endpoint cũng có thể chứa định danh trong đường dẫn; kiểm tra file JSON trước khi chia sẻ. Dữ liệu này chỉ phục vụ khảo sát sơ bộ; mã trạng thái hoặc thời lượng có thể không chính xác tuyệt đối trong mọi trường hợp.

Extension chỉ hoạt động trên `https://www.hero-wars-alliance.com/*` ở khung trang chính. WebSocket MQTT được quan sát qua kết nối do JavaScript của trang chính tạo; extension không tự mở thêm kết nối hay đăng ký topic. Payload MQTT được giới hạn 128 KiB cho mỗi gói và có cờ `payloadTruncated` khi bị cắt. Kết nối tạo trong Worker hoặc trước khi hook được nạp, request từ iframe, `sendBeacon` và resource của trình duyệt không nằm trong log. Hook chạy trong JavaScript của trang game nên trang có thể thay thế hook hoặc gửi bản ghi giả; không dùng log này làm nguồn dữ liệu bảo mật.
