---
id: VHE-49R1NS
title: Restore dialog RPC contracts and campaign result timeout safety
status: done
priority: high
labels:
  - migration
  - dialogs
createdAt: '2026-11-13T03:50:07.637Z'
updatedAt: '2026-11-13T04:02:11.020Z'
completedAt: '2026-11-13T04:02:11.020Z'
timeSpent: 0
parent: VHE-HRA25T
---
# Restore dialog RPC contracts and campaign result timeout safety

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Restore canonical quest claim/refresh contracts and bounded campaign result waits; remove duplicate chat/dungeon refreshes, avoid persisted cache reset and isolate Tower settings per account. Dungeon Auto remains intentionally hidden as in baseline HTML.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Quest claim uses quest_multiFarm and refresh uses established API names exactly once
- [x] #2 Chat and dungeon refresh dispatch one request each; dungeon reset does not persist authoritative cache
- [x] #3 Campaign timeout cannot succeed or reuse old drops; sequential loop stops with pending feedback
- [x] #4 Regression tests pass and intentionally hidden dungeon automation remains unchanged
- [x] #5 Individual/all quest claims use claim-rewards envelope and surface queued/rejected transport responses
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Use shared pure RPC call builders for quest refresh/claim; remove duplicate chat and dungeon refresh sends. Replace dungeon reset full-cache write with popup-local reset followed by authoritative refresh. Make campaign result wait return pending/error on timeout and never reuse stale drops; stop sequential continuation. Keep dungeon auto hidden as in HTML. Add behavioral tests for exact calls and fresh/stale/failed/pending campaign results.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented supported quest_multiFarm one/all claims and canonical quest refresh calls, removed duplicate chat/dungeon sends, made stale Dungeon reset popup-local. Campaign waits now reject pending timeout and never reuse stale drops; pending propagates through loop/direct caller without disabling mission for the day. Tower settings reject another or unknown account, with matching baseline account isolation test. Added focused storage shapes, guarded queue movement and normalized template indices for strict Vue typecheck.
Validation: node --test tests/dialog-rpc.test.mjs tests/wxt-vue-frontend.test.mjs: 50 tests, 50 pass, 0 fail. npx vue-tsc --noEmit: no diagnostics in owned dialog files (other workers integrating global check). Knowns targeted validate: 0 errors/warnings. Review: no new P1; helper contracts are wired into SFC consumers, no legacy renderer restored, no game mutation performed.
System Decision Impact: none — restores existing HTML RPC/account-isolation contracts; project-wide ownership and WXT rules documented by parent audit task.
Spec Decision Compliance: not applicable — standalone child task without linked spec.

Reopened after integrated review: quest_multiFarm must use claim-rewards envelope; refresh-rpc strips actions through allowActions=false. Replace sender and add envelope/error/queued behavioral tests.

Integrated P1 fixed: sendQuestClaim dispatches dedicated claim-rewards envelope so background enables claim allowlist; both individual and all claims in modal/tab use this sender, surface queued/rejected/error response and disable while sending. Behavioral test asserts exact envelope and queued/rejected/missing/transport branches. npm run typecheck passed; node --test tests/dialog-rpc.test.mjs tests/wxt-vue-frontend.test.mjs: 51 tests, 51 pass, 0 fail. Targeted Knowns validate rerun. No further changes to System Decision Impact (existing restored claim routing contract).
<!-- SECTION:NOTES:END -->

