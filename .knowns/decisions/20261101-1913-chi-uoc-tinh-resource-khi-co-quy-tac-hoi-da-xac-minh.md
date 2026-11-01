---
id: 20261101-1913-chi-uoc-tinh-resource-khi-co-quy-tac-hoi-da-xac-minh
title: Chi uoc tinh resource khi co quy tac hoi da xac minh
status: draft
supersedes: []
supersededBy: []
tags: []
sources:
  - '@task-VHE-PKDENV'
relatedDocs: []
relatedTasks:
  - VHE-PKDENV
verification: []
reviewState: needs_evidence
reviewBlockers:
  - 'linked task "VHE-PKDENV" is "in-progress"; all linked tasks must be done before accepting candidate'
reviewMatches: []
reviewAllowedResolutions: []
reviewEvaluatedHash: 'f2492247f0dea148653ba3165ca12f08a1bcbcf906d1321f070c776a75258f70'
reviewEvaluatedAt: '2026-11-01T12:13:59.072Z'
createdAt: '2026-11-01T12:13:59.072Z'
updatedAt: '2026-11-01T12:13:59.072Z'
---

## Context

RPC tra so du resource tai mot thoi diem; khong phai moi resource deu co quy tac hoi theo thoi gian.

## Decision

Chi tinh tang resource theo thoi gian neu co du lastRefillAt, refillAmount, refillEveryMs va cap da doi chieu tu cau hinh game. Snapshot API moi thay the so du va moc tinh cu. Cac resource khac giu so API gan nhat.

## Alternatives Considered


## Consequences

World Energy id=2 duoc tinh 1 diem moi 5 phut, tran 200; cac refillable khac khong duoc uoc tinh khi chua co cau hinh xac minh.
