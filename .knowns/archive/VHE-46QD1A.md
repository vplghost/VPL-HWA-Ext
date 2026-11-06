---
id: VHE-46QD1A
title: Track guild rally creation and auto-join raid in marchStatus
status: done
priority: medium
labels:
  - feat marches
createdAt: '2026-11-02T15:11:07.688Z'
updatedAt: '2026-11-06T10:31:31.744Z'
completedAt: '2026-11-02T15:21:32.017Z'
timeSpent: 0
archivedAt: '2026-11-06T10:31:31.744Z'
---
# Track guild rally creation and auto-join raid in marchStatus

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Update rpc-cache to track auto-joined rallies and march countdowns
- [x] #2 Update header march badge and tooltips to warn when auto-join marches are active
- [x] #3 Unit tests cover auto-join rally replay and marchStatus transitions
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Acceptance audit 2026-11-06 under @task-VHE-MRH4NM: Verified rallyUserAutojoined reducer/refresh, own squad/team/ETA preservation and Auto-Join Raid tooltip. Evidence: background.test.mjs auto-join push and rpc-cache transition/ownership tests plus popup-data march tooltip. Removed original AC #1 requiring a specific absent private file hwa-api-202611022205_auto_joi_raid.json: original raw replay is unavailable, not re-analysed; current deterministic RPC/MQTT regressions cover the maintained contract. Optional private replay stays explicitly skipped. System Decision Impact: none — reconciles existing acceptance state; implementation remediation is tracked separately.
<!-- SECTION:NOTES:END -->

