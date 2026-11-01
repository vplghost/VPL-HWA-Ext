---
id: 20261101-1711-cache-game-cap-nhat-thu-dong-tu-rpc
title: Cache game cap nhat thu dong tu RPC
status: draft
supersedes: []
supersededBy: []
tags: []
sources:
  - '@task-VHE-Y5EAR4'
relatedDocs: []
relatedTasks:
  - VHE-Y5EAR4
verification: []
reviewState: needs_evidence
reviewBlockers:
  - 'linked task "VHE-Y5EAR4" is "in-progress"; all linked tasks must be done before accepting candidate'
reviewMatches: []
reviewAllowedResolutions: []
reviewEvaluatedHash: '8875c76d872a2070639df893df68a80137876e12d8cf10e9aa5f934dd7928863'
reviewEvaluatedAt: '2026-11-01T10:11:06.738Z'
createdAt: '2026-11-01T10:11:06.738Z'
updatedAt: '2026-11-01T10:11:06.738Z'
---

## Context

Extension phuc vu ca nhan; can tranh request dot bien toi server game.

## Decision

Cache Heroes, Items va cac nhom khac chi cap nhat tu RPC do game tu phat sinh ma hook quan sat duoc. Khong polling, khong chu dong goi API game va khong co nut refresh cache tay. Khi cache rong, popup co the nap mot lan tu log da luu cuc bo. Cong tac Ghi log chi dieu khien log tho, khong chan cap nhat cache neu Theo doi API van bat.

## Alternatives Considered


## Consequences

Giao dien co the hien du lieu cu den khi game tu phat sinh RPC phu hop; tai lieu docs/HUONG-DAN.md ghi ro cach hoat dong.
