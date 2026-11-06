---
id: 20261106-1121-all-helper-rpc-calls-inherit-shared-settings
title: All helper RPC calls inherit shared settings
status: draft
supersedes: []
supersededBy: []
tags:
  - rpc
  - settings
  - user-rule
sources:
  - '@task-VHE-62VVG5'
  - '@doc/architecture/shared-rpc-settings'
  - 'extension/background.js: rpcMessageForSettings'
  - 'extension/intercept.js: preparePiggyback'
relatedDocs:
  - architecture/shared-rpc-settings
  - architecture/rpc-cache-pipeline
relatedTasks:
  - VHE-62VVG5
verification: []
reviewState: needs_evidence
reviewBlockers:
  - 'linked task "VHE-62VVG5" is "in-progress"; all linked tasks must be done before accepting candidate'
reviewMatches: []
reviewAllowedResolutions: []
reviewEvaluatedHash: '7b274963c044415dde9732644d310751b51d58293ce47b0cf21ba77cf1c3db04'
reviewEvaluatedAt: '2026-11-06T04:21:46.547Z'
createdAt: '2026-11-06T04:21:46.547Z'
updatedAt: '2026-11-06T04:21:46.547Z'
---

## Context

User explicitly requested this new rule on 2026-11-06 and asked to update existing functions. Experimental, Draft, quick refresh and action follow-ups previously forced Direct.

## Decision

Every extension-generated RPC inherits popupRpcEnabled and socketRefreshMode. Default Piggyback must not fall back to Direct. Feature exceptions require an explicitly specified feature setting; none is currently defined. Apply the policy to Experimental, Draft, manual refresh, claims, MQTT refresh and automatic follow-ups, and enforce settings again before queue execution.

## Alternatives Considered


## Consequences

Existing Direct-only paths now use shared routing; Piggyback actions expire and never automatically retry. Settings labels and architecture docs now describe one global policy.
