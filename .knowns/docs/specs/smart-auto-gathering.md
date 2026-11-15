---
id: doc-0387b165a8c4de930cfa0bf94b5311ad
title: Smart auto gathering
description: Execution scope, verified evidence, scenarios and missing information for smart auto-gathering
createdAt: '2026-11-14T11:50:18.441Z'
updatedAt: '2026-11-15T07:12:39.612Z'
tags:
  - spec
  - gathering
---

# Smart auto gathering

Canonical task/spec tracking for `docs/Smart-auto-gathering.md`. AC-1 through AC-6 are implemented in version0.10.81. The user supplied the missing incoming-attack captures on 2026-11-14; see @doc/api/mine-incoming-attack-and-timed-withdrawal. User authorized planning, task creation, sequential implementation and final commit on 2026-11-14.

## Locked Decisions

- D1: Smart rules run only with Auto-Gather, explicit Smart gathering and shared RPC enabled. Manual gathering stays explicit.
- D2: Daily order food → iron → stone → wood; target ceil(final milestone × 1.02), never sum milestones (user confirmed).
- D3: Server responses confirm mutations; dispatch acknowledgement is not completion. Fresh march and unit observations gate released slots/heroes.
- D4: User permits estimated return ETA from configured speed/coordinates and estimated gathering duration from configured mine speed/remaining amount. Own outpost coordinates must be identified. Attack ownership/ETA must be captured before enabling defense. Hospital free capacity = sum Infirmary capacity minus wounded troops. Per user update2026-11-15, attacked-mine defense triggers only when wounded troops exceed50% of positive total Infirmary capacity; exactly50% does not trigger. Squad size does not set this threshold.
- D5: Execute tasks sequentially, preserve account isolation, shared RPC settings and established raid lifecycle.

## Task Links

- @task-VHE-MA5SJK — requirements and evidence, done.
- @task-VHE-WBZH46 — daily rotation, done.
- @task-VHE-XXCNGQ — queue recall and resume, done.
- @task-VHE-BCK7WZ — nearest estimated >1h, done.
- @task-VHE-1M0CGC — priority rally preemption, done.
- @task-VHE-CB9VBW — timed mine defense, implemented with the supplied late-load and full-attack captures.

## Requirements, acceptance criteria and scenarios


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

Khi có dữ liệu xác thực về đội địch tấn công đúng mine đang gather và tổng troops bị thương vượt 50% tổng sức chứa Infirmary, recall đúng squad một lần trong **0 < ETA va chạm ≤10 giây**. Sau khi về base thì gather tiếp theo các ưu tiên trên. Đã xác minh RPC getIncomingMarches và MQTT marchAttackDetected/Ended từ hai capture mới. Chi tiết, SHA256 và timing ở @doc/api/mine-incoming-attack-and-timed-withdrawal. Recall tại impact−10s, hết hạn tại impact; Piggyback cần game RPC trước deadline.

## Bằng chứng và thông tin cần bổ sung

| ID | Thông tin | Nguồn / trạng thái | Người dùng cần bổ sung |
|---|---|---|---|
| E1 | Mine search và recall RPC | api/world-map-rpc-contracts; search trả mineId + coordinates; recall trả route | Không |
| E2 | Thời lượng/amount gather đang chạy | getMineSummary có startedAt, plannedDurationMs, plannedGatheredResourceAmount | Không |
| E3 | Full chain daily | Remote quest + questChain, transferProgress=true; mốc cuối ×1,02 đã chốt | Không |
| E4 | Thời lượng mine mới | Cấu hình globalMapMine + getMineById; cho phép ước tính | Không |
| E5 | ETA return trước recall | Cấu hình route speed + tọa độ; cho phép ước tính | Không |
| E6 | Incoming attack owner/mine/route/version/impact and terminal events | Verified from 19:20/19:23 captures | No missing capture |
| E7 | Hospital | Verified cumulative Infirmary metadata + getHealing injuredUnits | Optional live UI cross-check |

## Tiêu chí nghiệm thu và kịch bản

