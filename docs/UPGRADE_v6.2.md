# Nâng cấp lên v6.2

## 1. Sao lưu

```bash
cp prisma/data.db prisma/data.db.backup-$(date +%Y%m%d-%H%M)
```

## 2. Cài dependency và migrate

```bash
npm ci
npm --prefix src/web ci
npm run db:generate
npm run db:deploy
```

Database cũ từng tạo bằng `db push` và chưa có migration history (sau khi backup + test restore):

```bash
npm run db:generate
BASELINE_EXISTING_DB=I_HAVE_A_VERIFIED_BACKUP npm run db:baseline-existing
npm run db:deploy
```

## 3. Tạo dữ liệu mặc định và build

```bash
npm run seed:clusters
npm run seed:options
npm run seed:knowledge
npm run build
npm start
```

`seed:clusters` chỉ tạo cụm còn thiếu và không ghi đè cấu hình category/role/channel đã chỉnh trên dashboard.

## 4. Thiết lập sau khi chạy

1. Vào `Dashboard → Cụm máy chủ`.
2. Gắn Category ID và Staff Role ID cho từng cụm.
3. Vào `Loại ticket`, chọn scope cụm cho từng option.
4. Vào `Knowledge Base`, kiểm tra scope của tài liệu.
5. Vào `Cấu hình → Smart AI`, bật yêu cầu chọn cụm và channel map.
6. Test một câu hỏi và một ticket ở cả `SMP` lẫn `ChunkySMP` để xác nhận không bị trộn.
