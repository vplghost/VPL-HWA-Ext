---
id: VHE-3YHW5M
title: Ignore local Knowns logs and runtime artifacts
status: done
priority: medium
labels: []
createdAt: '2026-11-15T08:20:17.755Z'
updatedAt: '2026-11-15T08:20:37.163Z'
completedAt: '2026-11-15T08:20:37.163Z'
timeSpent: 9
---
# Ignore local Knowns logs and runtime artifacts

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Ignore newly generated Knowns logs, agent work state and Qdrant initialization marker; remove staged generated log from index while preserving the local file and canonical knowledge.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 New log/runtime artifacts are ignored and the local log is preserved outside the index.
- [x] #2 Git ignore checks confirm canonical docs, tasks, decisions and existing temp README exceptions remain trackable.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inspect existing ignore rules and staged generated files. 2. Add exact local runtime/log patterns and untrack the generated log. 3. Verify ignore behavior and canonical-file exceptions.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added exact root rules for .knowns/logs/, .knowns/agent-work.json and .qdrant-initialized. Removed newly staged typescript.log from the index with git rm --cached; local file preserved. git check-ignore verified all four generated paths, and --no-index checks preserved canonical docs/tasks/decisions plus temp README exceptions. git diff --check passed. Spec Decision Compliance: N/A (standalone). System Decision Impact: none — extends the established local-runtime exclusion policy to newly generated artifacts.
<!-- SECTION:NOTES:END -->

