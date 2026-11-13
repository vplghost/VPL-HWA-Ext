---
id: doc-0028392fb0682f7e63346c9532c6cd90
title: Committed build versions and changelog
description: Release convention for versioned builds included with feature or fix commits.
createdAt: '2026-11-13T10:11:26.799Z'
updatedAt: '2026-11-13T10:11:26.799Z'
tags:
  - build
  - version
  - changelog
  - workflow
---

# Committed build versions and changelog

Implemented by the release-version task for the user's 2026-11-13 request to increment versions for builds associated with commits and provide changelogs.

For each new release build that will be included in a feature/fix commit:

1. Prepare one patch increment with `npm run version:bump -- patch`, unless the user requests another version boundary. The existing scripts/bump-version.mjs utility synchronizes package.json, package-lock.json (root and root package) and extension/manifest.json, rejecting mismatches and non-increasing versions.
2. Add an English `CHANGELOG.md` entry for the new version with the date, user-visible behavior and relevant known commit references. Never fabricate a hash for the commit currently being prepared. Link its existing version heading from the release commit body instead.
3. Run checks appropriate to the changed code and `npm run build`. WXT takes the package version and produces dist/manifest.json. Verify all versions match before committing.
4. Commit version files, changelog and generated dist with the completed change. A release version may include preceding source-only fix commits; name those in the version's changelog.

Repeated local verification builds while preparing the same commit reuse the prepared version. `npm run build` remains a compiler/artifact operation; it does not silently bump versions. The release preparer invokes version:bump once per committed release build. This avoids consuming versions on retry/typecheck/diagnostic work.

Release 0.10.53 includes the Tower final boss completion fix (086fb77) and Brigand camp discovery. Do not amend or rewrite existing commits just to backfill a version number.
