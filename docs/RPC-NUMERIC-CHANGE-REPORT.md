# Báo cáo các sự kiện RPC có thể làm thay đổi số liệu

**Ngày rà soát:** 2026-11-04
**Phạm vi:** các RPC mà HWA Helper nhận diện và dùng để cập nhật cache số liệu trong `extension/rpc-cache.js`.

## Phạm vi và cách đọc

Extension ghi nhận RPC của game theo cách thụ động, rồi chuyển response thành một trong hai loại cập nhật:

- **Snapshot:** thay thế hoặc làm mới số liệu từ response đầy đủ, ví dụ `inventoryGet`, `heroGetAll`, `titanGetAll` và `userGetInfo`.
- **Delta/action:** cộng hoặc trừ số lượng, hay cập nhật một trường cụ thể sau một hành động thành công, ví dụ nhận thưởng, mua hàng, tiến hóa hoặc dùng potion.

Các delta có token từ request `ident` để tránh áp dụng lặp khi dựng lại cache. Delta của resource bị bỏ qua nếu snapshot mới hơn hành động đó. Việc được liệt kê ở đây có nghĩa là extension có logic cập nhật cache cho loại response tương ứng; nó không khẳng định mọi RPC đều xuất hiện trong mọi phiên chơi hoặc mọi định dạng thưởng đều được nhận diện.

## Snapshot số liệu

| RPC / nguồn | Số liệu được làm mới |
|---|---|
| `userGetInfo` | Gold, Emeralds (`starMoney`), account name/level và các refillable trong response. ID refillable 1 được chuẩn hóa thành Energy; các ID khác thành `resource:refillable:<id>`. |
| `refillableGetAll` với feature `refillable` | Energy, World Energy và các world refillable; response cũng có thể cung cấp mốc refill/cap. |
| `inventoryGet` | Snapshot đầy đủ theo các nhóm inventory. Các nhóm được chiếu thành resource riêng gồm material, coin, scroll, consumable, speedup, teleporter, lootbox và patron/relic shard. |
| `getInventory` với feature `inventory` | Các resource từ danh sách inventory response; đây là projection resource, không thay cho toàn bộ snapshot `inventoryGet`. |
| `heroGetAll` | Hero roster và các trường như level, star, skills, power, XP, skins theo snapshot API. |
| `artifact_getAll`, `skin_getAll`, `rune_getAll`, `heroStatsBonus_getAll` | Snapshot các dữ liệu bổ trợ cho hero: artifacts, skins, runes và bonus stats. |
| `titanGetAll` | Titan roster và các trường như level, star, XP, power, skills/artifacts theo response. |
| `titan_artifactGetCounters` | Counter liên quan đến titan artifacts. |
| `dungeonGetInfo`, `dungeonEndBattle`, `dungeonSaveProgress` | Floor/checkpoint, prime elements, floor doors và trạng thái titan trong Titan Dungeon. Đây là trạng thái hoạt động; reward được xử lý riêng ở phần delta. |

Các snapshot khác như `magicTower_getAll`, `magicTower_briefInfo`, quest/event status, shop stock và team composition có thể thay đổi số đếm tiến độ hoặc trạng thái hiển thị, nhưng không nhất thiết là số dư inventory.

## Sự kiện tạo delta cho resource hoặc item

### Nhận thưởng và mua hàng

