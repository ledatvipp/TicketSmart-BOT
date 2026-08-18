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
