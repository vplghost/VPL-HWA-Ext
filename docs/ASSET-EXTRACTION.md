# Hero and Titan Asset Extraction & .img Conversion

This document records the discovery, file format specifications, conversion process, and inventory results for hero and titan avatar assets in **Hero Wars: Alliance**.

---

## 1. CDN Asset Overview & Endpoints

Hero Wars: Alliance (WebGL / Mobile client) serves graphical assets through the Nexters Global CDN:

- **Base CDN**: `https://heroesmobile-a-cdn.nextersglobal.com/v/webgl/1.292.0/v0001/extends/icons/hero/`
- **Fandom / WebP mirror**: `https://heroes-wb.nextersglobal.com/assets/assets/images/heroes/icon/{id}.webp`

### URL Patterns
1. **Heroes (WebP)**:
   `https://heroes-wb.nextersglobal.com/assets/assets/images/heroes/icon/{id}.webp`
   *Available for 74 of 83 playable heroes.*

2. **Heroes (.img on CDN)**:
   `https://heroesmobile-a-cdn.nextersglobal.com/v/webgl/1.292.0/v0001/extends/icons/hero/hero_{id4}_new.img` or
   `https://heroesmobile-a-cdn.nextersglobal.com/v/webgl/1.292.0/v0001/extends/icons/hero/hero_{id4}.img` (where `{id4}` is zero-padded 4 digits, e.g. `0065`).

3. **Titans (.img on CDN)**:
   `https://heroesmobile-a-cdn.nextersglobal.com/v/webgl/1.292.0/v0001/extends/icons/hero/titan_160_{id}.img` (e.g. `titan_160_4000.img`).
   *Available for all 29 titans.*

---

## 2. `.img` File Structure & Decoding

Game `.img` files are **PKZip archives** enclosing two specific payload files:

```
[Archive: hero_0065.img]
 ├── tex.header   (640 bytes)
 └── tex.bytes    (25,600 bytes)
```

### `tex.header` Specification
`tex.header` is a .NET `BinaryFormatter` serialized record of:
`System.ValueTuple<bool, UnityEngine.TextureFormat, int, int>`

In standard .NET BinaryFormatter serialization, the record concludes with:
- `Item2` (TextureFormat enum): 4-byte 32-bit LE integer
- `Item3` (Width): 4-byte 32-bit LE integer
- `Item4` (Height): 4-byte 32-bit LE integer
- `0x0B`: BinaryFormatter `MessageEnd` record marker

Extracting the metadata from `headerBuf` (length `L`):
```javascript
const end = headerBuf.length - 1; // 0x0B
const height = headerBuf.readInt32LE(end - 4);
const width = headerBuf.readInt32LE(end - 8);
const unityFormat = headerBuf.readInt32LE(end - 12);
```

### Format Mapping
Unity's `UnityEngine.TextureFormat` integers map to ETC texture decompression formats:

| Unity Enum Value | Unity Format Name | Decoder Enum | Channels | Used by |
| :--- | :--- | :--- | :--- | :--- |
| `34` | `TextureFormat.ETC_RGB4` | `ETC1_RGB` (0) | 3 (RGB) | Legacy textures |
| `45` | `TextureFormat.ETC2_RGB` | `ETC2_RGB` (1) | 3 (RGB) | **Titans** (80×80) |
| `46` | `TextureFormat.ETC2_RGBA1` | `ETC2_RGBA1` (4) | 4 (RGBA) | Cutout textures |
| `47` | `TextureFormat.ETC2_RGBA8` | `ETC2_RGBA8` (3) | 4 (RGBA) | **Heroes** (160×160) |
| `48` | `TextureFormat.EAC_R` | `EAC_R11` (5) | 1 (Gray) | Masks |
| `50` | `TextureFormat.EAC_RG` | `EAC_RG11` (6) | 2 (Normal) | Normal maps |

