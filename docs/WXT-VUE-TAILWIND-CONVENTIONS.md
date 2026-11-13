# Quy chuẩn WXT / Vue 3 / Tailwind

Ghi nhận ngày 2026-11-13 từ review extension 0.10.52, task @task-VHE-HRA25T. Đây là quy chuẩn triển khai theo yêu cầu kiến trúc của project; không phải cam kết toàn bộ migration đã qua game acceptance.

## Build và ranh giới runtime

1. WXT là compiler và producer duy nhất của manifest/popup. entrypoints/popup/main.ts tạo Vue app; App.vue chỉ composition/wiring UI. Không copy popup.html/popup.js legacy lên output WXT, không fallback khi compile lỗi.
2. wxt.config.ts là cấu hình manifest cho artifact phát hành. Khi thêm permission/host/content script, cập nhật tại đây và kiểm tra artifact; extension/manifest.json hiện vẫn là mirror tương thích cho version tooling/tests.
3. Runtime classic background.js với importScripts, bridge isolated world và intercept/mqtt MAIN world đang được giữ nguyên để bảo toàn hợp đồng. Hook build:publicAssets đưa chúng và game assets vào WXT output. Đây là public/prebuilt asset boundary được WXT hỗ trợ; không giả nhận chúng là TypeScript entrypoint đã migrate.
4. Mã UI mới luôn ở Vue SFC/composable/helper. Chỉ sửa runtime JS ở extension khi bản thân hợp đồng background/content cần sửa. Việc chuyển runtime sang defineBackground/defineContentScript phải là task riêng với fixtures và kiểm tra world/run_at/importScripts; không rewrite âm thầm cùng parity patch.
5. npm run wxt:build tạo gói có thể load tại .output/chrome-mv3; npm run build validate gói này rồi copy sang dist. Lỗi compile/missing dependency phải trả exit khác 0; không giữ gói HTML để che lỗi.
6. Build/check không thay version. Release chạy npm run version:bump -- patch (hoặc target hợp lệ), rồi npm run check; xác nhận package/lock/legacy mirror/WXT artifact cùng version trước commit.
7. Generated dist, .output, .wxt không được sửa tay. .output và .wxt bị gitignore; dist hiện tracked nên build lại sau source thay đổi. Thư mục dist là đích cố định trong repository, không nhận đường dẫn xóa tùy ý.

## Vue và state

- Dùng Vue 3 Composition API, script setup lang="ts", ref/computed/watch; component nhận props/phát emits, giữ render trong template.
- Không append/replaceChildren/innerHTML để khôi phục UI cũ. Không dùng v-html cho nội dung chat/log/server chưa được sanitize.
- Composable quản lý lifecycle và trạng thái dùng lại; pure helper thực hiện normalize/công thức/payload. Tránh copy cùng công thức giữa nhiều dialog.
- Cache RPC authoritative thuộc background reducer. Popup không read-modify-write toàn bộ chrome.storage.local.rpcCache. updateCacheLocally chỉ là clone tạm của popup; không chứng minh server đã chấp nhận.
- Không tăng skill, cộng quân, xóa hospital hoặc fabricate duration như state thành công trước response. Pending/queued/error phải khác completed; request refresh server khi cần.
- Singleton hydration phải coalesce và gắn listener trước read; response cũ không đè event mới. Account change và key deletion là tình huống bình thường.
- Account chưa xác định không được dùng custom teams của account đầu tiên. Async load phải kiểm tra revision/account trước apply; save phải đối chiếu account hiện tại. Preferences có accountId phải kiểm tra.
- onMounted subscription phải có onUnmounted remove. Shared monitor dùng consumer count; KeepAlive ticker dừng lúc deactivated và resume activated, tránh tạo timer trùng.
- Không tự bật popupRpcEnabled khi mount view/dialog đang ẩn. Mọi helper RPC kế thừa global enable/mode. Nếu một thao tác đổi mode có chủ ý, UI phải thể hiện rõ cho người dùng.
- Session recorder đọc record:* từ chrome.storage.session, clear/export qua background command. Không tạo kho apiLogs song song.

## RPC và metadata

- Tên RPC/feature/args dựa trên capture, reducer và handler đang dùng; không suy từ tên màn hình.
- Ví dụ được đối chiếu: quest_multiFarm {questIds} → questGetAll; getInfo feature clanVersus; getMarches feature march; magicTower_briefInfo/magicTower_getAll.
- Không gửi cùng request qua raw runtime.sendMessage rồi gọi dispatchRpc lần nữa.
- Transport ok/queued không phải server result. Campaign chờ action entry mới, hết hạn phải dừng/pending; không dùng drops cũ làm success.
- Runtime.lastError/exception cần trả lỗi có cấu trúc để UI xử lý. Không nuốt lỗi rồi hiển thị completed.
- Legacy metadata/pure helpers ở extension có thể dùng qua src/utils/metadata.ts adapter trong giai đoạn chuyển tiếp. UI không gọi legacy renderer. Giảm globalThis dần bằng task riêng giữ golden fixtures.
- Luôn normalize array/object/null từ game; unknown khác 0. Không đưa số liệu mẫu vào báo cáo tiến độ thật.

