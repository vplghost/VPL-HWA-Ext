---
id: VHE-D0K20G
title: Unstick Smart gathering awaiting an unsent or unconfirmed RPC
status: done
priority: high
labels: []
createdAt: '2026-11-14T18:09:00.405Z'
updatedAt: '2026-11-14T18:15:50.799Z'
completedAt: '2026-11-14T18:15:50.799Z'
timeSpent: 394
spec: specs/smart-auto-gathering
---
# Unstick Smart gathering awaiting an unsent or unconfirmed RPC

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User0.10.84 still shows Waiting for game confirmation; hwa-game-record-202611150108.json contains only native getMineSummary/getMarches, no helper dispatch. Inspect transport allowlists and persisted read pending recovery; fix reproducible blockers without retrying unconfirmed mutations.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Reproduce missing Smart gathering read RPC compatibility through actual MAIN-world carrier tests, including getMineById:mine and getIncomingMarches:march.
- [x] #2 Recover expired pending read-only requests safely and display which RPC/phase is waiting; never retry an unconfirmed mutation as a read.
- [x] #3 Exercise reload-to3 gathering end to end through background, bridge/intercept and queue response handling; validate supported shared modes and rejection/expiry handling.
- [x] #4 Document the1-record capture limits, add regression coverage, pass tests/typecheck/build and preserve previous threshold/reload fixes.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inspect capture/transport/state lifecycle and reproduce silent read filtering. 2. Add feature-bounded missing read allowlist entries and safe read expiry/recovery, preserving mutation guards. 3. Add actual intercept + background integration tests (not sendMessage-only mocks), plus actionable pending status. 4. Verify all modes/expiry and final build, document evidence and limitations.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
User confirms Direct and later reports generic confirmation timeout plus research queue missing-receiver error. Confirmed independent root cause: findActiveGameTab constructed Promise as chrome.tabs.query(...,resolve) || resolve([]). Chrome's callback API returns undefined immediately, so the Promise resolved[] before the asynchronous callback; synchronous test mocks hid the bug. Fixed both filtered and fallback query paths and reproduced with asynchronous callbacks. Also fixed feature-bounded getMineById/getIncomingMarches carrier reads (queued modes only, not claimed as current Direct cause). Added bounded read-only deadline recovery with named statuses; mutations retain explicit confirmation/no automatic retry. Running actual Chrome Direct background→bridge→MAIN fixture lifecycle, not sendMessage-only simulation.

Final PASS at0.10.85. Actual Chrome157 unpacked extension test (scripts/browser-gather-acceptance.mjs) uses real asynchronous Chrome query/storage/worker, content bridge and MAIN Direct fetch interception against locally fulfilled game responses: calls searchMine→attackMine→march/unit refresh twice, count1→3, final Current marches limit reached(3/3), exactly2 additional attacks. Evidence docs/acceptance/gather-2026-11-15.json; no live server contacted. Queued read features tested through actual intercept VM carrier for Piggyback and MQTT mode; wrong features rejected. Tests prove bounded read expiry and no automatic mutation retry. Full suite793 tests,781 passed/12 optional skips; typecheck, build and diff whitespace PASS. Existing timeout requires explicit restart; missing receiver after extension reload requires F5 in game tab. Review: PASS, no P1/P2 remaining. Spec Decision Compliance:D1=pass,D2=pass,D3=pass,D4=pass,D5=pass. System Decision Impact:none — scheduling/correlation/retry guards implement existing Smart lifecycle and shared RPC rules; no new current policy. Root cause and proof limits in @doc/specs/smart-auto-gathering; memory extraction links actual callback regression.
<!-- SECTION:NOTES:END -->

