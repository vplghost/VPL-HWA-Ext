---
id: VHE-62VVG5
title: Enforce shared RPC settings for every extension RPC
status: done
priority: high
labels: []
createdAt: '2026-11-06T04:16:08.393Z'
updatedAt: '2026-11-06T10:31:31.908Z'
completedAt: '2026-11-06T04:23:50.399Z'
timeSpent: 428
archivedAt: '2026-11-06T10:31:31.908Z'
---
# Enforce shared RPC settings for every extension RPC

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User rule: every helper-generated RPC inherits popupRpcEnabled and socketRefreshMode; feature exceptions require explicit future settings. Audit experimental, Draft, refresh, claims and automatic follow-ups.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 All extension RPC producers obey the global enable gate and Piggyback/Direct mode, including Experimental, Draft and manual/automatic refresh.
- [x] #2 Queued actions are not dispatched after settings disable/change; actions expire without retry and target one game tab.
- [x] #3 Canonical docs and durable user rule are updated; relevant regression tests pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Audit every extension RPC producer and queue/dispatch enforcement.
2. Route experimental, Draft, manual refresh, claims and automatic follow-ups through shared settings; enforce again in the page interceptor.
3. Extend piggyback support to existing helper actions with bounded expiry and no action retries; update queue-aware UI feedback.
4. Record the user rule in canonical docs and a Decision candidate; update obsolete direct-dispatch documentation.
5. Run regression tests across settings/modes, cancellation, action payloads and response isolation; validate docs/task.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented global RPC policy in rpcMessageForSettings plus execution-time interceptor enforcement. Experimental, Draft, quick refresh, reward claims, MQTT and resource/skin follow-ups now inherit popupRpcEnabled/socketRefreshMode. Piggyback needs Monitor API, bounded helper actions expire after two minutes, settings changes cancel queued calls, actions never automatically retry, and one game tab is targeted. Draft/claim companion refresh follows action order even with an earlier native read. Generic Unity commands cannot bypass Piggyback and are rejected there. Updated canonical docs and active preference memory xvorcs. 95 relevant tests pass; full suite 249/259, with remaining 10 failures caused by missing historical trace fixtures. Fixed outdated gather metadata assertion and popup test helper dependency. Syntax/CSS checks pass; npm build succeeds. System Decision Impact: candidate @decision/20261106-1121-all-helper-rpc-calls-inherit-shared-settings (added) — records the user's explicit global RPC inheritance rule, retained as draft per decision workflow.
<!-- SECTION:NOTES:END -->

