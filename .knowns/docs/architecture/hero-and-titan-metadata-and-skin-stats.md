---
id: doc-264cdb45c3634afc0f2fc3b97f5f5f3d
title: Hero and Titan Metadata and Skin Stats
description: Ground truth protobuf mappings for hero and titan skin stats, skill names, and tank stat rules
createdAt: '2026-11-23T20:25:37.475Z'
updatedAt: '2026-11-23T20:25:37.475Z'
tags:
  - metadata
  - skins
  - heroes
  - titans
---

# Hero and Titan Metadata and Skin Stats

## 1. Overview & Data Source
Client configuration files downloaded directly from Nexters Game CDN (`locale/en.json.gz` and `splitlib.json.zip`) provide the ground truth for hero/titan abilities and skin attributes.

## 2. Protobuf Stat ID Mapping (`temp/splitlib/skin.pb`)
Analysis of packed skin record bytes in Table 2 of `skin.pb` reveals key mappings that differ from intuitive naming:
- **`statId === 9`**: Health (`HP`), formerly misattributed as Armor (`Arm`).
- **`statId === 7`**: Armor (`Arm`), formerly misattributed as Magic Defense (`MD`).
- **`statId === 13`**: Main Stat Intelligence (`Int`) for Intelligence heroes (Iris #242, Xe'sha #1010).
- **`statId === 4`**: Main Stat Strength (`Str`) for Strength heroes (Corvus #1002, Aurora #1, Galahad #2, Astaroth #4).

## 3. Titan Skin Stat Allocation Rules
Titans strictly partition skin attribute categories based on whether their combat role is Tank:
- **Tank Titans** (Sigurd #4000, Moloch #4010, Angus #4020, Brustar #4030, Rigel #4040, Pallant #4050):
  - Default Skin: **Health (`HP`)**
  - Primordial Skin: **Physical Attack (`PA`)**
  - Biomech Skin: **Health (`HP`)**
- **Non-Tank Titans** (Marksman, Support, Super Titans):
  - Default Skin: **Physical Attack (`PA`)**
  - Primordial Skin: **Health (`HP`)**
  - Biomech Skin: **Physical Attack (`PA`)**

## 4. Purchased Hero Skin Corrections
14+ hero skins purchased in-game provide Health (`HP`) rather than Armor (`Arm`):
- Cleaver Barbarian (#93)
- Aurora Spring (#95)
- Astaroth Cybernetic (#241)
- Ishmael Masquerade (#146)
- Lilith Winter (#159)
- Martha Masquerade (#224)
- Rufus Angel/Winter (#121 / #180)
- Ziri Cybernetic/Champion (#82 / #112)
- Julius Demonic (#291), Amira Demonic (#293), Chabba Masquerade (#169), Luther Cybernetic (#173), Elmir Cybernetic (#229), Alvanor Winter (#253).

## 5. Provenance & Generator Synchronization
- Canonical Data: `src/data/heroMetadata.ts` (`skinStats`), `src/data/titanMetadata.ts`.
- Automation: `scripts/sync-skin-stats.mjs`, `scripts/sync-skill-names.mjs`.
- Linked Task: `@task-VHE-14NKJ6`, `@task-VHE-JBQF32`.
