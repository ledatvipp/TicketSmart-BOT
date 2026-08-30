---
title: "Minecraft rank cards: final verification"
date: 2026-08-30
status: completed
---

# Hoàn tất thẻ cấp độ Minecraft

## Kết quả

Hoàn tất nâng cấp hình thức: SVG rừng tối/khối cỏ/kim cương nguyên bản, avatar vuông viền nổi, chữ pixel và thanh XP lime chia đoạn. Preview cùng phong cách, vẫn ghi rõ MINH HỌA. Giữ PNG 1000×360, cấu hình mặc định, API/XP/outbox/HMAC, giới hạn avatar/worker và embed fallback; không thêm npm dependency hoặc migration.

## Bằng chứng kiểm chứng

| Gate | Kết quả |
|---|---|
| Test renderer/presentation tập trung | 22/22 đạt, 0 failed, 0 skipped; PNG/font thật, XML/clip, 0–100%, avatar/timeout/concurrency/fallback |
| `npm run verify` của controller | Exit 0; 142/142 tests, 0 failed, 0 skipped; Prisma generate/validate và security source scan PASS |
| Migration trên DB tạm | 15 migrations, 36 tables, foreign-key violations `[]`; không tác động runtime DB |
| Syntax cuối | 172 JavaScript files, 35 Vue components PASS |
| Build sau sửa font frontend | Exit 0; 175 modules, 5,93 giây |
| Browser Chromium | 9/9 PASS, exit 0; [JSON](./browser-smoke-results.json), `executedAt: 2026-08-30T03:53:49.034Z` |
| Review độc lập | [Renderer](./260830-renderer-review.md) không có blocker; source preview và parse/compileScript/compileTemplate độc lập PASS |

Full verify chạy sau renderer/test mới nhưng trước khi preview cuối hoàn tất; syntax/build và browser được chạy lại sau thay đổi frontend. Không coi build cũ là bằng chứng cho preview mới.

Review preview xác nhận props và kiểm tra accent sáu chữ số không đổi, không có API/polling hay tính XP mới, SVG trang trí ẩn với trợ năng, disclosure và thông báo tắt ảnh giữ nguyên. Browser kiểm tra font đã tải/vẽ, không lỗi HTTP/không yêu cầu font ngoài, màu mặc định/cam, image-off và bố cục 375px. Lỗi 403 từ import font ngoài phạm vi Vite đã được sửa bằng `/fonts/press-start-2p.ttf`, không mở rộng filesystem allow-list/CSP. Bản bot/public/dist trùng SHA-256 `034C77F1F05EC89421E4A63F0E3A4CA1ECF852CC6D2BF611F126F275728E017D`; OFL đi kèm public/dist.

## Ảnh đã kiểm tra

Controller kiểm tra PNG thật và preview cuối; reviewer cũng xem rank/level-up và preview mobile. Mẫu dưới đây là hồ sơ minh họa, không phải dữ liệu người chơi thật:

- [Rank](./sample-rank-card.png), [level-up](./sample-level-up-card.png), [tên tiếng Việt](./sample-vietnamese-name-card.png), [tên dài](./sample-wide-name-card.png), [số lớn](./sample-large-values-card.png).
- [0% XP](./sample-empty-xp-card.png), [100% XP](./sample-full-xp-card.png), [avatar](./sample-avatar-card.png), [màu tùy chỉnh](./sample-custom-accent-card.png).
- [Preview desktop tối](./browser-rank-preview-desktop-dark.png), [mobile sáng](./browser-rank-preview-mobile-light.png), [mobile tối](./browser-rank-preview-mobile-dark.png), [màu tùy chỉnh/tắt ảnh](./browser-rank-preview-custom-accent-image-disabled.png).

## Đồng bộ và giới hạn

`ak plan check` hoàn tất phase duy nhất; `ak plan status` xác nhận **1/1 phases, 3/3 tasks, 100%**. Metadata/acceptance và [nhật ký](../../../docs/journals/260830-minecraft-rank-card-design.md) đã đồng bộ. CLI hiện chỉ đổi checkbox, không đổi Phases table; giữ nguyên bảng CLI-owned và ghi chú trạng thái có thẩm quyền trong plan.

Không deploy, restart, commit, xuất bản bên ngoài hoặc smoke test Discord/Minecraft/OAuth thật. Browser dùng Vue thực với fixture auth/config/operations cô lập; Chromium không thay thế kiểm tra đa trình duyệt. Linux native renderer chưa kiểm chứng. Rủi ro dependency toolchain web đã ghi ở [SECURITY](../../../SECURITY.md#dependency-audit-snapshot-2026-08-30) vẫn giữ nguyên (snapshot trước: root 0, web 2); slice hình thức này không thay dependencies hoặc chạy lại audit. Không có blocker còn mở trong phạm vi đã duyệt.
