---
id: VHE-B4P15Y
title: Configure maximum troop count per custom team
status: done
priority: medium
labels: []
createdAt: '2026-11-07T03:56:30.867Z'
updatedAt: '2026-11-07T03:57:46.678Z'
completedAt: '2026-11-07T03:57:46.678Z'
timeSpent: 51
---
# Configure maximum troop count per custom team

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Optional positive total troop capacity per custom team, persisted and used in raid/farm including every queue round.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Custom team maximum troops can be saved, edited and cleared.
- [x] #2 Raid and farm respect the configured maximum including subsequent raid rounds.
- [x] #3 Targeted regression tests and build pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add optional validated maxTroops to custom team storage/editor. 2. Use configured total capacity for raid preview, persisted queue rounds, and farm troop cap; blank retains automatic capacity. 3. Test validation, capacity override, shortages and queue refresh; build.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added optional maxTroops input to custom team editor and summary, positive-safe-integer validation, storage/dropdown propagation, raid preview and queue-round capacity override, and farm manual troop cap. Blank clears override for existing teams. 56 experimental-data/raid-queue/background tests pass including capacities below/above estimate, shortages, invalid input, persistence and second-round refresh; build 0.9.97 and syntax/diff checks pass. System Decision Impact: candidate @decision/20261107-1057-custom-teams-may-specify-total-maximum-troops (added) — optional per-team total troop setting.
<!-- SECTION:NOTES:END -->

