# Auto-gathering thông minh

Tài liệu yêu cầu và theo dõi triển khai. Trạng thái chuẩn: `@doc/specs/smart-auto-gathering` trong Knowns. Người dùng đã yêu cầu tạo task, thực hiện tuần tự và commit ngày 2026-11-14.

## Phạm vi và nguyên tắc

- Chỉ hoạt động khi **Auto-Gather Automation**, tùy chọn **Smart gathering** và RPC chung đều bật. Giữ chế độ cũ để có thể quay lại.
- Không thay đổi thao tác gather thủ công. Tối đa một quyết định thay đổi đội tại một thời điểm; chờ phản hồi game, không coi gửi lệnh là thành công.
- Trạng thái runtime, mine cần quay lại và yêu cầu đang chờ gắn với account; đổi account không dùng lại trạng thái cũ.
- Thứ tự ưu tiên: tránh nguy hiểm (khi có dữ liệu xác thực) → queue do người dùng start → Priority Rally Auto Join → quay lại mine gián đoạn → daily quest → xoay vòng thông thường.
- Khi thiếu dữ liệu, hiển thị lý do chờ; không tự coi trường thiếu là 0. Giữ slot trong khi đội đang về; chỉ dùng lại sau snapshot march và unit xác nhận.

## Yêu cầu có thể kiểm chứng

### SG-1 — Chọn mine gần nhất và còn hơn một giờ

Thêm lựa chọn **Nearest · estimated >1h** cho Preferred Mine Level. Tìm các level 1–10 của resource cần gather, so sánh khoảng cách Euclid từ outpost. Xác minh mine bằng `getMineById` và dùng resourceAmount hiện tại ÷ gatheringSpeedPerMinute cấu hình × 60 để ước tính giây. Chỉ nhận khi **>3600 giây**, không nhận đúng 3600. Người dùng đã cho phép dùng thời lượng ước tính; buff và thay đổi mine có thể làm thời lượng thực khác đi.

Không suy ra level từ resourceAmount. Mỗi search giữ config, map, center và thời điểm; bỏ mine đang có squad và dữ liệu khác map/account. Tìm lần lượt từng level vì reply search không có config của từng mine. Không tìm vô hạn khi không có ứng viên.

### SG-2 — Daily quest và xoay vòng

Khi `mineType=rotate`, đầu ngày game ưu tiên **food → iron → stone → wood**. Mục tiêu là **ceil(mốc cuối chain × 1,02)**, không cộng các mốc; người dùng đã xác nhận. Cấu hình đã xác minh: food/wood 255000, stone 51000, iron 15300.

Chỉ dùng quest snapshot thuộc ngày game hiện tại (reset từ server). Không kết luận hoàn thành toàn chain từ việc hoàn thành mốc đầu. Ước lượng đang gather là lower bound, tránh cộng trùng với progress server. Khi đủ mục tiêu và còn resource khác chưa đủ, recall squad thích hợp để chuyển resource. Không tạo thêm squad trùng resource đã có đội đang đi/đang gather. Sau full chain, quay lại vòng thường. Snapshot cũ qua reset phải refresh trước khi ra quyết định.

### SG-3 — Queue raid/monster

Khi start queue và cần slot hoặc heroes đang gather, recall một squad gather phù hợp gần base nhất. Nếu đội được chọn có heroes cụ thể, không recall đội không giải phóng được heroes đó. Chờ đội thực sự về và refresh roster trước khi start queue; trong toàn bộ thời gian queue chưa terminal, không tự gửi gather mới.

Giữ mine bị gián đoạn trong danh sách quay lại. Sau queue hoàn thành hoặc người dùng cancel, chờ các đội đã gửi về trước khi gather lại. Không tự hủy rally/monster đã xuất phát. Lỗi recall/dispatch phải hiển thị và dừng yêu cầu hiện tại, không gửi lặp vô hạn.

### SG-4 — Priority Rally Auto Join

Giữ nguyên các điều kiện auto-join hiện có. Chỉ khi hết slot và có squad gather với **ETA ước tính <29 giây** thì recall một đội để nhường chỗ. ETA dùng tọa độ và tốc độ return trong cấu hình game (người dùng cho phép); không dùng thời gian gather còn lại làm thời gian về.

