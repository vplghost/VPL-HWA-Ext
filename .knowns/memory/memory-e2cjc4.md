---
id: e2cjc4
title: Chrome callback APIs must not resolve their Promise through an undefined return
key: chrome-callback-apis-must-not-resolve-their-promise-through-an-undefined-return
layer: project
category: failure
status: active
confidence: high
lastVerified: '2026-11-14T18:15:50.013Z'
ttlDays: 90
sources:
  - '@task-VHE-D0K20G'
  - 'extension/background.js:findActiveGameTab'
  - tests/gather-reload.test.mjs
  - scripts/browser-gather-acceptance.mjs
tags:
  - chrome
  - callbacks
  - gathering
  - debug
createdAt: '2026-11-14T18:15:50.013Z'
updatedAt: '2026-11-14T18:15:50.013Z'
---

findActiveGameTab used chrome.tabs.query(filter, resolve) || resolve([]), which resolved the Promise immediately because real Chrome callback APIs return undefined before invoking callbacks asynchronously. Synchronous mocks hid the bug and Smart gathering start/periodic ticks found no tab. Both paths now explicitly wait for the callback. Require asynchronous callback/fallback tests and real browser background→bridge→MAIN acceptance for automation scheduling. Canonical evidence and Direct1→3 fixture result: @doc/specs/smart-auto-gathering and docs/acceptance/gather-2026-11-15.json.
