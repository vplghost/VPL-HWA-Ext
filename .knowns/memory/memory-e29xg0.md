---
id: e29xg0
title: Version and changelog each committed release build
key: version-and-changelog-each-committed-release-build
layer: project
category: preference
status: active
lastVerified: '2026-11-13T10:11:27.218Z'
sources:
  - User, 2026-11-13, version builds per commit request
  - '@doc/architecture/committed-build-versions-and-changelog'
  - 'scripts/bump-version.mjs:bumpVersion'
tags:
  - version
  - build
  - changelog
  - user-preference
createdAt: '2026-11-13T10:11:27.218Z'
updatedAt: '2026-11-13T10:11:27.218Z'
---

User requested on 2026-11-13: “Tiến hành nâng phiên bản với mỗi bản build theo commit để có changelogs”. Prepare one patch increment with npm run version:bump -- patch for each new release build included in a commit, update CHANGELOG.md, rebuild dist and verify versions match. Repeated verification builds for the same pending commit reuse the prepared version; npm run build itself does not bump automatically. **Why:** The user wants each committed build to be identifiable by extension version and readable changelog. See @doc/architecture/committed-build-versions-and-changelog and scripts/bump-version.mjs:bumpVersion.
