---
id: 20261111-1038-always-build-release-bundle-and-track-in-git-on-version-release
title: Always build release bundle and track in git on version release
status: accepted
supersedes: []
supersededBy: []
tags:
  - release
  - build
  - workflow
  - git
sources:
  - package.json
  - docs/HUONG-DAN.md
relatedDocs:
  - workflows/extension-versioning-and-release
relatedTasks:
  - VHE-DNMYZY
verification:
  - 'source:package.json'
  - 'source:docs/HUONG-DAN.md'
  - 'task:@task-VHE-DNMYZY:done'
verifiedAt: '2026-11-11T03:39:21.894Z'
createdAt: '2026-11-11T03:38:40.392Z'
updatedAt: '2026-11-11T03:39:21.894Z'
---

## Context

Developers and users pulling the repository to a new machine require an immediately loadable Chrome extension without needing to configure Node tooling first.

## Decision

Every time a new version is created or released, the project build command must always be executed, and the built release bundle must be included in git commits and pushed so that a ready-to-run extension is available immediately upon git clone or pull.

## Alternatives Considered

Requiring every machine clone to manually configure dev tooling and run build commands was rejected to ensure instant extension availability and zero setup friction.

## Consequences

Release and update commits will consistently include compiled distribution outputs, guaranteeing that pulling to a new machine yields an immediately runnable extension.