| RPC / điều kiện | Số liệu cache có thể đổi |
|---|---|
| `shopBuy` thành công | Trừ `cost`, cộng `reward`. Cost/reward được lấy từ response trước, sau đó mới fallback sang args của request. |
| `readAndClaimAll` | Cộng các reward nhận được từ response claim mail/reports. |
| `mailFarm` | Cộng reward cho từng letter ID trong response. |
| `quest_multiFarm`, `quest_farm`, `questFarm`, `dailyQuestFarm` | Cộng các reward được trả về trong response. |
| `completeQuest` | Dùng reward response hoặc fallback sang reward trong `questGetAll`; nếu không có reward thì đánh dấu claim cần đồng bộ lại, không tự đoán số lượng. |
| `claimChest` với feature `clanVersus` | Cộng reward theo bảng reward Guild Versus đã nạp trong extension. Nếu không có mapping cho chest thì không tạo delta reward. |
| `missionRaid` | Trừ Energy theo XP/cost được xác định từ response hoặc mission-cost data; cộng Gold nếu response raid trả Gold. |
| `missionStart`, `missionEnd` | Trừ Energy theo mission-cost data; `missionEnd` chỉ trừ cost phụ khi kết quả thắng. |
| `openLootboxChanced` thành công | Trừ số hộp mở và cộng reward items trong response. |
| `inventory_use` cho item dạng hộp có response array | Trừ consumable đã dùng và cộng các reward được parse từ response. |
| `dungeonEndBattle`, `dungeonSaveProgress` | Reward reducer hiện xử lý các nhóm `consumable`, `fragmentTitan`, `gold`, `coin`; `dungeonSaveProgress` còn cộng coin quest ở các trạng thái quest được hỗ trợ. |

Reward parser dùng chung hỗ trợ các trường dạng object như `stamina`, `gold`, `starMoney`/`starmoney`, `refillableResource`, `consumable`, `material`, `coin`, `scroll`, `gear`, `fragmentHero`, `fragmentTitan`, `lootboxChanced`, `patron`, `teleporter`, cùng một số phần thưởng dạng array. Cost parser hỗ trợ Energy, Gold, Emeralds, refillables, coin, consumable, material, gear, fragmentHero, fragmentTitan và scroll. Các key inventory/resource tương ứng được đồng bộ khi cache đã có snapshot phù hợp.

### Hành động thay đổi resource riêng

| RPC / điều kiện | Tác động |
|---|---|
| `createRally` thành công | Trừ 25 World Energy cho rally; delta chỉ áp dụng khi snapshot World Energy không mới hơn action. |
| `cancelRally` thành công | Hoàn 25 World Energy cho rally đang active, theo cùng điều kiện timestamp/dedup. |
| `alchemyUseFree` thành công | Trừ một refillable ID 62 và đánh dấu Wheel of Fortune đã dùng free spin. |
| `refillable_alchemyUseVideo` với `type: "alchemy"` thành công | Trừ một refillable ID 62; cooldown hiển thị được tính từ timestamp của request theo quan sát hiện tại. |
| `randomDraft_register` thành công | Trừ một refillable ID 60 (Draft Chip) và mở trạng thái draft. |
| `heroUpgradeSkill` thành công | Trừ một refillable ID 2 (Skill Points); đồng thời tăng skill tương ứng một cấp nếu có hero snapshot. |

## Hero

- `heroGetAll` và các snapshot bổ trợ nêu trên làm mới hero/skin/artifact/rune data theo response API.
- `heroEvolve` tăng star tối đa đến 6 và trừ fragment theo bảng cost nội bộ của extension: 20, 50, 100, 150, 300 cho các bậc 2–6 sao. Delta fragment chỉ áp dụng trực tiếp nếu có hero snapshot để xác định star hiện tại.
- `heroUpgradeSkill` tăng level skill trong cache nếu hero và skill tồn tại trong snapshot; Skill Points được xử lý như resource delta riêng.
- `skin_upgrade` tăng level skin trong `heroGetAll` nếu skin level hiện tại đã có trong snapshot.
- Lootbox/reward parser có thể cộng `fragmentHero` nếu reward trả về theo định dạng được nhận diện.

## Titan

- `titanGetAll` và `titan_artifactGetCounters` làm mới roster/counter theo snapshot.
- `titanEvolve` tăng star, trừ titan fragments và Gold theo bảng cost nội bộ cho star 2–6. Nếu response trả consumable hoặc quest changes, cache đồng bộ các trường đó. Titan `power` được ước tính bằng multiplier nội bộ khi chưa có snapshot mới, nên cần xem là giá trị dự đoán cho đến lần refresh tiếp theo.
- `inventory_use` với `libId: 20` trừ Titan Potion (consumable 20), rồi cộng XP vào titan được chỉ định bởi `params.unitId`.
- Reward dungeon và reward parser có thể cộng `fragmentTitan`; dungeon reward hỗ trợ thêm consumable, Gold và coin.
- Titan Dungeon snapshot làm mới trạng thái HP/energy được server cung cấp. Nếu response không chứa dungeon snapshot, cache giữ trạng thái hợp lệ gần nhất thay vì dựng số liệu mới từ dữ liệu thiếu.