### Decoding & Converting to PNG (with Vertical Orientation Flip)
1. Read `tex.bytes` using `node:zlib` `inflateRawSync`.
2. Decode raw texture blocks using `tex-decoder` `decodeETC(bytesBuf, width, height, etcFormat)`.
3. **Vertical Flip**: Unity and WebGL OpenGL textures store pixel row 0 at the bottom-left coordinate origin. Standard image formats like PNG store row 0 at the top-left coordinate origin. During the conversion pass, pixel rows are flipped vertically (`srcY = height - 1 - y`) so the resulting avatars are correctly upright.
4. If the decoded texture is 3 channels (RGB) like `ETC2_RGB` on Titans, expand to 4 channels (RGBA) by setting `alpha = 255` for each pixel.
5. Encode the RGBA buffer into PNG using `makePNG(rgba, width, height)`.

---

## 3. Automation Tools

### 1. `scripts/convert-img-asset.mjs`
A standalone CLI tool and module to convert `.img` files:
```bash
# Convert a local .img file to PNG
node scripts/convert-img-asset.mjs path/to/titan_160_4000.img titan_4000.png

# Fetch and convert directly from URL
node scripts/convert-img-asset.mjs https://heroesmobile-a-cdn.nextersglobal.com/v/webgl/1.292.0/v0001/extends/icons/hero/hero_0065.img 65.png
```

### 2. `scripts/generate-hero-metadata.mjs`
Build pipeline script that:
1. Inspects existing WebP / PNG avatars in `extension/assets/heroes/`.
2. Queries Fandom / Web CDN for missing avatars.
3. Automatically falls back to fetching and converting `.img` assets from the game CDN.
4. Generates `extension/hero-metadata.js` referencing each hero's specific file.

### 3. `scripts/generate-titan-metadata.mjs`
Build pipeline script that:
1. Inspects all 29 titans from `temp/splitlib/titan.json` and `extension/assets/titans/`.
2. Maps roles (Tank, Marksman, Support, Supertitan, Summoner) and elements (Water, Fire, Earth, Darkness, Light, Spirit).
3. Generates `extension/titan-metadata.js` for titan hover cards and avatars.

---

## 4. Extraction & Conversion Inventory

### Playable Heroes (83 total)
- **82 / 83 heroes successfully have visual avatars**:
  - **74 heroes**: WebP format (stored in `extension/assets/heroes/{id}.webp`).
  - **8 heroes**: Converted from CDN `.img` to PNG (stored in `extension/assets/heroes/{id}.png`):
    - Hero #65: Tempus (160×160, `ETC2_RGBA8`)
    - Hero #68: Peech (160×160, `ETC2_RGBA8`)
    - Hero #72: Byrna (160×160, `ETC2_RGBA8`)
    - Hero #73: Drayne (160×160, `ETC2_RGBA8`)
    - Hero #75: Kendle (160×160, `ETC2_RGBA8`)
    - Hero #76: Crow (160×160, `ETC2_RGBA8`)
    - Hero #77: Eva (160×160, `ETC2_RGBA8`)
    - Hero #79: Leonel (160×160, `ETC2_RGBA8`)
- **1 hero unable to extract standalone asset**:
  - **Hero #78 (Wodryn)**:
    - *Release date*: 2026-10-26 (recently added hero).
    - *Technical reason*: Hero 78 definition has `iconAssetAtlas: 2, iconAssetTexture: '78'` and `icon: { imagePath: 'hero_0078.png' }`. No standalone `hero_0078.img` or `hero_0078_new.img` exists on CDN version `1.292.0`; its icon is bundled inside composite texture atlas #2.
    - *Fallback behavior*: Falls back to the initials badge (`W`), styled with faction gradient and star-colored glowing border.

### Playable Titans (29 total)
- **29 / 29 titans successfully converted**:
  - All 29 titans (IDs 4000..4053) downloaded from CDN `titan_160_{id}.img` and decoded from `ETC2_RGB` (format 45) into 80×80 PNG images in `extension/assets/titans/{id}.png`.
