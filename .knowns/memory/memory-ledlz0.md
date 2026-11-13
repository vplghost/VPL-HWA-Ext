---
id: ledlz0
title: Legend Draft Active Only Pick Matrix
layer: project
category: pattern
status: proposed
confidence: high
lastVerified: '2026-11-02T06:44:25.472Z'
ttlDays: 90
sources:
  - extension/popup.js
  - src/views/DraftModal.vue
tags:
  - draft,ui
createdAt: '2026-11-02T06:44:25.472Z'
updatedAt: '2026-11-02T06:44:25.472Z'
---

The 15 candidate heroes matrix and picking slots in Legend Draft are strictly gated by isActivelyDrafting, rendering only during active picking phases and hiding when locked, idle, or completed in favor of lineup review.
