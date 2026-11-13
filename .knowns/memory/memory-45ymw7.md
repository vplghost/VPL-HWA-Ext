---
id: 45ymw7
title: Remember dialog team choices and require explicit dismissal
key: remember-dialog-team-choices-and-require-explicit-dismissal
layer: project
category: preference
status: active
lastVerified: '2026-11-13T12:23:25.877Z'
sources:
  - User, 2026-11-13, dialog team persistence and backdrop requests
  - '@task-VHE-A1W68G'
  - '@doc/architecture/dialog-team-memory-and-explicit-dismissal'
tags:
  - dialogs
  - teams
  - user-preference
createdAt: '2026-11-13T12:23:25.877Z'
updatedAt: '2026-11-13T12:23:25.877Z'
---

User requested on 2026-11-13: remember the last selected team for future dialog openings, and disable closing dialogs by clicking their backdrop. **Why:** Preserve setup choices and avoid dismissing a dialog accidentally while configuring or monitoring a game action. Implemented by useDialogTeamSelection with separate account/dialog storage; shared ModalDialog and standalone overlays retain close buttons and Escape without backdrop dismissal. See @doc/architecture/dialog-team-memory-and-explicit-dismissal.
