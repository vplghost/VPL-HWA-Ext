---
id: 20261118-1956-visual-theme-separation-warm-amber-for-building-and-cool-purple-for-research
title: 'Visual theme separation: warm amber for building and cool purple for research'
status: accepted
supersedes: []
supersededBy: []
tags:
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
verification:
  - 'source:src/components/dialogs/ResearchModal.vue'
  - 'source:src/components/dialogs/BuildingModal.vue'
  - 'source:src/components/dashboard/QueuesOverview.vue'
  - 'task:@task-VHE-9BP80S:done'
verifiedAt: '2026-11-18T12:56:29.154Z'
createdAt: '2026-11-18T12:56:20.733Z'
updatedAt: '2026-11-18T12:56:29.154Z'
---

## Context

Building and Research are two core progression pillars in the extension. Previously, several Research dialog elements leaked Building warm amber styles (active queue cards, auto-queue checkboxes, status badges, and speedup controls), creating visual confusion.

## Decision

Enforce visual theme separation across all UI components: 1) Building (City Construction) consistently uses the warm amber theme (amber badges, border-amber-200/bg-amber-50 cards, amber progress bar, amber speedup). 2) Research (Academy) consistently uses the cool purple theme (purple badges, border-purple-200/bg-purple-50 cards, purple progress bar, purple speedup). This rule applies across BuildingModal, ResearchModal, Dashboard QueuesOverview, Header navbar badges, and SpeedupControl.

## Alternatives Considered


## Consequences

Guarantees visual distinction between construction and technology research. Future UI additions must respect this color mapping without cross-theme leakage.
