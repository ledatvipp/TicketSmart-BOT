# SmartLearn v2 — Knowledge Lifecycle & Server-Aware Learning

SmartLearn v2 biến hàng đợi duyệt của v1 thành một vòng đời kiến thức có kiểm soát. Mục tiêu là giúp bot trả lời ngày càng nhiều câu hỏi mà không tạo rác Knowledge Base, không trộn dữ liệu giữa các cụm và không cần AI Provider cho các câu đã được xác minh.

## 1. Bốn loại candidate

| Loại | Khi dùng | Kết quả khi duyệt |
| --- | --- | --- |
| `NEW_ARTICLE` | Chưa có bài tương tự đủ tốt | Tạo `KnowledgeArticle` mới |
| `ADD_ALIAS` | Câu hỏi mới là cách diễn đạt khác của bài hiện có | Gắn `KnowledgeAlias`, không tạo bài trùng |
| `VERIFY_EXISTING` | Bot tìm được bài nhưng cần người thật xác nhận | Cập nhật lần review và giữ bài đang hoạt động |
| `REVISE_ARTICLE` | Người dùng báo sai, bài yếu hoặc nội dung cần sửa | Snapshot revision cũ rồi cập nhật bài |

Candidate có `targetArticleId`, `matchScore` và `priorityScore`. Staff nhìn thấy ngay bài đang được đề xuất để gộp hoặc sửa.

## 2. Quy tắc theo cụm máy chủ

Mỗi candidate và article giữ `clusterKey`/`clusterKeys`. Retrieval chỉ dùng:

- Kiến thức `global` hoặc `*`.
- Kiến thức đúng cụm đang hỏi.

`chunkysmp` không được xem là `smp`; `skyblock`, `boxpvp`, `tutien`, `ffa`, `survival` cũng được tách chính xác.

## 3. Lifecycle của Knowledge Article

Trạng thái:

- `DRAFT`: đang soạn, bot không dùng công khai.
- `PUBLISHED`: được phép retrieval nếu còn hạn và `PUBLIC`.
- `REVIEW_REQUIRED`: cần admin/staff kiểm tra lại.
- `EXPIRED`: đã quá hạn.
- `ARCHIVED`: lưu lịch sử, không dùng để trả lời.

Visibility:

- `PUBLIC`: bot có thể trả lời member.
- `STAFF_ONLY`: chỉ phục vụ luồng staff.
- `INTERNAL`: ghi chú nội bộ, không xuất ra Discord.

Các trường quản trị gồm `expiresAt`, `reviewDueAt`, `lastReviewedAt`, `lastReviewedBy`, `qualityScore`, `confidenceFloor`, `pinned` và `enabled`.

## 4. Chất lượng và tự yêu cầu review

Helpful/unhelpful feedback cập nhật `qualityScore`. Khi một bài có tối thiểu ba phản hồi xấu và quality dưới ngưỡng an toàn, bài tự chuyển sang `REVIEW_REQUIRED`.

Search công khai loại bỏ bài:

- Không phải `PUBLISHED`.
- Không `PUBLIC`.
- Đã hết hạn.
- Bị tắt.
- Không đúng cluster.

Score retrieval được điều chỉnh bằng quality và `confidenceFloor`, nên bài yếu không dễ vượt lên trên bài đã được xác minh tốt.

## 5. Dashboard Knowledge Manager

`Dashboard → Knowledge Base` hỗ trợ:

- Xem tổng quan published/draft/review/expired/archived.
- Tìm kiếm và lọc theo cụm, trạng thái, health, category.
- Thêm, xem, sửa, archive và xóa bài.
- Quản lý aliases và trọng số.
- Quản lý button/action an toàn.
- Thiết lập lifecycle, visibility, hạn dùng và lịch review.
- Xem revision history và rollback.
- Retrieval Lab để thử câu hỏi theo cluster trước khi publish.

`Dashboard → SmartLearn` hỗ trợ lọc candidate theo loại, xem bài đích và chọn `Gộp vào kiến thức` khi cần.

## 6. Publication transaction

Khi candidate đạt approval policy, toàn bộ thao tác chạy trong transaction:

1. Kiểm tra candidate và phiếu duyệt.
2. Tạo bài, gắn alias, xác minh hoặc sửa bài đích.
3. Snapshot revision trước khi sửa.
4. Cập nhật candidate và review metadata.
5. Commit; lỗi ở bất kỳ bước nào sẽ rollback.

## 7. Flow khuyến nghị

```text
Member hỏi
→ Cluster Router
→ Verified Knowledge Retrieval
→ Có bài tốt: trả lời bằng embed/button
→ Có bài gần đúng: VERIFY_EXISTING hoặc ADD_ALIAS
→ Người dùng báo sai: REVISE_ARTICLE
→ Chưa có bài: NEW_ARTICLE
→ Human Approval
→ Knowledge lifecycle
→ Retrieval không cần AI Provider
```

## 8. Migration

Migration SmartLearn v2:

```text
prisma/migrations/20260731143000_smartlearn_v2_knowledge_manager/migration.sql
```

Database có migration history:

```bash
npm run db:generate
npm run db:deploy
```

Database cũ được quản lý bằng `db push` (sau khi backup + test restore):

```bash
npm run db:generate
BASELINE_EXISTING_DB=I_HAVE_A_VERIFIED_BACKUP npm run db:baseline-existing
npm run db:deploy
```
