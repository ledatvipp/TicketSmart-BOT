# Multi-Cluster Router v6.2

## Cụm mặc định

| Key | Tên | Mục đích |
|---|---|---|
| `smp` | SMP | SMP cộng đồng và sinh tồn cơ bản |
| `survival` | Survival | Câu cá, dungeon, trade, farm và event Survival |
| `skyblock` | Skyblock | Đảo, thành viên đảo, nâng cấp đảo và generator |
| `boxpvp` | BoxPvP | Mine, trang bị và PvP |
| `tu-tien` | Tu Tiên | Cảnh giới, tu luyện, đột phá và bí cảnh |
| `ffa` | FFA | Arena, kit, combat và xếp hạng |
| `chunkysmp` | ChunkySMP | Chunk, cộng đồng và bảo vệ khu vực riêng |
| `ung-ho` | Ủng hộ | Nạp thẻ, giao dịch và sản phẩm |
| `tai-khoan` | Tài khoản | Đăng nhập, liên kết và tài khoản người chơi |

## Thứ tự xác định cụm

1. Channel đã map với một cụm.
2. Tên hoặc alias cụm xuất hiện trong câu hỏi.
3. Cụm đang dùng trong hội thoại gần nhất.
4. Cụm mặc định, nếu quản trị viên đã cấu hình.
5. Nếu vẫn chưa biết, bot hiện button để member chọn; bot không đoán.

## Cấu hình Discord

Vào `Dashboard → Cụm máy chủ` và điền cho từng cụm:

- Discord Category ID dùng cho ticket.
- Support Channel IDs, ngăn cách bằng dấu phẩy.
- Staff Role IDs, ngăn cách bằng dấu phẩy.
- Alias nhận diện, ngăn cách bằng dấu phẩy.

Channel map nâng cao tại `Dashboard → Cấu hình → Smart AI`:

```json
{
  "111111111111111111": "survival",
  "222222222222222222": "skyblock",
  "chunkysmp": ["333333333333333333", "444444444444444444"]
}
```

Cả hai dạng `channelId → clusterKey` và `clusterKey → [channelIds]` đều được hỗ trợ.

## Scope ticket và Knowledge Base

- `*`: dùng cho toàn hệ thống.
- `smp,survival`: chỉ dùng đúng hai cụm.
- Scope so khớp chính xác; `smp` không bao gồm `chunkysmp`.

Nội dung toàn hệ thống nên dùng `*`, ví dụ nạp tiền, bảo mật tài khoản, ứng tuyển staff và quy định Discord.

## Quy tắc AI an toàn

- Không trộn lệnh, tiền tệ, vật phẩm, lịch sự kiện hoặc quy định giữa các cụm.
- Không tự suy đoán lệnh nếu tài liệu đúng cụm chưa có.
- Yêu cầu nhạy cảm vẫn chuyển staff quyết định.
- Ticket không có cluster sẽ bị chặn AI cho đến khi member hoặc staff chọn cụm.
# Điểm đến ticket

Panel ticket công khai chỉ có một bước chọn điểm đến. Mỗi cụm đang hoạt động
sẽ đi thẳng đến loại ticket mặc định rồi mở modal Discord ngắn hỏi tên ingame
và nội dung cần hỗ trợ. Catalog cũng có hai điểm dịch vụ **Ủng hộ** và
**Tài khoản**.

Với từng điểm đến, quản trị viên nên cấu hình:

- Discord Category ID để ticket của điểm đến nằm chung một category;
- Staff Role IDs để đúng đội ngũ được xem kênh;
- Loại ticket mặc định để chọn option định tuyến, quyền staff theo option và
  phần trình bày ticket.

Category được ưu tiên theo điểm đến, sau đó đến option; nếu chưa cấu hình, bot
tạo category riêng cho điểm đến. Quyền xem lần lượt kết hợp role của điểm đến,
role của option, rồi role staff toàn cục. Form công khai luôn cố định hai ô
tên ingame và nội dung cần hỗ trợ, không dùng form riêng của option.

Bot không tự xóa category đã cấu hình ở option hoặc điểm đến. Một người dùng
chỉ giữ tối đa hai ticket ở trạng thái đang tạo, mở hoặc đã nhận; đóng ticket
hoặc tạo thất bại sẽ trả lại lượt.

Nếu cụm cũ chưa chọn loại mặc định hoặc option đó bị tắt, bot lần lượt dùng
`Hỗ Trợ Chung` đang hoạt động và phù hợp cụm, option toàn hệ thống đang hoạt
động, rồi option phù hợp đầu tiên. Dashboard vẫn nên được cấu hình rõ loại mặc
định để kiểm soát chính xác option định tuyến và phạm vi staff.
