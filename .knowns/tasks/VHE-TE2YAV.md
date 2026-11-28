---
id: VHE-TE2YAV
title: 'P2-47: Smart Batch Auto-Heal Infirmary (Strongest-Team Batch & maxMarches + 1 Demand)'
status: done
priority: high
labels: []
createdAt: '2026-11-28T08:06:08.056Z'
updatedAt: '2026-11-28T08:12:54.046Z'
completedAt: '2026-11-28T08:12:54.046Z'
timeSpent: 0
---
# P2-47: Smart Batch Auto-Heal Infirmary (Strongest-Team Batch & maxMarches + 1 Demand)

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement smart batch auto-heal service using strongest 5-hero team capacity as batch baseline and (maxMarches + 1) team shortfall, alarm-driven background auto-heal loop, Header active automation integration, Settings UI, and Dashboard Heal Batch button.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Strongest-team batch baseline (no customTeams) & (maxMarches + 1) shortfall with highest-tier-first selection
- [x] #2 Background alarm loop (hwa-auto-heal-wake) with completeHealing -> next batch chaining, 0-Emerald guard, and error backoff
- [x] #3 SettingsTab #settings-auto-heal-section, Dashboard #dashboard-troops-heal-batch-btn, ActiveAutomationStrip, and CONFIG_KEYS backup wiring (100% English Vue UI)
- [x] #4 Unit tests (tests/troop-heal.test.mjs), full npm test (0 fail), and dual npm run build pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed P2-47 (v0.11.397): strongest 5-hero team batch baseline (no customTeams), (maxMarches + 1 defense) shortfall, highest-tier-first batching, hwa-auto-heal-wake background loop, SettingsTab + TroopsOverview UI, 1390/1390 tests and dual build passed.
<!-- SECTION:NOTES:END -->

