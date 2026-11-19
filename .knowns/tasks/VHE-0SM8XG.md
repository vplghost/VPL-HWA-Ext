---
id: VHE-0SM8XG
title: 'Fix artifact_levelUp slotId indexing (0: weapon, 1: book, 2: ring) and cache reduction'
status: done
priority: high
labels:
  - heroes
  - artifacts
  - bug
createdAt: '2026-11-19T17:29:39.800Z'
updatedAt: '2026-11-19T17:31:36.443Z'
completedAt: '2026-11-19T17:31:36.443Z'
timeSpent: 0
---
# Fix artifact_levelUp slotId indexing (0: weapon, 1: book, 2: ring) and cache reduction

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Update artifactHelper slot mapping to 0: weapon, 1: book, 2: ring
- [x] #2 Update HeroDetailModal to pass 0-indexed slotId and render icons correctly
- [x] #3 Fix rpcCache artifactLevelUpAction to index artifacts array directly by slotId
- [x] #4 Update unit tests and compile production build
<!-- AC:END -->

