---
id: VHE-DGMJ0K
title: 'P2-49: Auto-Claim Expiring Quest & Event Rewards (10m Before Expiry)'
status: done
priority: medium
labels: []
createdAt: '2026-11-28T09:40:20.008Z'
updatedAt: '2026-11-28T09:44:15.750Z'
completedAt: '2026-11-28T09:44:15.750Z'
timeSpent: 0
---
# P2-49: Auto-Claim Expiring Quest & Event Rewards (10m Before Expiry)

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement zero-polling expiringClaimService.ts (10m lead window for timed quests including 3x daily energy, daily reset quests, event quests, and battle pass free rewards), hwa-auto-expiring-claims single alarm in backgroundRuntime.ts, ActiveAutomationStrip 1-click stop, SettingsTab UI, and CONFIG_KEYS backup.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 collectExpiringClaimPlan waits when > leadMinutes (returning exact expiryMs - leadMs wake), claims due items <= leadMinutes via quest_multiFarm / completeQuest / claimBattlepassRewardAll, and skips expired items
- [x] #2 Zero-Emerald safety, single alarm hwa-auto-expiring-claims scheduling, and deduplication / error backoff
- [x] #3 SettingsTab #setting-auto-expiring-claims + #setting-expiring-claims-lead-min (100% English), ActiveAutomationStrip 1-click stop, and CONFIG_KEYS backup wiring
- [x] #4 Unit tests (tests/expiring-claims.test.mjs), full npm test (0 fail), and dual npm run build pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed P2-49 (v0.11.401): zero-polling expiringClaimService.ts (10m default lead window for timed quests including 3x daily energy, daily reset quests, event quests, and Battle Pass free rewards), hwa-auto-expiring-claims single alarm, 5m dedupe & 2m error backoff, ActiveAutomationStrip 1-click stop, SettingsTab UI, 1404/1404 tests and dual build passed.
<!-- SECTION:NOTES:END -->