## Resource key thường gặp

- `resource:gold`, `resource:starMoney`
- `resource:energy`, `resource:world-energy`
- `resource:refillable:<id>` và `resource:world-refillable:<id>`
- `resource:<type>:<id>` cho consumable, coin, material, gear, scroll, fragments, lootbox và loại item có mapping.

Khi delta Gold/Emerald được áp dụng, cache cũng cập nhật các bản sao trong `inventoryGet` hoặc `userGetInfo` nếu chúng đang tồn tại. Delta resource được chặn ở mức tối thiểu bằng 0; resource có refill metadata trước tiên được tính tiến trình refill đến thời điểm action.

## Giới hạn và điểm cần đối chiếu

1. **Không phải mọi thay đổi server đều có delta riêng.** Các thao tác không có handler chuyên biệt phụ thuộc vào snapshot tiếp theo để đồng bộ.
2. **Battle report claim:** `claimReward` với feature `report` hiện cập nhật trạng thái report đã claim; nhánh này không parse reward thành delta inventory. `readAndClaimAll` chỉ cập nhật số liệu khi response của nó có reward nhận diện được.
3. **Skin stones:** handler `skin_upgrade` tăng cấp skin trong hero cache nhưng không trừ số dư skin stone. Cần snapshot inventory mới hoặc handler cost chuyên biệt để bảo đảm số item này chính xác sau nâng cấp.
4. **Tower rewards:** `magicTower_*` được lưu thành session/history để hiển thị route và completion; handler hiện không chuyển reward Tower thành delta inventory.
5. **Dungeon reward coverage hẹp hơn reward parser dùng chung.** `dungeonRewardAction` hiện xử lý consumable, fragmentTitan, Gold và coin; loại reward khác cần được kiểm chứng từ trace trước khi thêm mapping.
6. **Một số cost do extension suy ra.** Hero/Titan evolution, mission cost và rally World Energy dùng bảng/config hoặc quy tắc hiện có. Nếu game thay đổi cost, delta có thể lệch cho tới khi snapshot mới thay thế.
7. **Snapshot thiếu entity làm mất khả năng áp dụng delta entity-specific.** Ví dụ tiến hóa cần snapshot hero/titan để biết star/cost; skill/skin cần snapshot hiện trạng để tăng đúng trường.
8. **Reward phụ thuộc định dạng response.** Field không nằm trong nhóm/array parser được hỗ trợ hoặc response không có reward sẽ không tự sinh item delta.

## Tham chiếu mã nguồn

