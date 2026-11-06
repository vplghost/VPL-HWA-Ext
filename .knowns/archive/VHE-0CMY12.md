---
id: VHE-0CMY12
title: Do CDN assets va hien thi ten heroes items
status: done
priority: medium
labels: []
createdAt: '2026-11-01T10:17:24.025Z'
updatedAt: '2026-11-06T10:31:30.876Z'
completedAt: '2026-11-01T10:24:34.289Z'
timeSpent: 0
archivedAt: '2026-11-06T10:31:30.876Z'
---
# Do CDN assets va hien thi ten heroes items

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Khao sat cac CDN request quan sat duoc, tai asset metadata phu hop de map ID sang ten co the doc, dua ket qua vao popup va tai lieu ma khong them polling/API call tu extension.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Co bang/chung cu ve asset CDN va nguon mapping heroes/items
- [x] #2 Popup hien ten tu mapping xac thuc khi co du lieu, van hoat dong khi mapping thieu
- [x] #3 Extension khong chu dong polling hay goi API game de tai mapping
- [x] #4 Tai lieu, test va build duoc cap nhat
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Kiem ke URL CDN trong HAR/log va kiem tra asset cong khai da quan sat. 2. Chon nguon mapping co the kiem chung va luu du lieu can thiet trong extension. 3. Them cot ten popup voi fallback, cap nhat docs. 4. Kiem tra test/build/validate.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified indexGet locale metadata against fetched CDN asset (681890 bytes, MD5 11eccb72982f5d7df36a550a821b0fcc); documented HAR CDN inventory and mapping. Removed 10 unresolved LIB_* values, added name-map tests, regenerated data docs. npm run check: 25 passed and build succeeded; knowns validate: 0 errors.

Da khao sat HAR/log va indexGet, tai locale en.json.gz va splitlib zip vao temp (git ignored). Phat hien locale co LIB_HERO_NAME va ten item; script names:update lay URL tu indexGet, kiem tra size/MD5, tao data-names.js dong goi. Popup/docs co cot ten, fallback khi thieu ten; khong them request runtime. npm run docs:data va npm run check dat 25/25, build 0.3.0. System Decision Impact: candidate @decision/20261101-1724-dong-goi-ten-asset-cdn-khong-tai-trong-popup (added) — bang ten dong goi tu CDN, popup tra cuu noi bo.

Backlog disposition 2026-11-06 (@task-VHE-MRH4NM): The old pinned 1.292 name/asset source is historical; @task-VHE-JTJQJK refreshes verified 1.293 manifest/catalog/locale. Current provenance lives in @doc/workflows/versioned-cdn-asset-synchronization.
<!-- SECTION:NOTES:END -->

