---
id: VHE-QTCGYM
title: Fix MQTT 5 parser defaults, Property skipping, and UTF-8 payload decoding
status: done
priority: high
labels:
  - mqtt,performance
createdAt: '2026-11-20T17:14:13.377Z'
updatedAt: '2026-11-20T17:22:25.112Z'
completedAt: '2026-11-20T17:22:25.112Z'
timeSpent: 0
---
# Fix MQTT 5 parser defaults, Property skipping, and UTF-8 payload decoding

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Default MQTT protocol version to 5 for Nexters EMQX broker endpoint
- [ ] #2 Correctly skip variable-length Properties in MQTT 5 PUBLISH frames
- [ ] #3 Prevent chat and event payloads from misclassifying as binary base64
- [ ] #4 Pass unit tests in tests/mqtt-capture.test.mjs
<!-- AC:END -->