- [RPC definitions, resource/reward/cost parsing và extraction handlers](../extension/rpc-cache.js#L1)
- [Resource delta, evolution, inventory use, chest và dungeon reducers](../extension/rpc-cache.js#L1680)
- [Interceptor ghi nhận API traffic](../extension/intercept.js)
- [Tên resource/item dùng trong giao diện](../extension/data-names.js)

## Đề xuất sự kiện và log records cần thu thập

Ưu tiên dưới đây dựa trên các trace đã rà soát. “Cần log” nghĩa là giữ request/response liên quan cùng snapshot trước/sau để xác nhận số liệu thực tế; không nên suy ra số dư chỉ từ tên RPC hoặc một response rỗng.

| Ưu tiên | Nhóm sự kiện cần ghi | Căn cứ từ trace đã phân tích | Nội dung cần có trong record để đối chiếu |
|---|---|---|---|
| **P0** | Claim quest/event: `completeQuest`, `quest_multiFarm`, `quest_farm`, `questFarm`, `dailyQuestFarm` và RPC claim riêng của event nếu xuất hiện | `hwa-api-202611032155_event_claim.json` (`completeQuest`, response `{}`) và `hwa-api-202611032321_claim_event.json` (`completeQuest`, response `{}`, sau đó có snapshot `userGetInfo`/`inventoryGet`). Response claim rỗng không nói item/resource nào đã đổi. | `questId`/event ID, `ident`, success/error, response reward; `questGetAll`/event state trước và sau; `userGetInfo` (Gold, Emeralds, refillables) và toàn bộ nhóm liên quan trong `inventoryGet` trước/sau. Ghi rõ reward đến từ response hay fallback snapshot. |
| **P0** | Nâng cấp skin và tiêu hao skin stone: `skin_upgrade`, `skin_getAll`, `inventoryGet` | `hwa-api-202611032318_hero_skin_stone.json` có 11 lần `skin_upgrade`; các response đều có `reward: []`, nên không cho biết lượng stone đã trừ. Trace Titan Dungeon cũng có `skin_upgrade` trả nhóm `consumable`. | Mỗi lần ghi `unitId`, `skinId`, `ident`, thời điểm, response/error; skin level và `inventoryGet` consumable/fragmentSkin liên quan trước/sau. Nếu RPC không trả cost, kèm snapshot `skin_getAll`/`inventoryGet` gần nhất và để trạng thái “cost chưa xác minh”, không tự suy ra từ số lần gọi. |
| **P1** | Titan Dungeon: `dungeonGetInfo`, `dungeonStartBattle`, `dungeonEndBattle`, `dungeonSaveProgress`, `inventory_use` | `hwa-api-202611040018_titan_dungeon.json` có reward trên battle, các lần checkpoint `dungeonSaveProgress`, dùng Titan Potion (`inventory_use`, `libId: 20`) và trận thua cuối chỉ trả `states`/`dungeonActivity`, không có `dungeon` snapshot/reward. | Ghi outcome và `stars`; floor/checkpoint; `reward`, `rewardMultiplier`, `dungeonActivity`, titan states; ID/số lượng potion dùng; snapshot `inventoryGet`, `titanGetAll`, `userGetInfo` trước/sau. Phân biệt reward trong `dungeonStartBattle` với reward xác nhận ở `dungeonEndBattle`/`dungeonSaveProgress`; ghi record cả khi thua hoặc response thiếu snapshot. |
| **P1** | Hero/Titan progression: `heroEvolve`, `titanEvolve`, `heroUpgradeSkill`, `skin_upgrade`, `inventory_use` potion | `hwa-api-202611022032_titan_evolve.json` ghi nhận `titanEvolve` trả consumable 24; các trace skin ghi nhiều lần nâng cấp nhưng không trả cost. | Trước/sau: hero/titan target trong `heroGetAll`/`titanGetAll`, `inventoryGet` fragment/coin/consumable, Gold/refillables trong `userGetInfo`; request target/skill/skin/amount; response cost, reward, consumable và error. Giữ loại cost “server trả”, “extension suy ra” hoặc “chưa biết” để phát hiện lệch bảng cost. |
| **P1** | Mail và battle report: `getRallyMobAttackResult`, `claimReward`, `readAndClaimAll`, `mailFarm` | `hwa-api-202611022011_mail_claim.json` có report response chứa `reward`, `claimReward` trả `{}`, `readAndClaimAll` trả `claimedRewards`, và `mailFarm` trả reward map gồm consumable/Gold. | Ghi report/letter ID đã làm mờ, reward preview trước claim, trạng thái `claimedReward`/`readReports`/`claimedRewards`, response claim, cùng snapshot inventory/resource trước/sau. Record riêng từng đường claim để không coi `claimReward` response rỗng là không có thưởng. |
| **P1** | Emerald Exchange / Wheel: `alchemyUseFree`, `refillable_alchemyUseVideo` (`type: "alchemy"`), `userGetInfo` | `hwa-api-202611032353_emerald_exchange.json` có `refillable_alchemyUseVideo` với `reward`/`crit`; response không nêu cooldown. | Trước/sau refillable ID 62 (amount, `lastRefill`, `boughtToday`), timestamp và result/error của roll, reward; ghi `nextDayTs` riêng là reset hằng ngày. Cần nhiều lần quan sát để xác nhận cooldown 8 giờ và phân biệt nó với daily reset. |
| **P1** | Legend Draft: `randomDraft_register`, `randomDraft_saveDefence`, `randomDraft_saveAttack`, `randomDraft_startBattle`, `randomDraft_result`, `randomDraft_getInfo` | Trace draft đã phân tích có register/picks/result; `randomDraft_result` trả `reward.draftBpExp`. Star trong draft là giá trị của trận draft, không mặc nhiên là star progression của hero sở hữu. | Ghi match/stage ID, action/result, reward và các trường rating/winstreak/progress trước/sau; refillable ID 60 trước/sau register; `questGetAll`/relevant progress nếu hoạt động draft hoàn thành quest. Tách draft hero stars khỏi `heroGetAll` để tránh cộng nhầm vào hero roster. |
| **P2** | Tower và chest: `magicTower_endBattle`, `magicTower_openChest`, response field `magicTower_completion`, snapshot `magicTower_getAll` | Tower session đã được phân tích và lưu route/reward trong session; cache hiện ghi lịch sử Tower nhưng chưa áp reward vào inventory. | Ghi floor/room, win/result, chest number, `reward`/completion fields và `inventoryGet`/resource snapshots trước/sau. Ghi riêng reward preview và reward response thực tế để không gán nhầm reward vào chest number. |
| **P2** | Shop/lootbox: `shopBuy`, `openLootboxChanced`, `inventory_use` loại hộp | `hwa-api-202611030107_shop.json` trả reward Gold 75.000 với cost 5 coin ID 1000; mail trace cũng có lootbox trong report reward. | Request shop/slot/amount hoặc box ID/amount; response cost/reward đầy đủ; inventory snapshot trước/sau cho currency, hộp và từng reward. Giữ token dedup/ident khi tổng hợp nhiều lần mở. |
| **P2** | World map/rally/gathering: `createRally`, `cancelRally`, `getRallyMobAttackResult`, các RPC bắt đầu/kết thúc gathering | `hwa-api-202611021947_rally_success.json`, `hwa-api-202611021904_gathering.json` và `...gathering_return.json` có các hành động tạo rally/gathering và trạng thái kết quả/đường về. | Ghi action success/error, rally/squad ID đã làm mờ, cost/refillable trước-sau, resource gathered/reward, report result và snapshot World Energy/material trước/sau. Tách event tạo/huỷ/hoàn thành để phát hiện double-count. |

### Record tối thiểu đề xuất

Mỗi chuỗi thay đổi nên lưu một record theo transaction/action, gồm:

1. `timestamp`, `call.name`, `feature`, `ident` và trạng thái thành công/lỗi.
2. Các args ảnh hưởng số lượng hoặc đối tượng: item/hero/titan/quest/skin ID, amount, floor, slot hoặc chest number.
3. Những trường response có ý nghĩa: `cost`, `reward`, `claimedRewards`, `progress`, `states`, `consumable`, `quests` và các trường reset/cooldown liên quan.
4. Snapshot trước/sau phù hợp: `inventoryGet`, `userGetInfo`, `heroGetAll`, `titanGetAll`, hoặc trạng thái event tương ứng. Ghi rõ snapshot nào thực sự tồn tại; không điền giá trị còn thiếu bằng 0.
5. `sourceTrace` hoặc trace filename để nối sự kiện với log gốc, cùng ghi chú nếu delta do extension suy ra thay vì server trả trực tiếp.

Chỉ ghi các trường cần thiết để đối chiếu; loại bỏ OAuth/access/refresh token, session token, chat/mail content và định danh tài khoản trước khi chia sẻ trace. Những log hiện có hữu ích làm mẫu gồm: `hwa-api-202611032155_event_claim.json`, `hwa-api-202611032318_hero_skin_stone.json`, `hwa-api-202611032321_claim_event.json`, `hwa-api-202611032353_emerald_exchange.json`, `hwa-api-202611040018_titan_dungeon.json`, `hwa-api-202611022032_titan_evolve.json`, `hwa-api-202611022011_mail_claim.json`, `hwa-api-202611030107_shop.json`, `hwa-api-202611021947_rally_success.json` và `hwa-api-202611021904_gathering*.json`.
