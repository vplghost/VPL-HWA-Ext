# Resources quan sát được trong RPC

Nguồn khảo sát: `temp/tracking-data/hwa-api-202611011829.json` và các log cùng ngày 2026-11-01. File log chứa dữ liệu tài khoản và không được commit. Bảng dưới ghi các trường có thể trích, không ghi số dư cá nhân.

| Nguồn RPC | Dữ liệu có thể trích | Cơ chế hiển thị |
| --- | --- | --- |
| `userGetInfo` | `gold`, `starMoney`, `refillable[]` (`id`, `amount`); `name` cho header | Số API gần nhất. Chỉ `refillable[id=1]` có tên chắc chắn là Energy. Các ID khác giữ dạng `Refillable #ID`. |
| `refillableGetAll:refillable` | `refillables[]` (`refillableId`, `amount`, `lastRefillAt`) | `id=2` là World Energy; `id=6` là Free Teleport. Snapshot mới thay mốc cũ. |
| `getInventory:inventory` | `inventory.items[]` (`type`, `id`, `quantity`) | Nguyên liệu, speedup, teleporter và chance lootbox; số API gần nhất. |
| `inventoryGet` | Các nhóm `coin`, `scroll`, `consumable` và các loại resource tương ứng | Số API gần nhất; tên dùng locale đóng gói khi có. |
| `getSummary:building`, `getSummary:personalResearch` | `queues[]` (`startDate`, `durationMs`) | Đếm ngược hàng đợi gần hoàn tất nhất. |

Trong log mới, `userGetInfo.refillable` có 88 ID quan sát được, gồm `1–8`, `10–45` (có khoảng trống), `50–88` (có khoảng trống) và `506–512`. `refillableGetAll` trả `2` và `6`. `getInventory` trả các nhóm `material` (ID `1–8`, `12`, `14`), `speedUpUnitTraining` (`1–3`), `speedUpUniversal` (`1–3`), `speedUpConstruction` (`1–3`), `speedUpResearch` (`1–3`), `speedUpUnitHealing` (`2`), `teleporter` (`1`) và `lootboxChanced` (15 ID). Extension trích mọi ID quan sát được trong những nhóm này; không cần thêm ID vào mã.

Tên World material `1–5` lần lượt là Elarite Shards, Iron, Stone, Wood, Food; ID `12` là Honor Marks. Tên và cơ chế hồi World Energy được đối chiếu từ `remoteConfigInit.index.configs.resourceView` và `refillableResource` trong log: World Energy (`refillableId=2`) hồi 1 điểm mỗi 5 phút, giới hạn 200. Các refillable khác không được tính tăng theo thời gian vì chưa có chu kỳ và giới hạn đáng tin cậy cho từng ID. Building trong log khảo sát có `queues=[]`, nên header hiện `—` cho đến khi game phát sinh queue đang chạy.
