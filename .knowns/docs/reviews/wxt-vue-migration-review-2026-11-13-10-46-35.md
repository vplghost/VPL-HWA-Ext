---
id: doc-f77e1d96a52276b7ff03ad4160bf8d09
title: WXT Vue Migration Review 2026-11-13 10-46-35
description: Evidence-based HTML 0.9.244 vs WXT Vue 0.10.52 migration audit, executed fixes, feature matrix and acceptance roadmap.
createdAt: '2026-11-13T03:57:57.724Z'
updatedAt: '2026-11-13T04:03:32.854Z'
tags:
  - migration
  - review
  - wxt
  - vue
---

# Review chuyển đổi HTML → WXT / Vue / Tailwind — 2026-11-13 10:46:35 +07:00

## Phạm vi và mốc đối chiếu

- Thời điểm bắt đầu: **2026-11-13 10:46:35 Asia/Saigon (UTC+07:00)**.
- Extension được review: **0.10.52**, master tại **d3cd034** trước đợt sửa này.
- Baseline HTML cuối: nhánh **HTML**, commit **12baa70**, extension **0.9.244**.
- Phiên bản sau sửa vẫn là **0.10.52**; build không tự tăng version. Đây là working tree chưa commit, không phải bản phát hành đã xác nhận.
- Task điều phối: @task-VHE-HRA25T. Nhánh HTML không bị checkout, sửa hoặc ghi đè.
- Phương pháp: so sánh git show HTML:extension/popup.js và manifest; kiểm tra SFC có logic thực chất và được App gắn vào UI; đối chiếu payload với reducer/background; test composable có mock Chrome, thực thi handler SFC, strict typecheck và kiểm tra artifact.
- Không thực hiện RPC thay đổi dữ liệu trên game thật. Chưa chứng minh pixel parity, hành vi Chrome khi service worker suspend, hoặc mọi luồng direct/piggyback/MQTT trên tài khoản thật.
- Test chỉ tìm chuỗi/ID trong SFC không đủ chứng minh tính năng hoạt động. Kết luận dưới đây phân biệt wiring tĩnh, kiểm thử hành vi và acceptance còn lại.

## Kết luận

Giao diện mới đã có phần triển khai thực chất cho đa số tính năng HTML, nhưng baseline 0.10.52 **chưa đủ điều kiện tuyên bố tương thích hoàn toàn**. Các khoảng thiếu rõ nhất là recorder Log, auto-claim/priority rally settings và unread chat; rủi ro kỹ thuật lớn nhất là artifact WXT thiếu runtime, lỗi RPC, ghi đè cache từ popup, cách ly account và xử lý kết quả bất đồng bộ.

Đợt này đã thực hiện các bản vá trong task con, giữ popup là Vue SFC, logic dùng lại trong composable/helper và Tailwind qua Vite. Runtime worker/content cũ được giữ theo hợp đồng đã kiểm chứng, đưa vào WXT qua public-asset hook; không đưa legacy DOM renderer trở lại popup.

## Ma trận tương thích chức năng

“Có” dưới đây nghĩa là có logic và wiring được đọc, không tự động có nghĩa đã chạy game thật.

