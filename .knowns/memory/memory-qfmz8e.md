---
id: qfmz8e
title: Corrupted 1D multi-team teamGetAll crashes Unity login
layer: project
category: failure
status: proposed
tags:
  - teamGetAll,unity,login,sanitizer,grand-arena
createdAt: '2026-11-25T13:21:38.488Z'
updatedAt: '2026-11-25T13:21:38.488Z'
---

In Unity WebGL mobileLogin, PlayerTeamData.createTeam calls DataObject.Keys on each sub-team of multi-team keys (grand, clan_boss, champClanDefence_heroes). If server teamGetAll stores a flat 1D hero ID array or bare scalar, ValueObject<T>.get_Keys() throws System.InvalidOperationException and stalls preloader_finished on all browsers. Guarded by sanitizeTeamGetAllRpcPayload and MULTI_TEAM_KEYS (commit 77e2c4a); see @doc/architecture/rpc-response-sanitization.
