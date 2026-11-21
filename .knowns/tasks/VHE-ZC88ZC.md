---
id: VHE-ZC88ZC
title: Allow queueing unbuilt buildings when research or level prerequisites are met
status: done
priority: high
labels:
  - building,queue,frontend,dialog
createdAt: '2026-11-21T03:49:32.879Z'
updatedAt: '2026-11-21T03:58:17.604Z'
completedAt: '2026-11-21T03:58:17.604Z'
timeSpent: 0
assignee: '@me'
---
# Allow queueing unbuilt buildings when research or level prerequisites are met

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Define STANDALONE_BUILDING_IDS, BUILDING_RESEARCH_REQUIREMENTS, and hasCompletedResearch in buildingData
- [x] #2 Update getEligibleCandidates in buildingQueue to evaluate unbuilt standalone buildings against research and level requirements
- [x] #3 Update BuildingModal to integrate completed researches and display eligible unbuilt buildings as Build Lv. 1 candidates
- [x] #4 Add unit tests verifying unbuilt buildings (Infirmary 2/3, Headquarters 1/2/3) unlock in candidates when research or Hall prerequisites are satisfied
<!-- AC:END -->

