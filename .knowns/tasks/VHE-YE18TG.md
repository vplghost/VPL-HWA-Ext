---
id: VHE-YE18TG
title: Show raid total power in result and countdown
status: blocked
priority: medium
labels: []
createdAt: '2026-11-07T11:50:16.465Z'
updatedAt: '2026-11-07T11:58:16.353Z'
timeSpent: 157
---
# Show raid total power in result and countdown

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Display raid power for active countdowns and recent results using available rally and roster data.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Raid countdown displays total power when data is available.
- [ ] #2 Recent raid result preserves and displays the same total power.
- [ ] #3 Targeted tests and build pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Confirm power semantics and available fields in captured rally data. 2. Persist power with rally march and result history. 3. Render the value in raid countdown and result rows. 4. Run targeted regression tests and build.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
User clarified total power means all raid participants. Captured getRallyById squads contain hero IDs/levels/stars and troop counts, but no member or squad power. Captured mobRallyAttackResult and getPage rallyMobAttackResult reports also have no power. User will provide a log/API with per-member power. Removed provisional own-team implementation; code unchanged. Waiting for the source payload to map exact fields before implementation.

Inspected temp/tracking-data/hwa-game-record-202611071854_rally_power.json: getRallyById responses at timeline 3/25/47 have leader/member squads with heroId, level, color, star and units, but zero power fields anywhere in the file. The only sampled getRallyAttackDefenders power is the enemy defender, not raid participants. background.js socketRefreshCalls already queues getRallyById on rallyMembersUpdated for tracked raids via existing RPC dispatch settings. Awaiting an authoritative power source or evidence of the displayed game value; no code change made.

User requested on 2026-11-07 to temporarily shelve this feature because the supplied log contains no raid total power. Resume only when an authoritative power field, computation contract, or suitable capture becomes available. No implementation changes are pending.
<!-- SECTION:NOTES:END -->

