---
id: ajap7g
title: Guild Versus separates unknown state from rule metadata
key: guild-versus-separates-unknown-state-from-rule-metadata
layer: project
category: pattern
status: active
confidence: high
lastVerified: '2026-11-14T14:52:07.160Z'
ttlDays: 90
sources:
  - '@task-VHE-VT9095'
  - src/utils/guildVersusView.ts
  - tests/guild-versus-unknown.test.mjs
tags:
  - ui
  - unknown
  - guild-versus
createdAt: '2026-11-14T14:52:07.160Z'
updatedAt: '2026-11-14T14:52:07.160Z'
---

guildVersusView normalizes absent/invalid metrics and eligibility to null while preserving server 0/false. Ready requires known claims, both actual eligibility flags and a positive packaged threshold; missing rules/progress never imply eligibility. Use this view pattern for future account-status cards. Canonical: @doc/architecture/goals-tracking and @doc/architecture/wxt-vue-tailwind-conventions.