| Nhóm | Baseline HTML | Vue trước sửa | Kết quả / mức chứng cứ |
|---|---|---|---|
| Dashboard resources | renderResources / renderDashboard | ResourceSummary, Header, pinning | Có; helper tests. Resource tab thiếu ticker đã sửa |
| Quân đội | renderDashboardTroops, train/heal/collect | useTroopTraining, TroopsOverview | Có; bỏ optimistic state giả khi RPC chưa thành công; test từ chối |
| Queue overview | renderMarches, action badges | QueuesOverview, Header | Có; sửa getMarches thiếu feature march |
| Daily activities | renderDashboard | ActivityGoals | Có; cần dùng canonical questGetAll và ưu tiên trạng thái Tower đã clear |
| Heroes | filter/search/sort/favorite/grid/table/export | HeroesTab + HeroDetailModal | Có; sửa skill optimistic; kiểm tra cleanup favorite listeners |
| Titans | element/favorite/evolve/sort/export | TitansTab + hover | Có; kiểm tra cleanup favorite listeners |
| Inventory/items | renderInventoryGrid, category groups | ItemsTab | Có; dropdown category tĩnh còn không liệt kê mọi nhóm hiếm, All vẫn hiển thị |
| Resources | sort/search/header pin/export/refill | ResourcesTab | Có; ticker KeepAlive và unmount đã thêm |
| Teams | renderCustomTeams, server teams | TeamsTab/useSquadTeams | Có; sửa account isolation, async stale load, capacity settings |
| Events | renderEvents, special events/Hydra/GVS | EventsTab | Có; sửa refresh dùng tên RPC sai |
| Goals | renderGoals / extractEventGoals | GoalsTab + dùng lại pure helper | Có; filters activity/resource/synergy/ready; sửa refresh |
| API/MQTT Log | renderLog / recordedEntries session record:* | LogTab đọc local apiLogs sai, search không áp dụng | Đã khôi phục session store, live/filter/sort/body/clear/export; behavioral tests |
| Settings cơ bản | theme, tab reorder/visibility, RPC policy, intercept, recorder | SettingsTab | Có; giữ global popupRpcEnabled, bổ sung strict validation |
| Auto claim | renderAutoClaim, executeAutoClaim, onOpen | Thiếu UI và on-open execution | Đã bổ sung usePopupAutomation, options, pending, claim-rewards và onOpen; mock tests |
| Priority auto join | renderPriorityAutoJoin | Thiếu controls | Đã bổ sung minLevel/team/enabled và lưu heroIds đúng team; chưa live-tested |
| Header | resources/marches/queue/status/version/open tab/dialog actions | Header | Có; timer và game monitor. Sửa refresh march feature |
| FAB / guild chat | unread count + mark-read + chat send/refresh | FAB thiếu unread/read tracking | Đã bổ sung; chat refresh bỏ double send |
| Building | renderBuildingDialog | BuildingModal | Có directory/search/filter, projected prerequisites, queue reorder/remove/clear/logs/start/complete |
| Research | renderResearchDialog | ResearchModal | Có projected building/research levels, special-resource checks, queue/log/start/complete |
| Rally | renderExperimental raid mode | RaidModal | Có teams/troops/search/start-stop queue/countdown; sửa dispatchRpc thiếu và tự bật RPC lúc mount |
| Solo monster | renderMonster | MonsterModal | Có targets/teams/troops/start-stop queue; sửa dispatchRpc thiếu và tự bật RPC lúc mount |
| Gathering | experimental mine workflow | GatheringModal | Có search/attackMine/stopMineGathering/auto-gather; giữ global RPC enable |
| Tower | renderTowerModal | TowerModal | Có 5 hero/top5/buff ordering/run/floor history; account guard và refresh canonical đã sửa |
| Dungeon | openDungeonModal | DungeonModal | Có doors/HP/energy/combat logs/reset/refresh. Auto button ẩn ở cả HTML và Vue: không tính thiếu tính năng đang mở |
| Quest detail | getDetailedQuests/renderQuestDetailDialog | QuestDetailModal | Có daily/event chains/general/reset/filter/export; claim sai RPC đã sửa |
| Campaign | renderCampaignDialog | CampaignRaidModal | Có recipe/craft/mission limits/max/loop/stop/drops; timeout pending đã sửa |
| Hero detail | renderHeroDialog | HeroDetailModal | Có switch/skills/equip/craft/farm/artifacts; không còn sửa level trước server response |
| Guild Versus | openGuildVersusModal | GuildVersusModal | Có sáu sections, chest thresholds/rewards/challenges/stack/grid; sample fallback metrics cần đợt riêng |
| Legend Draft | renderDraft / openDraftModal | DraftModal | Có opponent/timer/lineups/result/candidate display/register/refresh. Không có submit lineup trong baseline đang đối chiếu; không coi docs ý tưởng là tính năng HTML đã hoàn tất |

App.vue gắn 12 dialog và GuildChatPanel; các tab hoạt động qua TabNav/App. GatheringTab/TowerTab/DungeonTab/QuestsTab độc lập không phải navigation chính; entry component tồn tại không chứng minh người dùng truy cập được. Luồng chính tương ứng là dialog và được giữ như HTML.

## Danh sách lỗi, tác động và bản vá

