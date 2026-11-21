---
id: VHE-SFT2RG
title: Fix infirmary troop double-counting by treating injuredUnits as total wounded troops in hospital
status: done
priority: high
labels:
  - dashboard,troops,infirmary
createdAt: '2026-11-21T10:52:08.825Z'
updatedAt: '2026-11-21T11:00:29.148Z'
completedAt: '2026-11-21T11:00:29.148Z'
timeSpent: 0
---
# Fix infirmary troop double-counting by treating injuredUnits as total wounded troops in hospital

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Do not sum active healing.units into hospitalCount because injuredUnits already includes all wounded troops in infirmary
- [ ] #2 Display hospital breakdown accurately: total injured with healing count in timer and hover tooltip
- [ ] #3 Prevent false overflow of currentTotal troops and ensure trainable capacity calculates correctly
<!-- AC:END -->

