---
id: VHE-Z0RGFJ
title: Live-game acceptance of mutation completion after browser fixture audit
status: blocked
priority: medium
labels:
  - acceptance
  - live-game
  - followup
createdAt: '2026-11-14T14:51:08.461Z'
updatedAt: '2026-11-14T14:51:41.268Z'
timeSpent: 0
---
# Live-game acceptance of mutation completion after browser fixture audit

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-up to @task-VHE-HHA1TB. Real Chrome fixture acceptance proves mounted UI and read transport only; capture authorized live behavior per feature without treating queued acknowledgements as completion. Scope the run to selected representative actions and attach replayable, sanitized evidence; never enable automation solely to fill coverage.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Attach sanitized real-game completion/rejection evidence for representative building/research, training/healing, hero/craft, quest/expedition collection, campaign and rally/gather automation; list untested groups explicitly.
- [ ] #2 Verify live MQTT carrier/packet handling and account switch during pending mutation without cross-account completion.
- [ ] #3 Record game/extension versions, runtime errors, expected-versus-observed outcome and residual limitations; keep queued acknowledgement distinct from server completion.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Obtain an available authorized game session or supplied full lifecycle captures for the selected actions. 2. Replay sanitized captures as regressions before any live check. 3. Run one authorized representative action per group sequentially, record RPC/MQTT completion and rejected paths. 4. Attach evidence to the canonical browser audit and check only proven criteria.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Blocked on availability of a real game session or additional full lifecycle captures for the selected acceptance scenarios. No live game page/account is connected in the disposable Chrome fixture. The current fixture audit remains valid within its documented scope; this follow-up is not a claim that captured unit-test coverage is absent.
<!-- SECTION:NOTES:END -->

