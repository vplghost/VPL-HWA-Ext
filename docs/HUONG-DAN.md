# Hướng Dẫn Sử Dụng HWA Helper (Phiên Bản WXT + Vue 3)

## 1. Yêu Cầu Hệ Thống

- **Trình duyệt**: Google Chrome hoặc trình duyệt nhân Chromium hỗ trợ Manifest V3.
- **Node.js**: Phiên bản 20.11 trở lên.
- **Nền tảng công nghệ**: WXT Framework (Next-Gen Web Extension Framework), Vue 3 (Composition API, `<script setup lang="ts">`), Tailwind CSS v4.

---

## 2. Cài Đặt và Build Extension

### Bước 1: Cài đặt dependencies
Mở terminal tại thư mục gốc của dự án và chạy lệnh:
```bash
npm ci
```

### Bước 2: Build extension
- **Build bản phát hành (Production)**:
  ```bash
  npm run wxt:build
  ```
  Lệnh này sẽ biên dịch mã nguồn Vue, TypeScript và Tailwind CSS thành extension đóng gói hoàn chỉnh tại thư mục `.output/chrome-mv3`. Quá trình build chỉ mất khoảng 500ms – 1s.

- **Chạy chế độ phát triển (Development với HMR)**:
  ```bash
  npm run wxt:dev
  ```
  Hỗ trợ Hot Module Replacement (HMR) – mọi thay đổi mã nguồn trong `src/` hoặc `entrypoints/` sẽ tự động cập nhật ngay lập tức vào trình duyệt mà không cần nạp lại extension thủ công.

- **Kiểm thử tự động toàn diện**:
  ```bash
  npm run check
  ```
  Chạy toàn bộ 467+ unit test và kiểm tra build để đảm bảo 100% tính năng hoạt động chính xác.

### Bước 3: Nạp vào Google Chrome
1. Mở Chrome và truy cập đường dẫn: `chrome://extensions/`.
2. Bật công tắc **Developer mode** ở góc trên bên phải.
3. Nhấp vào nút **Load unpacked** (Tải tiện ích đã giải nén).
4. Trỏ đến thư mục `.output/chrome-mv3` vừa được tạo (hoặc thư mục `dist` nếu build bằng script legacy).
5. Mở hoặc tải lại trang web game: `https://www.hero-wars-alliance.com/`.

---

## 3. Tổng Quan Giao Diện & Tính Năng

Giao diện popup extension tuân thủ quy chuẩn **100% tiếng Anh** (System Decision `20261110-2012-standardize-extension-popup-ui-language-to-english`) để đồng nhất với định danh game quốc tế.

### 3.1. Header Bar
- **Tên & Phiên bản**: Hiển thị tên extension `HWA Helper` kèm số phiên bản mới nhất và tên tài khoản người chơi đang đăng nhập.
- **RPC Queue Badge**: Hiển thị số lượng lệnh RPC đang được xếp hàng chuẩn bị đồng bộ với game (`RPC: X`).
- **Nút Chuyển Theme (☀️ / 🌙)**: Chuyển đổi nhanh giữa chế độ **Dark Mode** và **Light Mode**.

### 3.2. Tab Dashboard (Bảng Điều Khiển Tổng Hợp)
Tab chính tổng hợp mọi thông tin cốt lõi nhất của tài khoản:
1. **Tài nguyên chiến lược & Đếm ngược hồi phục**:
   - **Gold** (Vàng) & **Emeralds** (Kim cương).
   - **Energy** (Năng lượng chiến dịch): Hiển thị số điểm hiện tại / giới hạn tối đa, kèm đồng hồ đếm ngược `+1 in MM:SS` theo thời gian thực.
   - **World Energy** (Năng lượng viễn chinh bản đồ): Hiển thị số điểm hiện tại / 200, kèm đồng hồ đếm ngược `+1 in MM:SS`.
   - **Tài nguyên thành phố**: Hiển thị số lượng Lương thực (Food), Gỗ (Wood), Đá (Stone), và Sắt (Iron).
