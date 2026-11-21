---
id: VHE-AZFWND
title: Decouple modal stack management from globalThis in useModals and modal dialogs
status: done
priority: high
labels:
  - refactor,modals
createdAt: '2026-11-21T05:12:47.325Z'
updatedAt: '2026-11-21T05:14:35.826Z'
completedAt: '2026-11-21T05:14:35.826Z'
timeSpent: 0
---
# Decouple modal stack management from globalThis in useModals and modal dialogs

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 ModalDialog, GuildVersusModal, MonsterModal, and QuestDetailModal import useModals directly
- [ ] #2 Remove globalThis.__hwaModalStack registration from useModals.ts
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decoupled modal stack management from globalThis; ModalDialog, GuildVersusModal, MonsterModal, and QuestDetailModal now directly import from useModals.ts and __hwaModalStack export removed
<!-- SECTION:NOTES:END -->

