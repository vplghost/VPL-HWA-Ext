---
id: VHE-RHAYF3
title: 'CP-01: HWA Control Panel Server — Express.js API/WS Hub, Internal SQLite (PV/PVC), 1-Year Cookie Auth, Docker/Jenkins/K8s & Knowns Docs'
status: done
priority: medium
labels: []
createdAt: '2026-11-28T15:37:03.751Z'
updatedAt: '2026-11-28T15:40:59.980Z'
completedAt: '2026-11-28T15:40:59.980Z'
timeSpent: 0
---
# CP-01: HWA Control Panel Server — Express.js API/WS Hub, Internal SQLite (PV/PVC), 1-Year Cookie Auth, Docker/Jenkins/K8s & Knowns Docs

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Build HWA-ControlPanel Express.js + ws + node:sqlite server with GUID+TOTP 1-year HttpOnly cookie auth, local/LAN Node dev mode, Dockerfile, Jenkinsfile, docker-compose, K8s PV/PVC manifests, Knowns docs, and unit tests.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 GUID+TOTP auth issues 1-year HttpOnly cookie, rate-limits brute force (429), blocks OTP replay, and supports revoke-sessions
- [x] #2 SQLite persists clients/snapshots/commands/sessions across restarts and relays commands over WS /ws/extension and /ws/web
- [x] #3 Local/LAN dev mode works with single node command + HWA-ControlPanel/data/control-panel.db; Dockerfile, Jenkinsfile, docker-compose.yml, and k8s/*.yaml are valid; Knowns docs architecture/hwa-control-panel and guides/hwa-control-panel-deployment created
- [x] #4 tests/hwa-control-panel-server.test.mjs, full npm test (0 fail), and dual npm run build pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented CP-01: Express.js + ws + node:sqlite HWA-ControlPanel server with GUID+TOTP 1-year HttpOnly cookie auth, local/LAN dev mode, Dockerfile, Jenkinsfile, docker-compose, K8s PV/PVC manifests, Knowns docs, and tests/hwa-control-panel-server.test.mjs (3/3 pass).
<!-- SECTION:NOTES:END -->