- AC-1: SG-1…SG-6 có task, trạng thái và yêu cầu bổ sung cụ thể.
- AC-2: Daily chọn đúng thứ tự, target và biên 2%; không cộng trùng, không dùng quest hôm qua, không tạo resource trùng; thiếu dữ liệu hiển thị chờ.
- AC-3: Queue chỉ start sau khi slot/heroes đã về thật; auto-gather dừng trong queue và quay lại mine sau terminal.
- AC-4: Nearest chọn gần nhất trong ứng viên estimated >3600s; không nhận 3600s; mine cũ được miễn threshold.
- AC-5: Auto-join không recall ở 29s hoặc ETA không biết; kiểm tra lại rally sau khi về, không recall/join trùng.
- AC-6: Defense cần đủ owner/mine/ETA/capacity dương và thương binh >50% tổng capacity; đúng50% không recall; recall đúng squad, một lần mỗi attack, trong [impact−10s, impact).

Kịch bản kiểm thử: RPC tắt; smart tắt; account đổi; reset qua ngày; quest mới chỉ hoàn thành mốc đầu; hai đội cùng resource; amount/ETA thiếu; mine cạn sau search; recall bị từ chối; worker khởi động lại; queue cancel khi đội chưa về; rally full/start trong lúc recall; piggyback trễ; đúng 29s và 3600s.

## Kế hoạch và task

Thực thi tuần tự theo yêu cầu người dùng, không dùng sub-agent. Thứ tự hiển thị không thay cho dependency: task tài liệu chặn các task code; daily tạo nền tảng runtime cho queue và nearest; auto-join dùng cơ chế recall/resume của queue. Defense tiếp tục sau khi E6 được người dùng bổ sung.

| Thứ tự | Task | Kết quả cần đạt | Trạng thái |
|---|---|---|---|
| 1 | VHE-MA5SJK | Chuẩn hóa mô tả, bằng chứng, AC và missing inputs | Hoàn thành |
| 2 | VHE-WBZH46 | Daily rotation, trạng thái quyết định, ngày/account | Hoàn thành |
| 3 | VHE-XXCNGQ | Nhường queue, recall/return/resume lifecycle | Hoàn thành |
| 4 | VHE-BCK7WZ | Nearest estimated >1h | Hoàn thành |
| 5 | VHE-1M0CGC | Priority auto-join <29s, quay lại mine | Hoàn thành |
| 6 | VHE-CB9VBW | Incoming attack và hospital guard | Implemented in0.10.81 |

Sau mỗi task: test theo AC, review diff, cập nhật Knowns; cuối đợt chạy typecheck/test/build, tăng version/changelog và commit. Task chờ dữ liệu giữ AC chưa hoàn thành, nêu rõ trong kết quả.

## Acceptance Criteria

- [x] AC-1: All rules have tracked tasks, evidence and exact missing input requests.
- [x] AC-2: Current-day conservative daily rotation targets final milestone ×1.02, avoids duplicate resource squads and recalls only on verified progress inputs.
- [x] AC-3: Raid/monster queues wait for gathering recall and confirmed return, suppress gather while active, then validate and resume interrupted mines.
- [x] AC-4: Nearest mine mode orders candidates across levels, probes remaining resources and requires estimated >3600s; validated interrupted mines bypass threshold.
- [x] AC-5: Priority rally preemption requires estimated return <29s plus start window, then rechecks rally and joins once after confirmed return.
- [x] AC-6: Verified hostile incoming routes target an own gathering mine; hospital occupancy strictly above50% triggers a single deadline-checked recall in final10s. Missing/stale inputs refresh without guessing.

## Scenarios

- Fresh daily snapshot, first milestone completed: continue toward final target; unchanged refreshed snapshots do not reset estimated gathering baseline.
- Quest reset/account change: refresh inputs and discard old account's marches, map, unit, quest and runtime reservations.
- Queue needs heroes/slot: recall nearest eligible squad; ETA alone cannot start queue; fresh march and unit snapshots confirm absence.
- Queue completes/cancels: validate interrupted mine resources, dispatch once, consume target only after server attackMine acknowledgement.
- Nearest candidate estimated exactly3600s: reject; >3600s: eligible; changed map/center starts new bounded search.
- Rally estimated exactly29s, unknown own outpost or insufficient start window: skip; otherwise recall once and recheck membership/start after return.
- Missing hostile route fields: defense stays inactive, task remains blocked.

