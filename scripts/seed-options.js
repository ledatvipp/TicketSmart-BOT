import { PrismaClient } from '../src/generated/client/index.js';

const prisma = new PrismaClient();

const options = [
  {
    name: 'Hỗ Trợ Chung',
    description: 'Các câu hỏi hoặc vấn đề chưa thuộc nhóm hỗ trợ cụ thể.',
    emoji: '💬',
    color: '#5865F2',
    customEmbedEnabled: true,
    ticketTitle: '💬 Hỗ Trợ Chung • Ticket #{ticketNum}',
    ticketDesc: 'Xin chào {user}! Hãy mô tả rõ vấn đề để đội ngũ hỗ trợ kiểm tra.',
    ticketGuidance: '• Nêu tên Minecraft\n• Nêu thời gian xảy ra\n• Gửi ảnh hoặc video nếu có',
    ticketFooter: 'IS7MC Support • Ticket #{ticketNum}',
    ticketColor: '#5865F2',
    welcomeMessage: 'Staff sẽ tiếp nhận ticket sớm nhất có thể.',
    formFields: [],
    sortOrder: 10
  },
  {
    name: 'Mất Vật Phẩm',
    description: 'Mất đồ do lag, rollback, lỗi inventory hoặc giao dịch.',
    emoji: '📦',
    color: '#F59E0B',
    customEmbedEnabled: true,
    ticketTitle: '📦 Kiểm Tra Mất Vật Phẩm • #{ticketNum}',
    ticketDesc: 'Staff cần thời gian, vị trí và danh sách vật phẩm để đối chiếu log.',
    ticketGuidance: '• Không chỉnh sửa bằng chứng\n• Không spam nhiều ticket\n• Hoàn đồ chỉ thực hiện khi log xác nhận lỗi máy chủ',
    ticketFooter: 'IS7MC • Item Recovery',
    ticketColor: '#F59E0B',
    formFields: [
      { id: 'minecraft_name', label: 'Tên Minecraft', type: 'text', required: true, placeholder: 'Ví dụ: LeDat' },
      { id: 'occurred_at', label: 'Thời gian xảy ra', type: 'text', required: true, placeholder: 'Ví dụ: 13:25 ngày 30/07/2026' },
      { id: 'server_world', label: 'Máy chủ / thế giới', type: 'text', required: true, placeholder: 'Ví dụ: Survival / world' },
      { id: 'lost_items', label: 'Vật phẩm bị mất', type: 'textarea', required: true, placeholder: 'Tên, số lượng, cấp nâng, enchant...' },
      { id: 'details', label: 'Mô tả sự cố', type: 'textarea', required: true, placeholder: 'Bạn chết, rollback hay mất kết nối như thế nào?' },
      { id: 'evidence', label: 'Ảnh hoặc video', type: 'url', required: false, placeholder: 'Link bằng chứng nếu có' }
    ],
    sortOrder: 20
  },
  {
    name: 'Ứng Tuyển Staff',
    description: 'Gửi đơn ứng tuyển Helper, Moderator hoặc vị trí khác.',
    emoji: '🛡️',
    color: '#8B5CF6',
    customEmbedEnabled: true,
    ticketTitle: '🛡️ Đơn Ứng Tuyển Staff • #{ticketNum}',
    ticketDesc: 'Điền thông tin trung thực. Đội ngũ quản lý sẽ xem xét và phản hồi.',
    ticketGuidance: '• Không hỏi liên tục về kết quả\n• Thông tin sai có thể khiến đơn bị từ chối',
    ticketFooter: 'IS7MC • Staff Recruitment',
    ticketColor: '#8B5CF6',
    formFields: [
      { id: 'minecraft_name', label: 'Tên Minecraft', type: 'text', required: true, placeholder: 'Tên trong game' },
      { id: 'age', label: 'Tuổi', type: 'number', required: true, placeholder: 'Tuổi hiện tại' },
      { id: 'position', label: 'Vị trí ứng tuyển', type: 'select', required: true, options: ['Helper', 'Moderator', 'Builder', 'Content', 'Khác'] },
      { id: 'availability', label: 'Thời gian online', type: 'textarea', required: true, placeholder: 'Số giờ/ngày và khung giờ' },
      { id: 'experience', label: 'Kinh nghiệm', type: 'textarea', required: true, placeholder: 'Server/vị trí đã từng làm' },
      { id: 'reason', label: 'Lý do nên chọn bạn', type: 'textarea', required: true, placeholder: 'Điểm mạnh và đóng góp dự kiến' }
    ],
    sortOrder: 30
  },
  {
    name: 'Nạp Thẻ & Thanh Toán',
    description: 'Chưa nhận xu, lỗi giao dịch, mua rank hoặc sản phẩm.',
    emoji: '💳',
    color: '#10B981',
    customEmbedEnabled: true,
    ticketTitle: '💳 Hỗ Trợ Thanh Toán • #{ticketNum}',
    ticketDesc: 'Cung cấp mã giao dịch để staff kiểm tra. Không đăng thông tin nhạy cảm công khai.',
    ticketGuidance: '• Không gửi mật khẩu hoặc OTP\n• Che số tài khoản nếu ảnh có thông tin riêng tư',
    ticketFooter: 'IS7MC • Payment Support',
    ticketColor: '#10B981',
    formFields: [
      { id: 'minecraft_name', label: 'Tên Minecraft', type: 'text', required: true, placeholder: 'Tên nhận xu/rank' },
      { id: 'transaction_code', label: 'Mã giao dịch', type: 'text', required: true, placeholder: 'Mã trên website hoặc biên nhận' },
      { id: 'payment_time', label: 'Thời gian thanh toán', type: 'text', required: true, placeholder: 'Ngày và giờ' },
      { id: 'product', label: 'Sản phẩm / số tiền', type: 'text', required: true, placeholder: 'Ví dụ: Rank Cá Nóc Chúa' },
      { id: 'details', label: 'Mô tả', type: 'textarea', required: true, placeholder: 'Lỗi hiển thị hoặc phần thưởng chưa nhận' },
      { id: 'evidence', label: 'Ảnh biên nhận', type: 'url', required: false, placeholder: 'Link ảnh đã che thông tin riêng tư' }
    ],
    sortOrder: 40
  },
  {
    name: 'Báo Lỗi Server',
    description: 'Báo bug plugin, GUI, lệnh, vật phẩm hoặc tính năng.',
    emoji: '🐞',
    color: '#EF4444',
    customEmbedEnabled: true,
    ticketTitle: '🐞 Báo Lỗi Server • #{ticketNum}',
    ticketDesc: 'Mô tả cách tái hiện lỗi để đội ngũ kỹ thuật kiểm tra nhanh hơn.',
    ticketGuidance: '• Ghi đúng lệnh/thao tác\n• Gửi log hoặc video nếu có\n• Không khai thác lỗi để trục lợi',
    ticketFooter: 'IS7MC • Bug Report',
    ticketColor: '#EF4444',
    formFields: [
      { id: 'minecraft_name', label: 'Tên Minecraft', type: 'text', required: true, placeholder: 'Tên trong game' },
      { id: 'location', label: 'Máy chủ / khu vực', type: 'text', required: true, placeholder: 'Ví dụ: Survival, /warp trade' },
      { id: 'steps', label: 'Các bước gây ra lỗi', type: 'textarea', required: true, placeholder: 'Liệt kê từng thao tác' },
      { id: 'expected', label: 'Kết quả mong đợi', type: 'textarea', required: true, placeholder: 'Đáng lẽ hệ thống phải làm gì?' },
      { id: 'actual', label: 'Kết quả thực tế', type: 'textarea', required: true, placeholder: 'Điều gì đã xảy ra?' },
      { id: 'evidence', label: 'Ảnh / video / log', type: 'url', required: false, placeholder: 'Link bằng chứng' }
    ],
    sortOrder: 50
  },
  {
    name: 'Báo Cáo Người Chơi',
    description: 'Báo hack, lừa đảo, xúc phạm hoặc hành vi vi phạm.',
    emoji: '🚨',
    color: '#DC2626',
    customEmbedEnabled: true,
    ticketTitle: '🚨 Báo Cáo Người Chơi • #{ticketNum}',
    ticketDesc: 'Cung cấp bằng chứng rõ ràng. Staff sẽ xử lý riêng tư.',
    ticketGuidance: '• Không công kích người bị báo cáo\n• Không chỉnh sửa bằng chứng gây sai lệch',
    ticketFooter: 'IS7MC • Player Report',
    ticketColor: '#DC2626',
    formFields: [
      { id: 'reporter', label: 'Tên Minecraft của bạn', type: 'text', required: true, placeholder: 'Người báo cáo' },
      { id: 'target', label: 'Người bị báo cáo', type: 'text', required: true, placeholder: 'Tên Minecraft / Discord' },
      { id: 'violation', label: 'Hành vi vi phạm', type: 'textarea', required: true, placeholder: 'Mô tả cụ thể' },
      { id: 'occurred_at', label: 'Thời gian và địa điểm', type: 'text', required: true, placeholder: 'Ngày, giờ, server/kênh' },
      { id: 'evidence', label: 'Bằng chứng', type: 'url', required: true, placeholder: 'Link ảnh hoặc video' }
    ],
    sortOrder: 60
  },
  {
    name: 'Kháng Án',
    description: 'Kháng ban, mute hoặc hình phạt khác.',
    emoji: '⚖️',
    color: '#64748B',
    customEmbedEnabled: true,
    ticketTitle: '⚖️ Đơn Kháng Án • #{ticketNum}',
    ticketDesc: 'Trình bày trung thực và tôn trọng quyết định của staff.',
    ticketGuidance: '• Một hình phạt chỉ mở một đơn\n• Spam hoặc xúc phạm có thể khiến đơn bị đóng',
    ticketFooter: 'IS7MC • Punishment Appeal',
    ticketColor: '#64748B',
    formFields: [
      { id: 'minecraft_name', label: 'Tên Minecraft', type: 'text', required: true, placeholder: 'Tên bị xử phạt' },
      { id: 'punishment', label: 'Loại hình phạt', type: 'select', required: true, options: ['Ban', 'Mute', 'Kick/Jail', 'Discord', 'Khác'] },
      { id: 'reason_shown', label: 'Lý do hệ thống hiển thị', type: 'text', required: true, placeholder: 'Nội dung reason' },
      { id: 'appeal', label: 'Nội dung kháng án', type: 'textarea', required: true, placeholder: 'Giải thích sự việc và lý do xin xem xét' },
      { id: 'evidence', label: 'Bằng chứng bổ sung', type: 'url', required: false, placeholder: 'Link nếu có' }
    ],
    sortOrder: 70
  }
];

async function upsertOption(data) {
  const existing = await prisma.option.findFirst({ where: { name: data.name } });
  const payload = {
    ...data,
    formFields: JSON.stringify(data.formFields ?? []),
    autoMessages: JSON.stringify([]),
    isActive: true
  };

  if (existing) {
    return prisma.option.update({ where: { id: existing.id }, data: payload });
  }
  return prisma.option.create({ data: payload });
}

async function main() {
  console.log('🌱 Đồng bộ các loại ticket khuyến nghị...');
  for (const option of options) {
    const saved = await upsertOption(option);
    console.log(`✅ ${saved.name}`);
  }
  console.log('✅ Hoàn tất. Không xóa các option tùy chỉnh đang có.');
}

main()
  .catch((error) => {
    console.error('❌ Seed thất bại:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
