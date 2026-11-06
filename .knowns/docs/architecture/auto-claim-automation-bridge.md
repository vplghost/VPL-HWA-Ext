---
id: doc-bfa2648b9c5b3898c65dac2f30b9615d
title: Auto-Claim Automation Bridge
description: Optional popup RPC dispatch, default-off safety switch, request-id limitations, and auto-claim flow
createdAt: '2026-11-03T14:31:58.305Z'
updatedAt: '2026-11-06T04:21:46.353Z'
tags:
  - automation
  - rpc
  - auto-claim
  - dispatch
---

# Auto-Claim Automation Bridge

## Overview
HWA Helper can dispatch RPC calls from the extension popup for quick refresh, reward claims, draft submission, and Unity commands. This is optional and controlled by popupRpcEnabled in chrome.storage.local. The default is false because popup-originated calls can still trigger the server error "Request id less then cached request id". Passive monitoring of game RPCs and Reload Game Tab remain available when dispatch is off.

## Request ID Handling
The game client and extension share an RPC endpoint. When popupRpcEnabled is true, intercept.js tracks the highest observed x-request-id in sessionStorage, increments it for extension calls, and may rewrite lower game XHR ids. When popupRpcEnabled is false, ordinary game XHR ids pass through unchanged. This local counter is best-effort and has not eliminated server request-id errors in all cases.

## Header Cleaning
Enabled extension calls reuse the last captured game RPC headers, strip x-request-id, x-env-timestamp and x-auth-signature, then generate a new request id and timestamp. The remaining authentication and client headers are retained.

## Pending Claim Detection
getPendingClaims in popup-data.js identifies unclaimed mail letters, battle reports, and completable quests. buildAutoClaimCalls maps them to mailFarm, readAndClaimAll, and quest_multiFarm calls.

## Dispatch Rules

All helper RPC dispatch inherits @doc/architecture/shared-rpc-settings. The shared enable switch is false by default; `socketRefreshMode` selects Piggyback by default or explicit Direct for every feature. This includes quick refresh, claims, Draft, Experimental and automatic follow-ups. Background and interceptor both enforce the policy. Piggyback requires Monitor API and must not fall back to Direct.

Auto-claim on popup open also requires its `onOpen` setting. The game client remains responsible for its own native traffic. Diagnostic engine-ping does not send an RPC; generic Unity commands are rejected in Piggyback mode because no known RPC payload can be queued for them.

## Key Invariants
- An unset popupRpcEnabled value is false.
- Passive RPC capture and Reload Game Tab work while popup RPC dispatch is off.
- Enabled auto-claim does not dispatch when no rewards are pending.
- hasAutoClaimedThisSession prevents repeated auto-runs during one popup session.

## Source Provenance
- @task-VHE-H817RH: initial auto-claim implementation
- @task-VHE-VXZJZG: header cleaning and sequential dispatch
- @task-VHE-PJJD5V: request-id synchronization and optimistic UI update
- Symbols: getPendingClaims, buildAutoClaimCalls, executeAutoClaim, syncRequestId, getNextRequestId
