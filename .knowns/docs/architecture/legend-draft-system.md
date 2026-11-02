---
id: doc-45cb642564ea6f7fbd7553c41c582fe2
title: Legend Draft System
description: Legend Draft state machine, 15 candidates matrix, review switcher, and replay extraction
createdAt: '2026-11-02T06:43:38.355Z'
updatedAt: '2026-11-02T06:43:47.378Z'
tags:
  - draft,legend-draft,pvp
---

# Legend Draft System

## Overview
Legend Draft is a synchronized PvP drafting mode in Hero Wars: Alliance consisting of alternating defense and attack picking phases followed by automated combat.

## Stage Lifecycle (stageId)
- 0: Not in match / Idle
- 1: Matching / Searching for opponent
- 2, 3: Defense Draft (picking 5 heroes from 5 rounds of 3 choices)
- 4: Attack Draft (picking 5 counter-heroes while viewing opponent defense)
- 5: Ready for Battle
- 7: Match Completed (battle result delivered)

## 15-Hero Candidate Matrix
- Each phase offers 5 sequential steps, with 3 candidate heroes per step (15 candidates total).
- Defense picks: Step 1 [78, 49, 44], Step 2 [76, 20, 38], Step 3 [75, 2, 25], Step 4 [37, 73, 28], Step 5 [5, 35, 69].
- Attack picks: Step 1 [8, 49, 28], Step 2 [73, 56, 12], Step 3 [17, 34, 14], Step 4 [4, 55, 10], Step 5 [29, 25, 78].

## UI Behavior & Active Gating
- Candidate cards and picking slots are ONLY displayed during active draft turns (isActivelyDrafting).
- When match finishes (stageId 7) or lineup is locked, the 15 candidate matrix is hidden.
- A segmented switcher enables reviewing both Defense Draft (your defense vs enemy attack) and Attack Draft (your attack vs enemy defense).
- Match outcome banner shows Victory/Defeat, Rating change, and Draft BP EXP reward.