## Tailwind và thiết kế UI

- Tailwind v4 qua @tailwindcss/vite trong WXT Vite pipeline, entrypoints/popup/style.css import tailwindcss.
- Component mới dùng utilities trong template, trạng thái dark theo class .dark đã cấu hình. Đừng đưa theme.css/popup.css legacy trở lại làm lớp UI song song.
- Tránh class ghép động như bg-${color}-500 khiến scanner không biết; dùng mapping class hoàn chỉnh.
- Giữ màu/spacing/typography theo component lân cận. CSS tùy chỉnh chỉ cho hành vi/token mà utilities không diễn đạt rõ.
- User-facing UI tiếng Anh theo convention project; tài liệu vận hành có thể tiếng Việt.
- Dialog có label, close button, Escape, focus/keyboard và scroll phù hợp; tooltip phải hỗ trợ pointer lẫn focus. Focus management thực tế cần browser acceptance.
- Nội dung UI không trình bày chi tiết kỹ thuật implementation trừ khi giúp người dùng quyết định (ví dụ queued/error, global dispatch mode).

## TypeScript và kiểm thử

- tsconfig extends .wxt/tsconfig.json; aliases @/ và ~/ cùng root như WXT, import @/src/... phải resolve thật.
- Giữ strict và noUncheckedIndexedAccess của WXT. Không tắt để có build xanh; guard index, tuple, unknown storage hoặc xác nhận shape tại boundary.
- Vue build chỉ transpile; npm run typecheck dùng wxt prepare && vue-tsc --noEmit là gate riêng.
- Compiler dùng TypeScript 6.0.3 + vue-tsc 3.3.14 trong đợt này: TS7 thiếu lib/tsc API mà vue-tsc sử dụng. Nâng lại chỉ sau typecheck và build tương thích.
- npm run check = typecheck → test → build/validate artifact. Không thay kiểm thử hành vi bằng assert ID/chữ.
- Dùng mocked Chrome + mounted composable hoặc SFC handler để chứng minh side effects, payload, race/deletion/account/queued/rejected. Test fake clock cho timeout.
- Artifact validator kiểm tra manifest references, classic importScripts closure và popup JS/CSS. Khi có code splitting/nested worker imports, mở rộng validator và thêm fixture.
- Trước release chạy checklist browser trong báo cáo migration. Ghi rõ test nào skipped và tiêu chí nào chưa được chứng minh; không đánh dấu live parity chỉ từ unit test.

## Memory và tài liệu cho phiên sau

- Knowns là canonical task/doc/workflow. Không sửa tay markdown trong .knowns.
- Báo cáo review phải có timestamp filename, extension version, baseline branch/commit, feature matrix, evidence, task/fix status và giới hạn kiểm chứng.
- Bản /docs dành cho người đọc được đồng bộ với canonical Knowns doc khi nội dung review/quy chuẩn thay đổi.
- System Decision candidate về kiến trúc lưu ở ledger dạng draft và có nguồn; không tự accept. Hướng dẫn user đã nêu có hiệu lực cho công việc hiện tại, draft ledger không thay thế yêu cầu đó.
- Không thêm toàn bộ side effects/settings của legacy vào component bằng một file khổng lồ; mở rộng các boundary đã mô tả và test wiring.

## Nguồn chính thức

- [WXT public assets](https://wxt.dev/guide/essentials/assets) và [entrypoints](https://wxt.dev/guide/essentials/entrypoints.html).
- [WXT TypeScript](https://wxt.dev/guide/essentials/config/typescript).
- [Vue TypeScript](https://vuejs.org/guide/typescript/overview).
- [Tailwind với Vite](https://tailwindcss.com/docs/installation/using-vite).

Bằng chứng repository: wxt.config.ts, scripts/build.mjs, scripts/validate-extension.mjs, entrypoints/popup, useRpcCache, useAccountTeams, useNow, useStoredFavorites, tests/vue-runtime-state.test.mjs và tests/vue-dialog-setup.test.mjs.

Bổ sung từ review tích hợp: quest_multiFarm phải đi qua runtime message kind claim-rewards để background chọn queue-claim trong piggyback/MQTT. Dùng đúng tên RPC nhưng sai envelope vẫn có thể bị whitelist loại bỏ. Test phải kiểm tra cả envelope và calls, không chỉ helper payload.