| ID | Mức | Bằng chứng có thể kiểm tra | Tác động / xử lý |
|---|---|---|---|
| M01 | P1 | wxt.config.ts manifest + .output trước sửa chỉ có popup/chunks/assets | wxt:build không đủ background.js/bridge.js/intercept.js/page.css/importScripts. Đã thêm build:publicAssets hook và artifact validator |
| M02 | P1 | scripts/build.mjs trước sửa catch WXT error rồi tiếp tục | Có thể báo build thành công với legacy UI; đã bỏ fallback, chỉ đóng gói WXT output sau validate |
| M03 | P2 | build.mjs gọi bumpVersion sau bundle | check làm đổi source version và version đã bundle có thể lệch. Build không tự bump; version:bump là thao tác release riêng |
| M04 | P1 | LogTab local apiLogs vs background RECORD_PREFIX record: ở session | Log rỗng/clear sai store/export sai dữ liệu; đã sửa useRecorder |
| M05 | P1 | QuestDetailModal.claimQuest/QuestsTab vs popup-data.buildAutoClaimCalls + background whitelist | quest_claim/quest_getAll không đúng canonical contract. Đã dùng quest_multiFarm {questIds} và questGetAll |
| M06 | P1 | useRpcCache.updateCacheLocally ghi lại toàn bộ rpcCache | Có thể ghi đè state background mới hơn; đã dùng deep clone popup-local, không persist |
| M07 | P1 | useTroopTraining collect/start/heal/sync sửa cache trước dispatch | RPC bị từ chối vẫn hiển thị thành công; đã bỏ state giả và dùng refresh server |
| M08 | P1 | CampaignRaidModal.waitForRaidResult trả ok:true sau timeout | Loop có thể tiếp tục dù chưa có response, cộng drop cũ; timeout trả pending/error và dừng |
| M09 | P1 | RaidModal/MonsterModal/GatheringModal mount set popupRpcEnabled:true | Việc mount dialog ngầm bật lệnh toàn cục, kể cả dialog đang ẩn. Đã bỏ |
| M10 | P1 | useSquadTeams / TeamsTab / TowerModal load stored settings | Có thể chọn team account khác hoặc dùng response tải cũ; đã cách ly account + guards |
| M11 | P2 | useRpcCache.loadInitial/listener ordering | Nhiều consumer load trùng, stale read đè event, bỏ qua deletion; đã coalesce/revision guard/remove handling |
| M12 | P2 | useTheme / useGameConnection lifecycle | System theme không đổi theo OS; monitor trùng/leak. Đã subscription + cleanup theo consumer |
| M13 | P2 | RaidModal/MonsterModal.refreshMapCoordinates | dispatchRpc chưa destructure => ReferenceError khi click; đã sửa và test handler thực tế |
| M14 | P2 | GoalsTab/EventsTab refresh + rpc-cache mapping | clanVersus_getInfo/quest_getAll sai; thay getInfo feature clanVersus + questGetAll |
| M15 | P2 | Header/Raid/Monster getMarches vs reducer getMarches:march | Refresh không cập nhật canonical key; đã thêm feature march |
| M16 | P2 | TowerModal.refreshTower vs rpc-cache magicTower_* | towerGetInfo không đúng luồng Tower hiện có; thay magicTower_briefInfo + magicTower_getAll |
| M17 | P2 | GuildChatPanel.refreshChat, DungeonModal.refreshDungeon | Gửi trùng một request; đã chỉ dispatch một lần |
| M18 | P2 | DungeonModal.resetActiveBattle | Read-modify-write toàn bộ rpcCache; chuyển popup-local, refresh canonical |
| M19 | P2 | useSquadTeams.capacityModel rawSettings undefined | Settings capacity không có tác dụng với team; đã đọc troopCapacitySettings |
| M20 | P2 | tsconfig paths @/* trỏ src nhưng import @/src/* | Alias build/typecheck lệch; đã dùng root alias WXT và chrome/node types |
| M21 | P2 | Không có vue-tsc; TS7 không export lib/tsc | Build chỉ transpile bỏ sót runtime binding. Pin TS6.0.3 + vue-tsc3.3.14, thêm gate typecheck strict |
| M22 | P2 | ResourceTab now=ref(Date.now()) không ticker | Refill đứng yên; thêm useNow lifecycle |
| M23 | P2 | Settings thiếu autoClaimSettings/priorityAutoJoin UI | Khôi phục controls và on-open workflow qua composable, không chép DOM renderer |
| M24 | P2 | FabDial không có unread count/last-read update | Khôi phục badge/read state qua helper hiện có |
| M25 | P2 | HeroDetailModal.upgradeSkill sửa object shared trước dispatch | Bỏ optimistic mutation; refresh heroGetAll/inventoryGet; test rejection |

P1 ở đây là lỗi chức năng/dữ liệu quan trọng, không phải khẳng định đã khai thác được bảo mật. Mọi payload thay thế đều dựa trên background/reducer/helper hiện có, không suy tên API từ tên component.

## Lộ trình và task

### Đợt A — Khôi phục luồng migration đã xác nhận (đã thực hiện)

- @task-VHE-FY1G5K: artifact WXT đầy đủ, fail-fast distribution, version tách riêng.
- @task-VHE-QREKB0: Vue strict typecheck, tương thích compiler API, missing refresh bindings và payload chuẩn.
- @task-VHE-8YB7KF: shared cache, lifecycle/theme, account/capacity, bỏ optimistic troop state.
- @task-VHE-YXR60J: Log, auto-claim, priority rally, unread chat.
- @task-VHE-H8YJ9H: resources live ticker và teams account isolation.
- @task-VHE-49R1NS: quest/chat/dungeon/campaign contracts, Tower account guard, strict storage/queue types.
- Dashboard/favorites/engine diagnostics được rà soát bổ sung trong task con ghi ở phần kết quả cuối.

Không có dependency ghi dữ liệu chung giữa các nhóm triển khai ban đầu; nhóm build và runtime được tích hợp/kiểm tra tuần tự. Dungeon reset phụ thuộc ngữ nghĩa mới của updateCacheLocally và đã được kiểm tra sau tích hợp.

### Đợt B — Acceptance trước khi phát hành

Task @task-VHE-HHA1TB vẫn cần chạy trong Chrome/game thật; không đánh dấu xong bằng test source/helper.

1. Load unpacked cả .output/chrome-mv3 và dist; xác nhận worker và MAIN-world intercept nạp được.
2. Mở popup và standalone tab; đóng/mở lại; reload extension khi game đang mở; kiểm tra stale-version warning.
3. Kiểm tra mọi tab/dialog với cache rỗng, partial, object thay cho array, số 0 và key bị xóa.
4. Đổi tài khoản A → B khi async read chưa xong; custom teams, Tower heroes, capacity và preferences không lẫn.
5. Global RPC disabled: mount UI không tự bật; bấm action phải hiện thất bại/chờ đúng, không thay state giả.
6. Thử direct/piggyback/MQTT: ack queued không được coi là game action hoàn tất; timeout campaign không chạy tiếp.
7. Thử train/heal/collect, skill/equip/craft, rally/monster/gather, Tower, quest claim, reward claim với response thành công/thất bại.
8. Recorder API/MQTT: start/stop/live/search/sort/body/clear/export, JSON giữ schema background.
9. Dark/light/system, OS theme đổi khi popup mở; KeepAlive tab switch không tạo thêm timer/listener.
10. Guild unread/read/send/refresh; không gửi trùng và badge đúng sau incoming message.
11. Chụp ảnh so sánh các feature group; review keyboard, focus, Escape, scroll, dropdown, tooltip và popup width.

### Đợt C — Nợ kỹ thuật / cải tiến sau tương thích

- @task-VHE-VT9095: bỏ số liệu mẫu Guild Versus (guild/battle/eligibility fallback); giữ unknown khác với 0. Đây là nợ có trong code cũ, không gán là regression migration.
- Category inventory nên dựng từ metadata thay danh sách dropdown tĩnh khi cần chọn riêng nhóm hiếm.
- Public runtime bridge là trạng thái chuyển tiếp được document: đưa worker/content sang entrypoint WXT riêng trong đợt độc lập có test importScripts, MAIN-world timing và cache reducer. Không vừa rewrite runtime vừa sửa UI parity.
- Thu nhỏ popup bundle bằng async dialog/import theo feature sau profiling; cảnh báo chunk >500KB hiện có, không tự chứng minh lỗi chạy.
- Thay dần globalThis metadata adapters bằng module typed, giữ golden fixtures để không đổi công thức và tên resource.
- Chuẩn hóa error/queued UX cho mọi action. Không coi return ok của transport là server acceptance.
- Hoàn thiện mounted DOM/browser tests thay test chỉ assert ID/chữ; không xóa legacy tests trước khi có coverage tương đương.

## Quy chuẩn kiến trúc cho phiên tiếp theo

Xem [WXT-VUE-TAILWIND-CONVENTIONS.md](WXT-VUE-TAILWIND-CONVENTIONS.md). Canonical Knowns document được liên kết trong task điều phối.

## Kiểm chứng và giới hạn

- Đợt chạy tích hợp đầu: 568 tests, 556 pass, 12 skip, 0 fail; typecheck strict pass; WXT distribution validate pass. Kết quả cuối sau các sửa bổ sung được ghi ở phần cuối tài liệu.
- Test mới thực thi composable Vue và handler SFC với mock Chrome, không chỉ so khớp chuỗi: startup race/removal/transport errors, account isolation, rejected troop/skill state, recorder, reward settings, clock lifecycle, campaign pending, exact quest payload, artifact missing dependencies.
- Build WXT đầy đủ khoảng 88 MB chủ yếu game assets; popup JS khoảng 1 MB. Chưa profile runtime Chrome.
- Không có tuyên bố 100% tương thích chỉ dựa trên build/tests. Task browser acceptance còn mở là bằng chứng minh bạch về giới hạn.

## Tài liệu nền chính thức đã đối chiếu

- [WXT assets/public asset pipeline](https://wxt.dev/guide/essentials/assets)
- [WXT entrypoints](https://wxt.dev/guide/essentials/entrypoints.html)
- [WXT TypeScript configuration](https://wxt.dev/guide/essentials/config/typescript)
- [Vue TypeScript / vue-tsc](https://vuejs.org/guide/typescript/overview)
- [Tailwind CSS với Vite](https://tailwindcss.com/docs/installation/using-vite)

Áp dụng dựa trên package thực tế của repository (WXT 0.21.5, Vue 3.5.x, Tailwind 4.3.x), không suy rằng nâng package là giải pháp cho parity.

## Kết quả cuối đợt triển khai

- Bổ sung @task-VHE-YVXJB9: ActivityGoals alias/brief-only Tower win, favorites lifecycle/deletion/race và engine diagnostics đã hoàn thành.
- Bổ sung M26 (P1 build/runtime): WXT thiếu permission alarms dù background dùng chrome.alarms để đánh thức queue; đã thêm permission và regression trong artifact validator.
- Đã sửa M13/M14/M15/M16/M25 ở handler thực tế, bổ sung tests/vue-dialog-setup.test.mjs kiểm tra mount giữ RPC disabled, march refresh payload và skill rejection.
- Kiểm tra cuối: **npm run check thành công; 573 tests, 561 pass, 12 skip, 0 fail**; strict vue-tsc pass; build + validate artifact pass. Test artifact permission bổ sung chạy riêng pass sau lần check này.
- Kiểm tra trực tiếp cả dist và .output/chrome-mv3: version **0.10.52**, permissions **storage, unlimitedStorage, tabs, alarms**; source package vẫn **0.10.52**.
- Report/architecture doc Knowns validation: 0 errors, 0 warnings.
- Tham chiếu canonical: @doc/reviews/wxt-vue-migration-review-2026-11-13-10-46-35 và @doc/architecture/wxt-vue-tailwind-conventions.
- System Decision kiến trúc được tạo dạng draft để review sau, không tự accept: @decision/20261113-1059-preserve-wxt-vue-tailwind-boundaries-during-html-parity-migration.
- Chưa commit/push. Các task acceptance và nợ fallback Guild Versus còn todo, không bị đánh dấu hoàn tất bằng kết quả unit tests.

## Xác nhận sau review độc lập — 2026-11-13 11:03 +07:00

Review tích hợp phát hiện thêm hai điểm và đã sửa trước khi kết thúc:
- M27 (P1): quest_multiFarm qua refresh-rpc bị queue-rpc whitelist loại trong piggyback. QuestDetailModal/QuestsTab nay dùng sendQuestClaim → **claim-rewards** → queue-claim; có test exact envelope và queued/rejected/transport error.
- M28 (P2): một số refresh đọc bị allowlist piggyback loại dù Direct chạy được. Task @task-VHE-R8Z54P đã thêm **7 cặp method/feature cụ thể** trong intercept.isPiggybackRead cho clanVersus, quest, Tower, Dungeon, chat; không mở arbitrary RPC/mutation. Test carrier append + response isolation cho hai chế độ queue.
- **Kết quả tích hợp cuối cùng thay thế số liệu chạy trước: 575 tests, 563 pass, 12 skip, 0 fail; npm run check thành công**, bao gồm WXT prepare, strict vue-tsc, toàn bộ tests, WXT build và artifact validation.
- dist và .output/chrome-mv3 đều version **0.10.52**, permission alarms có mặt. git diff --check thành công.
- Hoàn tất 8 task triển khai trong đợt audit; 2 task roadmap còn todo: browser acceptance @task-VHE-HHA1TB và nợ sample fallback @task-VHE-VT9095.
- Review: các P1/P2 đã xác nhận trong phạm vi migration patch được xử lý; chưa coi Chrome/game acceptance là hoàn tất. Không commit hoặc push trong đợt này.
