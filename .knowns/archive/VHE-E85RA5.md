---
id: VHE-E85RA5
title: Chi lang nghe API va them cong tac tracking/log
status: done
priority: medium
labels: []
createdAt: '2026-11-01T09:59:20.538Z'
updatedAt: '2026-11-06T10:31:33.694Z'
completedAt: '2026-11-01T10:03:55.574Z'
timeSpent: 0
archivedAt: '2026-11-06T10:31:33.694Z'
---
# Chi lang nghe API va them cong tac tracking/log

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Bo thao tac reload game chu dong, refresh chi doc cache/log cuc bo. Them cau hinh bat/tat intercept va ghi log doc lap, luu qua cac phien.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Extension khong chu dong goi API game hoac reload game; refresh chi dong bo cache/log cuc bo
- [x] #2 Tat intercept khong thu body, khong gui record va khong cap nhat cache/log; bat lai hoat dong cho request moi
- [x] #3 Tat ghi log khong them apiRecords nhung cache van cap nhat neu intercept bat
- [x] #4 Popup hien va luu hai cong tac; tests/build/validation dat
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Bo reload-game va quyen activeTab, doi ten refresh. 2. Dong bo setting tu popup qua bridge sang MAIN va enforce o background. 3. Them tests cho bat/tat va cap nhat docs. 4. Chay build/test/validate.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Removed reload-game action and activeTab permission; popup Refresh from log only replays local storage. Added persisted captureSettings with independent interceptEnabled/logEnabled. MAIN hook starts disabled until isolated bridge sends settings, bypasses fetch/XHR while off, and background rechecks settings before cache/log writes. Log off retains cache updates. Updated guide and generated data catalog. npm run check: 23/23 pass, build 0.2.1 and docs generation pass; Knowns validation passes. System Decision Impact: candidate @decision/20261101-1703-passive-rpc-capture-with-independent-intercept-and-log-switches (changed); prior reload-game draft rejected. Chrome smoke test remains.
<!-- SECTION:NOTES:END -->

