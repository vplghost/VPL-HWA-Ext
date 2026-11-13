---
id: n78k58
title: Dungeon door enemy Titans are stored in team
key: dungeon-door-enemy-titans-are-stored-in-team
layer: project
category: pattern
status: active
lastVerified: '2026-11-13T17:05:55.835Z'
sources:
  - 'src/components/dialogs/DungeonModal.vue:doors'
  - tests/dungeon-enemies.test.mjs
  - '@task-VHE-473JB8'
tags:
  - dungeon
  - titans
  - ui
createdAt: '2026-11-13T17:05:55.835Z'
updatedAt: '2026-11-13T17:05:55.835Z'
---

Dungeon responses expose per-door enemy Titans at floor.userData[].team as { id, level, star } entries. The cache retains these under dungeonStatus.data.currentFloorDoors[].team; this is separate from the player's states.titans. DungeonModal derives display enemies from team, with legacy enemies fallback only when team is absent, and resolves names/elements/packaged avatars through getTitanMetadata. Tests render the actual door template and verify door/floor separation and unknown-data fallback.
