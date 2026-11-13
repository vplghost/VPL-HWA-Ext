---
id: VHE-WH13EE
title: Correct current troop caps to Drill Grounds only and align progress
status: done
priority: medium
labels: []
createdAt: '2026-11-13T13:12:06.351Z'
updatedAt: '2026-11-13T13:17:07.565Z'
completedAt: '2026-11-13T13:17:07.565Z'
timeSpent: 257
---
# Correct current troop caps to Drill Grounds only and align progress

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User clarifies latest game ignores Camps for per-type troop stock limits. Sum completed Drill Grounds only, and render stock progress relative to the actual cap with explicit overflow and unknown states. Example L19=7400 and L14=6830 totals14230; reported14320 is awaiting clarification, so do not fabricate a90-point bonus.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Confirmed Drill Grounds182/183/184 alone determine the same computed cap for each troop type; Camps and queued upgrades never add stock capacity.
- [x] #2 L19=7400 and L14=6830 sum correctly with no invented bonus; a valid explicit server limit remains authoritative.
- [x] #3 Progress uses true cap, stays visually within0–100%, shows overflow/unknown meaningfully and training remains bounded.
- [x] #4 Tests/typecheck/build pass; superseded guidance corrected, version/changelog and commit completed.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Remove legacy Camp capacity from active model/generator and preserve authoritative server limits where available. 2. Replace overflow-normalized progress with cap-relative clamped segments, occupancy text and excess/unknown state. 3. Update regression cases/docs/memory to replace superseded Camp-stock assumptions. 4. Validate tests/typecheck/build, increment version/changelog and commit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
User clarified reported14320 was a typo; actual example is7400+6830=14230. Removed Camp capacity from calculation and generated data/generator. All three troop types use only completed Drill Grounds182/183/184; queued levels and legacy Camp rows ignored. Added cap-relative progress helper and card integration: raw occupancy, explicit excess, clamped sequential segments/shrink-0, neutral unknown state, zero-cap handling and progressbar accessibility. Training remains bounded. Rewrote canonical doc/memory to remove obsolete Camp contribution; rejected previous incorrect draft rather than leave it live.
Verification: 638 tests total, 626 pass, 12 optional private-data skips, zero failures; typecheck and production build passed. Release0.10.58 with changelog and synchronized manifests prepared for authorized commit. The user example, max-level Camps ignored, overflow and actual card reactivity are covered.
System Decision Impact: candidate @decision/20261113-2016-use-drill-grounds-only-for-current-troop-stock-caps (changed) — replaces incorrect legacy Camp contribution with confirmed current-game rule and cap-relative progress.
<!-- SECTION:NOTES:END -->

