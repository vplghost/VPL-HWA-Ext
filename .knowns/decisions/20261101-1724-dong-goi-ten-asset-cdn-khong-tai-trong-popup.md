---
id: 20261101-1724-dong-goi-ten-asset-cdn-khong-tai-trong-popup
title: Dong goi ten asset CDN, khong tai trong popup
status: accepted
supersedes: []
supersededBy: []
tags: []
sources:
  - '@task-VHE-0CMY12'
relatedDocs: []
relatedTasks:
  - VHE-0CMY12
verification:
  - 'source:@task-VHE-0CMY12'
  - 'task:@task-VHE-0CMY12:done'
verifiedAt: '2026-11-06T10:57:44.893Z'
createdAt: '2026-11-01T10:24:38.758Z'
updatedAt: '2026-11-06T10:57:44.893Z'
---

## Context

indexGet tu RPC game cung cap locale CDN co kich thuoc va MD5; nguoi dung can ten heroes/items de doc.

## Decision

Bang ten ID cua Heroes, Titans va Items duoc tao tai thoi diem phat trien tu en.json.gz duoc indexGet chi den, kiem tra kich thuoc/MD5 va dong goi trong extension. Popup chi tra cuu bang ten noi bo; khong tai CDN, khong goi API game hay polling. Cache so lieu tiep tuc cap nhat thu dong tu RPC game. ID khong co ten xac thuc giu cot ten rong/dau gach va van hien ID.

## Alternatives Considered


## Consequences

Khi game doi phien ban, chay names:update voi log co indexGet moi va build lai; khong tu dong cap nhat bang ten trong popup.