2. **Quản lý Quân đội & Bệnh viện (Troops · Forces & Hospital)**:
   - **3 Binh chủng**: Marksmen (Cung thủ 🏹), Spearmen (Giáo binh 🔱), Infantry (Bộ binh 🛡️) với đầy đủ 9 cấp độ (Lv.1 – Lv.9).
   - **Thanh tiến trình trực quan phân đoạn (Segmented Bar)**:
     - Màu xanh lục: Quân số sẵn sàng chiến đấu (Ready).
     - Màu đỏ hồng: Thương binh đang nằm viện (In Hospital).
     - Màu tím chàm: Quân số đang trong hàng đợi huấn luyện (In Training).
   - **Ngưỡng quân tối đa (`Max:`)**: Nhập ngưỡng quân tối đa mong muốn cho từng loại; hệ thống tự động lưu vào cấu hình.
   - **Chọn cấp độ huấn luyện (`Lv.1`–`Lv.9`)**: Dropdown chọn tier quân muốn luyện; tự động lưu lựa chọn.
   - **Huấn luyện thông minh (Clamped Training)**:
     - Công thức tự động: `unitsToTrain = Math.min(26, Math.max(0, maxTarget - currentTotal))`.
     - Chỉ cho phép huấn luyện vừa đủ tới ngưỡng Max, ngăn lãng phí tài nguyên. Nút tự động khóa và hiển thị `Maxed` khi đã đủ quân.
   - **Thu hoạch quân (`Ready / Collect`)**: Tự động nhận diện khi hàng đợi luyện quân xong và cho phép bấm nhận ngay vào quân số sẵn sàng.
   - **Cứu chữa toàn bộ (`Heal All`) & Đồng bộ viện binh (`Sync Healed`)**: Bấm một chạm để đưa toàn bộ thương binh vào viện điều trị hoặc đồng bộ quân đã lành lặn ra tiền tuyến.
3. **Trạng thái Hàng đợi (Queues Status)**:
   - Thời gian hoàn thành công trình đang nâng cấp (Building Queue).
   - Thời gian nghiên cứu công nghệ tại Học viện (Research Queue).
   - Danh sách các đạo quân đang hành quân ngoài thành kèm thời gian đến mục tiêu.
4. **Tiến độ Hoạt động Hàng ngày (Daily Activities & Progress)**:
   - Theo dõi trạng thái Tháp (Tower: Cleared hay tầng hiện tại).
   - Số lượt đánh Đấu trường còn lại (Arena & Grand Arena).
   - Tiến độ Hầm ngục Guild (Dungeon) và số lượt đánh trùm Hydra.

---

### 3.3. Các Tab Chức Năng Chuyên Sâu

#### 🦸 Heroes (Tướng)
- Lưới danh sách tướng hiển thị hình ảnh đại diện (avatar), tên, cấp độ, số sao (★), rank phẩm trang bị và chiến lực (Power).
- Tìm kiếm nhanh theo tên hoặc ID tướng.
- Lọc theo Class: *Tank, Warrior, Marksman, Mage, Support, Control, Healer*.
- Sắp xếp theo: *Power, Level, Stars, Name*.

#### 🗿 Titans (Người khổng lồ)
- Danh sách 29 Titan trong game kèm icon hệ nguyên tố: Nước (💧 Water), Lửa (🔥 Fire), Đất (🌍 Earth), Ánh sáng (☀️ Light), Bóng tối (🌑 Darkness).
- Hiển thị vai trò (Role), cấp độ, số sao, chiến lực và ảnh đại diện.
- Lọc theo nguyên tố và sắp xếp linh hoạt.

#### 🎒 Items (Túi đồ & Trang bị)
- Hỗ trợ 2 chế độ hiển thị: Dạng lưới (▦ Grid) trực quan hoặc dạng bảng danh sách (☰ List).
- **Huy hiệu Arena Coins**: Tách biệt rõ ràng Arena Coin (`coin[1]`) với số dư vàng Gold, không bị ghi đè dữ liệu.
- Phân loại nhanh các danh mục: *Gear, Fragment Gear, Artifact, Fragment Artifact, Scroll, Consumable, Coin*.

