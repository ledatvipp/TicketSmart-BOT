# SmartLearn v1

SmartLearn là human-in-the-loop knowledge system dành cho IS7MC. Nó không huấn luyện model mới; nó chuyển câu hỏi thật thành Knowledge Article đã được staff xác minh.

## Flow

```text
Player question
→ Cluster Router
→ Knowledge Search
→ Không có bài đủ tốt / feedback 👎
→ Knowledge Candidate
→ Review channel hoặc reviewer DM
→ Duyệt | Từ chối | Câu trả lời khác
→ Approval policy
→ Knowledge Article + aliases
→ Bot trả lời miễn phí ở lần sau
```

## Approval policy

- `NORMAL`: Admin đủ phiếu hoặc staff đủ số phiếu cấu hình.
- `ADMIN_REQUIRED`: chỉ phiếu Admin được dùng để xuất bản.
- Có cả phiếu duyệt và từ chối: `CONFLICTED`.
- Admin từ chối: đóng candidate ngay.

## Dedupe

Exact key:

```text
guildId + clusterKey + SHA-256(normalizedQuestion)
```

Candidate chưa hoàn tất còn được so sánh token Jaccard trong cùng cluster và intent. Câu tương tự chỉ tăng `occurrenceCount` và bổ sung `sourceExamples`.

## Discord review

Button:

- `✅ Duyệt`
- `❌ Từ chối` → modal lý do
- `✍️ Câu trả lời khác` → modal title/answer/keywords/note

Review message được đồng bộ trạng thái trên review channel và các DM đã gửi.

## Security

- Button được kiểm tra lại member/role trong guild, kể cả khi interaction đến từ DM.
- Nội dung player được giới hạn length, loại control character và chặn `@everyone/@here`.
- Bot API dùng `BOT_API_SECRET`.
- Candidate publish và alias creation chạy trong transaction.
- Một reviewer chỉ có một vote đang hoạt động cho mỗi candidate.
- Không có console command hoặc action Minecraft trong SmartLearn.

## Upgrade

```bash
npm run db:generate
npm run db:deploy
npm run build
npm start
```

Database cũ tạo bằng `db push` nhưng chưa có migration history:

```bash
npm run db:generate
BASELINE_EXISTING_DB=I_HAVE_A_VERIFIED_BACKUP npm run db:baseline-existing
npm run db:deploy
npm run build
npm start
```
