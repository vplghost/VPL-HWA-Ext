# Phân tích log API ngày 2026-11-01

## Phạm vi và cách đọc

Nguồn là `temp/tracking-data/hwa-api-2026-11-01_latest.json`, ghi trong khoảng **09:18:19–09:19:23 UTC**. Đây là một phiên quan sát ngắn, không phải danh mục đầy đủ API của game. File đã lọc là `temp/tracking-data/hwa-api-2026-11-01_latest_filtered.json`; cả hai nằm trong `temp/` và bị Git bỏ qua. Báo cáo chỉ nêu tên endpoint, tên RPC và tên trường; không sao chép giá trị định danh, token, nội dung chat/mail hoặc dữ liệu giao dịch.

| Nhóm | Số request | Xử lý |
| --- | ---: | --- |
| Nexters analytics (`analytics.nextersglobal.com`) | 111 | Loại |
| AppsFlyer (`wa.appsflyersdk.com`, `websdk.appsflyersdk.com`) | 6 | Loại; gồm cả manifest SDK đo lường |
| Google Analytics/Ads (`google.com` collect, `google-analytics.com`, `googleadservices.com`, DoubleClick) | 10 | Loại |
| RPC game (`api.hero-wars-alliance.com/api/rpc`) | 36 | Giữ |
| SDK cửa hàng (`api.aghanim.com/sdk/v1/items`) | 15 | Giữ |
| Làm mới đăng nhập (`api.hero-wars-alliance.com/oauth/refresh`) | 1 | Giữ, đánh dấu nhạy cảm |
| **Tổng** | **179** | **127 loại, 52 giữ** |

Bộ lọc của extension nằm tại [`tracking-filter.js`](../extension/tracking-filter.js). Nó ngừng ghi request tracking mới; popup cũng ẩn chúng khi xem/xuất log cũ. Bộ lọc không chặn request mạng của game. Các endpoint Ads/Analytics mới chưa xuất hiện trong mẫu có thể cần bổ sung vào danh sách.

## Cấu trúc RPC và mức độ đầy đủ

36 request `/api/rpc` là các lô chứa tổng cộng **181 call**, thuộc **134 tên phương thức**. Cấu trúc quan sát được:

```text
requestBody:  { calls: [{ name, feature?, args, ident }, ...] }
responseBody: { results: [{ ident, result: { response, ... } }, ...], date }
```

`ident` ghép call với result tương ứng; cả 181 call trong mẫu đều có result. Bảy result còn chứa thông báo cập nhật phụ như `billingsUpdate`, `quests`, `liveOps_*` hoặc `magicTower_completion`, nên khi lập bộ phân tích không nên chỉ đọc `result.response`. Cả 36 cặp body đều đọc được và không bị cắt trong file mẫu. Mọi request được giữ có mã HTTP 200, nhưng điều đó không chứng minh từng hành động trong game đã thành công.

## Dữ liệu hữu ích để phát triển tính năng

