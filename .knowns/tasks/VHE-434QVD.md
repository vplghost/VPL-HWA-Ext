---
id: VHE-434QVD
title: Lap bang du lieu game va them cache tabs
status: done
priority: medium
labels: []
createdAt: '2026-11-01T09:43:46.145Z'
updatedAt: '2026-11-01T09:50:39.628Z'
completedAt: '2026-11-01T09:50:39.628Z'
timeSpent: 0
---
# Lap bang du lieu game va them cache tabs

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Phan tich log mau de tao bang heroes/items/cac nhom khac trong docs, them cache RPC co chon loc va giao dien popup tabs de xem cap nhat.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Docs co bang heroes, items, cac nhom du lieu khac va mo ta phuong phap trich xuat/cap nhat
- [x] #2 Extension cache cac response RPC huu ich co chon loc, khong cache auth/telemetry; cache cap nhat khi thay request moi
- [x] #3 Popup co tabs cho heroes, items, cac nhom du lieu khac va log, hien thoi gian cap nhat va cach nap lai cache
- [x] #4 Tests va build/validation dat
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Khao sat schema va tao generator docs an toan tu log. 2. Tach bo trich xuat RPC snapshot va luu cache trong background voi gioi han. 3. Xay popup tabs, bang du lieu, thoi gian va nut nap lai tu log. 4. Cap nhat huong dan, tests va chay verification.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Generated docs/HEROES.md (59 rows), docs/ITEMS.md (364 rows across 12 groups), docs/DATA-CATALOG.md (20 titans, 18 team modes and other snapshots) from ignored latest log via npm run docs:data. Added whitelist-based rpcCache with 2 MB budget, automatic updates and rebuild from retained log; popup tabs Heroes/Items/Titans/Teams/Other/Log with timestamps, search, reload-game update action, independent cache/log clears. Actual log yields 19 snapshots totaling 184804 bytes and excludes auth/chat. npm run check: 19/19 pass, build 0.2.0 and docs generation pass; Knowns validation passes. System Decision Impact: candidate @decision/20261101-1650-cache-selected-rpc-snapshots-independently-of-raw-logs (added) — bounded passive RPC cache and tabs. Browser smoke test not performed.
<!-- SECTION:NOTES:END -->

