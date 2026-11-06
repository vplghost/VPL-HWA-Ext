---
id: hedex0
title: Standardize all UI and user-facing content in English
layer: project
category: preference
status: active
confidence: high
lastVerified: '2026-11-06T10:27:54.670Z'
sources:
  - '@task-VHE-WABVR0'
  - 'extension/popup.js:renderDraft'
  - tests/legend-draft-ui.test.mjs
  - '@task-VHE-MRH4NM'
tags:
  - i18n,ui,standardization
createdAt: '2026-11-01T18:40:45.212Z'
updatedAt: '2026-11-06T10:27:54.670Z'
---

All extension UI labels, buttons, stage descriptions, status messages and tooltips use English; preserve that language for future UI work.

**Why:** The existing preference records the user’s request for English standardization on 2026-11-02 in @task-VHE-WABVR0. The current renderers and English-language UI assertions corroborate the implemented convention. Audited under @task-VHE-MRH4NM.