Rally phải còn đủ cửa sổ chờ ETA + biên dispatch. Sau recall dùng route trả về thật, refresh march/unit và kiểm tra lại rally trước join. Rally đã start/full/expired thì bỏ yêu cầu join, không recall thêm. Khi raid trở về, ưu tiên mine đã gián đoạn.

### SG-5 — Quay lại mine

Chỉ ghi mine gián đoạn sau recall thành công. Trước quay lại dùng `getMineById`, bỏ mine cạn/không còn truy cập được. Mine cũ được miễn điều kiện >1h, nhưng vẫn cần còn tài nguyên và RPC attackMine được game chấp nhận. Không đánh dấu resume thành công trước phản hồi attackMine.

### SG-6 — Tránh tấn công và hospital

Hospital trống = **max(0, tổng sức chứa các Infirmary − tổng troops bị thương)**, theo xác nhận của người dùng. Nếu một dữ liệu đầu vào thiếu thì capacity còn trống là chưa biết.

Khi có dữ liệu xác thực về đội địch tấn công đúng mine đang gather và tổng troops bị thương vượt 50% tổng sức chứa Infirmary, recall đúng squad một lần trong **0 < ETA va chạm ≤10 giây**. Sau khi về base thì gather tiếp theo các ưu tiên trên. Đã xác minh trigger bằng hai capture `hwa-game-record-202611141920_firstattack.json` và `hwa-game-record-202611141923_under_attack2.json`: RPC `getIncomingMarches` hỗ trợ load giữa attack; MQTT `marchAttackDetected` hỗ trợ nhận từ đầu. Impact = startedAt + durationMs; lịch recall tại impact−10s, hết hạn tại impact. Giữ RPC mode chung; Piggyback cần có RPC game trong cửa sổ này.

## Bằng chứng và thông tin cần bổ sung

| ID | Thông tin | Nguồn / trạng thái | Người dùng cần bổ sung |
|---|---|---|---|
| E1 | Mine search và recall RPC | api/world-map-rpc-contracts; search trả mineId + coordinates; recall trả route | Không |
| E2 | Thời lượng/amount gather đang chạy | getMineSummary có startedAt, plannedDurationMs, plannedGatheredResourceAmount | Không |
| E3 | Full chain daily | Remote quest + questChain, transferProgress=true; mốc cuối ×1,02 đã chốt | Không |
| E4 | Thời lượng mine mới | Cấu hình globalMapMine + getMineById; cho phép ước tính | Không |
| E5 | ETA return trước recall | Cấu hình route speed + tọa độ; cho phép ước tính | Không |
| E6 | Incoming attack: mine, attacker, route/version, impactAt và terminal events | Đã xác minh RPC + MQTT từ hai capture 19:20/19:23; xem @doc/api/mine-incoming-attack-and-timed-withdrawal | Không còn thiếu capture |
| E7 | Hospital | Metadata Infirmary 162/174/175 hash-verified; cộng dồn capacity từng level, trừ injuredUnits; không cộng trùng healing queue | Có thể đối chiếu UI khi thử live |

## Tiêu chí nghiệm thu và kịch bản

- AC-1: SG-1…SG-6 có task, trạng thái và yêu cầu bổ sung cụ thể.
- AC-2: Daily chọn đúng thứ tự, target và biên 2%; không cộng trùng, không dùng quest hôm qua, không tạo resource trùng; thiếu dữ liệu hiển thị chờ.
- AC-3: Queue chỉ start sau khi slot/heroes đã về thật; auto-gather dừng trong queue và quay lại mine sau terminal.
- AC-4: Nearest chọn gần nhất trong ứng viên estimated >3600s; không nhận 3600s; mine cũ được miễn threshold.
- AC-5: Auto-join không recall ở 29s hoặc ETA không biết; kiểm tra lại rally sau khi về, không recall/join trùng.
- AC-6: Defense cần đủ owner/mine/ETA/capacity; chỉ recall trong [impact−10s, impact), đúng squad giữ mine và một lần cho mỗi attack; dữ liệu thiếu/stale phải refresh.

Kịch bản kiểm thử: RPC tắt; smart tắt; account đổi; reset qua ngày; quest mới chỉ hoàn thành mốc đầu; hai đội cùng resource; amount/ETA thiếu; mine cạn sau search; recall bị từ chối; worker khởi động lại; queue cancel khi đội chưa về; rally full/start trong lúc recall; piggyback trễ; đúng 29s và 3600s.

