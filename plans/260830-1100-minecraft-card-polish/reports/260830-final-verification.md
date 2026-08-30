---
date: 2026-08-30
status: completed
---

# Hoàn tất polish thẻ Minecraft

## Kết quả

Đã thêm chiều sâu emerald/cyan, viền/avatar nhiều lớp, bệ huy hiệu/kim cương, năm sparkle cố định và gleam XP giới hạn trong tiến độ. Preview đồng bộ hình thức, vẫn là dữ liệu MINH HỌA. Không đổi PNG 1000×360, font/dependency, API/config/XP/HMAC, xử lý avatar, giới hạn worker hoặc embed fallback.

## Bằng chứng cuối

| Gate | Kết quả |
|---|---|
| Focused renderer/presentation | **24/24 PASS**, giữ đủ 22 kiểm tra cũ; thêm deterministic/five-sparkle và gleam-clipping tests |
| `npm run verify` sau toàn bộ source/test cuối | Controller xác nhận exit 0; **144/144 tests, 0 failed, 0 skipped** |
| Syntax | **172 JS / 35 Vue PASS** |
| Security/Prisma | Source scan, generate và validate PASS |
| Migration DB tạm | **15 migrations, 36 tables, foreign-key violations `[]`** |
| Build cuối | Exit 0; **175 modules, 5,18 giây** |
| Browser Chromium cô lập | **9/9 PASS**, exit 0; [JSON](./browser/browser-smoke-results.json) lúc `2026-08-30T04:05:42.945Z` |
| Review | [Renderer + preview source PASS](./260830-polish-review.md), không còn blocker |

[Báo cáo tester](./260830-render-browser-verification.md) ghi lệnh và mẫu kiểm tra. PNG 0% render có/không có hai đường gleam giống hệt nhau; 100% khác nhau, chứng minh gleam chỉ vẽ khi có tiến độ. Sparkle luôn đúng năm đường, không phụ thuộc độ dài tên/số cấp và không dùng animation/filter. Kiểm tra avatar, font, timeout/capacity, fallback và an toàn gửi Discord vẫn đạt.

Browser xác nhận font nội bộ tải/vẽ, không lỗi font HTTP hay request host ngoài, màu mặc định/tùy chỉnh, thông báo tắt ảnh và không tràn ngang ở 375px. Controller trực tiếp xem before/after level-up, avatar/tên Việt/0% và preview desktop tối/mobile sáng; tester xem cả chín PNG và bốn theme preview. Không có vấn đề chồng chữ/font trong các mẫu đã kiểm tra.

## Mẫu trước/sau

Các ảnh dùng hồ sơ minh họa. Baseline trong `before/` giữ nguyên; chín ảnh sau vẫn 1000×360.

- Rank: [trước](./before/sample-rank-card.png) / [sau](./after/sample-rank-card.png); level-up: [trước](./before/sample-level-up-card.png) / [sau](./after/sample-level-up-card.png).
- [Tên Việt](./after/sample-vietnamese-name-card.png), [tên rộng](./after/sample-wide-name-card.png), [số lớn](./after/sample-large-values-card.png), [avatar](./after/sample-avatar-card.png).
- [0%](./after/sample-empty-xp-card.png), [100%](./after/sample-full-xp-card.png), [màu tùy chỉnh](./after/sample-custom-accent-card.png).
- Preview [desktop tối](./browser/browser-rank-preview-desktop-dark.png), [mobile sáng](./browser/browser-rank-preview-mobile-light.png), [mobile tối](./browser/browser-rank-preview-mobile-dark.png), [tắt ảnh/màu tùy chỉnh](./browser/browser-rank-preview-custom-accent-image-disabled.png).

## Đồng bộ và giới hạn

CLI đã check toàn bộ phase; `ak plan status` xác nhận **1/1 phases, 3/3 tasks, 100%**. Metadata/acceptance và đoạn polish trong [nhật ký](../../../docs/journals/260830-minecraft-rank-card-design.md) đã đồng bộ, giữ nguyên lịch sử đợt trước. Phases table vẫn được giữ nguyên vì CLI hiện không tự cập nhật ô trạng thái; plan ghi rõ trạng thái có thẩm quyền.

Không deploy/restart/commit, xuất bản ngoài, thay runtime DB hoặc gọi Discord/Minecraft thật. Browser dùng Vue thực với fixture HTTP và profile cô lập; chưa kiểm chứng OAuth/dịch vụ thật, production headers, đa trình duyệt/toàn bộ công nghệ trợ năng hoặc native renderer trên Linux. So sánh hình ảnh dựa trên kiểm tra trực tiếp, không có ngưỡng visual-diff tự động. Không còn blocker trong phạm vi đã duyệt.
