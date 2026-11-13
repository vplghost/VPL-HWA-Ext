---
id: VHE-R07HP4
title: Preserve day components in building and research duration data
status: done
priority: medium
labels: []
createdAt: '2026-11-13T16:41:51.692Z'
updatedAt: '2026-11-13T16:50:36.001Z'
completedAt: '2026-11-13T16:50:36.001Z'
timeSpent: 487
---
# Preserve day components in building and research duration data

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Hall of Heroes20→21 source duration4.10:59:00 currently becomes18300sec and2h56m after0.58 multiplier instead of2d14h03m. Audit both configuration tables, correct day-aware parsing/generation, display days, and fix downstream queued durations without corrupting authoritative live timings.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Hall20→21 and all source day-form durations retain days in generated seconds and effective milliseconds; Research is audited/corrected as needed.
- [x] #2 Dialog duration displays and queue/timeline/RPC calculations preserve multi-day values; stored wrong estimates cannot continue silently overriding corrected metadata.
- [x] #3 Regression tests, typecheck, production build, documentation and commit are complete.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Compare versioned source Building/Research duration strings against generated seconds and reproduce day parsing loss. 2. Add strict shared duration parser, regenerate affected tables reproducibly and preserve calculations/display of multi-day upgrades; handle previously saved queued estimates using metadata where needed. 3. Add regression coverage for both domains, update docs/changelog/version, validate/build and commit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Audited hash-verified buildingLevel(3294rows) and current personalResearchLevel(898rows). Building had102incorrect day durations, all corrected by shared strict TimeSpan parser; non-duration fields unchanged. Research durations already correct, no metadata edits. Hall20→21 is385140base seconds,223381200ms at existing0.58estimate,2d14h3m. Exact legacy queued estimates migrate in timeline/planner and persist with repair log; active server times and pending payloads untouched. Actual Vue candidate/timeline, background migration and multi-day calculations covered. Full suite670:658pass,0fail,12optional skips; typecheck passed.

Review PASS:P1=0,P2=0,P3=0. Source regeneration verified against MD5-pinned current Building config; all102old estimates repair and all non-duration metadata is unchanged. Production build0.10.63 passed; source/dist versions synchronized. System Decision Impact: none — this fixes data parsing, existing queued estimates and multi-day presentation while preserving current speed-estimate defaults, authoritative server timing and RPC confirmation semantics.

Committed verified parser/generator, corrected data, saved-estimate migration, day-aware dialog formatting, regression tests, source documentation, changelog and0.10.63 production artifacts. Final task state folded into the same commit; unrelated staged empty TypeScript LSP log remains excluded.
<!-- SECTION:NOTES:END -->

