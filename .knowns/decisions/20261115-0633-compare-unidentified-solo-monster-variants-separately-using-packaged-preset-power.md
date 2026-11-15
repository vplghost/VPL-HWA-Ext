---
id: 20261115-0633-compare-unidentified-solo-monster-variants-separately-using-packaged-preset-power
title: Compare unidentified solo monster variants separately using packaged preset power
status: draft
supersedes: []
supersededBy: []
tags: []
sources:
  - '@task-VHE-ZP1CW2'
  - scripts/generate-rally-power-data.mjs
  - src/utils/monsterPower.ts
  - tests/monster-power.test.mjs
relatedDocs:
  - api/world-map-rpc-contracts
relatedTasks:
  - VHE-ZP1CW2
verification: []
reviewState: needs_evidence
reviewBlockers:
  - 'linked task "VHE-ZP1CW2" is "in-progress"; all linked tasks must be done before accepting candidate'
reviewMatches: []
reviewAllowedResolutions: []
reviewEvaluatedHash: '3dc18fc56b19af48a404e1a8ecf2ef03d5315e67181495895c3906e635978489'
reviewEvaluatedAt: '2026-11-14T23:33:58.503Z'
createdAt: '2026-11-14T23:33:58.504Z'
updatedAt: '2026-11-14T23:33:58.504Z'
---

## Context

Capture hwa-game-record-202611051201_attack_monster.json returns mobId and coordinates only in solo search, with preset109 supplied separately in getSoloAttackDefenders. Existing verified squad config labels identify normal and PvP monster levels 1-30. The CDN solo config was unavailable during implementation.

## Decision

Monster dialog uses packaged predefinedSquadHeroes.heroesPower plus preset units times unit.power, and selected own hero power plus actual planned troop allocation. Since searchMob can omit config/variant identity, display both named solo level presets unless a matching predefinedSquadId is explicitly supplied. Never guess a numeric config mapping or substitute rally boss values. Incomplete squad totals use + or unknown and cannot produce a definite weaker-total verdict. Warnings are advisory and do not change queue dispatch.

## Alternatives Considered


## Consequences

Comparison remains useful before attacking, while exact target variant may remain unknown until authoritative target details are captured. Base/preset power is not a combat result prediction.
