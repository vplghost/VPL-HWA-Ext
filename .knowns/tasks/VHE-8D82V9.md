---
id: VHE-8D82V9
title: Fix Draft dialog isolation and show RPC queue count
status: in-progress
priority: high
labels: []
createdAt: '2026-11-06T04:27:39.044Z'
updatedAt: '2026-11-06T04:33:35.871Z'
timeSpent: 0
---
# Fix Draft dialog isolation and show RPC queue count

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Fix Draft header dialog replacing the active tab, show Draft icon only while active, replace shelved Wheel feature with live RPC queue count, verify and commit all outstanding task changes to a clean workspace.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Draft dialog opening and refresh preserve active tab content; icon only visible for active stages.
- [x] #2 Header shows the actual queued RPC count across enqueue, dispatch, cancellation and expiry.
- [x] #3 Wheel feature is archived and stops live tracking until explicitly resumed.
- [ ] #4 Changes are verified, built and committed in appropriate groups; git status is clean.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reproduce Draft renderer writing into global view and isolate dialog rendering; restrict alert visibility to active stages.
2. Publish actual interceptor queue counts through the bridge and display a live header count.
3. Archive Wheel implementation and docs, remove its active UI/reducer tracking, and preserve unrelated resource handling.
4. Add regression tests, build and validate, then commit outstanding implementation/docs/task groups until git status is clean.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fixed root cause: renderDraft previously replaced global view/status while rendering modal; target parameter now isolates dialog open and refresh. Header Draft icon hidden outside stages 1–6. Replaced Wheel badge with actual per-tab queue totals reported by interceptor through bridge/background; counters update on enqueue, dedup, consume, restore, cancellation, action/claim expiry and tab closure. Wheel UI/reducers/rule/tests are shelved in non-executable archive/wheel/free-spin.snapshot.txt and its prior memory archived. Added regression coverage. Full tests: 245 pass, 10 explicitly skipped optional private trace replays, 0 fail. Build 0.9.72 and docs validation pass. Implementation committed as 6ec7e2c; completing docs/task/config commits next. System Decision Impact: candidate @decision/20261106-1132-shelve-wheel-and-preserve-draft-dialog-isolation (changed) — preserves explicit Wheel suspension and dialog isolation guidance.
<!-- SECTION:NOTES:END -->

