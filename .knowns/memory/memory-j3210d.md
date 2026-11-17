---
id: j3210d
title: CLI network sandbox blocks CDN downloads; use extension context with host_permissions
layer: project
category: failure
status: proposed
tags:
  - cdn
  - network
  - firewall
  - host_permissions
createdAt: '2026-11-17T15:06:43.969Z'
updatedAt: '2026-11-17T15:06:43.969Z'
---

Node.js and curl processes outside Chrome fail with timeout when accessing hwmb-remote-config-cdn.nextersglobal.com due to local host firewall rules. Dynamic remote config downloads must execute within the Chrome extension background worker or popup using host_permissions. See @doc/architecture/dynamic-event-synchronization-and-milestones-pipeline.
