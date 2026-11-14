---
id: 8lf35x
title: Mine resources remaining do not imply vacancy; RPC rejection may contain only errorCode
key: mine-resources-remaining-do-not-imply-vacancy-rpc-rejection-may-contain-only-err
layer: project
category: failure
status: active
confidence: high
lastVerified: '2026-11-14T18:26:40.742Z'
ttlDays: 90
sources:
  - '@task-VHE-P3VDNA'
  - 'extension/smart-gather.js:rpcFailure'
  - 'extension/smart-gather.js:skipMine'
  - tests/fixtures/gather-occupied-20261115.json
  - tests/gather-reload.test.mjs
  - docs/acceptance/gather-occupied-2026-11-15.json
tags:
  - gathering
  - rpc
  - occupied-mine
  - errors
createdAt: '2026-11-14T18:26:40.742Z'
updatedAt: '2026-11-14T18:26:40.742Z'
---

Nov15 capture timeline26 getMineById returned resourceAmount5708965 plus another player's gathering.user; timeline33 attackMine:pve to the same mine returned HTTP200 response{errorCode:BattleTypeMismatch} with no error field. Smart resume/nearest now reject any gathering object, and rpcFailure recognizes errorCode-only failures. Confirmed BattleTypeMismatch skips that target for60s and selects a different free mine; unconfirmed mutations never auto-retry and auto gathering never switches to PvP. Canonical contracts/provenance: @doc/api/world-map-rpc-contracts and @doc/specs/smart-auto-gathering.