| Nhóm | RPC/endpoint tiêu biểu | Trường và cấu trúc quan sát được | Hướng sử dụng |
| --- | --- | --- | --- |
| Hồ sơ và tài nguyên | `userGetInfo`, `user_getClanInfo`, `userActivityMarkers_getKeyValues` | `userGetInfo` có `level`, `serverId`, `clanId`, `clanRole`, `starMoney`, `gold`, cùng trường định danh cá nhân | Hồ sơ cục bộ, mức tài nguyên; cần tránh đưa định danh vào tài liệu/log công khai |
| Hero và nâng cấp | `heroGetAll`, `artifact_getAll`, `skin_getAll`, `rune_getAll`, `heroStatsBonus_getAll`, `heroWay_getAll` | `heroGetAll` là map **59 hero**, mỗi entry có `level`, `star`, `power`, `skills`, `skins`, `artifacts`, `slots`; `artifact_getAll` là map **79 entry** | Cache hero, so sánh sức mạnh và mức nâng cấp; khóa map là ID, không phải tên hiển thị |
| Titan và đội hình | `titanGetAll`, `titan_artifactGetCounters`, `teamGetAll`, `battle_teamGetClient` | `titanGetAll` là map **20 titan** với `level`, `star`, `power`, `skills`, `artifacts`; `teamGetAll` có **18 chế độ** như `arena`, `mission`, `clanDefence_heroes`, `clanDefence_titans`, `grand` | Xây bảng đội hình và tra cứu titan theo chế độ |
| Inventory và kinh tế | `inventoryGet`, `getInventory` (`feature=inventory`), `shopGetMany`, `offerGetAll`, `billingGetAll` | `inventoryGet` chia **12 nhóm** như `consumable`, `gear`, `fragmentHero`, `coin`, `fragmentTitan`, `fragmentArtifact`, `fragmentSkin`; `getInventory` trả `inventory.items` của một phân hệ khác; `shopGetMany` có **15 shop**, `offerGetAll` có **72 offer** | Cache vật phẩm, tính nhanh tài nguyên và lập bảng shop; hai RPC inventory cần xử lý riêng |
| Nhiệm vụ và tiến trình | `questGetAll`, `getDailyQuests` (`feature=quest`), `missionGetAll`, `getUserProgress` (`feature=clanVersus`), `battlePass_getAll` | `questGetAll` là mảng **38 quest** với `state`, `progress`, `reward`; `getDailyQuests` có `quests`; `getUserProgress` có `progress`, `chestNumbers` | Bảng tiến độ và nhắc việc theo trạng thái; chỉ suy ra lịch làm mới sau khi có thêm nhiều phiên log |
| Guild, chiến đấu và sự kiện | `clanBoss_getAll`, `clanBoss_getDayHistory`, `clanWarGetBriefInfo`, `getWars` (`feature=fortress`), `eventBoss_getAll`, `eventPicker_info` | `clanBoss_getAll` có `heads`, `tries`, `superTries`, `endDay`; `clanWarGetBriefInfo` có `nextWarTime`, `tries`, `hasActiveWar`; `getWars` trả `wars`, `clans` | Cảnh báo lượt đánh và thời gian kết thúc, bảng lịch sử boss/war |
| Bản đồ và đơn vị | `getMaps` (`feature=globalMap`), `getOutpostSummary`, `getUnitSummary`, `getTrainings`, `getMineSummary` | `getMaps` có `maps`; `getOutpostSummary` có `coordinates`, `mapId`, `version`; `getUnitSummary` có `squads`, `available`, `reserved`; `getTrainings` có hàng đợi và `duration` | Theo dõi đội, mỏ, huấn luyện và các mốc thời gian |
| Cấu hình, thư và chat | `settingsGetAll`, `mailGetAll`, `chatGetAll`, `chat_getPrivateChats` | `settingsGetAll` chứa tùy chọn game; `mailGetAll` có `letters`, `users` | Có thể dùng cho nhắc việc, nhưng mail/chat chứa dữ liệu cá nhân; không đưa giá trị thô vào tài liệu |
| Cửa hàng ngoài game | `GET api.aghanim.com/sdk/v1/items` | Có **15 request**, chỉ có metadata trong log hiện tại vì extension chưa lưu response body cho `GET` | Có thể liên quan danh mục cửa hàng; **chưa xác nhận schema hay nội dung**, cần quan sát GET body nếu muốn phân tích |
| Phiên đăng nhập | `POST /oauth/refresh`, `mobileLogin`, `onLogin` | Request/response đăng nhập có thể chứa token và thông tin tài khoản | Chỉ dùng để hiểu vòng đời phiên; không xuất hoặc chia sẻ body thô |

Các tên RPC trong bảng là bằng chứng về dữ liệu có mặt trong phiên này. Chức năng suy ra từ tên trường là giả thuyết để thiết kế tính năng, cần kiểm tra lại trên nhiều trạng thái tài khoản và thời điểm khác nhau.

## Ưu tiên phân tích tiếp

1. Ghép `heroGetAll`, `titanGetAll`, `teamGetAll` thành bảng sức mạnh và đội hình; kiểm tra ID tham chiếu giữa các map.
2. Ghép `inventoryGet` với dữ liệu shop/offer để lập bảng vật phẩm và tài nguyên. Giữ `getInventory` của `feature=inventory` như schema riêng.
3. Theo dõi `questGetAll`, `clanBoss_getAll` và các trường thời gian qua nhiều phiên để xác định chu kỳ cập nhật trước khi bật cảnh báo.
4. Nếu cần dữ liệu SDK cửa hàng, bổ sung thu thập response body cho `GET` có chọn lọc; log hiện tại không đủ để mô tả 15 response đó.

**Giới hạn:** Log này là ảnh chụp khoảng một phút và tối đa 500 bản ghi trong extension. Body dài hơn 524.288 ký tự hoặc log vượt ngân sách khoảng 5 MB có thể bị cắt hoặc đẩy bản ghi cũ ra ngoài. Việc lọc tracking dựa trên endpoint quan sát được; các RPC có tên như `stashClient` hoặc `getPage` vẫn được giữ vì chưa có bằng chứng chúng chỉ phục vụ đo lường.
