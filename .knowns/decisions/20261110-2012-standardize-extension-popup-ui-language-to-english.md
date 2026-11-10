---
id: 20261110-2012-standardize-extension-popup-ui-language-to-english
title: Standardize Extension Popup UI Language to English
status: draft
supersedes: []
supersededBy: []
tags:
  - ui
  - locale
  - standards
sources:
  - extension/popup.js
relatedDocs:
  - architecture/ui-language-standardization
relatedTasks:
  - VHE-V68GQ2
  - VHE-3SPMFH
verification: []
reviewState: ready_for_review
reviewBlockers: []
reviewMatches: []
reviewAllowedResolutions:
  - accept_new
  - reject_new
reviewEvaluatedHash: 'fd7be7374740800bc8fb77617612eac7e7c9153beba412d0e57dd209f54eaa9e'
reviewEvaluatedAt: '2026-11-10T13:17:47.359Z'
createdAt: '2026-11-10T13:12:16.762Z'
updatedAt: '2026-11-10T13:17:47.359Z'
---

## Context

The extension UI previously had mixed language copy, where some dialogs and sections (Legend Draft, Tower accordion, Equipment slots, Campaign Mission Raid & Recipe tree) contained Vietnamese text while other parts used English, resulting in bilingual fragmentation.

## Decision

All user-facing text across the extension popup—including titles, headers, labels, tooltips, button text, badges, status notifications, and empty states—must use standard English as the primary and uniform language.

## Alternatives Considered

A full i18n translation framework was considered, but a uniform English UI directly aligns with standard game data terminology and avoids maintenance overhead of bilingual desync.

## Consequences

Ensures uniform terminology across the extension interface and automated test suites. Any new UI additions or updates must follow English copy to prevent language drift.
