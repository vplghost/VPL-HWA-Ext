---
id: doc-62dc94eb050af678d49cd1dfea471bc5
title: Mail RPC contract and dialog
description: Explicit mail deadlines, account-scoped claims, reward display and local expiry cleanup
createdAt: '2026-11-15T06:58:39.728Z'
updatedAt: '2026-11-15T07:03:35.961Z'
tags: []
---

MailModal opens from Header without a server refresh; Refresh explicitly reads mailGetAll and getPage:report. Rewards and explicit deadlines are primary. availableUntil is seconds for letters; report expiresAt is milliseconds. Zero, missing and invalid deadlines remain unknown. mail-data.prune removes only explicitly expired entries from mailStatus, mailGetAll and getPage:report and recomputes counts. Background startup, records and hwa-mail-expiry alarms run cleanup without a game request. Claims use existing mailFarm {letterIds} response ID-to-reward mapping and readAndClaimAll:report {types}; prior contract source: @doc/architecture/auto-claim-automation-bridge. No new mail wire capture is asserted. Persist account-scoped pending before dispatch and preserve token in Direct and Piggyback; ambiguous acknowledgments hold without automatic retry. Credit only returned reward IDs and wait for authoritative balances where unknown; newer snapshots win. Full mailGetAll replaces the letter collection. Account changes invalidate old pending/cache data. Tests: tests/mail.test.mjs, tests/mail-background.test.mjs, tests/intercept.test.mjs; Chrome fixture scripts/browser-mail-acceptance.mjs verifies both modes and no request on open. Related task: @task-VHE-7AC9T3.
