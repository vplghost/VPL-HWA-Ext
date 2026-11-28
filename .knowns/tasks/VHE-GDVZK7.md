---
id: VHE-GDVZK7
title: 'CP-03: HWA Control Panel Mobile WebView — On-Demand Monitoring, 1-Year Cookie Session & Emergency Triggers'
status: done
priority: medium
labels: []
createdAt: '2026-11-28T15:46:46.776Z'
updatedAt: '2026-11-28T15:48:17.035Z'
completedAt: '2026-11-28T15:48:17.035Z'
timeSpent: 0
---
# CP-03: HWA Control Panel Mobile WebView — On-Demand Monitoring, 1-Year Cookie Session & Emergency Triggers

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Build mobile-first Tailwind HWA Control Panel WebView in HWA-ControlPanel/public/, on-demand Refresh with task-only WS wait, 1-year cookie session, emergency action triggers, update Knowns deployment guide, and add tests.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 QR ?guid= pre-fill and 1-year cookie session restore via GET /api/web/session work without re-entering OTP on reload
- [x] #2 Dashboard uses on-demand Refresh and opens /ws/web only while awaiting command/task completion
- [x] #3 Mobile-first Tailwind UI (max-w-md) embedded in HWA-ControlPanel/public/ with monitoring cards, 2-step Emergency Recall, and Knowns guide updated
- [x] #4 tests/hwa-control-panel-web.test.mjs, full npm test (0 fail), and dual npm run build pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented CP-03 (v0.11.409): mobile-first Tailwind WebView in HWA-ControlPanel/public/ with QR ?guid= pre-fill, 1-year HttpOnly cookie session, on-demand Refresh with task-only WS wait, 2-step Emergency Recall, Knowns guide update, and tests/hwa-control-panel-web.test.mjs. Verified: 1,425 pass / 0 fail, dual build pass.
<!-- SECTION:NOTES:END -->

