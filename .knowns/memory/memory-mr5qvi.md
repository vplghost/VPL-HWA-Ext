---
id: mr5qvi
title: WXT artifact completeness and migration architecture review
key: wxt-artifact-completeness-and-migration-architecture-review
layer: project
category: failure
status: active
lastVerified: '2026-11-13T04:00:44.421Z'
sources:
  - wxt.config.ts
  - scripts/validate-extension.mjs
  - '@task-VHE-FY1G5K'
  - '@doc/architecture/wxt-vue-tailwind-conventions'
tags:
  - migration
  - wxt
  - build
  - architecture
createdAt: '2026-11-13T04:00:44.421Z'
updatedAt: '2026-11-13T04:00:44.421Z'
---

Review extension 0.10.52 found wxt:build produced popup-only artifacts while manifest referenced missing classic worker/content runtime; legacy hybrid build could hide Vue failures. The corrected wxt.config.ts public-assets hook and scripts/validate-extension.mjs enforce complete runtime and alarms permission; npm run check now runs strict Vue typecheck, behavioral tests and fail-fast WXT distribution. See @doc/architecture/wxt-vue-tailwind-conventions before future migration work; browser acceptance remains separate.
