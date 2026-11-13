---
id: doc-ee7f1ea4adb17cfe05b9d802e9823052
title: UI Language Standardization
description: Policy and rules establishing English as the sole uniform language across all extension popup UI components
createdAt: '2026-11-10T13:17:18.783Z'
updatedAt: '2026-11-13T04:53:15.876Z'
tags:
  - ui
  - standards
  - locale
---

## Context & Policy

All user-facing copy in the HWA Helper extension popup must use standard English as the primary and uniform language.

### Components Covered
- **Titles & Headers:** Dialog headers, card titles, section labels.
- **Action Elements:** Buttons, checkboxes, toggles, dropdowns, segmented filters.
- **Status Indicators:** Pills, badges, progress notifications, error/warning banners, empty states.
- **Tooltips & Helper Text:** Subtext, placeholder inputs, title tooltips, and explanation alerts.

### Rules for Future Development
1. **No Mixed Copy:** Do not introduce non-English UI strings or phrases into popup templates, renderers, or dialogs.
2. **Alignment with Game Metadata:** Hero names, items, scrolls, stats, and game modes must match standard English game metadata from 
ames or assets.
3. **Automated Testing:** Test assertions verifying popup UI text must check against the standardized English copy.


## Server terminology

When a concept exists in verified server contracts, use its server term consistently in UI copy, documentation, and new domain naming. Check captured RPC methods and payloads before introducing synonyms; do not infer equivalence from English wording alone.

- **Team**: a selected or saved group of heroes/titans, matching `teamGetAll`, `battle_teamGetClient`, and `battle_teamSet`. Use `Select Team`, `Selected Team`, `Server-Saved Teams`, and `Custom Preset Teams`; use `Team` instead of `Lineup` for this concept.
- **Squad**: the world-map dispatch payload containing `heroes` and `units`, and the deployed entity identified by `squadId`. Keep `Send Squad` and `Recall Squad` for dispatch/recall actions. A selected Team supplies the heroes for a Squad.
- Preserve protocol fields, RPC names, persisted keys, existing compatibility helpers, and user-created names. A copy change must not rename these implicitly. Extension-only concepts may use a clear local term when no verified server concept exists.

Evidence: @doc/api/roster-inventory-rpc-catalog (`teamGetAll`, `battle_teamGetClient`, `battle_teamSet`) and @doc/api/world-map-rpc-contracts (Shared squad and route). Applied by @task-VHE-QAYD52.
