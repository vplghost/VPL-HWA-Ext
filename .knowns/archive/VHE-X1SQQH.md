---
id: VHE-X1SQQH
title: Phan biet log API cu va ban tracking hien tai
status: done
priority: medium
labels: []
createdAt: '2026-11-01T09:13:13.260Z'
updatedAt: '2026-11-06T10:31:37.165Z'
completedAt: '2026-11-01T09:16:47.463Z'
timeSpent: 0
archivedAt: '2026-11-06T10:31:37.165Z'
---
# Phan biet log API cu va ban tracking hien tai

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
HAR cho thay POST /api/rpc co body JSON. Ban export 15:51 khong co truong body va co truoc ma capture body 15:57; can lam ro version va ban ghi cu trong popup/tai lieu.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Popup phan biet POST record cu chua co body fields voi body khong doc duoc
- [x] #2 Nguoi dung xem duoc version extension va buoc thu lai tracking
- [x] #3 Build/test/validation thanh cong
- [x] #4 Response RPC co kich thuoc khoang 322 KB duoc luu day du trong gioi han moi
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Doi chieu HAR/export/timestamp de chot chan doan. 2. Cap nhat popup hien version va trang thai ban ghi cu. 3. Cap nhat huong dan reload/thu lai. 4. Chay npm run check va Knowns validation.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Diagnosis: HAR has 25 POST /api/rpc fetch entries and its initiator includes intercept.js; HAR omits response.content.text. Export 15:51 predates body-capture code at 15:57. New export contains 14 RPC entries with non-null request/response bodies; 6 were truncated at 16000 chars. Fix: mark legacy entries, show extension version, raise per-body limit to 524288 chars while retaining 5 MB total budget.

Verified fresh export: 14 /api/rpc entries have non-null request and response bodies; 6 were truncated under prior 16000-character cap. Popup distinguishes legacy entries; extension version 0.1.2 and body cap 524288. npm run check: 11/11 pass; build and Knowns validation pass. HAR and exports remain gitignored. System Decision Impact: candidate @decision/20261101-1616-retain-rpc-sized-post-bodies-for-profiling (changed) — larger bounded POST body retention; stale 16000-character draft rejected.
<!-- SECTION:NOTES:END -->

