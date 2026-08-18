# Gợi ý tính năng ngoài Ticket và Smart Response

## 1. Multi-Cluster Incident Center — ưu tiên cao

Một trung tâm sự cố cho SMP, Survival, Skyblock, BoxPvP, Tu Tiên, FFA và ChunkySMP.

- Đặt trạng thái từng cụm: operational, degraded, maintenance, outage.
- Tự cập nhật status embed và announcement channel.
- Gộp report lag/down trùng nhau thành một incident.
- Staff thêm timeline, nguyên nhân, ETA và postmortem.
- Khi incident đang mở, bot trả lời người chơi bằng status card thay vì tạo nhiều ticket.

## 2. Player Identity & Account Hub — ưu tiên cao

- Liên kết Discord ↔ Minecraft UUID.
- Tra cứu profile, cụm gần nhất, lịch sử đăng nhập và trạng thái account link.
- Button xác minh, unlink, báo mất tài khoản.
- Dữ liệu nhạy cảm chỉ hiện sau permission/audit phù hợp.
- Là nền cho nạp thẻ, lịch sử mua hàng, punishment và reward cross-server.

## 3. Event & Reminder Center — ưu tiên trung bình

- Tạo lịch sự kiện theo cụm.
- RSVP bằng button: tham gia / có thể / không tham gia.
- Nhắc trước 1 ngày, 1 giờ hoặc thời gian tùy chọn.
- Tự cập nhật embed khi event bắt đầu/kết thúc.
- Tạo recurring event cho boss, KOTH, reset mine hoặc maintenance.

## 4. Staff Operations & On-call — ưu tiên trung bình

- Ca trực theo cluster.
- Ai đang on-call và escalation chain.
- Handover note giữa ca.
- Staff workload, SLA, ticket chưa xử lý và SmartLearn queue trên một màn hình.
- Không ping toàn bộ role khi đã có staff đúng cụm đang trực.

## 5. Payment & Delivery Verification — ưu tiên cao nếu server có shop

- Tra cứu transaction theo mã giao dịch/player.
- Signed webhook và idempotency key.
- Phân biệt pending, paid, delivered, failed, refunded.
- Bot không tự cộng vật phẩm/rank nếu chưa xác minh transaction.
- Tạo ticket có sẵn transaction context khi giao hàng lỗi.

## 6. Suggestion / Poll / Roadmap Center — ưu tiên thấp

- Member gửi đề xuất bằng modal.
- Vote bằng button, chống vote trùng.
- Tách theo cluster.
- Trạng thái planned, accepted, rejected, shipped.
- Khi shipped, bot tự thông báo cho người đã vote.

## Recommended order

1. Incident Center.
2. Player Identity Hub.
3. Payment Verification.
4. Event Center.
5. Staff On-call.
6. Suggestion Center.
