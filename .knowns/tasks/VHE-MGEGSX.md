---
id: VHE-MGEGSX
title: 'P1-22: Fix AutomationLogPanel undefined entries, useRpcCache DataCloneError & Building Queue Verify console.error'
status: done
priority: high
labels: []
createdAt: '2026-11-28T05:04:13.912Z'
updatedAt: '2026-11-28T05:05:05.427Z'
completedAt: '2026-11-28T05:05:05.427Z'
timeSpent: 0
---
# P1-22: Fix AutomationLogPanel undefined entries, useRpcCache DataCloneError & Building Queue Verify console.error

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Fix 3 runtime errors from temp/tracking-data/error-log.md: harden AutomationLogPanel entries/logs props + GrandArenaModal binding, replace shallow toRaw+structuredClone with deep plain clone in useRpcCache, and downgrade transient queue summary verify rejections to deduplicated warn without [object Object].
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 AutomationLogPanel handles undefined entries and legacy logs ({time,tone,text}) without TypeError; GrandArenaModal binds :entries
- [x] #2 useRpcCache updateCacheLocally clones nested Vue reactive Proxies without DataCloneError
- [x] #3 backgroundRuntime logs transient queue verify rejections as deduplicated warn with 30s backoff and no [object Object]; npm test and npm run build pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented P1-22 (v0.11.392): hardened AutomationLogPanel.vue (safe entries/logs/emptyText) + fixed GrandArenaModal.vue :entries binding, replaced shallow toRaw+structuredClone with deep clonePlainCache() in useRpcCache.ts, and downgraded transient advanceCityQueue verify rejections to deduplicated warn with 30s backoff without [object Object]. Verified 1,373 pass / 0 fail + dual build.
<!-- SECTION:NOTES:END -->

