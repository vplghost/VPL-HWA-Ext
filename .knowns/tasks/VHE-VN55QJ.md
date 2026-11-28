---
id: VHE-VN55QJ
title: 'P3-09: Anti-Cap Energy Auto-Burner (Zero-Polling Campaign & World Energy Fallback)'
status: done
priority: medium
labels: []
createdAt: '2026-11-28T09:18:09.274Z'
updatedAt: '2026-11-28T09:22:37.813Z'
completedAt: '2026-11-28T09:22:37.813Z'
timeSpent: 0
---
# P3-09: Anti-Cap Energy Auto-Burner (Zero-Polling Campaign & World Energy Fallback)

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement zero-polling Anti-Cap Energy Auto-Burner with strict Over-Cap Preservation Guard (only burns when triggerTarget <= energy <= cap), favorite-first Soul Stone sweep + fallback 3-star missions, optional World Energy Solo-Monster fallback when raidEnergyAuto is off, hwa-auto-energy-burn single alarm, ActiveAutomationStrip 1-click stop, SettingsTab card, and CONFIG_KEYS backup.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 planCampaignEnergyBurn enforces triggerTarget <= energy <= cap (preserving over-cap user energy), exact zero-polling wake, favorite-first Soul Stone sweep, fallback missions, reserve, maxRaidsPerTick, and disabled missions
- [x] #2 Over-Cap Preservation, 0-Emerald/0-Bottle safety, 15m error backoff, and World Energy Solo-Monster fallback (respecting raidEnergyAuto and active queues)
- [x] #3 SettingsTab #settings-auto-energy-burn-section (100% English), ActiveAutomationStrip energy-burn 1-click stop, and CONFIG_KEYS backup wiring
- [x] #4 Unit tests (tests/energy-auto-burn.test.mjs), full npm test (0 fail), and dual npm run build pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed P3-09 (v0.11.400): zero-polling Anti-Cap Energy Auto-Burner with strict Over-Cap Preservation Guard (triggerTarget <= energy <= cap), favorite-first Soul Stone sweep + fallback 3-star missions, optional World Energy Solo-Monster fallback, hwa-auto-energy-burn single alarm, ActiveAutomationStrip 1-click stop, SettingsTab UI, 1402/1402 tests and dual build passed.
<!-- SECTION:NOTES:END -->

