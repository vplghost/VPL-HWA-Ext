# Titan, đội hình và các nhóm dữ liệu khác

Nguồn: `temp/tracking-data/hwa-api-2026-11-01_latest.json`. Đây là snapshot của một tài khoản, lấy từ response RPC; tên hiển thị lấy từ locale CDN đã đóng gói; nơi thiếu tên giữ ID. Không chép token, tên người chơi, chat hoặc mail.

## Titans

RPC `titanGetAll`; cập nhật lúc `2026-11-01T09:18:28.248Z`.

| Titan ID | Tên | Level | Star | Power | Current skin ID |
| ---: | --- | ---: | ---: | ---: | ---: |
| 4000 | Sigurd | 45 | 3 | 7,358 | 10,001 |
| 4001 | Nova | 45 | 4 | 8,874 | 10,002 |
| 4002 | Mairi | 40 | 4 | 7,410 | 10,003 |
| 4004 | Tydus | 40 | 2 | 3,670 | 10,044 |
| 4010 | Moloch | 45 | 3 | 7,336 | 10,005 |
| 4011 | Vulcan | 44 | 3 | 6,368 | 10,006 |
| 4012 | Ignis | 40 | 3 | 5,689 | 10,007 |
| 4013 | Araji | 45 | 3 | 6,963 | 10,008 |
| 4020 | Angus | 45 | 3 | 6,797 | 10,009 |
| 4021 | Sylva | 35 | 3 | 4,453 | 10,010 |
| 4022 | Avalon | 45 | 3 | 6,930 | 10,011 |
| 4023 | Eden | 45 | 3 | 7,088 | 10,012 |
| 4030 | Brustar | 1 | 1 | 178 | 0 |
| 4031 | Keros | 1 | 2 | 220 | 0 |
| 4040 | Rigel | 35 | 2 | 4,012 | 10,031 |
| 4041 | Amon | 1 | 2 | 219 | 0 |
| 4042 | Iyari | 31 | 2 | 3,394 | 10,018 |
| 4050 | Pallant | 43 | 3 | 6,205 | 10,062 |
| 4052 | Orm | 34 | 2 | 3,248 | 10,060 |
| 4053 | Metida | 45 | 5 | 12,539 | 10,064 |

## Đội hình

RPC `teamGetAll`; cập nhật lúc `2026-11-01T09:18:28.248Z`. Một số chế độ chứa nhiều đội lồng nhau; cột ID chỉ liệt kê các phần tử số ở lớp đầu.

| Chế độ | Số phần tử lớp đầu | ID lớp đầu |
| --- | ---: | --- |
| `mission` | 5 | 79, 72, 16, 70, 60 |
| `arena` | 5 | 4, 79, 72, 16, 60 |
| `boss_fight` | 5 | 1, 2, 64, 15, 7 |
| `magicTower` | 5 | 4, 79, 72, 16, 60 |
| `clanDefence_heroes` | 5 | 79, 72, 16, 70, 60 |
| `clanDefence_titans` | 5 | 4000, 4001, 4004, 4002, 4053 |
| `dungeon_water` | 5 | 4000, 4001, 4052, 4004, 4002 |
| `dungeon_neutral` | 5 | 4000, 4001, 4004, 4002, 4053 |
| `adventure_battle` | 5 | 70, 72, 79, 16, 60 |
| `dungeon_fire` | 4 | 4010, 4011, 4013, 4012 |
| `clan_boss` | 3 | cấu trúc đội lồng nhau |
| `brawl` | 5 | 24, 504, 72, 5, 74 |
| `dungeon_earth` | 1 | 4021 |
| `grand` | 3 | cấu trúc đội lồng nhau |
| `champClanDefence_heroes` | 3 | cấu trúc đội lồng nhau |
| `champClanDefence_titans` | 5 | 4000, 4001, 4004, 4002, 4053 |
| `clan_pvp_hero` | 5 | 60, 70, 16, 72, 79 |
| `clan_pvp_titan` | 5 | 4053, 4002, 4004, 4001, 4000 |

## Các snapshot khác

| RPC | Nhóm | Hình dạng dữ liệu quan sát | Cập nhật UTC |
| --- | --- | --- | --- |
| `questGetAll` | Nhiệm vụ | mảng 38 quest | 2026-11-01T09:18:28.248Z |
| `missionGetAll` | Màn chơi | mảng 194 mission | 2026-11-01T09:18:28.248Z |
| `shopGetMany` | Shop | 15 shop | 2026-11-01T09:18:36.817Z |
| `offerGetAll` | Ưu đãi | mảng 72 offer | 2026-11-01T09:18:36.817Z |
| `artifact_getAll` | Artifact | 79 entry | 2026-11-01T09:18:36.817Z |
| `skin_getAll` | Skin | 79 entry | 2026-11-01T09:18:36.817Z |
| `getInventory:inventory` | Inventory phân hệ khác | inventory | 2026-11-01T09:18:36.817Z |
| `clanBoss_getAll` | Clan boss | headsBestResults, heads, tries, superTries, endDay | 2026-11-01T09:18:36.817Z |
| `clanWarGetBriefInfo` | Clan war | nextWarTime, tries, hasActiveWar, nearestWarEndTime, arePointsMax | 2026-11-01T09:18:28.248Z |

## Phương pháp lấy và cập nhật dữ liệu

1. Extension quan sát `POST https://api.hero-wars-alliance.com/api/rpc`, không tự gửi RPC. Request chứa `calls[{name, feature?, args, ident}]`; response chứa `results[{ident, result.response}]`. Ghép call/result bằng `ident`.
2. Chỉ lấy response hoàn chỉnh (HTTP 200, body JSON đọc được và không bị cắt). Mỗi phương thức giữ snapshot mới nhất theo thời điểm. Các bảng heroes/items/titans/teams là trạng thái tại một thời điểm, không phải danh mục tên chính thức.
3. Trong extension, cache tự cập nhật khi game phát sinh RPC phù hợp. Khi cache rỗng, popup tự nạp lại một lần từ log cục bộ đã lưu. Extension chỉ cập nhật cache từ RPC do game tự phát sinh; không gửi RPC theo lịch, không gọi API game để làm mới dữ liệu và không tải lại trang.
4. Để làm mới tài liệu, xuất log JSON rồi chạy `npm run docs:data -- <đường-dẫn-log.json>`. Chỉ các trường đã chọn được ghi vào tài liệu; kiểm tra bảng trước khi commit vì đây là dữ liệu của tài khoản cá nhân.

Giới hạn: log hiện chưa chứa response body cho GET như `api.aghanim.com/sdk/v1/items`; dữ liệu GET đó không thể tạo thành bảng từ mẫu này.
