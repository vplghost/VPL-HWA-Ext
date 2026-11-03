---
id: 3wsnt1
title: Resource labels must have a string fallback before name sorting
key: resource-labels-must-have-a-string-fallback-before-name-sorting
layer: project
category: failure
status: active
confidence: high
lastVerified: '2026-11-03T06:11:33.143Z'
sources:
  - resourceLabel
  - '@task-VHE-EZ49PN'
tags:
  - resources
  - popup
  - debug
createdAt: '2026-11-03T06:11:33.143Z'
updatedAt: '2026-11-03T06:11:33.143Z'
---

`resourceEntries` accepts finite-amount cache entries even when their `data.label` is absent. `resourceLabel` must return a nonempty string derived from the resource key; otherwise Resources name sorting calls `localeCompare` on `undefined` and crashes the popup. The regression is covered by the unlabeled Resources test.
