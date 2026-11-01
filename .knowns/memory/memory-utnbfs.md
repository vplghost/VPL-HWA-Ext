---
id: utnbfs
title: Skill Points use a soft cap of 10 in WebGL 1.292.0
layer: project
category: pattern
status: proposed
tags: []
createdAt: '2026-11-01T13:51:37.877Z'
updatedAt: '2026-11-01T13:51:37.877Z'
---

The captured account has no refillable upgrades and splitlib/refillable.json sets Skill Points (id 2) maxValue to [10,10,10,10,20]. hwaHelperRefillableRules[2] uses cap 10; hwaHelperResourceData.amountAt preserves a higher observed balance but only refills below 10. Source: @task-VHE-FZRFSN and hwaHelperRefillableRules[2].
