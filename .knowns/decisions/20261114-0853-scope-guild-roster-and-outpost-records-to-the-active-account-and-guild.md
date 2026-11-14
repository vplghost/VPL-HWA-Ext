---
id: 20261114-0853-scope-guild-roster-and-outpost-records-to-the-active-account-and-guild
title: Scope Guild roster and outpost records to the active account and Guild
status: draft
supersedes: []
supersededBy: []
tags:
  - guild
  - cache
  - account-scope
sources:
  - '@task-VHE-6WM927'
  - '@doc/architecture/guild-features'
  - 'extension/rpc-cache.js: guildRosterAction and guildOutpostsAction'
  - 'src/utils/guildData.ts: currentGuild and guildMembers'
  - tests/guild-data.test.mjs
relatedDocs:
  - architecture/guild-features
relatedTasks:
  - VHE-6WM927
verification: []
reviewState: needs_evidence
reviewBlockers:
  - 'linked task "VHE-6WM927" is "in-progress"; all linked tasks must be done before accepting candidate'
reviewMatches: []
reviewAllowedResolutions: []
reviewEvaluatedHash: 'a1b1aa9a4a9a5098ad7a35318963e16b466b5af715554a8c714ecff84f69d282'
reviewEvaluatedAt: '2026-11-14T01:53:16.994Z'
createdAt: '2026-11-14T01:53:16.994Z'
updatedAt: '2026-11-14T01:53:16.994Z'
---

## Context

The Guild tab joins independent user_getClanInfo and getUserClanMembersOutposts responses, which may arrive in either order and persist in the shared RPC cache.

## Decision

Treat user_getClanInfo as the authoritative current membership snapshot, require a known active player belonging to that roster, and join outposts by exact user ID only. Bind records to the active account/Guild; discard prior associations on account/Guild transitions and ignore failed/empty/stale snapshots. Retain last observed outpost details for remaining members with observation timestamps and expose missing data explicitly.

## Alternatives Considered

Using clan_getSummary is incorrect because that RPC belongs to city building/research data. Mixing nearby map players into the member table or retaining prior-Guild associations would expose unrelated or stale membership information.

## Consequences

Later Guild data sources must preserve this scope/correlation contract and observation provenance. The active snapshot cache is not a cross-account or historical membership archive.
