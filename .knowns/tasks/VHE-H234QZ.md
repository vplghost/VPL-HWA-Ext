---
id: VHE-H234QZ
title: Refactor Vue components to import typed data and services directly without globalThis.hwaHelper in-progress
status: done
priority: high
labels:
  - typescript,vue,refactor
createdAt: '2026-11-16T04:10:37.927Z'
updatedAt: '2026-11-16T04:26:37.543Z'
completedAt: '2026-11-16T04:26:37.543Z'
timeSpent: 0
assignee: '-s'
---
# Refactor Vue components to import typed data and services directly without globalThis.hwaHelper in-progress

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Update Vue components to import directly from src/data/*, src/services/*, and src/utils/* rather than falling back to (globalThis as any).hwaHelper...
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Update BuildingModal and ResearchModal to use typed building/research data and queue services
- [x] #2 Update CampaignRaidModal, GuildVersusModal, ActivityGoals, HeroHoverCard, TitanHoverCard, FabDial, TabNav to use typed imports
- [x] #3 Verify typecheck passes with 0 errors and all unit tests pass
<!-- AC:END -->

