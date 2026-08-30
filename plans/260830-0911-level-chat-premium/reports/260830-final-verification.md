---
title: "Level Chat premium: kiểm chứng và bàn giao"
date: 2026-08-30
status: completed
---

# Level Chat premium: kiểm chứng và bàn giao

## Trạng thái

Hoàn thành phạm vi nâng cấp và kiểm chứng cục bộ. Controller xác nhận full verify, focused tests, browser và review sau các sửa cuối đều đạt. Đã đồng bộ cả ba phase bằng `ak plan check`: **3/3 phase, 8/8 tác vụ, 100%**; metadata đã được cập nhật tương ứng.

## Phạm vi đã triển khai

- Thẻ rank/level-up PNG tạo cục bộ, font Noto Sans có giấy phép, giới hạn avatar/worker/concurrency và fallback embed; không gửi lại khi lỗi truyền tải chưa rõ kết quả.
- Cấu hình bổ sung đúng `imageEnabled: true`, `accentColor: '#5865F2'`; chặn tên khóa nhạy cảm lồng nhau, giữ trường mở rộng hợp lệ.
- Sửa lỗi import profile, cô lập lỗi XP/role/thông báo, config refresh dùng chung request, auto-actions đọc đúng envelope, startup không đăng ký thiếu command và supervisor giữ lịch restart.
- Level Chat có biểu mẫu tiếng Việt/JSON/preview minh họa, draft riêng, khóa lưu khi tải lỗi, cảnh báo bỏ thay đổi và trạng thái reward đúng; điều hướng/mobile/keyboard được cập nhật.
- Tài liệu README, SECURITY, Level Chat và dashboard đã đồng bộ. Material Symbols được tự host cùng Apache 2.0 license; CSP giữ nguyên.

## Bằng chứng đã xác nhận

| Kiểm tra | Kết quả và phạm vi |
| --- | --- |
| `npm run verify` cuối | Controller xác nhận exit 0 trên source cuối: **138 test pass, 0 fail, 0 skip** |
| Syntax / security source scan | 172 JavaScript, 35 Vue; pass |
| Prisma / migration | Validate/generate pass; 15 migrations, 36 bảng, không vi phạm FK; database tạm |
| Build dashboard | Build cuối pass, 175 modules, 4,51 giây |
| Focused sau sửa cuối | Controller xác nhận 39/39 pass, exit 0 |
| Presentation/command/config focused | 32/32 pass; PNG worker thật, font Việt, URL/byte/dimension/timeout, fallback, API fixture và secret guard; xem [báo cáo](./260830-level-premium-focused-tests.md) |
| Dashboard logic focused | 7/7 pass; xem [báo cáo frontend](./260830-level-dashboard-implementation.md) |
| Browser cuối | **9/9 PASS**; JSON timestamp `2026-08-30T02:41:22.858Z` |
| Review độc lập | Không còn blocker sau sửa race khi xóa tìm kiếm; controller xác nhận đóng finding |
| Audit dependencies | Root 0; web 2 còn lại: esbuild moderate, Vite high; không force major/Node engine bump |
| Liên kết tài liệu | Các liên kết mới tồn tại; README có một link changelog cũ thiếu file, không do thay đổi này |

Browser JSON cuối: [browser-smoke-results.json](./browser-smoke-results.json). Các scenario gồm tải ban đầu, form/JSON/lưu, JSON lỗi/lưu lỗi giữ draft, tải config lỗi và malformed response khóa lưu, polling không ghi đè draft/retry đúng trạng thái, xác nhận bỏ draft, palette/bàn phím, mobile/theme. Các lượt trước có lỗi selector test do icon/toast; harness đã sửa và chạy lại đủ 9 scenario, không bỏ qua test. Review cũ là ảnh chụp theo thời điểm; finding race đã sửa và font đã đổi sang bản static tự host trước kết quả cuối này.

## Hình minh họa

[Rank](./sample-rank-card.png), [level-up](./sample-level-up-card.png), [tên dài](./sample-wide-name-card.png) đã được xem trực tiếp; dữ liệu chỉ là mẫu. Controller đã xem bản cuối rank/level-up/tên guild dài và screenshot [desktop dark](./browser-levels-desktop-dark-viewport.png)/[mobile light](./browser-levels-mobile-light-viewport.png): icon font tĩnh hiển thị. Có thêm ảnh [lỗi tải config](./browser-config-load-error-viewport.png), [lỗi lưu giữ draft](./browser-save-error-preserved-draft-viewport.png) và [menu mobile](./browser-mobile-menu-viewport.png).

## Giới hạn và vận hành

- Không deploy, restart dịch vụ, commit hoặc sửa LobbySign. Không thay schema, công thức XP, outbox hay HMAC trong phạm vi nâng cấp này.
- Chưa smoke test Discord/Minecraft thật, OAuth thật hay native renderer trên Linux. Browser dùng fixture xác thực/API với hồ sơ Chromium riêng, không chứng minh môi trường production.
- Hai advisory web thuộc toolchain nhưng Vite nằm trong `dependencies`; không tuyên bố web `--omit=dev` sạch. Production chỉ phục vụ `src/web/dist` qua Express/HTTPS, không public Vite dev/preview. Nâng Vite major là công việc riêng.
- README còn liên kết cũ `CHANGELOG_v7.3.3_TRIAL_POLISH.md` trỏ đến file không tồn tại; các bổ sung tài liệu mới không tạo liên kết hỏng.
- Giữ nguyên các thay đổi không liên quan có sẵn trong worktree.
- CLI `add-phase`/`check` không tự cập nhật bảng Phases ban đầu hoặc YAML. Không sửa tay bảng CLI-owned; metadata đã được đồng bộ, còn `ak plan status` và phần Execution ghi đúng **3/3, 8/8, 100%**.
