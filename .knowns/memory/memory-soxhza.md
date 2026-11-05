---
id: soxhza
title: Piggyback missed fetch requests whose body lived in a Request object
layer: project
category: failure
status: proposed
tags:
  - rpc
  - piggyback
  - debug
createdAt: '2026-11-05T16:41:07.154Z'
updatedAt: '2026-11-05T16:41:07.154Z'
---

In the 2026-11-05 failed capture, 17 game RPC batches completed but none contained appended calls. preparePiggyback in intercept.js originally required options.body to be a string, so fetch(Request) and Blob bodies could not consume queued calls. The fetch wrapper now reads Request.clone().text() or Blob.text() before dispatch and records piggyback queue/attach/complete/expire milestones during Record. The capture alone did not show when the popup queued the claim, so the Request form was a confirmed code gap, not a proven exclusive cause of that session.