## System Decision Impact

- Impact: none
- Reason: Task-specific behavior is locked in D1–D5; metadata packaging, shared RPC settings and confirmed-mutation handling reuse established project patterns.

## Verification mapping

AC-1: source document and Knowns validation. AC-2/4: tests/smart-gather.test.mjs plus existing auto-gather tests. AC-3/5: tests/smart-gather-background.test.mjs runs real background controllers and RPC transitions, with boundary and account-reset cases in smart-gather.test.mjs. AC-6: tests/mine-defense.test.mjs replays minimal real captures and exercises the reducer, planner and background; bridge.test.mjs verifies exact wake scheduling without a storage-triggered heartbeat loop.

## Delivery verification for0.10.80

Release0.10.80 completed AC-1…AC-5 with762 tests,750 passed,12 optional skipped; typecheck and WXT build passed. AC-6 was deferred at that release until incoming-attack capture was available. That deferred scope is now implemented in0.10.81; see the current delivery section and @doc/api/mine-incoming-attack-and-timed-withdrawal.
## Delivery verification for0.10.81

All six task scopes implemented. Incoming contracts/hashes: @doc/api/mine-incoming-attack-and-timed-withdrawal. Verification:775 tests,763 passed,12 optional skipped; typecheck, validated WXT build and strict SDD validation pass. AC-6 covers insufficient/sufficient/unknown hospital, exact10s/impact bounds, full/late-load attacks, snapshot/version/terminal/account guards, overlapping recalls, confirmed return, safe mine resume, Piggyback expiry and queue cleanup on account/Smart disable. Bridge test proves absolute wake scheduling without a storage-update loop. Direct sends at wake; Piggyback requires natural game traffic before impact. No live in-game validation is claimed.

## Occupancy threshold update — 0.10.83

@task-VHE-N7EWFF implements the user's2026-11-15 change: attacked-mine recall eligibility is strictly wounded >0.5 × total Infirmary capacity. Exactly50% does not trigger. This replaces the former comparison of defending squad size against hospital free space in SG-6/AC-6. The recorded0.10.81 delivery notes describe the earlier rule only. Positive known capacity and fresh building/healing/march/unit inputs remain mandatory; unknown/stale/zero capacity requests refresh. Final10s window, ownership/account isolation, shared RPC mode and confirmation-driven return/resume stay in force. No live-game validation is claimed.

## Reload recovery — 0.10.84

@task-VHE-B86D4M investigates temp/tracking-data/hwa-game-record-202611150055_relaod.json (SHA256174af2d3cde7564f24c3de092f8e3c21487c2a26cb2a5bd77f9bbb5969215055). Capture extension0.10.83/client1.293.1010, exported2026-11-14T17:55:36.937Z. It shows1 current mine squad, available units7245/7240/7240 of unit7/17/27, all resource daily chains completed and no incoming attacks. The user reports maxMarches3; settings and persisted automation state are not included in the export.

Confirmed blocker: getOutpostSummary:outpost at timeline14 (17:55:19.055Z) returns current mapId and own coordinates606,376, but the reducer ignored that response. Smart context therefore lacked own outpost coordinates until getChunks at timeline39 (17:55:32.043Z). Replay reproduces the wait and, after fix, nearest search starts from timeline14. Another reproduced bug: getMarches sets a generic center to the deployed mine587,340, and fixed-level gathering preferred that center even after own base was known.

The reducer now binds successful valid own-outpost summaries to the current known account, discards responses older than account/context observations, isolates different maps, and clears state on account change. Auto-gather prefers outposts[currentAccount] before a generic viewport center. Shared RPC/queue gates, slot cap, troop availability and server-confirmed mutation lifecycle are retained.

Regression tests/gather-reload.test.mjs uses sanitized tests/fixtures/gather-reload-20261115.json (no request headers/auth; account name/ID replaced). It replays real startup RPCs without getChunks; then a controlled backend simulation proves1→2→3 gathering squads, fresh roster confirmation between sends and no fourth squad. Simulated successful search/dispatch responses are test inputs, not additional observed game evidence. The short capture has no helper searchMine/attackMine requests and cannot establish all popup settings or any prior persisted error; no live-game fix confirmation is claimed.

