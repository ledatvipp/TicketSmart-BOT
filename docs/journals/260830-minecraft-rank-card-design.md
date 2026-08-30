---
date: 2026-08-30
session: minecraft-rank-card-design
---

# Nhật ký: thẻ cấp độ phong cách Minecraft

## Bối cảnh

Làm thẻ rank/level-up đẹp và gần phong cách Minecraft hơn, giữ nguyên PNG 1000×360, API, XP và giới hạn render. Nguồn tham khảo và phạm vi cảm hứng được ghi tại [báo cáo nghiên cứu](../../plans/260830-1037-minecraft-rank-cards/reports/260830-design-research-review.md).

## Thay đổi

Renderer dựng rừng tối, khối cỏ và kim cương bằng SVG nguyên bản; avatar vuông viền nổi, thanh XP lime chia đoạn và tiêu đề riêng cho rank/level-up. Press Start 2P dành cho tiêu đề ASCII/số cấp lớn; Noto Sans giữ chữ tiếng Việt rõ. Màu cấu hình chỉ nhấn viền/chi tiết. Ba TTF và hai OFL đi cùng bot; preview dùng bản font/OFL nội bộ ở `src/web/public/fonts`. Không thêm dependency hoặc migration.

## Suy ngẫm và quyết định

Chọn SVG động thay vì ảnh AI hay texture sao chép: bố cục, chữ và tiến độ phải cập nhật theo hồ sơ, giữ tính xác định và giới hạn công việc rõ ràng. Chia vai trò font và cắt tên trong vùng riêng giúp giữ chất pixel mà không hy sinh dấu tiếng Việt. Giữ worker, giới hạn avatar và embed fallback hiện có; hình thức không được làm thay đổi việc cộng XP hay gửi thưởng.

## Kiểm chứng và bước tiếp

[Review renderer](../../plans/260830-1037-minecraft-rank-cards/reports/260830-renderer-review.md) và review preview không còn lỗi chặn. **22/22 test tập trung**, **142/142 test toàn bộ**, security scan, Prisma và kiểm tra migration đạt. Sau khi preview hoàn tất, syntax **172 JS/35 Vue**, build **175 modules/5,93 giây** và browser **9/9** đạt; font thực sự tải/vẽ, màu tùy chỉnh và trạng thái tắt ảnh đúng, bố cục 375px không tràn. Đã xem PNG thật và preview desktop/mobile. Browser từng phát hiện font import ngoài phạm vi Vite gây 403; sửa bằng bản font công khai nội bộ, không nới allow-list hoặc CSP. [Báo cáo cuối](../../plans/260830-1037-minecraft-rank-cards/reports/260830-final-verification.md) ghi rõ bằng chứng và giới hạn. Chưa deploy, restart, commit hay smoke test Discord/Minecraft thật; Linux native renderer chưa kiểm chứng. Nhật ký chỉ lưu nội bộ, không xuất bản ra dịch vụ ngoài.

## Tinh chỉnh chiều sâu hình ảnh

Đợt polish tiếp theo thêm ánh xanh emerald/cyan, viền nhiều lớp, bệ huy hiệu và sparkle cố định; gleam XP bị giới hạn trong phần đã đạt để không vẽ tiến độ giả ở 0%. Không đổi font, dependency hoặc hợp đồng xử lý. [Review polish](../../plans/260830-1100-minecraft-card-polish/reports/260830-polish-review.md) không có blocker; **24/24 test tập trung** giữ đủ 22 kiểm tra cũ và bổ sung số sparkle cố định/PNG 0% không đổi khi bỏ gleam. Sau toàn bộ thay đổi, `npm run verify` đạt **144/144 test**, syntax **172 JS/35 Vue**, security scan, Prisma, **15 migration/36 bảng/0 lỗi khóa ngoại** trên DB tạm và build **175 modules/5,18 giây**. Browser mới **9/9** đạt, đã xem chín PNG sau chỉnh cùng before/after và bốn theme preview; 375px không tràn, font rõ. [Báo cáo polish cuối](../../plans/260830-1100-minecraft-card-polish/reports/260830-final-verification.md) ghi bằng chứng và giới hạn; không deploy/restart/commit hoặc kiểm thử Discord/Minecraft thật.

## Làm rõ tên server trên thẻ

Header có bảng tên mờ dần và icon server pixel; ảnh minh họa đổi nhãn thử nghiệm sang IS7MC. Runtime vẫn lấy `guild.name` hiện tại cho slash/prefix và thông báo lên cấp, không cố định thương hiệu; thiếu ngữ cảnh dùng `Tên server`. [Review header và bằng chứng cuối](../../plans/260830-1100-minecraft-card-polish/reports/server-header/260830-header-review.md) không có blocker: **29/29 test tập trung**, **148/148 unit test** và syntax **172 JS/35 Vue** đạt, gồm PNG thật chứng minh tên riêng từng guild đi qua command/announcement, escaping và fallback. Đã xem rank/level-up, tên Việt và tên rộng. Không đổi Vue, font, dependency hoặc hợp đồng XP/API nên không chạy lại browser/build; không deploy/restart/commit hoặc kiểm thử Discord/Minecraft thật.
