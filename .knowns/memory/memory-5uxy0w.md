---
id: 5uxy0w
title: Teams power must normalize nested custom members before reducing
key: teams-power-must-normalize-nested-custom-members-before-reducing
layer: project
category: failure
status: active
confidence: high
lastVerified: '2026-11-14T18:57:59.543Z'
ttlDays: 90
sources:
  - '@task-VHE-40Y50X'
  - src/utils/teamMembers.ts
  - src/composables/useAccountTeams.ts
  - 'src/components/tabs/TeamsTab.vue:getTeamPower'
  - tests/teams-members.test.mjs
  - docs/acceptance/teams-2026-11-15.json
tags:
  - teams
  - vue
  - normalization
  - debug
createdAt: '2026-11-14T18:57:59.543Z'
updatedAt: '2026-11-14T18:57:59.543Z'
---

TeamsTab getTeamPower previously called reduce on raw customTeam.heroIds. An outer array of stored teams can contain indexed-object heroIds, so outer normalization alone did not prevent the blank-tab crash after hero cache refresh. useAccountTeams now normalizes load/save; teamMemberIds/serverTeamGroups normalize power/edit and flat-versus-nested server groups. Actual SFC and Chrome regressions prove object-member rendering and power3000→9000 on cache refresh. Canonical: @doc/architecture/wxt-vue-tailwind-conventions.
