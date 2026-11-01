---
id: VHE-QEWSHW
title: Hero avatars beside names with hover card and hidden foreign key columns
status: done
priority: high
labels: []
createdAt: '2026-11-01T15:12:14.397Z'
updatedAt: '2026-11-01T16:07:27.569Z'
completedAt: '2026-11-01T15:25:10.722Z'
timeSpent: 0
---
# Hero avatars beside names with hover card and hidden foreign key columns

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Hero avatars appear beside names on lists matching line height and vertically centered
- [x] #2 Hovering on hero avatar displays enlarged card with stars, power, role, and faction
- [x] #3 Foreign key ID columns (hero/titan IDs on teams, skin ID on heroes) are hidden from lists
- [x] #4 Tests, build and data docs pass and stay in sync
- [x] #5 Star-colored border and glowing aura on small and large avatars, omitting parentheses star count
- [x] #6 Expanded hover trigger area across avatar icon and hero name text
- [x] #7 CDN .img asset discovery and extraction for heroes and titans with converter tool and documentation
- [x] #8 Fixed vertical orientation of converted PNG avatars
- [x] #9 Added titan hover card and titan avatar inline view on Titans and Teams tabs
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extract hero metadata (role, class, faction, avatar mapping) from splitlib assets into extension. 2. Provide avatar image assets. 3. Update popup.js and popup.css to show inline avatars with line-height centering and hover cards with stars, power, role, faction. 4. Hide foreign key ID columns on teams and heroes. 5. Update tests and data docs, verify check/build.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added hero avatars beside names on Heroes and Teams lists with exact line-height centering (-my-0.5) and pure CSS hover card showing large avatar, stars, power, role (class and position), and faction. Extracted 83 playable heroes metadata into extension/hero-metadata.js and downloaded 74 WebP avatars into extension/assets/heroes/ with faction gradient fallback for new heroes. Hid foreign key columns: Skin ID on heroes and Hero/Titan ID on teams. Updated tests, build, and data docs. 55/55 tests pass, build and validate succeed.

Added automatic hiding of the open-tab button when already viewing inside a browser tab (via min-[800px]:hidden, query param view=tab, and chrome.tabs.getCurrent), ensuring it only shows within the extension popup dropdown.

Implemented star-colored borders and glowing auras (avatar-star-1..6 and avatar-star-lg-1..6) on both small and large avatars. Removed star count text in parentheses on the card. Expanded hover area to include both the avatar and hero name text. Investigated game CDN .img asset structure (PKZip containing tex.header BinaryFormatter tuple and tex.bytes ETC compressed blocks). Developed scripts/convert-img-asset.mjs converting both ETC2_RGBA8 heroes and ETC2_RGB titans. Extracted 8 missing heroes to PNG (82/83 heroes with avatars) and all 29 titans to PNG in extension/assets/titans/. Documented extraction format and Wodryn #78 atlas exception in docs/ASSET-EXTRACTION.md.

Fixed OpenGL bottom-left to PNG top-left vertical orientation inversion in scripts/convert-img-asset.mjs and re-converted all 8 hero PNGs and 29 titan PNGs upright. Created extension/titan-metadata.js and scripts/generate-titan-metadata.mjs mapping all 29 titans with roles and elements. Added createTitanInline in popup.js with star-colored glowing borders, hover trigger over icon + name, and enlarged hover card showing role and elemental affinity on both Titans and Teams tabs. Added tests in tests/titan-metadata.test.mjs and tests/popup-hero-view.test.mjs. All 65 tests pass.
<!-- SECTION:NOTES:END -->

