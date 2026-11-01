---
id: sggoar
title: Old API records survive extension reload
layer: project
category: failure
status: proposed
tags:
  - extension
  - profiling
createdAt: '2026-11-01T09:16:33.497Z'
updatedAt: '2026-11-01T09:16:33.497Z'
---

Root cause of missing request/response fields in the 2026-11-01 HWA export: it was created before POST body capture, and local storage kept legacy records after reload. Fresh POST /api/rpc records contained both bodies; six of fourteen responses hit the former 16000-character cap. Compare record field presence and timestamps before diagnosing a live hook failure; see @task-VHE-X1SQQH.
