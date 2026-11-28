---
id: VHE-0F1KKZ
title: 'CP-02: Extension Control Panel Bridge — Dedicated Tab, Endpoint Check, GUID/Link/QR, OTP & Emergency Executor'
status: done
priority: medium
labels: []
createdAt: '2026-11-28T15:41:00.581Z'
updatedAt: '2026-11-28T15:46:46.221Z'
completedAt: '2026-11-28T15:46:46.221Z'
timeSpent: 0
---
# CP-02: Extension Control Panel Bridge — Dedicated Tab, Endpoint Check, GUID/Link/QR, OTP & Emergency Executor

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Build remoteBridgeService.ts, pure offline qrSvg.ts, backgroundRuntime WS/HTTP bridge with MV3 alarm keepalive and strict emergency allowlist, dedicated ControlPanelTab.vue registered in useTabConfig/App.vue, update Knowns doc, and add unit tests.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 normalizeEndpointUrl, buildMobilePairUrl, generateTotpCode, qrSvg, and sanitized buildRemoteTelemetrySnapshot pass unit tests
- [x] #2 validateRemoteCommand enforces strict emergency allowlist and backgroundRuntime executes & acks commands
- [x] #3 Dedicated ControlPanelTab.vue registered in useTabConfig.ts and App.vue with Endpoint Check, GUID/Link/QR, live 30s OTP, and 100% English UI
- [x] #4 tests/remote-bridge.test.mjs passes and architecture/hwa-control-panel-architecture doc updated
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented CP-02: remoteBridgeService.ts, offline qrSvg.ts, remoteBridgeRuntime.ts, dedicated ControlPanelTab.vue, backgroundRuntime wiring, Knowns doc update, and tests/remote-bridge.test.mjs (6/6 pass).
<!-- SECTION:NOTES:END -->