## Direct confirmation timeout follow-up — 0.10.85

@task-VHE-D0K20G follows the user's Direct-mode report and hwa-game-record-202611150108.json. This capture has exactly one native getMineSummary/getMarches RPC at18:08:03.029Z, exported18:08:13.298Z, extension0.10.84. It contains no helper RPC or persisted pending state; the user separately reported Waiting for game confirmation followed by timeout, and a research-queue receiving-end-does-not-exist error.

Confirmed independent source defect: findActiveGameTab used `new Promise(resolve => chrome.tabs.query(filter, resolve) || resolve([]))`. Chrome's callback API returns undefined before asynchronously invoking its callback, so the Promise resolved[] immediately and both start/reset and periodic Smart ticks found no game tab. Previous tests synchronously invoked the callback and therefore concealed the defect. Both query paths now wait for the callback; regression uses asynchronous callbacks and fallback selection.

Read-only pending requests expire at their30s dispatch deadline and retry at most3 times before a named connection error. Exact method/feature and sent phase classify reads; attackMine, stopMineGathering and joinRally are not automatically retried. Existing server-confirmed mutation/roster gates remain. Status names the awaited RPC and Direct/queued mode; explicit Auto-Gather start clears old retry/error state. A missing content-script receiver after extension reload still requires F5 in the game page; the helper now names that recovery action instead of silently waiting.

Also corrected omitted feature-bounded getMineById:mine and getIncomingMarches:march queue compatibility; these were separate Piggyback/MQTT gaps and are not claimed as the user's Direct cause.

Actual Chrome157 fixture acceptance: scripts/browser-gather-acceptance.mjs runs unpacked0.10.85 with real callback timing, storage, worker, content bridge and MAIN interception. All game HTTP requests are fulfilled locally. Auto-Gather start then periodic wake-ups send two additional squads, reconcile server responses/current rosters and reach Current marches limit reached(3/3). Evidence docs/acceptance/gather-2026-11-15.json; this is browser integration evidence with a simulated backend, not a live-account result. Full suite793 tests:781 passed,12 optional skips; typecheck and validated build PASS.

## Occupied interrupted mine follow-up — 0.10.86

@task-VHE-P3VDNA / @doc/api/world-map-rpc-contracts documents the new0.10.85 capture with actual helper RPCs. Unlike the previous one-record timeout export, this log proves the request reached the server: getMineById reported another gatherer, then attackMine:pve received errorCode-only BattleTypeMismatch. Existing resume/nearest validation ignored gathering and error checks ignored errorCode, leaving a rejected mutation pending.

Resume/nearest probes now require no gathering object, valid matching mineId/resources and the existing duration rules. Occupied or explicitly race-rejected targets are removed from interrupted/resume/nearest selection and temporarily excluded from ordinary Smart cached searches for60s (bounded50 records). BattleTypeMismatch selects a different free target; other mutation errors stop with the actual code. No automatic PvP and no retries of unconfirmed mutations.

Verification: tests/gather-reload.test.mjs uses sanitized captured occupied/errorCode replies. Real Chrome157 Direct fixture acceptance with occupied-resume-and-target-race ends with3 squads, zero pending and status3/3; only distinct PvE targets are requested and the occupied interrupted mine is not attacked. Checked-in evidence docs/acceptance/gather-occupied-2026-11-15.json. Full suite796 tests:784 passed,12 optional private-capture skips; typecheck, validated build and diff whitespace checks PASS. Game responses in the Chrome acceptance are controlled fixtures, not a live-game outcome.
## Passive-first march reads — 0.10.95

@task-VHE-ZRSTK3 reduces automatic getMarches calls without changing Locked Decisions D1-D5. Header bootstrap and smart/defense followups reuse fresh native snapshots; repeated energy userGetInfo does not trigger login bootstrap. Known full deployed marches wait until a route/gather ETA, with stale-data recovery for due or unknown ETA. Captured gatheringMineCompleted and returnFromMineCompleted update known own squads directly; released troops/heroes still require fresh unit evidence after return. Complete initial hydration, account isolation and explicit manual refresh remain required. See @doc/architecture/passive-first-gathering-march-observations for request sources, capture provenance, bounded recovery and regression scenarios.
