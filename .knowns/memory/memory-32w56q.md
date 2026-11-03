---
id: 32w56q
title: Popup-originated RPC dispatch defaults off
layer: project
category: preference
status: proposed
tags:
  - popup
  - rpc
createdAt: '2026-11-03T16:37:11.663Z'
updatedAt: '2026-11-03T16:37:11.663Z'
---

User preference (2026-11-03): popup-originated RPC calls must be disabled by default and enabled only through an explicit Settings switch. **Why:** Direct popup calls can leave the game with "Request id less then cached request id" errors. The popupRpcEnabled switch is enforced in background forwarding and intercept.js; passive game RPC capture remains available.
