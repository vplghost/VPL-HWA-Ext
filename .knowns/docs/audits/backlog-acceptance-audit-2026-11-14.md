---
id: doc-f313560be5f09842b8ea1159abb97ff4
title: Backlog Acceptance Audit 2026-11-14
description: Task/AC reconciliation, real Chrome fixture evidence and explicit live acceptance limits.
createdAt: '2026-11-14T14:51:42.720Z'
updatedAt: '2026-11-14T15:02:12.748Z'
tags:
  - audit
  - backlog
  - acceptance
  - browser
---

# Backlog Acceptance Audit 2026-11-14

## Reconciliation

Initial inventory: 118 non-archived tasks; 3 open tasks. No completed task had unchecked acceptance criteria. Work was processed sequentially.

- @task-VHE-VT9095: implemented unknown-aware Guild Versus state; all 3 ACs verified by compiled SFC render tests, typecheck and build. See @doc/architecture/goals-tracking.
- @task-VHE-HHA1TB: actual Chrome 157.0.8103.52, extension 0.10.82; dist and .output/chrome-mv3 installed in an isolated temporary profile. 74 browser checks per artifact, zero recorded popup Runtime exceptions. Machine-readable evidence: docs/acceptance/browser-2026-11-14.json. Reusable driver: scripts/browser-backlog-acceptance.mjs and scripts/browser-cdp.mjs.
- @task-VHE-YE18TG: remains shelved awaiting an authoritative all-participant rally power source. @task-VHE-G173WD lower-bound tooltip is complete separately; enemy incoming-attack power does not fill the missing rally-member contract.
- @task-VHE-Z0RGFJ tracks the remaining real-game acceptance, blocked on session/capture availability.

## Browser evidence and boundaries

Both artifacts load service worker, MAIN interception, isolated bridge and packaged UI. The harness opens standalone UI and a separate chrome.action popup, reloads UI, traverses all 9 tabs plus Settings, and renders 16 mounted dialogs/panels with empty and partial caches. Dialog opening uses the production compiled v-model callbacks, so it does not prove every user entry point. All 15 actual dialogs render and close with Escape; the nonmodal Guild Chat panel is separately observed. Shared ModalDialog now exposes role, accessible title and named close button. Keyboard Tab/shortcut Escape and light/dark/system color changes are exercised.

Account A to B switches account-scoped team lists; cache removal clears them. RPC remains disabled when feature tabs mount. Disabled dispatch is rejected. Piggyback and MQTT modes queue reads without prematurely populating cache, then resolve through a natural mocked fetch carrier. Direct mocked RPC rejection leaves the cache unknown. Recorder start/stop/export uses actual background/bridge plumbing. These are browser integration observations, not proofs of every account race or every mutation reducer.

## Per-feature live limitations

| Feature group | Browser evidence | Remaining live acceptance |
| --- | --- | --- |
| Header, navigation, resources, items, heroes, titans, teams, goals, events, guild | Empty/partial mount, theme, account team isolation | Actual gameplay values, all hover/dropdown/focus layouts and server filtering |
| Building/research | Dialog mount and Escape | Queue execution, server rejection, completion and account switch mid-flight |
| Training/healing | Dashboard render | Real capacities, mutation completion/rejection and hospital races |
| Hero skills/equipment/crafting | Hero detail mount | Actual inventory consumption, craft/upgrade outcomes |
| Quests/expeditions | Dialog mount | Real start/collect eligibility and end-to-end completion |
| Tower/dungeon/draft | Dialog mount | Complete real run and engine-dependent actions |
| Rally/monster/brigand/gathering | Dialog mount | Real march lifecycle, power, retaliation and timed withdrawal under network delay |
| Campaign | Dialog mount | Mission mutation, queued result timeout and server outcome |
| Guild Versus/chat | Unknown/zero eligibility model, panel mount | Current real season, unread/read/send and server errors |
| Recorder/RPC transport | Start/stop/export, disabled, queued, carrier and rejected read | Actual broker packets/encryption, UI export/search/sort/clear and rejected mutations |

No game server was contacted by the fixture pages: Fetch interception fulfills every request locally, with fake identity/auth. No Unity engine or live MQTT broker is present. Full live parity is explicitly unclaimed; see @task-VHE-Z0RGFJ.

## Reproduction learning

Use a NEW disposable Chrome profile, remote-debugging-port=0 and enable-unsafe-extension-debugging. Read its DevToolsActivePort; load unpacked builds via CDP Extensions.loadUnpacked. Run node scripts/browser-backlog-acceptance.mjs temp/<disposable-profile>. Never point this driver at a user profile: it uninstalls extensions and replaces pages inside the supplied profile. The driver validates the profile path is inside repository temp. Keep fixture target Fetch interception active for its full lifetime. Bring the UI target to the foreground before testing matchMedia change events; a background target delayed the event and initially looked like an app theme bug. No useTheme change was needed.

## Verification

Guild Versus targeted tests: 50 passed. Typecheck and build passed before browser run. Final integrated regression results are appended after execution. Global Knowns validation initially reported 0 errors and 20 existing legacy Memory trust-metadata warnings; this audit does not invent confidence/expiry for unrelated memories.

## Extracted tooling failure boundary

While editing scripts/generate-quest-data.mjs in this audit, Knowns code.replace regex replacement interpreted simple JavaScript ${name}/${md5} template expressions as replacement captures, deleting those expressions; the generator then failed on smart-gather-.json. The file was repaired with apply_patch and rerun against the pinned configs. Literal replacements involving backslash-heavy regular expressions also required source inspection. For future edits, prefer literal whole-text replacements for simple text; when replacement expansion changes code or LSP does not support .mjs/.vue, inspect the resulting source and use apply_patch for syntax-heavy snippets. Always execute the generator and a syntax/behavior check rather than accepting a successful edit-tool response as proof.
## Final integrated result

@task-VHE-X39972 is also complete: exact English locale title #364 Clear Brigand Camp 10 times; cumulative phases1/5/10; sanitized capture progress5 shown as5/10. Corrected all25 daily pack labels and #365 false Tower lock; full extraction in @doc/architecture/goals-tracking and @memory/h63h8p. Final browser report was refreshed after the quest changes:74 checks per artifact,148 total, zero recorded popup runtime exceptions. Full suite:783 tests,771 passed,12 optional private-capture skips; typecheck/build and git diff --check passed. Updated tasks/docs pass strict entity validation. Global Knowns validation:0 errors,20 existing legacy Memory trust warnings. Extraction added3 verified active Memories and1 draft System Decision; the draft has not been accepted.

Final task inventory:120 non-archived tasks,118 done,2 blocked (@task-VHE-YE18TG and @task-VHE-Z0RGFJ). No actionable todo/in-progress task remains. The two blocked items retain explicit evidence prerequisites; no completion is inferred from partial power or fixture acceptance.
