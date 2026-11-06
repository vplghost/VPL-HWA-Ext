---
id: VHE-EBNKTR
title: Luu body request va response cho POST tracking
status: done
priority: medium
labels: []
createdAt: '2026-11-01T08:55:15.131Z'
updatedAt: '2026-11-06T10:31:33.779Z'
completedAt: '2026-11-01T08:58:13.129Z'
timeSpent: 0
archivedAt: '2026-11-06T10:31:33.779Z'
---
# Luu body request va response cho POST tracking

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Mo rong tracking fetch/XHR de luu body POST dang text/JSON va xem/xuat tu popup, co gioi han dung luong va khong anh huong luong xu ly game.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 POST fetch/XHR luu request va response data khi dang text/JSON; request khac chi giu metadata
- [x] #2 Gioi han body va tong dung luong luu tru; body khong doc duoc duoc xu ly an toan
- [x] #3 Popup hien body va JSON export chua body; tai lieu mo ta du lieu va gioi han
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Mo rong hook fetch/XHR de doc body POST an toan va khong doi ket qua game. 2. Chuan hoa/han che ban ghi trong background va cap nhat popup. 3. Cap nhat huong dan va tests. 4. Chay npm run check, validation, doi chieu draft Decision cu.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented bounded POST request/response body capture for fetch and XHR, popup inspection/export, and documentation. npm run check: 10 tests pass and build succeeds; Knowns validation and git diff --check pass. Rejected stale metadata-only draft after user changed scope. System Decision Impact: candidate @decision/20261101-1557-bounded-post-body-capture-for-api-profiling (changed) — bounded POST body logging.
<!-- SECTION:NOTES:END -->

