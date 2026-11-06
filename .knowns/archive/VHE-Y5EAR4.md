---
id: VHE-Y5EAR4
title: Bo nut refresh cache, giu cap nhat thu dong
status: done
priority: medium
labels: []
createdAt: '2026-11-01T10:10:08.055Z'
updatedAt: '2026-11-06T10:31:37.597Z'
completedAt: '2026-11-01T10:11:15.962Z'
timeSpent: 0
archivedAt: '2026-11-06T10:31:37.597Z'
---
# Bo nut refresh cache, giu cap nhat thu dong

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Popup bo thao tac refresh tay; cache van cap nhat khi extension quan sat RPC game va khong phat sinh request chu dong/dinh ky.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Popup khong con nut refresh Heroes, Items hay cache
- [x] #2 Cache cap nhat tu RPC game va log co san, khong goi API game chu dong
- [x] #3 Tai lieu va ban build phan anh hanh vi moi; kiem thu dat
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Go nut va handler refresh popup, giu backfill cuc bo lan dau neu cache rong. 2. Sua huong dan va tai lieu tao tu script. 3. Kiem tra code, test/build va validate task.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Da go nut refresh va handler popup; giu backfill cache mot lan tu log cuc bo neu cache rong. Cache tiep tuc cap nhat tu RPC game; da ra soat khong co polling hay game API call. Da cap nhat huong dan, generator/tai lieu, tang version 0.2.2. npm run docs:data va npm run check dat (23/23, build thanh cong); knowns validate hop le. System Decision Impact: candidate @decision/20261101-1711-cache-game-cap-nhat-thu-dong-tu-rpc (changed) — ghi nhan co che cache thu dong va bo refresh tay.

Backlog disposition 2026-11-06 (@task-VHE-MRH4NM): The original passive-only/no-refresh policy has been superseded by optional authorized RPC features and the shared gate/modes in @task-VHE-62VVG5. Passive observation still works when helper RPC is off; this archive does not restore the obsolete prohibition on opt-in refresh.
<!-- SECTION:NOTES:END -->

