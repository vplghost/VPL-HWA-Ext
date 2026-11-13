---
id: VHE-HRA25T
title: Audit HTML to WXT Vue migration and restore compatibility
status: done
priority: high
labels:
  - migration
  - audit
  - wxt
  - vue
createdAt: '2026-11-13T03:46:07.155Z'
updatedAt: '2026-11-13T04:03:33.003Z'
completedAt: '2026-11-13T04:03:33.003Z'
timeSpent: 990
---
# Audit HTML to WXT Vue migration and restore compatibility

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Compare HTML@12baa70 to master@d3cd034 extension 0.10.52. Deliver timestamped /docs audit with evidence, feature matrix, prioritized roadmap; execute verified migration fixes; document WXT/Vue/Tailwind conventions and validate without live game mutations.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Timestamped /docs report names both branch commits and extension versions with feature matrix and severity evidence
- [x] #2 Verified migration defects have tracked remediation tasks and executed fixes with behavioral regression coverage
- [x] #3 WXT/Vue/Tailwind conventions are documented for future sessions
- [x] #4 Full automated checks and artifact validation run; live-game verification gaps explicitly recorded
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Freeze baseline HTML@12baa70 v0.9.244 and master@d3cd034 v0.10.52; inspect build/runtime architecture and exhaustive UI/RPC inventory.
2. Record evidence-backed compatibility matrix and P1/P2/P3 findings in timestamped /docs report, mirrored through Knowns.
3. Create concrete remediation tasks with plans and ACs. Execute dependency-ordered fixes using Vue components/composables, WXT entrypoints/config and Tailwind utilities; preserve established background contracts.
4. Add behavioral regression coverage, run full tests, WXT/distribution build and artifact integrity checks.
5. Document durable conventions, draft System Decision candidate, review final diff, update tasks and clearly mark live-game validation limits.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Report: @doc/reviews/wxt-vue-migration-review-2026-11-13-10-46-35; reader copy docs/MIGRATION-REVIEW-2026-11-13_10-46-35.md. Conventions @doc/architecture/wxt-vue-tailwind-conventions and docs/WXT-VUE-TAILWIND-CONVENTIONS.md.
Executed implementation wave: VHE-FY1G5K,VHE-QREKB0,VHE-8YB7KF,VHE-YXR60J,VHE-H8YJ9H,VHE-49R1NS,VHE-YVXJB9. Follow-up roadmap: VHE-HHA1TB browser acceptance (not exercised), VHE-VT9095 inherited sample metric debt.
System Decision Impact: candidate @decision/20261113-1059-preserve-wxt-vue-tailwind-boundaries-during-html-parity-migration (added) — WXT-only packaging and strict Vue validation conventions documented.
Spec Decision Compliance: not applicable — audit task wave has no linked spec.
Validation: npm run check passed (573 tests;561 pass;12 skip;0 fail), strict vue-tsc and artifact checks pass. Browser acceptance remains @task-VHE-HHA1TB.

Final independent review exposed quest claim envelope and bounded read allowlist issues; fixed VHE-49R1NS and new VHE-R8Z54P. Final npm run check:575 tests,563 pass,12 skip,0 fail; strict vue-tsc/build/artifact checks pass, dist+.output version0.10.52 with alarms. git diff --check pass. Eight implementation subtasks done; two explicitly scheduled follow-up roadmap tasks remain todo (browser acceptance and inherited GVS fallback debt), not prerequisites to delivering the audit report. Audit/remediation wave complete; no live parity claim, no commit/push.
<!-- SECTION:NOTES:END -->

