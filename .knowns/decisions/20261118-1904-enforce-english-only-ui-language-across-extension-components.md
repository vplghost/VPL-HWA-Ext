---
id: 20261118-1904-enforce-english-only-ui-language-across-extension-components
title: Enforce English-only UI language across extension components
status: accepted
supersedes: []
supersededBy: []
tags:
  - ui
  - localization
  - language
sources:
  - src/components/dashboard/IncomeOverview.vue
  - src/components/dialogs/GatheringModal.vue
  - src/composables/useSquadTeams.ts
relatedDocs: []
relatedTasks:
  - VHE-0RENVD
verification:
  - 'source:src/components/dashboard/IncomeOverview.vue'
  - 'source:src/components/dialogs/GatheringModal.vue'
  - 'source:src/composables/useSquadTeams.ts'
  - 'task:@task-VHE-0RENVD:done'
verifiedAt: '2026-11-18T12:04:38.483Z'
createdAt: '2026-11-18T12:04:08.403Z'
updatedAt: '2026-11-18T12:04:38.483Z'
---

## Context

Past iterations occasionally introduced ad-hoc Vietnamese text strings into UI components, dialogs, badges, and tooltips, resulting in an inconsistent mixed-language user interface.

## Decision

All user-facing UI text, buttons, labels, tooltips, dialogs, badges, and options across all extension components must strictly use English. No Vietnamese or mixed-language text strings are permitted in src/ components or templates.

## Alternatives Considered

Bilingual or Vietnamese UI strings were rejected because Hero Wars: Alliance and technical terminology are standardized in English, and mixing languages degrades layout predictability and visual consistency.

## Consequences

All future UI components, dialogs, and tools must author their text in English. All existing Vietnamese strings in src/ have been refactored to clean English equivalents.
