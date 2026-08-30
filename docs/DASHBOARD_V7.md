# Dashboard v7 — IS7MC Control Center

Bản v7 nâng toàn bộ frontend theo hướng command center, giữ nguyên API và dữ liệu của v6.2.

## Thành phần mới

- App shell mới với sidebar thu gọn và lưu trạng thái trong localStorage.
- Topbar theo ngữ cảnh từng trang, tìm kiếm Ctrl+K, realtime status và theme switcher.
- Dashboard tổng quan gồm ticket operations, SLA, thời gian phản hồi, cluster health và AI quality.
- Action queue ưu tiên ticket khẩn/cao và chưa đóng.
- Cluster cards cho SMP, Survival, Skyblock, BoxPvP, Tu Tiên, FFA và ChunkySMP.
- AI quality panel hiển thị helpful rate, detections, action success, conversation memory và Knowledge Base.
- Realtime ticket feed với cluster, priority và trạng thái.
- Design token, card, table, form và responsive polish áp dụng cho toàn bộ trang quản trị.

## Level Chat: chỉnh sửa và vận hành

Vào **Dashboard → Level Chat**. Biểu mẫu hướng dẫn chia cấu hình thành phạm vi nhận EXP, nhịp độ/chống spam, role theo cấp, thưởng Minecraft và thông báo/thẻ cấp độ. ID Discord nhận nhiều dòng hoặc dấu phân cách; ngưỡng và đơn vị được giải thích ngay cạnh trường nhập.

- **Biểu mẫu hướng dẫn / JSON nâng cao** cùng chỉnh một bản soạn. JSON không hợp lệ phải được sửa trước khi trở lại biểu mẫu hoặc lưu; các trường mở rộng không chứa thông tin nhạy cảm vẫn được giữ lại.
- **Lưu cấu hình** chỉ bật khi đã tải được cấu hình, có thay đổi và dữ liệu hợp lệ. Lỗi tải/response thiếu cấu hình khóa chỉnh sửa/lưu, không đưa mặc định vào để lưu đè; lỗi lưu giữ nguyên bản soạn.
- **Tải lại cấu hình** hỏi trước khi bỏ thay đổi chưa lưu. **Đặt lại bản soạn về mặc định** chỉ đổi bản soạn sau xác nhận; chưa tác động máy chủ cho đến khi lưu. Rời trang có cảnh báo bản chưa lưu; đang lưu thì chặn điều hướng, đóng/tải lại tab dùng cảnh báo của trình duyệt.
- **Làm mới dữ liệu** và lượt polling sau mỗi 30 giây chỉ cập nhật vận hành, không ghi đè bản soạn. Polling không chạy chồng và tạm ngừng khi tab ẩn.
- Thẻ bên cạnh có nhãn **MINH HỌA**: dùng màu bản đang soạn và số liệu mẫu, không phải hồ sơ thật hay bản PNG chính xác của Discord. PNG thật được tạo trên bot; `imageEnabled: false` chuyển bot sang embed.

Danh sách kênh nhận EXP trống nghĩa là **không cộng EXP ở bất kỳ kênh nào**. Role xác minh trống nghĩa là không bắt buộc role; role quản trị trống vẫn cho phép Discord Administrator dùng lệnh quản trị. Kênh thông báo trống dùng kênh nơi thành viên lên cấp. Mốc thưởng cao nhất phù hợp thay thế mức mặc định, không cộng dồn các mốc.

Trạng thái reward hiển thị đúng `PENDING`, `LEASED`, `DEFERRED`, `COMPLETED`, `FAILED`; chỉ hai trạng thái `DEFERRED`/`FAILED` có nút **Thử lại**. Checklist dùng cấu hình đã lưu và heartbeat worker, tách biệt với bản soạn. “Đã từng kết nối” cùng thời điểm heartbeat không xác nhận worker đang online; lỗi tải dữ liệu được hiển thị riêng, không giả làm trạng thái sẵn sàng.

Mặc định hình ảnh: `imageEnabled: true`, `accentColor: "#5865F2"`; Level Chat vẫn mặc định tắt. Secret/token/API key và tên khóa nhạy cảm bị chặn cả ở trình duyệt lẫn API. Chi tiết schema, giới hạn ảnh và worker: [Level Chat + Minecraft](LEVEL_CHAT_MINECRAFT.md).

Thiết kế PNG lấy cảm hứng Minecraft: rừng tối dạng khối, cỏ/kim cương SVG tự dựng, avatar vuông có viền nổi và thanh EXP xanh lime chia đoạn. Tiêu đề ASCII cùng số cấp lớn dùng Press Start 2P; tên và nội dung tiếng Việt trong PNG dùng Noto Sans. Màu `accentColor` chỉ đổi viền/chi tiết nhấn, không đổi thanh EXP lime. Thẻ minh họa không phải hồ sơ thật và không thay thế việc xem PNG thực tế từ bot; thay đổi hình thức không đổi API, cách tính EXP hay thưởng Minecraft.

## Điều hướng, bàn phím và font

Sidebar có trạng thái riêng cho desktop/mobile, đóng bằng Escape và giữ focus trong menu mobile khi mở. Có liên kết bỏ qua menu đến nội dung chính; menu đóng không còn nhận focus. Command palette mở bằng Ctrl/Cmd+K hoặc nút tìm kiếm, hỗ trợ phím mũi tên/Enter/Escape và trả focus về điểm mở khi đóng. Các trường, nút biểu tượng và vùng cuộn bảng có nhãn truy cập.

Material Symbols Outlined được phục vụ nội bộ từ `src/web/public/fonts/material-symbols-outlined.woff2`, kèm [Apache 2.0 license](../src/web/public/fonts/material-symbols-LICENSE.txt). Trang không cần Google Fonts CSS để tải biểu tượng; CSP production giữ nguyên, không mở thêm font/script origin.

Preview tải Press Start 2P nội bộ tại `/fonts/press-start-2p.ttf`, từ `src/web/public/fonts/press-start-2p.ttf`, kèm [bản OFL frontend](../src/web/public/fonts/press-start-2p-OFL.txt); build giữ cả font và giấy phép trong `dist/fonts`. Không cần mở rộng Vite filesystem allow-list hoặc CSP để tải font. Khi đóng gói bot, giữ đủ ba TTF và hai giấy phép trong `src/assets/fonts` theo [hướng dẫn thẻ cấp độ](LEVEL_CHAT_MINECRAFT.md#rank-cards-and-announcements); không chỉ sao chép font của dashboard. Nâng cấp hình thức này không thêm npm dependency hoặc migration.

## Build

```bash
npm --prefix src/web ci
npm run build
```

Dashboard production nằm trong `src/web/dist` và được phục vụ qua Express API sau reverse proxy HTTPS. Không dùng Vite dev/preview làm máy chủ production; `npm --prefix src/web start` hiện cũng chỉ chạy preview. Xem [snapshot audit và rủi ro toolchain còn lại](../SECURITY.md#dependency-audit-snapshot-2026-08-30).
