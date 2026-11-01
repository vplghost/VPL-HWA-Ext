# Cài đặt HWA Helper

## Yêu cầu

- Chrome có hỗ trợ extension Manifest V3.
- Node.js 20.11 trở lên để chạy lệnh build.

## Build và nạp vào Chrome

1. Tại thư mục gốc của dự án, chạy `npm run build`. Không cần `npm install` vì dự án hiện không dùng thư viện ngoài.
2. Mở `chrome://extensions`, bật **Developer mode**.
3. Chọn **Load unpacked** và trỏ tới thư mục `dist` vừa được tạo.
4. Mở hoặc tải lại `https://www.hero-wars-alliance.com/`. Phần tử `#header` sẽ được ẩn.

Sau khi sửa mã, chạy lại `npm run build`, nhấn **Reload** tại thẻ extension trong `chrome://extensions`, rồi tải lại trang game. `npm run check` chạy kiểm thử và build.

Kiểm tra số phiên bản trong popup sau khi reload; bản **0.4.0** hiển thị tên tiếng Anh của heroes, titans và phần lớn items từ bảng locale CDN đã đóng gói. Nút cạnh tên **HWA Helper** mở giao diện trong một tab trình duyệt. Bản này vẫn có các tab dữ liệu game, công tắc theo dõi/ghi log, lọc request đo lường và giữ POST body tối đa 524.288 ký tự. Bản ghi đã tạo trước khi cập nhật vẫn chỉ có metadata và không thể bổ sung body về sau. Có thể dùng **Xóa log**, sau đó thực hiện lại thao tác trong game và xuất JSON mới để kiểm tra.

## Xem log API

Nhấn biểu tượng HWA Helper trên thanh công cụ. Tab **Log** hiển thị 50 request gần nhất và tổng số request đang lưu. Trong tab này, **Xuất JSON** tải toàn bộ bản ghi hiện có; **Xóa log** xóa chúng khỏi Chrome. Dữ liệu được lưu cục bộ trong `chrome.storage.local`, tối đa 500 bản ghi mới nhất.

Extension không ghi request tới các endpoint analytics, AppsFlyer và Google Ads/Analytics đã xác định từ log mẫu. Popup cũng loại chúng khỏi bản xuất JSON của log cũ. Tên file xuất dùng giờ địa phương theo mẫu `hwa-api-YYYYMMDDHHmm.json`; nếu xuất nhiều lần trong cùng một phút, file sau có hậu tố `-2`, `-3`, v.v.

## Các tab dữ liệu và cache

Popup có các tab **Heroes**, **Items**, **Titans**, **Teams**, **Khác** và **Log**. Tab Heroes hiển thị soul stone đang có / số cần để nâng lên bậc sao kế tiếp, lấy từ inventory và bảng giá nâng sao của asset game; khi chưa có snapshot inventory, số đang có hiện `—`. Hero 6 sao hiện `Tối đa`. Tab Teams hiển thị cả ID lẫn tên, tách từng đội lồng nhau thành dòng riêng. Bảng cache tự cập nhật khi trang game thực hiện RPC tương ứng; mỗi tab cho biết thời điểm snapshot gần nhất. Tab **Khác** cho phép mở JSON của các snapshot phụ đã chọn. Cache nằm trong `chrome.storage.local` dưới khóa riêng `rpcCache`, nên **Xóa log** không xóa cache và **Xóa cache** không xóa log. Cache chỉ lưu các response RPC đã chọn, tối đa khoảng 2 MB; dữ liệu đăng nhập, chat, mail và analytics không được đưa vào cache.

Các tab Heroes, Items và Titans hiển thị thêm cột **Tên**, có thể lọc theo tên hoặc ID. Bảng tên tiếng Anh được đóng gói sẵn trong extension, không làm phát sinh request khi mở popup. ID chưa có tên xác thực vẫn được giữ lại với dấu `—` ở cột Tên. Xem [nguồn asset CDN và cách cập nhật bảng tên](CDN-ASSETS.md).

Cache tự cập nhật khi extension quan sát được RPC do game phát sinh trong quá trình sử dụng bình thường. Khi mở popup mà cache còn rỗng, extension thử nạp lại một lần từ log đã lưu cục bộ. Cả hai thao tác chỉ xử lý dữ liệu đã quan sát được; extension không gọi API game theo lịch, không gửi request để làm mới dữ liệu và không tải lại trang. Nếu log cũ đã bị đẩy khỏi giới hạn lưu trữ, cache sẽ có dữ liệu mới khi game tự phát sinh request phù hợp.

Hai công tắc trên popup được lưu qua các lần mở trình duyệt. **Theo dõi API** tắt việc thu nhận request/response và cập nhật cache/log từ request mới; bản ghi cũ vẫn xem được. **Ghi log** chỉ tắt lưu log thô; nếu Theo dõi API còn bật, các RPC hữu ích vẫn cập nhật cache. Khi mở trang, hook chờ cài đặt từ extension trước khi bắt đầu theo dõi. Thay đổi công tắc áp dụng cho request tiếp theo; request đang xử lý khi tắt có thể bị bỏ qua. Lần nạp cache từ log cục bộ khi cache rỗng không phụ thuộc trạng thái Theo dõi API.

Các bảng tài liệu có thể được tạo lại từ một file log đã xuất bằng `npm run docs:data -- <đường-dẫn-log.json>`. Chúng chứa trạng thái của tài khoản tại thời điểm ghi, không phải danh mục chính thức; kiểm tra trước khi commit.

Tên hiển thị lấy từ [locale CDN đã xác minh](CDN-NAMES.md) và được đóng gói trong extension. ID chưa có tên hiện `—`; khi có log `indexGet` mới, chạy `npm run names:update -- <đường-dẫn-log.json>` rồi build lại. Extension không tải locale trong lúc sử dụng.

Mỗi bản ghi có thời điểm, phương thức, endpoint, kiểu gọi (`fetch` hoặc `xhr`), mã HTTP nếu có, thời lượng (ms) và kết quả. Với `POST`, popup và file JSON còn chứa `requestBody` và `responseBody` khi dữ liệu có thể đọc dưới dạng văn bản; nhấn **Request / Response data** trong popup để xem. Mỗi body giữ tối đa 524.288 ký tự; trường `requestBodyTruncated` hoặc `responseBodyTruncated` cho biết dữ liệu đã bị cắt. Body nhị phân, stream không đọc được và response không thể truy cập có giá trị `null`. Ngoài giới hạn 500 bản ghi, log được giữ dưới khoảng 5 MB bằng cách bỏ các bản ghi cũ nhất. Bản ghi cũ đã bị cắt không thể khôi phục từ extension.

Query string, fragment, header và cookie không được ghi trực tiếp, nhưng POST body có thể chứa thông tin nhạy cảm. Endpoint cũng có thể chứa định danh trong đường dẫn; kiểm tra file JSON trước khi chia sẻ. Dữ liệu này chỉ phục vụ khảo sát sơ bộ; mã trạng thái hoặc thời lượng có thể không chính xác tuyệt đối trong mọi trường hợp.

Extension chỉ hoạt động trên `https://www.hero-wars-alliance.com/*` ở khung trang chính. Các request từ iframe, WebSocket, `sendBeacon`, resource của trình duyệt và request xảy ra trước khi script được nạp không nằm trong log. Hook chạy trong JavaScript của trang game nên trang có thể thay thế hook hoặc gửi bản ghi giả; không dùng log này làm nguồn dữ liệu bảo mật.
