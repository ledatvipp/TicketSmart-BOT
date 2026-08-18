console.error([
  'Từ chối chạy prisma db push từ script production.',
  'Database mới: dùng `npm run db:deploy`.',
  'Database cũ từng tạo bằng db push: sao lưu/kiểm tra restore rồi dùng',
  '`BASELINE_EXISTING_DB=I_HAVE_A_VERIFIED_BACKUP npm run db:baseline-existing`, sau đó `npm run db:deploy`.',
  'Chỉ môi trường phát triển tạm thời mới dùng `npm run db:push:dev`.',
].join('\n'));
process.exit(2);