#### ⛏️ Gathering (Tự Động Hóa Khai Thác Mỏ)
- **Auto-Gather Automation**:
  - Công tắc Bật / Tắt tự động hóa hoàn toàn.
  - Tùy chọn loại mỏ: Xoay vòng tài nguyên (🔄 Rotate All) hoặc mỏ chỉ định (Vàng, Lương thực, Gỗ, Đá, Sắt).
  - Cấp độ mỏ mục tiêu: Lv.1 đến Lv.8.
  - Giới hạn số đạo quân tối đa được phép ra ngoài (1 đến 5 squads).
- Danh sách các đạo quân đang khai thác kèm thời gian còn lại.
- Nút tìm kiếm mỏ thủ công (Search Mines).

#### 🏰 Dungeon (Tự Động Đánh Hầm Ngục)
- Theo dõi tầng hầm ngục và điểm năng động (Activity points).
- Thuật toán tự động chọn cửa tối ưu nhất dựa trên thuộc tính Titan còn sống.
- Cơ chế an toàn tự động dừng lại khi có Titan hy sinh hoặc máu giảm xuống mức nguy hiểm.

#### 🗼 Tower (Tự Động Leo Tháp)
- Tự động leo các tầng tháp từ 1 đến 25.
- Tự động mua các loại Buff tăng chỉ số tối ưu (Giáp, Kháng phép, Sát thương) bằng đồng Skull Coin tích lũy được.
- Tự động mở đúng 1 rương miễn phí ở mỗi tầng thưởng; cam kết tuyệt đối **không bao giờ tiêu tốn Emeralds**.

#### 📜 Quests (Nhiệm Vụ Hàng Ngày & Sự Kiện)
- Danh sách nhiệm vụ ngày và nhiệm vụ sự kiện đặc biệt kèm thanh tiến độ.
- Khu vực nổi bật các nhiệm vụ đã hoàn thành kèm nút nhận từng mục hoặc nhận nhanh toàn bộ (`Claim All`).

#### ⚙️ Settings (Cấu Hình & Thiết Lập Hệ Thống)
- **Theme Mode**: Tùy chọn Dark Mode (mặc định), Light Mode, hoặc System Preference.
- **RPC Dispatch Mode**:
  - `Piggyback (Safe Stealth)`: Gửi kèm RPC cùng lúc với tương tác tự nhiên của người dùng trên web, an toàn tối đa.
  - `Direct (Fast RPC)`: Phát lệnh RPC trực tiếp tới tab game để làm mới tức thì.
- **MQTT Live Telemetry**: Thu nhận các thông báo push thời gian thực (tin nhắn bang hội, thông báo kết quả công thành, quân trở về).
- **Session Recorder**: Ghi lại nhật ký gói tin RPC thô để phục vụ phân tích dữ liệu hoặc chẩn đoán lỗi.

#### 📝 Log (Nhật Ký Gọi API)
- Danh sách các cuộc gọi API RPC theo thứ tự thời gian.
- Hiển thị tên method, trạng thái (thành công/thất bại), thời gian thực thi (ms).
- Ô tìm kiếm lọc theo tên method và nút **Export JSON** để tải file nhật ký về máy.

---

## 4. Cơ Chế Lưu Trữ & An Toàn Dữ Liệu

1. **Storage Tách Biệt**:
   - Toàn bộ snapshot dữ liệu game (`rpcCache`), cấu hình ngưỡng quân (`troopTrainSettings`), cấu hình mỏ (`autoGatherSettings`) được lưu trong `chrome.storage.local`.
   - Nhật ký API log thô trong phiên được lưu trong `chrome.storage.session`, tự động giải phóng khi tắt trình duyệt, không gây đầy bộ nhớ máy tính.
2. **Nguyên Tắc Bất Biến & Không Giả Lập Dữ Liệu**:
   - Extension hoạt động hoàn toàn dựa trên dữ liệu game phản hồi thực tế từ máy chủ.
   - Không tự động gửi request spam làm nghẽn mạng hay gây nguy cơ cho tài khoản.
