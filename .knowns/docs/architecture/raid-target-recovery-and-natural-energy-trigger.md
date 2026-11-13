---
id: doc-64f6d5af5b3641f375ea265a5722a77c
title: Raid target recovery and natural energy trigger
description: Fresh boss search and account-bound opt-in auto raids on an exact natural World Energy threshold crossing.
createdAt: '2026-11-13T11:14:25.340Z'
updatedAt: '2026-11-13T11:14:25.340Z'
tags:
  - raid
  - energy
  - automation
  - rpc
---

# Raid target recovery and natural energy trigger

Implemented by @task-VHE-BPQPT6. Relevant code: `hwaHelperRaidQueue.start/advance`, `hwaHelperRaidEnergyAuto.observe`, background `evaluateRaidEnergy`, `RaidModal.vue` and bridge `scheduleRaidEnergy`.

## Stale targets

A missing/mismatched selected boss or cached search without a valid timestamp, dated in the future, or older than five minutes no longer prevents starting the queue. Refresh the roster, search the configured rally boss level and continue automatically. If a guild raid/heroes are already deployed, preserve the existing waiting_rally behavior before refreshing/searching. The user does not need to click Start again after the search.

Candidate batches retain searchedAt and expire after five minutes before another createRally. While fresh, keep using remaining candidates in order, consistent with the accepted raid queue decision. A matched createRally failure reporting a nonexistent, expired, unavailable or already dead target excludes the rejected ID and invalidates the old batch before searching again. Remaining raid count decreases only on a confirmed win and return. Other recoverable create errors retain the existing skip-candidate behavior. World Energy/resource errors stop; no uncertain mutation is retried on a transport timeout. Both result.error and response.error are recognized.

## Auto raid settings

The Raid dialog has an opt-in checkbox and integer World Energy threshold from 25 to 200 (default 200). Save an account-bound raidEnergyAuto object containing enabled, threshold and the dialog's map/center, teamId/heroIds, boss level, waitSeconds, minMembers, count, maxTroops and autoCancel. Team and parameter changes while enabled update these options. On trigger resolve the selected saved/custom/weakest team using the latest roster and account team data; retain troop limits from the current selected team or saved dialog options. Missing or deployed heroes prevent starting. Account switches require enabling the setting for that account again.

Saving preferences or enabling the checkbox never enables popupRpcEnabled or changes socketRefreshMode. Manual and automatic raid actions inherit global RPC/Monitor API policy.

## Exact natural threshold detection

The content script sends a local worker heartbeat every 30 seconds while the option is enabled, even with the popup closed. Every new document receives a new session identity. The background serializes configuration, heartbeats, manual queue starts and RPC reductions through its existing pending lane. Store raidEnergyWatch in Chrome session storage so MV3 worker suspension alone does not create duplicate triggers.

First observation only establishes the baseline. Trigger requires the same configured account, game tab, document and settings, observations at most 90 seconds apart, prior energy below the threshold, current energy exactly equal to it, and the previous known refill schedule independently projecting that exact value. Require amount, refill clock, interval, refill amount and cap. An unchanged source or a consistent authoritative refillableGetAll snapshot can confirm natural regeneration. A changed item/reward/action source cannot establish that crossing.

Opening/reloading game, first snapshot already equal/above threshold, changed account/options, missing refill evidence, a clock reversal, offline/late heartbeat catch-up, manual energy gain or overshoot never starts a raid. Login RPC capture resets the baseline too. There is no arbitrary >= threshold trigger.

Persist the new observation before dispatch. A crossing is consumed even when global RPC is disabled, a raid/monster queue is active, a rally is active or heroes are unavailable. It is not deferred to execute later; energy must fall below and naturally reach the threshold again. Start the normal managed queue with a fresh search rather than an old selected boss. Status/skipped reasons are retained in raidEnergyAutoStatus and shown in the dialog.

Natural regeneration is inferred from the cached server refill schedule; this does not issue polling RPCs for energy. Only local heartbeats are periodic. Browser throttling that creates a gap over 90 seconds conservatively skips catch-up.

## Verification

`tests/raid-queue.test.mjs`: missing/stale target auto-search, accepted target rejection and exclusion, counts, fresh batch reuse, waiting rally and normal lifecycle. `tests/raid-energy-auto.test.mjs`: exact natural crossing, one-shot/re-arm, startup/reload/overshoot/manual gains, insufficient metadata, configuration and actual Vue dialog saving/global policy. `tests/background.test.mjs`: serial concurrent ticks, Direct/Piggyback dispatch, busy/disabled/startup/reload/item cases and saved options. `tests/bridge.test.mjs`: popup-independent heartbeat, disable and document restart. Live game interaction is not exercised by these tests.
