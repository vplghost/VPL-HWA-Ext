---
id: VHE-HHA1TB
title: Browser acceptance of migration across queued RPC and accounts
status: todo
priority: high
labels:
  - migration
  - acceptance
  - browser
createdAt: '2026-11-13T03:55:34.027Z'
updatedAt: '2026-11-13T04:01:51.165Z'
timeSpent: 0
parent: VHE-HRA25T
---
# Browser acceptance of migration across queued RPC and accounts

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow timestamped migration audit browser checklist using disposable/mock game responses first; then authorized live account. Verify install both WXT/dist, popup/standalone, refresh/reopen, account switch, each mutation direct/piggyback/MQTT, unknown/empty data, dark/system theme, recorder export, campaign pending result. Static/helper tests do not prove live parity.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Both artifacts install in Chrome with worker/content hooks and assets available
- [ ] #2 All mounted tabs/dialogs work with empty/partial data, keyboard and dark/system theme
- [ ] #3 Account switch and queued/rejected RPC scenarios preserve correct state
- [ ] #4 Live-game acceptance evidence or explicit limitations are attached per feature group
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Run the report browser checklist against both artifacts without mutation first, then exercise authorized game fixtures/accounts across direct/piggyback/MQTT; attach screenshots, exact versions and failed criteria. Keep todo until actual browser evidence exists.
<!-- SECTION:PLAN:END -->

