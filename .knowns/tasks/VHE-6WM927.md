---
id: VHE-6WM927
title: Add Guild member and outpost information tab
status: done
priority: medium
labels: []
createdAt: '2026-11-14T01:35:09.166Z'
updatedAt: '2026-11-14T01:59:07.005Z'
completedAt: '2026-11-14T01:59:06.973Z'
timeSpent: 998
---
# Add Guild member and outpost information tab

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Use official game Guild terminology in UI and clan RPC keys internally. Record/show basic member information and outpost information from captured server responses, with account/guild scope and no fabricated member attributes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Guild tab presents verified member basics and outposts, including safe missing-data states.
- [x] #2 Recorded guild data respects account/guild boundaries and refreshes from known supported sources.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Inspect clan summary/member/outpost contracts and existing cache/tab infrastructure; implement passive member/outpost collection and Guild tab with useful search/details; test, document, release and commit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented passive user_getClanInfo roster/stat collection and getUserClanMembersOutposts:globalMap joins with known active account/member validation, exact user-ID correlation, stale-response guards, account/Guild transition cleanup and bounded outpost inputs. GuildTab uses official Guild locale terminology and displays name,level,official/custom role,last login,activity,Titanite,champion record,outpostlevel/coordinates and expanded totals/server/observation times; search/filter/sort/refresh/filtered JSON export included. Unknown fields stay unavailable and raw UUIDs/account IDs are not rendered. Actual capture replay yields30members/30outposts; tests cover both response arrival orders, foreign members, account/Guild/no-Guild transitions, actual SFC display, filtering, export and refresh. Sharedrelease0.10.75:717tests,705pass,0fail,12optional skips; typecheck/build passed. Review PASS P1=0/P2=0/P3=0. @doc/architecture/guild-features documents sources and scope. System Decision Impact: draft candidate20261114-0853-scope-guild-roster-and-outpost-records-to-the-active-account-and-guild recorded with task/doc/source links, not promoted to accepted.
<!-- SECTION:NOTES:END -->

