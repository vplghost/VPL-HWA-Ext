---
id: 20261119-2059-always-build-production-extension-and-update-changelog-before-git-push-for-immediate-deployment
title: Always build production extension and update changelog before git push for immediate deployment
status: accepted
supersedes:
  - 20261111-1038-always-build-release-bundle-and-track-in-git-on-version-release
supersededBy: []
tags:
  - release
  - build
  - workflow
  - git
  - changelog
sources:
  - package.json
  - CHANGELOG.md
  - scripts/build.mjs
relatedDocs: []
relatedTasks:
  - VHE-9K91PS
  - VHE-3W75DT
  - VHE-MDGS9J
verification:
  - 'source:package.json'
  - 'source:CHANGELOG.md'
  - 'source:scripts/build.mjs'
  - 'task:@task-VHE-9K91PS:done'
  - 'task:@task-VHE-3W75DT:done'
  - 'task:@task-VHE-MDGS9J:done'
verifiedAt: '2026-11-19T14:01:59.583Z'
createdAt: '2026-11-19T13:59:03.015Z'
updatedAt: '2026-11-19T14:01:59.583Z'
---

## Context

Developers and users pulling or loading the extension directly from git require immediately runnable production artifacts (dist/) without manually configuring Node or build tools, alongside a synchronized changelog documenting changes for every version.

## Decision

Before pushing git commits for any version release or feature update, the production build (npm run build) must always be executed, compiling WXT outputs to dist/, and CHANGELOG.md must be updated with the version's release notes, committing the compiled dist/ bundle and changelog together so that pulling the repository provides an instantly runnable extension.

## Alternatives Considered

Requiring manual builds or relying on detached CI creates broken/stale extension states on git pull and lacks visibility into what changed without compiling.

## Consequences

Every git push contains an up-to-date, verified production dist/ directory and synchronized CHANGELOG.md.
