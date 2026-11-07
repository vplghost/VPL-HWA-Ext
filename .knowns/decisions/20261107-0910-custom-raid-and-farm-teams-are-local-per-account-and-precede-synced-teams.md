---
id: 20261107-0910-custom-raid-and-farm-teams-are-local-per-account-and-precede-synced-teams
title: Custom raid and farm teams are local per account and precede synced teams
status: draft
supersedes: []
supersededBy: []
tags: []
sources:
  - '@task-VHE-NT1AZC'
  - 'extension/experimental-data.js:teamOptions'
  - 'extension/popup.js:renderCustomTeams'
  - 'extension/raid-queue.js:start'
relatedDocs: []
relatedTasks:
  - VHE-NT1AZC
verification: []
reviewState: needs_evidence
reviewBlockers:
  - 'linked task "VHE-NT1AZC" is "in-progress"; all linked tasks must be done before accepting candidate'
reviewMatches: []
reviewAllowedResolutions: []
reviewEvaluatedHash: '92dbebacd092080a155c882f8b35bf8137036ad8548d98aa23986c8867494024'
reviewEvaluatedAt: '2026-11-07T02:10:26.874Z'
createdAt: '2026-11-07T02:10:26.874Z'
updatedAt: '2026-11-07T02:10:26.874Z'
---

## Context


## Decision

Store custom five-hero teams separately in Chrome local storage keyed by account ID. Game team sync must not modify them. Raid/farm dropdowns list custom teams first. The weakest-five option resolves only currently available heroes and raid queues resolve it again after roster refresh.

## Alternatives Considered


## Consequences
