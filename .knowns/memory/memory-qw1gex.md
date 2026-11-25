---
id: qw1gex
title: Interceptor document_start toggles need localStorage fallback and error-only Response rebuild
layer: project
category: pattern
status: proposed
tags:
  - interceptor,bridge,settings,document-start,rpc
createdAt: '2026-11-25T13:21:39.020Z'
updatedAt: '2026-11-25T13:21:39.020Z'
---

MAIN-world fetch hooks run before isolated-world bridge.ts completes async chrome.storage.local.get. Sync settings via createControlPayload (sanitizeTeamEnabled) and mirror to localStorage (hwa_sanitize_team_enabled) for synchronous document_start reads. Gate response rewriting behind fast-path hasTeamGetAllRequest and only construct a new Response when sanitizeTeamGetAllRpcPayload reports mutated === true (commit 77e2c4a); see @doc/architecture/rpc-response-sanitization.