## Kế hoạch và task

Thực thi tuần tự theo yêu cầu người dùng, không dùng sub-agent. Thứ tự hiển thị không thay cho dependency: task tài liệu chặn các task code; daily tạo nền tảng runtime cho queue và nearest; auto-join dùng cơ chế recall/resume của queue. Defense độc lập sau tài liệu; E6 đã được bổ sung và task 6 tiếp tục triển khai sau các task trước.

| Thứ tự | Task | Kết quả cần đạt | Trạng thái |
|---|---|---|---|
| 1 | VHE-MA5SJK | Chuẩn hóa mô tả, bằng chứng, AC và missing inputs | Hoàn thành |
| 2 | VHE-WBZH46 | Daily rotation, trạng thái quyết định, ngày/account | Hoàn thành |
| 3 | VHE-XXCNGQ | Nhường queue, recall/return/resume lifecycle | Hoàn thành |
| 4 | VHE-BCK7WZ | Nearest estimated >1h | Hoàn thành |
| 5 | VHE-1M0CGC | Priority auto-join <29s, quay lại mine | Hoàn thành |
| 6 | VHE-CB9VBW | Incoming attack và hospital guard | Hoàn thành với capture E6 mới |

Sau mỗi task: test theo AC, review diff, cập nhật Knowns; cuối đợt chạy typecheck/test/build, tăng version/changelog và commit. Task chờ dữ liệu giữ AC chưa hoàn thành, nêu rõ trong kết quả.

## Kết quả đợt triển khai

Bản 0.10.81: task 1–6 đã triển khai, bao gồm timed mine defense. Bật Auto-Gather Automation + Smart gathering để sử dụng. Rule hiện tại: chỉ rút khi tổng troops bị thương > 50% tổng sức chứa Infirmary; đúng 50% hoặc thấp hơn thì giữ nguyên gather. Ngưỡng này không phụ thuộc số troops của squad bị đe dọa; capacity phải biết, dương và dữ liệu còn mới.

Hai capture mới được ghi nhận tại @doc/api/mine-incoming-attack-and-timed-withdrawal, cùng SHA256, RPC/MQTT fields, giờ impact và fixture rút gọn trong tests/fixtures/mine-attacks-20261114.json. Ví dụ log đầu: Infirmary 11900+11200=23100; wounded11188; free11912, đủ cho squad4194 nên không rút theo rule.

Kiểm thử gồm late-load, MQTT từ đầu, terminal/version/replay/account guards, biên 10s/impact, hospital thiếu/đủ/unknown, recall đồng thời các mine, xác nhận return/resume và Piggyback deadline. Chưa thử trực tiếp trong tài khoản game. Piggyback cần RPC game trước impact; không cam kết gửi đúng hạn nếu không có RPC tự nhiên.

Sau defensive recall, mine cũ chỉ được ưu tiên khi đã qua impact và getChunks mới xác nhận không có người chiếm. Nếu còn enemy hoặc chưa rõ owner, helper chọn mine gather khác; không tự chuyển sang đánh PvP.

Từ 0.10.84, reload game khôi phục tọa độ base từ `getOutpostSummary`, không cần chờ mở bản đồ để nhận `getChunks`. Khi tìm mine, ưu tiên tọa độ base của account hiện tại; vị trí mine/viewport trong snapshot march không thay thế base. Nếu cấu hình tối đa 3 đội và chỉ có 1 đội đang gather, helper bổ sung tuần tự đến 3 đội khi đủ heroes/troops/slot và server đã xác nhận từng lần gửi. Chế độ RPC chung và ưu tiên raid/monster vẫn áp dụng.

Từ 0.10.86, trước khi quay lại mine gián đoạn hoặc chọn mine nearest, phản hồi `getMineById` có `gathering` sẽ khiến helper bỏ mine đó, kể cả còn nhiều tài nguyên. Nếu mine bị chiếm giữa lúc chọn và gửi, server trả `errorCode: BattleTypeMismatch` thì helper bỏ target, tạm loại mine đó 60 giây và tìm mine trống khác. Không chuyển sang PvP. Các lỗi mutation khác hiển thị mã lỗi ngay; không tiếp tục chờ như thể đã gửi quân thành công.
