---
id: doc-ee7f1ea4adb17cfe05b9d802e9823052
title: UI Language Standardization
description: Policy and rules establishing English as the sole uniform language across all extension popup UI components
createdAt: '2026-11-10T13:17:18.783Z'
updatedAt: '2026-11-10T13:17:18.783Z'
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
