# Báo cáo đồng bộ phiên bản Game 1.294.1020 (CDN static 1.294.0)

Báo cáo ghi nhận quá trình phân tích và đồng bộ toàn diện dữ liệu, cấu hình và assets của Hero Wars: Alliance khi nâng cấp lên phiên bản client **1.294.1020** (CDN static **1.294.0**).

---

## 1. Nguồn dữ liệu kiểm chứng (Provenance)

- **Log gốc:** `temp/tracking-data/hwa-game-record-202611211122.json`
- **Thời điểm trích xuất:** `2026-11-21T04:12:26.197Z`
- **Phiên bản client:** `1.294.1020`
- **Static Base CDN:** `https://heroesmobile-a-cdn.nextersglobal.com/v/webgl/1.294.0/`
- **Manifest Index (`index.latest.json.gz`):**
  - URL: `https://heroesmobile-a-cdn.nextersglobal.com/v/webgl/1.294.0/1e8af4ed49f75d2f461962f885ffbaac/index.latest.json.gz?hash=d5d8b4c5cc66458bb7f952894e258e5d`
  - Kích thước: **622.658 byte**
  - MD5: `d5d8b4c5cc66458bb7f952894e258e5d`
  - Tổng số entry manifest: **17.628** (tăng từ 17.360 của bản 1.293)
  - Số entry icon: **7.816** (tăng từ 7.746)
- **Locale tiếng Anh (`en.json.gz`):**
  - URL: `https://heroesmobile-a-cdn.nextersglobal.com/v/webgl/1.294.0/v0067/1e8af4ed49f75d2f461962f885ffbaac/locale/en.json.gz`
  - Kích thước: **688.687 byte**
  - MD5: `00b495cbfd75c22a93b508612c41cc1f`
- **Thư viện dữ liệu tĩnh (`splitlib.json.zip`):**
  - URL: `https://heroesmobile-a-cdn.nextersglobal.com/v/webgl/1.294.0/v0069/1e8af4ed49f75d2f461962f885ffbaac/lib/splitlib.json.zip`
  - Kích thước: **6.031.315 byte**
  - MD5: `1bb97cbf947cf3692eb2bb95136bdd77`
  - Tổng số file giải nén: **438** bảng dữ liệu

---

## 2. Các thay đổi chính trong phiên bản 1.294.1020

### 2.1. Nhân vật mới
- **Titan mới:** **Valdur** (ID `4054`)
  - Vai trò: `Summoner` (triệu hồi)
  - Hệ nguyên tố: `Spirit` (Mage)
  - Kỹ năng: `Child of Elarite` (ID `4070`), `Elarite Resonance` (ID `4082`)
  - Cổ vật (Artifacts): `11030` (Zorval’s Call), `12006` (Crown), `13008` (Chthonic Summon Seal)
  - Icon avatar: `extension/assets/titans/4054.png` (đã tải và chuyển đổi từ ETC2 sang PNG)
  - Tổng số playable titans tăng từ **29** lên **30**.
- **Boss mới:** Ogre (boss) (ID `10106`), Valdur (ID `10107`)

### 2.2. Vật phẩm & Trang bị mới
- **Vật phẩm tiêu hao (Consumable):**
  - `40248`: Sweet Treat
  - `40251`: Holiday Chest
  - `40253`: Red Recipe Box
- **Trang bị & Bản vẽ (Gear & Recipe):**
  - `317`: Hand of Rebirth
  - `324`: Hand of Rebirth – Recipe
  - `327`: Icon trang bị mới
  - `334`: Icon bản vẽ mới
- **Cổ vật mới:**
  - `11030`: Zorval’s Call
  - `13008`: Chthonic Summon Seal

### 2.3. Cải tiến công cụ đồng bộ CDN
- Bổ sung `resilientFetch` trong `scripts/sync-cdn-assets.mjs` với TLS SNI (`servername`) và cơ chế fallback IP Akamai trực tiếp khi hệ thống bị nghẽn/chặn cổng 53 UDP (DNS timeout).
- Sửa lỗi trong `scripts/generate-name-map.mjs` để tự động khởi tạo nhóm hiệu chỉnh `names[group] ||= {}`.
- Sửa lỗi tương thích định dạng `records`/`timeline` trong `scripts/generate-data-docs.mjs`.

---

## 3. Kiểm kê Assets & Catalog

- **Catalog:** `docs/assets-1.294.0-catalog.json`
- **Báo cáo kiểm kê:** `docs/assets-1.294.0-audit.json`
- **Kết quả audit:**
  - Tổng số ID kiểm tra: **967**
  - Khớp nguyên vẹn (unchanged): **965**
  - Thêm mới (added): **6** (`assets/titans/4054.png`, `assets/items/consumable/40248.png`, `assets/items/consumable/40251.png`, `assets/items/consumable/40253.png`, `assets/items/gear/327.png`, `assets/items/scroll/334.png`)
  - Thiếu từ upstream (missing): **2** (Consumable 103 và 104 không có texture độc lập trong manifest)
  - Titan/Hero chưa map (unmapped): **0**

---

## 4. Xác minh kiểm thử (Verification)

- Toàn bộ **1.096** unit tests đạt kết quả: **1.084 passed, 0 failed, 12 skipped (optional traces)**.
- Kiểm tra build extension `npm run build` thành công, tạo gói extension hợp lệ tại `dist/`.
