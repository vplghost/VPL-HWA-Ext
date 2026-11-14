---
id: VHE-CB9VBW
title: Withdraw threatened gatherers when hospital is full
status: blocked
priority: medium
labels:
  - from-spec
  - gathering
  - spec:smart-auto-gathering
createdAt: '2026-11-14T11:51:46.577Z'
updatedAt: '2026-11-14T12:07:46.928Z'
timeSpent: 62
spec: specs/smart-auto-gathering
fulfills:
  - AC-6
order: 60
---
# Withdraw threatened gatherers when hospital is full

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Verify incoming mine attack ownership/ETA and free hospital capacity, then recall in final10s only when troop count exceeds hospital space. Required MQTT and hospital evidence is currently missing.

Blocked by @task-VHE-MA5SJK{blocked-by}
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A verified hostile attack must target the player's current mine and squad.
- [ ] #2 Only insufficient hospital space and 0<impactETA<=10s trigger a single recall.
- [ ] #3 Missing ETA/ownership/capacity leaves automatic defense inactive and lists the evidence the user must provide.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read spec Locked Decisions and inspect existing gathering coordination contracts. 2. Implement only evidence-backed behavior for AC-6, recording exact missing inputs without guesses. 3. Add outcome tests and wire background/UI as required. 4. Review diff, document verification and decision impact, validate task.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Blocked on E6 only: user explicitly says they will provide incoming-attack tracking later. Existing MQTT routeCreated gives routeId/from/to but no hostile owner, targeted owned mine/squad or impactAt, so no safe trigger for final10s exists. User clarified hospital free capacity = sum current Infirmary capacities minus wounded count; keep unknown inputs explicit. No defense RPC/timer stub shipped. Unchecked ACs require capture from before attack, route/ETA updates/cancel, impact and corresponding own mine/squad; cross-check hospital UI capacity/wounded when capture arrives. Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass. System Decision Impact: none — missing evidence tracked, no new runtime guidance.
<!-- SECTION:NOTES:END -->

