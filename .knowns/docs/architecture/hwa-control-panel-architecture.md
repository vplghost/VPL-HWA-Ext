---
id: doc-c096ecb895844909b2e2e6e012dcc588
title: HWA Control Panel Architecture
description: Architecture, HTTP/WS contract, SQLite schema, and GUID+TOTP 1-year cookie security for HWA-ControlPanel
createdAt: '2026-11-28T15:40:37.815Z'
updatedAt: '2026-11-28T15:45:25.618Z'
tags:
  - control-panel,architecture,sqlite,websocket,security
---

# HWA Control Panel Architecture

## Overview
HWA Control Panel (`HWA-ControlPanel/`) is a lightweight personal mobile monitoring & emergency-trigger proxy built with **Node.js 22+**, **Express.js**, **ws**, and built-in **node:sqlite** (`DatabaseSync`).

## Security Model (Zero User Management)
- **Extension Auth**: Client generates `clientGuid` (UUID v4), `deviceToken` (hex), and `otpSecret` (Base32 TOTP). Pairs via `POST /api/ext/pair` (optional `X-Bootstrap-Key`). Extension HTTP requests use `X-Client-Guid` + `Authorization: Bearer <deviceToken>`; WS `/ws/extension` supports both headers and MV3-compatible first-frame `{ type: 'auth', guid, token }`.
- **Mobile Auth (QR + 6-digit OTP -> 1-Year Cookie)**: Mobile scans QR (`https://<endpoint>/?guid=<GUID>`), submits 6-digit RFC 6238 TOTP to `POST /api/web/auth`. Server enforces 5-failure/5m IP rate limiting (`429`), blocks OTP step replay, and sets `hwa_cp_session` (`HttpOnly; SameSite=Lax; Max-Age=31536000`, auto `Secure` on HTTPS).
- **Revocation**: Extension calls `POST /api/ext/revoke-sessions` to immediately invalidate all 1-year cookies and close active web sockets.

## SQLite Schema (`control-panel.db`)
- `clients(guid, token_hash, otp_secret, last_seen_at, meta_json)`\n- `snapshots(guid, updated_at, payload_json)`\n- `commands(id, guid, action, payload_json, status, result_json, created_at, acked_at)` (pruned to last 500 per client)
- `web_sessions(token_hash, guid, expires_at, created_at)`\n
## Endpoints
- Health: `GET /healthz`, `GET /readyz`\n- Extension: `POST /api/ext/pair`, `POST /api/ext/snapshot`, `POST /api/ext/command-ack`, `POST /api/ext/revoke-sessions`, `WS /ws/extension`\n- Mobile WebView: `POST /api/web/auth`, `POST /api/web/logout`, `GET /api/web/session`, `GET /api/web/state`, `GET /api/web/commands`, `POST /api/web/command`, `WS /ws/web` (opened on-demand while awaiting task/refresh ack).

## Extension Bridge & Strict Allowlist (CP-02)
- Dedicated Extension tab: `src/components/tabs/ControlPanelTab.vue` (tab ID `controlPanel` in `TabNav.vue` & `App.vue`) with Endpoint URL check (`GET /healthz`), offline SVG QR generator (`src/utils/qrSvg.ts`), live 30s TOTP, and session revocation.
- Whitelisted commands (`validateRemoteCommand`): `refresh-snapshot`, `emergency-recall-gatherers`, `toggle-automation` (`autoGather`, `mineDefense`, `autoHeal`, `autoTrain`, `energyBurn`, `expiringClaims`, `shopFavorites`), `stop-queue` (`raid`, `monster`, `tower`, `dungeon`, `building`, `research`), and `trigger-special` (`run-daily-autopilot`, `run-batch-heal`, `claim-freebies`).
