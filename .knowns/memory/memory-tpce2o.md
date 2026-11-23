---
id: tpce2o
title: Titan and Hero Skin Stat Protobuf Mapping in splitlib
layer: project
category: pattern
status: proposed
tags:
  - skins
  - protobuf
  - metadata
createdAt: '2026-11-23T20:26:12.400Z'
updatedAt: '2026-11-23T20:26:12.400Z'
---

In splitlib skin.pb, statId 9 maps to Health (HP) and statId 7 maps to Armor (Arm). Tank Titans strictly follow Default HP / Primordial PA / Biomech HP, whereas Non-Tank Titans follow Default PA / Primordial HP / Biomech PA. See @doc/architecture/hero-and-titan-metadata-and-skin-stats and @task-VHE-14NKJ6.
