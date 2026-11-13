---
id: doc-581c6f5e7cbf1b101ed8b3b988c66770
title: Building and Research Duration Units and Day Components
description: Verified TimeSpan configuration parsing, effective duration estimates, day-aware UI and migration of legacy queued building durations.
createdAt: '2026-11-13T16:49:09.459Z'
updatedAt: '2026-11-13T16:50:14.328Z'
tags:
  - building
  - research
  - duration
  - configuration
  - debug
---

# Building and Research duration units

## Root cause and verified source — 2026-11-13

`scripts/generate-building-data.mjs` previously split a duration by `:` and converted the first component directly to a number of hours. Server durations use the .NET TimeSpan shape `[days.]hours:minutes:seconds`, so `4.10:59:00` became 4.1 hours + 59 minutes = 18,300 seconds instead of 385,140 seconds. This affected 102 of 3,294 building-level rows, starting where day components appear. It was a metadata-generation error, not a JavaScript integer-overflow or clock-formatting limit.

| Configuration | Verified MD5 / immutable source |
| --- | --- |
| Building levels | `8f8820e1d76bbfa899e8bdf9241880bf` — `https://hwmb-remote-config-cdn.nextersglobal.com/config/buildingLevel/8f8820e1d76bbfa899e8bdf9241880bf.json` |
| Current research levels | `b587adca0646f9a24abf202da822c321` — `https://hwmb-remote-config-cdn.nextersglobal.com/config/personalResearchLevel/b587adca0646f9a24abf202da822c321.json` |

Both hashes match the captured `indexGet.index.configs` map in `temp/remote-config-captured.json`. Building bytes were checked directly; the research source was fetched from the pinned current URL and MD5-verified. All 898 current research durations already matched generated metadata, including day components. No research table values needed changing. Older `temp/personalResearchLevel.json` has a different hash; do not treat that older file as the current config without verification.

Hall of Heroes (building 20), target level 21:

- Raw `4.10:59:00` = 4 days 10 hours 59 minutes = 385,140 seconds.
- Existing building estimate multiplier 0.58 gives 223,381,200 milliseconds, approximately 2 days 14 hours 3 minutes 1.2 seconds.
- The old parsed 18,300 seconds gave 10,614,000 milliseconds, explaining the reported 2h 56m display.

Other verified research examples: research 568 level 5 = `07.19:30:00` = 675,000 seconds; research 634 level 1 = `01.09:40:00` = 121,200 seconds; research 635 level 1 = `02.14:30:00` = 225,000 seconds.

## Parsing and units

`parseRemoteDurationSeconds` in `scripts/lib/remote-duration.mjs` handles optional days, zero-padded day/hour fields, ordinary hour durations, legacy minute:second strings and non-negative integer seconds. Malformed formats, invalid minute/second fields, out-of-range hours with an explicit day component, and unsafe integers fail rather than silently truncating.

The generator verifies source MD5 against the captured index before writing `extension/building-data.js`. Metadata `d` is always base seconds. `calculateEffectiveDurationMs` converts seconds to milliseconds once, then applies the existing speed multiplier. The default estimates remain 0.58 for Building and 0.892 for Research; this fix does not establish those as universal account-specific speed bonuses. Explicit caller multipliers remain supported. Live server queue timestamps/durations remain authoritative.

`getQueueEnd`, timelines, planned `startConstruction`/`startResearch` arguments and wake deadlines use full millisecond values; a multi-day duration must never be treated as a time of day or truncated with a clock-only parser.

## Saved automation queue migration

The generated building helper retains the exact historical bad seconds only for the 102 affected rows. `normalizeQueuedDuration` repairs an automation item's duration only when its building/target level is affected and its saved milliseconds exactly match the old default 0.58 estimate. It preserves identities and other fields and leaves unrelated/custom estimates unchanged.

`normalizeQueuedItem` applies this correction in Building timeline and planning helpers. `runCityQueue` also persists repaired automation items and emits a `repair` log before future dispatch. Disabled queues can display the repaired timeline and are persisted when evaluation resumes. Repeated normalization is idempotent.

Do not rewrite already-issued `pendingRequest.calls`/`startedItem`, server `buildingStatus`/`researchStatus` queue durations, active start/end times, or historical upgrade records. Pending requests still require normal authoritative acknowledgement/reconciliation. The migration updates future estimates, not a running server operation.

## UI

`formatDuration` displays days, remaining hours and minutes for durations of 24 hours or longer; sub-day formatting stays compatible. `formatFinishTime` includes month/day for another local date and year when it differs, preventing a multi-day completion from looking like a same-day clock time. Building and Research dialogs use it for active, queued, total and candidate finish estimates. Execution-log timestamps remain clock times.

## Regeneration and verification

1. Obtain a current complete `indexGet` and its exact `buildingLevel` bytes. Save them at the paths consumed by `scripts/generate-building-data.mjs`; hashes must match.
2. Run `npm run building:metadata`. Do not manually edit the generated table. Use the same TimeSpan parser for future research metadata generation/audits.
3. Compare every source row's parsed duration to generated `d`; ensure non-duration fields remain unchanged when fixing only duration parsing. On 2026-11-13 this verified all 3,294 building rows and all 898 current research durations. All 102 legacy default estimates were checked against their corrected values.
4. Run `npm test`, `npm run typecheck` and the versioned production build.

`tests/city-duration.test.mjs` covers the parser, Hall example, multi-day Research values, exact migration and exclusions, timelines, RPC payloads, wait deadlines, authoritative server durations and formatting boundaries. `tests/city-queue-ui.test.mjs` evaluates the actual Building dialog candidate/timeline computeds. `tests/background.test.mjs` checks persisted migration and unchanged in-flight payloads.

Implemented by @task-VHE-R07HP4. Related: @doc/architecture/building-and-research-queue-reconciliation.
