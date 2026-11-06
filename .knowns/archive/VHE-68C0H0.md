---
id: VHE-68C0H0
title: Document observed RPC and MQTT protocol catalog
status: done
priority: medium
labels: []
createdAt: '2026-11-06T04:02:40.038Z'
updatedAt: '2026-11-06T10:31:31.995Z'
completedAt: '2026-11-06T04:09:16.108Z'
timeSpent: 386
archivedAt: '2026-11-06T10:31:31.995Z'
---
# Document observed RPC and MQTT protocol catalog

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Inventory available captures and implemented reducers; publish reusable API/MQTT docs with schemas, provenance, timing units, workflows and uncertainty labels.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 All RPC methods and MQTT event types found in available captures are indexed with sources and structural contracts.
- [x] #2 Rally/gather workflows and MQTT refresh behavior are documented with verified payloads and limitations.
- [x] #3 Docs contain no credentials or personal payload values and pass Knowns validation.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inventory available trace files and extract method/event schemas without payload values.
2. Cross-check reducers and existing architecture docs to distinguish capture evidence from implemented handling.
3. Publish API index, per-domain RPC catalogs, MQTT catalog, and detailed world-map contracts via Knowns.
4. Verify inventory coverage, redaction and all documentation references.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Published nine api docs: evidence index/source SHA-256 manifest, five domain RPC catalogs (177 captured method/feature pairs), captured MQTT catalog (9 event types), detailed world-map contracts and MQTT processing/refresh guide. Linked from architecture/rpc-cache-pipeline. Audited catalog headings against the complete available corpus: 177/177 RPC and 9/9 MQTT coverage, zero parse failures. Clearly separated code/test-only methods/events from raw captures. Redaction scan compared 201 sensitive source values and UUID patterns with no leaks. Knowns docs validation and git diff check pass. System Decision Impact: none — descriptive protocol evidence capture adds no new architectural or workflow rule.
<!-- SECTION:NOTES:END -->

