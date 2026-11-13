---
id: VHE-4HPVTP
title: Use server-configured Tower floor count and document provenance
status: done
priority: medium
labels: []
createdAt: '2026-11-13T13:46:40.196Z'
updatedAt: '2026-11-13T13:55:45.044Z'
completedAt: '2026-11-13T13:55:45.044Z'
timeSpent: 392
---
# Use server-configured Tower floor count and document provenance

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User reports 23-floor Tower while UI assumes25. Find matching server/static configuration, derive floor count and final boss information, update all current UI/reducer/automation assumptions and document verifiable evidence and update procedure.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Server configuration supporting23 floors is identified with source/version/hash and extraction documented.
- [x] #2 Dashboard, Tower modal, reducer and automation share configured final floor and do not use25/26 sentinel or treat arbitrary late-floor victory as completion.
- [x] #3 Meaningful parser/runtime regression tests, typecheck and production build pass; changelog/version and commit completed.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inspect indexGet splitlib Tower configuration and verify source integrity. 2. Generate shared Tower rules from configured floors and terminal template; replace25/26 and broad high-floor completion heuristics. 3. Verify23-floor display, final boss and ordinary late floor behavior, snapshots and configuration parser; update canonical docs, version/build and commit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified pinned static 1.293.0 splitlib ZIP against catalog size/MD5 and internal CRC; original public tables confirm floors1–23 and template12 MAGIC_TOWER_FLOORLAST_TITLE. Generated shared rules, removed25/26 and >=20 heuristics, documented provenance/refresh procedure in @doc/architecture/tower-floor-count-from-splitlib. Full suite645:633pass,0fail,12optional skips. Typecheck and production build0.10.59 passed.

Review PASS: P1=0,P2=0,P3=0. Shared rules are wired before worker consumers and Vue; public source tables and generator reproduced byte-for-byte, including packaged rules. Runtime tests reject intermediate boss completion and support a configured future final floor27. System Decision Impact: none — this corrects Tower data and existing completion behavior using the established generated server-library metadata pattern; no project-wide policy or accepted decision changes.

Completed and committed code, docs, public fixtures, changelog and production artifacts for0.10.59. All acceptance criteria verified. Isolated commit excludes the pre-existing staged empty TypeScript LSP log. Final task status is included by amending the same task commit.
<!-- SECTION:NOTES:END -->

