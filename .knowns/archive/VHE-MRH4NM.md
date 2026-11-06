---
id: VHE-MRH4NM
title: Audit completed tasks and resolve stale acceptance criteria
status: done
priority: high
labels: []
createdAt: '2026-11-06T10:21:19.863Z'
updatedAt: '2026-11-06T10:34:26.610Z'
completedAt: '2026-11-06T10:34:26.409Z'
timeSpent: 326
archivedAt: '2026-11-06T10:34:26.610Z'
---
# Audit completed tasks and resolve stale acceptance criteria

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Review all existing Knowns tasks against current implementation and tests, close fulfilled acceptance criteria, archive obsolete/superseded work with evidence, and create/complete important remediation tasks for real gaps.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Inventory every existing task, identify unchecked criteria and obsolete/superseded requirements with evidence.
- [x] #2 Resolve stale task criteria and archive verified completed or obsolete tasks through Knowns lifecycle without deleting historical evidence.
- [x] #3 Create and complete important remediation tasks for actual implementation gaps; preserve explicitly shelved work.
- [x] #4 Record audit outcomes, validate Knowns and project checks, and commit cleanly.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inventory active/historical task metadata and unchecked ACs; group criteria by feature and trace superseding tasks. 2. Verify affected code/tests and run baseline validation. 3. Complete fulfilled ACs and annotate/archive outdated tasks with explicit replacements or missing-evidence limitations. 4. Open and implement important remaining gaps, with regression coverage. 5. Publish audit ledger, validate task/docs/tests/build and commit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Inventory: all 79 original tasks already done; 10 had 40 unchecked ACs and 21 had no supplied AC. Reconciled 37 fulfilled criteria with code/test evidence; removed 3 obsolete/unverifiable requirements (private dispatcher discovery, removed Guild Chat tab, a specific missing private trace) with explicit notes and history retained. Reviewed existing English preference hedex0 and activated it with original provenance. Added seven explicit supersession dispositions, including Wheel remaining shelved and newer Settings/asset/RPC workflows. Knowns task validation now 0 errors / 0 warnings, down from 40 warnings. Important actual gap is isolated to @task-VHE-MACK1D and implemented with multi-rally regressions.

Archived all 79 original completed tasks through canonical batch_archive (79 processed/79 changed), retaining history and references; no hard deletions. Important remediation @task-VHE-MACK1D is done and full build 0.9.77 passes 283 tests/10 optional private skips. Audit ledger created at @doc/audits/backlog-acceptance-audit-2026-11-06 covering all original tasks, ten evidence reviews, three obsolete criteria and seven explicit supersessions. Whole-store validation: 0 errors, 45 existing Memory trust/source/TTL warnings (not task AC backlog), preserved rather than filling invented evidence. System Decision Impact: none — lifecycle/evidence cleanup and enforcement of existing isolation rules; no new project policy or automatic draft decision acceptance.

Final audit/remediation review complete; task and doc reference validations pass with no errors/warnings, full project check passes 283 tests (10 optional private trace skips), final build 0.9.78. All 79 original tasks were archived with historical evidence preserved. Closing and archiving the two audit/remediation tasks as well leaves the active backlog empty. No Wheel work resumed; no draft decision accepted. Whole-store nonblocking Memory metadata warnings remain explicitly scoped in the ledger rather than silently fabricated away. Source/dist parity and staged diff checks completed before the authorized commit.
<!-- SECTION:NOTES:END -->

