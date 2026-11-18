---
id: 20261118-1954-enforce-warm-amber-theme-for-building-and-cool-purple-theme-for-research-across-extension-ui
title: Enforce warm amber theme for building and cool purple theme for research across extension UI
status: rejected
supersedes: []
supersededBy: []
tags:
  - ui
  - theme
  - building
  - research
sources:
  - src/components/dialogs/ResearchModal.vue
  - src/components/dialogs/BuildingModal.vue
  - src/components/dashboard/QueuesOverview.vue
relatedDocs: []
relatedTasks:
  - VHE-9BP80S
verification: []
reviewState: ''
reviewBlockers: []
reviewMatches:
  - id: 20261118-1904-enforce-english-only-ui-language-across-extension-components
    title: Enforce English-only UI language across extension components
    status: accepted
    score: 0.850000
    kind: conflict
    hash: d4cafe3aeead8d3481c0b966be1a35842590c84b09eac1be803270544c03b069
    matchedBy:
      - 'lexical:conflict_topic'
    snippet: All user-facing UI text, buttons, labels, tooltips, dialogs, badges, and options across all extension components must strictly use English. No Vietnamese or mixed-language text strings are permitted in src/ components...
    tags:
      - ui
      - localization
      - language
reviewAllowedResolutions: []
reviewEvaluatedHash: 'c6da79a4d30bc0932733f693d77141da952ff298dec1223f7e321cd12263929f'
reviewEvaluatedAt: '2026-11-18T12:55:58.943Z'
createdAt: '2026-11-18T12:54:40.324Z'
updatedAt: '2026-11-18T12:56:13.028Z'
---

## Context

Building and Research are the two core progression pillars in the extension. Previously, several Research dialog elements leaked Building warm amber styles (active queue cards, auto-queue checkboxes, status badges, and speedup controls), creating visual confusion.

## Decision

Enforce strict theme separation across all UI components: 1) Building (City Construction) must consistently use the warm amber theme (amber-100/amber-800 badges, border-amber-200/bg-amber-50 cards, amber-500 progress/dots, amber speedup). 2) Research (Academy) must consistently use the cool purple theme (purple-100/purple-800 badges, border-purple-200/bg-purple-50 cards, purple-500 progress/dots, purple speedup). This rule applies across BuildingModal, ResearchModal, Dashboard QueuesOverview, Header navbar badges, and SpeedupControl.

## Alternatives Considered


## Consequences

Guarantees immediate visual distinction between construction and technology research. Future UI additions must respect this color mapping without cross-theme leakage.
