---
id: 20261107-1057-custom-teams-may-specify-total-maximum-troops
title: Custom teams may specify total maximum troops
status: draft
supersedes: []
supersededBy: []
tags: []
sources:
  - '@task-VHE-B4P15Y'
  - 'extension/experimental-data.js:teamTroopCapacity'
  - 'extension/experimental-data.js:normalizeCustomTeam'
  - 'extension/raid-queue.js:start'
  - 'extension/popup.js:renderCustomTeams'
relatedDocs: []
relatedTasks:
  - VHE-B4P15Y
verification: []
reviewState: needs_evidence
reviewBlockers:
  - 'linked task "VHE-B4P15Y" is "in-progress"; all linked tasks must be done before accepting candidate'
reviewMatches: []
reviewAllowedResolutions: []
reviewEvaluatedHash: 'a3d9ab28674da2a332a4f04a17be8079c8068a28f7140dc877a5e8840b974253'
reviewEvaluatedAt: '2026-11-07T03:57:34.592Z'
createdAt: '2026-11-07T03:57:34.592Z'
updatedAt: '2026-11-07T03:57:34.592Z'
---

## Context


## Decision

Custom teams optionally persist a positive whole maxTroops value. Blank retains automatic capacity. A configured value replaces the capacity estimate for raid preview and every raid queue round, with allocation bounded by available troop stock. Gathering caps the manually entered total to the configured maximum.

## Alternatives Considered


## Consequences
