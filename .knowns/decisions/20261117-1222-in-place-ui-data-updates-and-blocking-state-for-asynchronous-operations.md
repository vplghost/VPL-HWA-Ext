---
id: 20261117-1222-in-place-ui-data-updates-and-blocking-state-for-asynchronous-operations
title: In-place UI data updates and blocking state for asynchronous operations
status: draft
supersedes: []
supersededBy: []
tags:
  - ui
  - async
  - ux
  - reactivity
sources:
  - src/components/dialogs/ExpeditionsModal.vue
relatedDocs:
  - architecture/wxt-vue-tailwind-conventions
relatedTasks: []
verification: []
reviewState: needs_evidence
reviewBlockers:
  - candidate needs at least one linked task or a spec with linked tasks before acceptance
reviewMatches: []
reviewAllowedResolutions: []
reviewEvaluatedHash: 'a1441e51e5922873c6ccf510d47d0b3256c18bed48a8bcfd20b630c068abe986'
reviewEvaluatedAt: '2026-11-17T05:22:21.142Z'
createdAt: '2026-11-17T05:22:21.142Z'
updatedAt: '2026-11-17T05:22:21.142Z'
---

## Context

When performing asynchronous operations (such as claiming rewards, refreshing data, or starting queues), UI components that completely re-render, unmount, or clear intermediate state cause severe visual jitter, layout shift, and blank content flashing before the server response arrives. Furthermore, allowing user clicks while mutations are in-flight causes duplicate requests or race conditions.

## Decision

All UI components executing asynchronous mutations must apply in-place data updates rather than tearing down and recreating DOM trees. Retain existing valid display data during in-flight requests until the full replacement dataset has settled. When a re-render is necessary, defer it until all required information is fully loaded. Display a focused loading or blocking state (e.g., slot-level spinners, disabled triggers, or soft overlays) to block user input during pending operations and eliminate blank-state flashes.

## Alternatives Considered

Immediate unmount/blanking of slot data while awaiting next server snapshot (rejected: causes jarring layout jumping and degraded UX); Global modal re-mounting (rejected: causes scroll loss and flicker).

## Consequences

UI transitions become smooth and flicker-free. Async components must maintain stable display structures, guard against intermediate null/unknown states, and lock interaction triggers until operations complete.
