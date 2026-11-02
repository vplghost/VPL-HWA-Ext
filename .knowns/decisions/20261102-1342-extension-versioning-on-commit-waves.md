---
id: 20261102-1342-extension-versioning-on-commit-waves
title: Extension Versioning on Commit Waves
status: draft
supersedes: []
supersededBy: []
tags:
  - convention
  - release
sources: []
relatedDocs: []
relatedTasks: []
verification: []
reviewState: needs_evidence
reviewBlockers:
  - candidate needs at least one source before acceptance
reviewMatches: []
reviewAllowedResolutions: []
reviewEvaluatedHash: '71fce70babc039378d36ab67520d79b55e1d4aa998894ffc62641a9986e54dac'
reviewEvaluatedAt: '2026-11-02T06:42:58.144Z'
createdAt: '2026-11-02T06:42:58.144Z'
updatedAt: '2026-11-02T06:42:58.144Z'
---

## Context

Chrome extensions require manifest.json version changes to reload properly. In previous sessions, version remained at 0.9.0 across multiple feature waves.

## Decision

Every feature commit wave must bump SemVer patch (or minor for milestone releases) across package.json and extension/manifest.json using npm run version:bump.

## Alternatives Considered

Manual version bumping was forgotten. Automated script npm run version:bump ensures synchronization.

## Consequences

Chrome unpacked extensions can easily be reloaded with updated version visible. Tests and build scripts stay synchronized.
