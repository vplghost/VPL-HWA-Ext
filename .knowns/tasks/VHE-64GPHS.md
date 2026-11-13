---
id: VHE-64GPHS
title: Populate dashboard queues marches and daily completion states
status: done
priority: medium
labels: []
createdAt: '2026-11-13T05:13:11.176Z'
updatedAt: '2026-11-13T05:21:12.689Z'
completedAt: '2026-11-13T05:21:12.689Z'
timeSpent: 464
---
# Populate dashboard queues marches and daily completion states

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Show live construction/research queues and active marches from normalized RPC cache. Correct daily Tower, Arena/Grand Arena and Dungeon statuses, including today's attacks followed by no surviving eligible titans for any next door. Preserve unknown/stale states and distinguish exhausted daily runs from available actions.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Queue Status shows normalized live building and research data with correct time units and ready/idle/unknown states.
- [x] #2 Active Marches shows gather, raid, monster and returning/battle marches with correct stage/countdowns and dialog links; expired returns disappear.
- [x] #3 Daily activities mark fresh cleared Tower and exhausted Arena/Grand Arena done; Dungeon done only with same-day combat and every next door exhausted, retaining pending/unknown otherwise.
- [x] #4 Dashboard reacts to cache/time changes; targeted behavior tests, typecheck and build pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reuse normalized buildingStatus/researchStatus queues, march badge/expiry helpers and daily dungeon/tower cache evidence.
2. Populate QueuesOverview with every active/ready queue, metadata names, countdowns and clickable marches including return/battle/wait stages; distinguish missing snapshots from idle.
3. Add daily activity helpers for fresh Tower completion, Arena/Grand Arena exhaustion and Dungeon exhaustion only after today's combat and no eligible surviving titans across all next doors; reset stale observations to unknown.
4. Wire reactive timers/cache updates and explicit Dashboard refresh through existing dispatch settings.
5. Add behavior tests for queue timing, march lifecycle, daily completion/unknown/reset and run typecheck, relevant tests/build and Knowns validation.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented dashboardState queue and march selectors, showing every normalized construction/research upgrade and clickable march lifecycle, using metadata/tooltips and useNow. Activity helpers distinguish fresh completed Tower, exhausted Arena/Grand Arena, and Dungeon exhausted across all eligible owned titans/next doors after today's battle; server reset window/local fallback. Hydra exhausted attempts now Done; quests distinguish remaining daily work and missing reward snapshots. Refresh All now fetches required source RPCs through existing dispatch policy, including userGetInfo for Arena attempts. Added 10 behavioral tests including actual SFC setup reactivity. Validation: full npm test 585 tests, 573 pass, 12 optional-data skips, 0 failures; typecheck pass; build and artifact validation pass. Browser/live game visual acceptance not run.
System Decision Impact: candidate @decision/20261113-1221-derive-dashboard-daily-completion-from-fresh-authoritative-evidence (added) — evidence-based Dashboard daily completion and normalized data lifecycle. See @doc/architecture/dashboard-live-status-model.
<!-- SECTION:NOTES:END -->

