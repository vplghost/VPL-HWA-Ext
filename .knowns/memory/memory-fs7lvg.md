---
id: fs7lvg
title: Popup auto-join uses classic team normalization helper
key: popup-auto-join-uses-classic-team-normalization-helper
layer: project
category: failure
status: active
lastVerified: '2026-11-13T16:11:53.769Z'
sources:
  - 'extension/experimental-data.js:normalizeCustomTeam'
  - 'src/composables/usePopupAutomation.ts:usePopupAutomation'
  - '@task-VHE-G4DDSQ'
tags:
  - popup
  - teams
  - debug
  - normalization
createdAt: '2026-11-13T16:11:53.769Z'
updatedAt: '2026-11-13T16:11:53.769Z'
---

The popup calls hwaHelperExperimentalData.autoJoinTeamOptions from extension/experimental-data.js via usePopupAutomation, not the parallel TypeScript utility. Object-form saved heroIds crashed normalizeCustomTeam at new Set when the classic implementation lacked asArray normalization already present in TS. The classic helper now normalizes arrays/object values for heroIds and custom-team collections before iteration, rejecting malformed IDs through existing ownership/size validation. Regression coverage includes the real usePopupAutomation computed and saving selected heroes.
