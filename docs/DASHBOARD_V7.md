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

## Build

```bash
npm --prefix src/web ci
npm run build
```

Dashboard production nằm trong `src/web/dist`.
