---
id: doc-411ec8bb49dbafc0b269cecc3ed99767
title: Dialog team memory and explicit dismissal
description: Account-isolated per-dialog team selection storage and backdrop click behavior.
createdAt: '2026-11-13T12:23:25.800Z'
updatedAt: '2026-11-13T12:23:25.800Z'
tags:
  - dialogs
  - teams
  - preferences
  - ui
---

# Dialog team memory and explicit dismissal

Implemented by @task-VHE-A1W68G for the user's requests on 2026-11-13 to remember the last selected team and to keep dialogs open on backdrop clicks.

## Selection storage

`useDialogTeamSelection(dialog, accountId)` owns a separate Chrome local storage key per account and dialog: `dialogTeam:<encoded account ID>:<dialog>`. Values contain optional teamId and heroIds. Separate keys prevent full preference writes or choices in another dialog/account from overwriting the remembered team. Store choices immediately on explicit selection; no game RPC is necessary.

Async load/save uses a revision and account/key guard. A newer choice invalidates pending reads, pending writes protect local choices from reload, account changes clear current selection before loading that account's key, and storage events keep open views synchronized. Unknown accounts cannot persist choices. Hero arrays are copied on save. Expose storage errors through the composable rather than reporting false persistence success.

`useSquadTeams` integrates remembered team IDs for Raid, Monster and Gathering. Existing account-bound legacy preferences remain fallback inputs and are still updated for automation compatibility, but no longer own the last selected team. Restoring the remembered team must take precedence over roster/preference reloads. Raid and Monster dialogs no longer assign their own competing restored team IDs after the shared helper loads. Gathering accepts its actual typed preference key without casts.

Brigand remembers both the custom preset ID and hero IDs, including explicit server-team selection and manual hero changes. Default server-team initialization is not an explicit choice and does not overwrite storage. Restore only owned hero IDs as the roster becomes available. Tower remembers the five selected hero slots independently of its legacy buff/options object, with guards for account changes; keep the existing towerAutomationSettings update for background compatibility.

Dialogs without a team-selection control (for example Dungeon doors or Draft's recorded team viewer) do not gain invented team controls or persistence semantics.

## Dismissal

Backdrop clicks never dismiss dialogs. The shared ModalDialog and standalone Building, Research, Raid, Monster, Campaign Raid, Hero Detail, Dungeon, Draft, Guild Versus and Quest Detail overlays have no backdrop close handler. Keep explicit close buttons and Escape. Do not remove backdrop layout, teleporting, click containment or focus behavior merely to change dismissal.

## Verification

`tests/dialog-team-selection.test.mjs` executes the actual composable and squad helper against mock Chrome storage: recreation, different accounts/dialogs, preference replacement, copied hero arrays and delayed reads. `tests/modal-dismissal.test.mjs` mounts the compiled shared Vue modal with a custom renderer, verifies backdrop clicks emit no close, and checks the close button, Escape and key listener cleanup. Brigand's existing actual setup tests continue to cover interaction with queue state.
