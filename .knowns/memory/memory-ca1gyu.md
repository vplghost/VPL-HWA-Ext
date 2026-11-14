---
id: ca1gyu
title: Disposable Chrome fixtures prove browser integration with explicit limits
key: disposable-chrome-fixtures-prove-browser-integration-with-explicit-limits
layer: project
category: pattern
status: active
confidence: high
lastVerified: '2026-11-14T14:52:07.205Z'
ttlDays: 90
sources:
  - '@task-VHE-HHA1TB'
  - scripts/browser-backlog-acceptance.mjs
  - docs/acceptance/browser-2026-11-14.json
tags:
  - browser
  - acceptance
  - cdp
createdAt: '2026-11-14T14:52:07.205Z'
updatedAt: '2026-11-14T14:52:07.205Z'
---

scripts/browser-backlog-acceptance.mjs and scripts/browser-cdp.mjs run both unpacked artifacts in a disposable temp Chrome profile with all game requests fulfilled locally. Foreground UI before matchMedia checks; background delivery caused a false theme failure. Dialog rendering/queued read tests do not prove every entry point, live mutation, Unity action or MQTT broker. Canonical evidence/limits: @doc/audits/backlog-acceptance-audit-2026-11-14; workflow: @doc/architecture/wxt-vue-tailwind-conventions.
