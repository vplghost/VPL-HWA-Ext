---
id: 20261106-1640-resolve-versioned-icons-through-verified-cdn-manifests
title: Resolve versioned icons through verified CDN manifests
status: draft
supersedes: []
supersededBy: []
tags:
  - assets
  - cdn
  - integrity
sources:
  - 'scripts/sync-cdn-assets.mjs:manifestCandidates'
  - tests/cdn-assets.test.mjs
  - docs/assets-1.293.0-catalog.json
relatedDocs:
  - workflows/versioned-cdn-asset-synchronization
relatedTasks:
  - VHE-JTJQJK
verification: []
reviewState: needs_evidence
reviewBlockers:
  - 'linked task "VHE-JTJQJK" is "in-progress"; all linked tasks must be done before accepting candidate'
reviewMatches: []
reviewAllowedResolutions: []
reviewEvaluatedHash: '31e002c458bd5357177b354b83d60e62df034b5d20ec6ed8c66bb0d7dd96aecf'
reviewEvaluatedAt: '2026-11-06T09:40:44.380Z'
createdAt: '2026-11-06T09:40:44.380Z'
updatedAt: '2026-11-06T09:40:44.380Z'
---

## Context

The 1.293 audit found item IDs differing from texture IDs, hero filename variants and per-file revisions; direct guessed URLs can return a valid but wrong image.

## Decision

Require a matching indexGet or checked-in version catalog. Validate manifest, splitlib and individual textures by their published hashes/sizes. Resolve icons from current metadata and exact manifest entries; reject ambiguous basenames and unknown item-ID guesses. Preserve existing images on failures and report upstream omissions.

## Alternatives Considered


## Consequences

Asset refresh is reproducible and does not add runtime RPC/CDN polling. New versions need their own startup index. Two current legacy consumables remain missing rather than receiving substitute images.
