---
id: 9dm7ym
title: Extension SemVer Bump on Commit Waves
layer: project
category: convention
status: proposed
confidence: high
lastVerified: '2026-11-02T06:44:15.787Z'
ttlDays: 90
sources:
  - package.json
  - extension/manifest.json
  - scripts/bump-version.js
tags:
  - versioning,release
createdAt: '2026-11-02T06:44:15.787Z'
updatedAt: '2026-11-02T06:44:15.787Z'
---

Every feature commit wave must bump SemVer patch in package.json and extension/manifest.json using npm run version:bump before committing, ensuring Chrome unpack reload compatibility.
