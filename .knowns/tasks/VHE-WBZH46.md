---
id: VHE-WBZH46
title: Rotate smart gathering for daily quest chains
status: done
priority: medium
labels:
  - from-spec
  - gathering
  - spec:smart-auto-gathering
createdAt: '2026-11-14T11:51:46.317Z'
updatedAt: '2026-11-16T03:39:33.656Z'
completedAt: '2026-11-14T11:58:02.183Z'
timeSpent: 232
spec: specs/smart-auto-gathering
fulfills:
  - AC-2
order: 20
---
# Rotate smart gathering for daily quest chains

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement opt-in smart gathering daily priorities, conservative observed progress and 2% final-target margin, account/day freshness gates and visible decision status.

Blocked by @task-VHE-MA5SJK{blocked-by}
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Smart rotation prioritizes food, iron, stone, wood without duplicate resource squads and uses verified final chain targets ×1.02.
- [x] #2 Missing/stale quests or unknown gathering plans cannot trigger speculative recall; legacy behavior remains available.
- [x] #3 Daily recall uses confirmed response lifecycle and tests cover reset, partial progress, unknowns and disabled RPC.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read spec Locked Decisions and inspect existing auto-gather planning and quest contracts. 2. Implement only evidence-backed behavior for AC-2, recording exact missing inputs without guesses. 3. Add outcome tests and wire background/UI as required. 4. Review diff, document verification and decision impact, validate task.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented verified full-chain target metadata (quest/questChain MD5 verified), Smart opt-in, conservative progress increments since current-day quest snapshot, fresh quest/reset refresh, duplicate-resource prevention, confirmed recall/return state and UI status. Targeted 62 tests passed, including reset, first milestone vs full chain, double counting, unknown plan, account switch and RPC off. Review: no blocking findings; structural RPC matching ignores property order; content timer uses existing bridge context invalidation handling. Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass. System Decision Impact: none — implements task-specific spec choices using established shared RPC and observation patterns.

Final integrated verification: 762 tests total,750 passed,12 optional skipped; typecheck passed; version0.10.80 WXT artifact built and validated. Review PASS (quality/architecture/security/completeness): own-outpost coordinate selection, current-account cache clearing, stale-input refresh, preserved daily baseline, safe pending-probe restart and shared-RPC dispatch gating verified. No live in-game account validation. AC-6 defense remains in separate blocked task VHE-CB9VBW per user-supplied-capture agreement.

Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass
<!-- SECTION:NOTES:END -->

