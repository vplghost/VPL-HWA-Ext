---
id: VHE-GQ0290
title: Phan loai API log va loc tracking
status: done
priority: medium
labels: []
createdAt: '2026-11-01T09:24:11.497Z'
updatedAt: '2026-11-01T09:29:58.309Z'
completedAt: '2026-11-01T09:29:58.309Z'
timeSpent: 0
---
# Phan loai API log va loc tracking

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Phan tich log temp/tracking-data/hwa-api-2026-11-01_latest.json, bo request tracking khoi log moi, viet bao cao du lieu huu ich trong docs, va dat ten export co YYYYMMDDHHmm.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Tracking/analytics requests trong mau duoc loai khoi log moi, request game va shop duoc giu
- [x] #2 Bao cao docs tong hop so luong, nhom du lieu, schema co ich, gioi han va khong lo gia tri nhay cam
- [x] #3 Export file co timestamp YYYYMMDDHHmm va tranh trung ten khi xuat lap
- [x] #4 Tests, build va validation dat
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Tong hop endpoint va RPC calls tu log, xac dinh rule loc. 2. Them bo loc o interceptor/background va test theo mau. 3. Viet docs phan tich cac nhom du lieu huu ich va gioi han. 4. Doi ten export co timestamp va suffix tranh trung; kiem tra toan bo.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Analyzed 179-entry latest log: excluded 127 measurement requests, retained 36 game RPC + 15 Aghanim GET + 1 auth refresh. Created private filtered log and docs/PHAN-TICH-API-LOG.md. Added shared endpoint filter for new capture and popup/export, local YYYYMMDDHHmm export names with same-minute sequence. npm run check: 16/16 tests pass and build 0.1.3 succeeds; task validation passes. System Decision Impact: candidate @decision/20261101-1629-exclude-measurement-endpoints-from-hwa-api-logs (added) — endpoint exclusions and export naming.
<!-- SECTION:NOTES:END -->

