---
id: VHE-PKDENV
title: Resources, hoi theo thoi gian va header account/timers
status: done
priority: high
labels: []
createdAt: '2026-11-01T12:08:18.927Z'
updatedAt: '2026-11-06T10:31:36.032Z'
completedAt: '2026-11-01T12:14:21.844Z'
timeSpent: 0
archivedAt: '2026-11-06T10:31:36.032Z'
---
# Resources, hoi theo thoi gian va header account/timers

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Trich va hien thi cac so du resource duoc xac minh tu log RPC moi trong tab Resources
- [x] #2 Resource co chu ky hoi duoc tinh theo thoi gian, co gioi han va snapshot API moi ghi de uoc tinh
- [x] #3 Moi resource co checkbox de hien ben duoi Energy tren header va lua chon duoc luu
- [x] #4 Header hien ten account va thoi gian building/research con lai theo gio:phut
- [x] #5 Kiem thu, tai lieu, build va validate hoan tat
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Thong ke truong resource, account va queues trong log moi; doi chieu cau hinh resource cua game. 2. Trich snapshot gon va an toan vao rpcCache, co co che hop nhat theo thoi diem. 3. Them ham tinh resource/timer va tab Resources, checkbox header. 4. Cap nhat tai lieu va test; chay check/build/validate.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Da trich 204 resource tu 397 record log 202611011829; 88 refillables userGetInfo, World id2/id6, inventory world va cac nhom item tien te. World Energy tinh 1/5 phut toi da 200 theo remoteConfigInit.refillableResource; API moi ghi de. Header account va queue building/research; tab Resources co checkbox luu resourceSelection. npm run check: 34/34, build pass; Edge headless Resources: 2 checkbox, header resource/account/research dung; knowns validate 0 errors (8 memory warnings cu). System Decision Impact: candidate @decision/20261101-1913-chi-uoc-tinh-resource-khi-co-quy-tac-hoi-da-xac-minh (added) — chi tinh hoi khi co rule duoc xac minh.
<!-- SECTION:NOTES:END -->

