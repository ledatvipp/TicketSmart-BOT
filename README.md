# Discord Smart Ticket System v7.3.3 — OpenRouter AI + SmartLearn Quality + Ticket Intelligence

Hệ thống ticket Discord chuyên nghiệp theo hướng interaction-first: panel gọn, menu/button/modal, trợ lý AI an toàn ngay trong ticket, dashboard quản trị, Rule Engine tiếng Việt, Knowledge Base lai, Action Engine có kiểm soát và router tách biệt dữ liệu theo từng cụm máy chủ.

Ví dụ người chơi gửi:

> Server vừa lag, tôi mất đồ và giao dịch nạp tiền vẫn chưa nhận.

Bot có thể tách thành nhiều nhu cầu độc lập, xác định người chơi đang hỏi **SMP, Survival, Skyblock, BoxPvP, Tu Tiên, FFA hay ChunkySMP**, trả lời từ đúng tài liệu của cụm đó, hỏi lại bằng button khi chưa chắc và hiện đúng hành động như **Tạo ticket**, **Báo giao dịch**, **Gọi staff** hoặc **Xem hướng dẫn**. AI không trực tiếp chạy console command, cộng tiền, cấp rank hay hoàn vật phẩm.


## Nâng cấp v7.3.3 — Trial Polish

- Thêm **AI Playground** ngay trong Dashboard để thử prompt thật trước khi bật AI cho người chơi.
- Hiển thị model thực tế, latency và input/output/reasoning token usage của lần thử.
- Thêm runtime diagnostics cho OpenRouter: request, retry, success/failure, average latency và circuit breaker.
- Model `:free` có failover một lần sang `openrouter/free` khi timeout/rate-limit/5xx; không che lỗi key/credit và không áp dụng cho paid model/embedding.
- Không có migration database mới so với v7.3.2.

Chi tiết: [`CHANGELOG_v7.3.3_TRIAL_POLISH.md`](CHANGELOG_v7.3.3_TRIAL_POLISH.md).

## Nâng cấp v7.3.2 — OpenRouter AI Provider

- AI thật của hệ thống dùng **OpenRouter** cho Intent Router, Grounded Answer, Ticket Triage và embedding; không còn cần `OPENAI_API_KEY`.
- Model mặc định: `google/gemma-4-26b-a4b-it:free`. Có thể đổi model chính, Answer, Triage và Embedding ngay trên Dashboard.
- Dashboard → **Smart Assistant → OpenRouter AI Provider** có ô nhập/rotate/xóa/test API key. Key được mã hóa AES-256-GCM trong bảng credential riêng và API config chỉ trả trạng thái + key hint, không trả key thô.
- Có fallback `OPENROUTER_API_KEY` trong `.env` cho secret manager/production; key lưu từ Dashboard được ưu tiên.
- Reasoning có thể bật/tắt và chọn `minimal/low/medium/high`; reasoning nội bộ không được hiển thị ra Discord.
- Nếu OpenRouter chưa có key hoặc tạm lỗi, Rule Engine/Knowledge fallback vẫn hoạt động theo policy an toàn.

Chi tiết: [`docs/OPENROUTER.md`](docs/OPENROUTER.md).

## Nâng cấp v7.3.0 — AI / SmartLearn / Ticket

- Ticket AI đọc tối đa 2–20 message gần nhất (mặc định 8) và giữ **ticket memory** bằng `aiSummary`, nên vẫn hiểu ngữ cảnh ở ticket dài mà không phải gửi toàn bộ lịch sử mỗi lần.
- Grounded Answer có **Evidence Gate**: kết hợp retrieval score, chất lượng bài, độ mới, lifecycle, review deadline và độ chênh top result; nguồn yếu/mơ hồ/quá hạn review sẽ chuyển staff thay vì đoán.
- Structured Ticket Triage lưu summary, suggested priority/tag, missing information, confidence, evidence và lý do cần người thật vào ticket.
- Auto-priority chỉ được **nâng**, không tự hạ mức staff đã đặt; auto-tag merge chống trùng; sensitive escalation mặc định tắt và có cooldown chống ping spam.
- SmartLearn có Learning Score, Evidence Score, Source Diversity, Conflict Score và negative signals; candidate mâu thuẫn bị khóa vào human review.
- Ticket đã đóng có thể trở thành nguồn học sau khi lọc chỉ câu user + phản hồi staff public và redact credential/PII cơ bản.
- Knowledge publish từ SmartLearn được đặt `reviewDueAt`; bài quá hạn review không còn được AI coi là nguồn đủ mạnh cho đến khi được xác minh lại.
- Nút **Đã giải quyết / Cần Staff** ghi feedback thật cho detection/Knowledge, tạo vòng lặp chất lượng thay vì chỉ đoán độ hữu ích từ log.
- Negative feedback được lưu như bằng chứng thất bại (`observedAnswer`), không tự biến câu trả lời AI sai thành nội dung Knowledge mới.
- Dashboard hiển thị AI triage/evidence trực tiếp trên ticket và cho sort SmartLearn theo learning/conflict/occurrence.

Chi tiết migration, cấu hình và luồng an toàn: [`docs/AI_SMARTLEARN_TICKET_V73.md`](docs/AI_SMARTLEARN_TICKET_V73.md).

## SmartLearn v2 / Knowledge Manager

- Phân loại candidate thành bài mới, alias, xác minh bài cũ hoặc revision.
- Dashboard quản lý đầy đủ nội dung, alias, lifecycle, version, quality và cluster scope.
- Knowledge đã xác minh có thể trả lời không cần AI Provider.
- Xem tài liệu chi tiết tại [`docs/SMARTLEARN_V2.md`](docs/SMARTLEARN_V2.md).

## Công nghệ

- Discord.js 14
- Express API + Socket.IO
- Prisma + SQLite WAL
- Vue 3 + Vite dashboard
- Rule Engine tiếng Việt có trọng số, fuzzy matching và xử lý phủ định
- OpenRouter Responses API cho intent fallback, grounded answer và ticket triage
- Hybrid Knowledge Search: từ khóa mở rộng + embedding tùy chọn
- Ticket, form động, claim, close, transcript, SLA, auto-action và audit log

## Các giai đoạn đã hoàn thành

### Giai đoạn 0 — Ổn định nền tảng

- Prisma schema/migration đầy đủ.
- Counter transaction chống trùng số ticket.
- Ticket `creating → open`, rollback khi tạo channel lỗi.
- Internal API fail-closed ở production.
- Hash/rotate refresh token, kiểm tra môi trường và graceful shutdown.
- Form wizard hỗ trợ hơn 5 trường.
- Production supervisor tự khởi động lại API/BOT có backoff và giới hạn vòng lặp.

### Giai đoạn 1 — Smart Rule Engine

- Hiểu tiếng Việt có dấu/không dấu, typo, chữ kéo dài và cách viết tắt phổ biến.
- Phrase/token/bigram scoring, phủ định và thứ tự từ.
- Nhận diện nhiều nhu cầu trong cùng một tin nhắn.
- Học thêm từ feedback đã được admin duyệt.
- Cooldown, burst limit, message deduplication và channel allowlist.

### Giai đoạn 2 — AI Intent Router

- Rule Engine chạy trước; AI chỉ dùng khi cần.
- AI chỉ chọn intent trong catalog cho phép bằng structured JSON.
- Multi-intent, hỏi làm rõ và dùng lịch sử hội thoại ngắn hạn.
- Retry, timeout, cache, circuit breaker và fallback khi AI lỗi/hết quota.
- Có client request ID để hỗ trợ truy vết request.

### Giai đoạn 3 — Knowledge Base / Hybrid RAG

- CRUD tài liệu trên dashboard và lưu revision.
- Tìm kiếm từ khóa mở rộng luôn hoạt động khi không có API key.
- Embedding tùy chọn để tìm câu đồng nghĩa.
- Grounded answer chỉ dựa trên tài liệu đã truy xuất.
- Hiển thị nguồn nội bộ, reindex và thống kê helpful/unhelpful.
- Seed 59 bài hướng dẫn, trong đó có nội dung và phạm vi riêng cho từng cụm.

### Giai đoạn 4 — Action Engine

Chỉ cho phép bốn loại action:

- `ticket`: mở đúng form ticket.
- `escalate`: gọi role/channel staff đã cấu hình.
- `link`: URL `http/https` hợp lệ.
- `channel`: mở Discord channel hợp lệ.

Mọi action được kiểm tra allowlist và ghi audit log. Console command, URL nguy hiểm và action tự sinh đều bị chặn.

### Giai đoạn 5 — Multi-turn Smart Assistant

- Ghi nhớ ngữ cảnh ngắn hạn theo guild/channel/user.
- Hiểu câu trả lời như `1`, `2`, `cái thứ hai`, hoặc tên lựa chọn.
- Tự đóng hội thoại khi người dùng nói đã xong/cảm ơn.
- Xóa hội thoại hết hạn định kỳ.
- Hợp nhất kết quả Rule + AI theo consensus.
- Catalog 54 intent: mất đồ, giao dịch, staff, event, kết nối, claim, RTP, warp, store, code, kit, rank, fishing, chicken farm, dungeon, trade, auction, quest, MobCoin, luật, liên kết Discord và nhiều nhóm khác.
- Dashboard hiển thị hội thoại đang hoạt động và các trường hợp chờ làm rõ.

### Giai đoạn 6 — Professional Ticket UX + In-ticket AI

- Một ticket chỉ có một panel chính được ghim và cập nhật, thay vì gửi nhiều thông báo rời.
- Menu member: hỏi AI nhanh, bổ sung thông tin, xem trạng thái, gọi staff và đóng ticket.
- Menu staff: claim, priority, workflow, bật/tắt AI và làm mới panel.
- Modal bổ sung thông tin cập nhật thẳng vào panel, không tạo thêm tin nhắn công khai.
- AI trong ticket chỉ phản hồi câu hỏi rõ ràng theo policy; mặc định tối đa 3 gợi ý và cooldown 45 giây.
- AI dùng một panel trả lời duy nhất, câu trả lời ngắn và có button như **Đã giải quyết**, **Cần Staff**, **Hỏi tiếp**.
- Ticket nhạy cảm như mất đồ, nạp tiền, report, kháng án hoặc bảo mật luôn chuyển quyết định cuối cho staff.
- AI tự nhường staff sau khi ticket được claim, và không thể bị member bật lại khi staff đã tạm dừng.
- Gọi staff có cooldown chống ping lặp.
- Workflow rõ ràng: `waiting_staff`, `waiting_user`, `ai_assisting`, `resolved`.
- Dashboard có điều khiển workflow/AI và hiển thị tóm tắt thông minh trong chi tiết ticket.
- Toàn bộ thay đổi workflow và action đều được audit.


### Giai đoạn 6.2 — Multi-Cluster Router + UI Polish

- Quản lý bảy cụm mặc định: `smp`, `survival`, `skyblock`, `boxpvp`, `tu-tien`, `ffa`, `chunkysmp`.
- Router ưu tiên theo thứ tự: channel mapping → tên/alias trong câu hỏi → ngữ cảnh hội thoại → cụm mặc định.
- `ChunkySMP` được khóa alias riêng, không bị nhận nhầm thành `SMP`.
- Các intent toàn hệ thống như nạp tiền, ứng tuyển staff hoặc bảo mật không bắt người chơi chọn cụm vô ích.
- Ticket hỏi cụm trước khi mở form/channel; cluster key được mang xuyên suốt ticket, detection, conversation, Knowledge Base và action log.
- Mỗi cụm có thể cấu hình category Discord, channel hỗ trợ, role staff, màu, emoji và alias riêng.
- Option ticket và Knowledge Article hỗ trợ scope `*` hoặc danh sách cụm chính xác; không dùng substring nên `smp` không khớp `chunkysmp`.
- AI prompt cấm trộn lệnh, kinh tế, tính năng hoặc quy định giữa các cụm. Khi chưa biết cụm, bot hỏi bằng button thay vì đoán.
- Ticket panel, AI panel và response công khai hiển thị màu/nhãn cụm, ưu tiên button/select/modal và nội dung ngắn.
- Dashboard có trang **Cụm máy chủ**, bộ lọc cluster cho ticket/Knowledge Base và cấu hình channel → cluster.


### Giai đoạn 7.1 — SmartLearn Human Approval Loop

- Tự tạo `KnowledgeCandidate` khi câu hỏi chưa có tài liệu xác minh, confidence thấp hoặc người chơi bấm **Không đúng**.
- Gộp câu hỏi trùng theo `guild + cluster + normalized question`, sau đó fuzzy-match trong cùng cụm để tăng `occurrenceCount` thay vì spam reviewer.
- Review bằng Discord interaction với ba nút: **Duyệt**, **Từ chối**, **Câu trả lời khác**.
- Hỗ trợ review channel, DM reviewer hoặc cả hai; role reviewer/admin có thể cấu hình, đồng thời dùng staff role riêng của từng cụm.
- Nội dung nhạy cảm như mất đồ, giao dịch, kháng án và bảo mật bắt buộc Admin xác minh.
- Staff thường có thể dùng policy nhiều phiếu; Admin có thể duyệt ngay theo cấu hình.
- Câu trả lời được duyệt được xuất bản thành `KnowledgeArticle` cùng nhiều `KnowledgeAlias`, để lần sau bot trả lời bằng keyword search mà không cần AI Provider.
- Dashboard có **SmartLearn Control Center**: queue theo trạng thái/cụm, occurrences, review history, ba action review và cấu hình policy.
- Người hỏi có thể được DM khi câu trả lời đã được xác minh.
- API và database review chạy atomic, có audit log, unique reviewer vote và race-safe candidate creation.

## Yêu cầu

- Node.js 18.18 trở lên; Node.js 20 LTS được khuyến nghị.
- npm 9 trở lên.
- Discord application có bot và OAuth2 callback.
- Bật **Message Content Intent** nếu bot cần đọc tin nhắn hỗ trợ thông thường.
- OpenRouter API key chỉ cần khi bật AI thật/embedding; có thể nhập trực tiếp trong Dashboard hoặc qua `.env`.

## Cài đặt mới

```bash
cp .env.example .env
npm ci
npm --prefix src/web ci
npm run setup
npm run setup-admin
npm start
```

`npm run setup` thực hiện:

```text
db:generate → db:deploy → seed:clusters → seed:options → seed:knowledge → build
```

Dashboard/API mặc định chạy tại `http://localhost:3001`.

## Nâng cấp từ v4 hoặc project cũ

Sao lưu trước:

```bash
cp prisma/data.db prisma/data.db.backup
```

Sau đó:

```bash
npm ci
npm --prefix src/web ci
npm run db:generate
npm run db:deploy
npm run seed:clusters
npm run seed:options
npm run seed:knowledge
npm run build
npm start
```

Nếu database cũ chưa từng dùng Prisma migrations và được tạo bằng `db push`, **không chạy `db push` tiếp trên production**. Sau khi tạo backup và thử restore thành công, chạy:

```bash
npm run db:generate
BASELINE_EXISTING_DB=I_HAVE_A_VERIFIED_BACKUP npm run db:baseline-existing
npm run db:deploy
```

Script baseline sẽ kiểm tra bảng/cột quan trọng trước khi đánh dấu migration; nếu schema cũ không đủ, nó dừng mà không giả vờ nâng cấp thành công.

## Cấu hình `.env`

```dotenv
NODE_ENV=production
PORT=3001
WEB_ORIGIN=https://ticket.example.com
API_URL=http://127.0.0.1:3001
DATABASE_URL="file:./data.db"

BOT_TOKEN=
CLIENT_ID=
GUILD_ID=

DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
DISCORD_REDIRECT_URI=https://ticket.example.com/auth/callback

JWT_SECRET=
BOT_API_SECRET=
ALLOW_INSECURE_BOT_API=false

# Có thể để trống và nhập key trong Dashboard → Smart Assistant.
OPENROUTER_API_KEY=
OPENROUTER_MODEL=google/gemma-4-26b-a4b-it:free
OPENROUTER_ANSWER_MODEL=
OPENROUTER_TRIAGE_MODEL=
OPENROUTER_EMBEDDING_MODEL=openai/text-embedding-3-small
OPENROUTER_HTTP_REFERER=https://ticket.example.com
OPENROUTER_APP_TITLE=Discord Smart Ticket

# Tùy chọn: số lần một tiến trình được tự restart trong 5 phút
PROCESS_RESTART_LIMIT=5
```

Tạo secret mạnh:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Dùng hai giá trị khác nhau cho `JWT_SECRET` và `BOT_API_SECRET`.

> Khi nâng cấp từ bản cũ hoặc khi từng chia sẻ source/backup, hãy rotate Discord Bot Token, Discord Client Secret, JWT secret và Bot API secret trước khi deploy.


## Bảo mật và nâng cấp v7.2.2

- Dashboard bắt buộc OAuth `state`; refresh token nằm trong cookie `HttpOnly`, access token chỉ giữ trong memory.
- REST và Socket.IO cùng áp RBAC + `allowedOptions`; VIEWER là read-only.
- Không render HTML từ nội dung Discord; transcript HTML/Markdown được escape.
- Upload ảnh kiểm tra magic bytes, MIME, dimensions và kích thước; không lưu data URL trong SQLite.
- Webhook dùng HTTPS-only, chống SSRF, secret AES-GCM, HMAC và durable retry/dead-letter.
- Production phải dùng migration (`db:deploy`), không dùng `db push`.
- Xem checklist và quy trình ứng cứu tại [`SECURITY.md`](SECURITY.md).

Trước khi deploy bản này, chạy:

```bash
npm ci
npm --prefix src/web ci
npm run verify
```

`npm run verify` phải hoàn tất Prisma validate/generate, syntax scan, security scan, unit test, migration test và Vite build.

## Cấu hình SmartLearn

Vào:

```text
Dashboard → SmartLearn → Cấu hình
```

Thiết lập tối thiểu:

- `smartLearnEnabled`: bật vòng lặp học có kiểm duyệt.
- `smartLearnReviewChannelId`: channel nhận candidate review.
- `smartLearnReviewerRoleIds`: role staff được bỏ phiếu.
- `smartLearnAdminRoleIds`: role được duyệt nội dung nhạy cảm.
- `smartLearnDeliveryMode`: `channel`, `dm` hoặc `both`.
- `smartLearnStaffVotesRequired`: số staff cần đồng thuận.
- `smartLearnDuplicateThreshold`: ngưỡng gộp câu tương tự.

Không bật `dm`/`both` với quá nhiều reviewer. Bot có giới hạn `smartLearnMaxDmReviewers` để tránh spam DM.

## Cấu hình Smart Assistant

Vào:

```text
Dashboard → Cấu hình → Smart AI
```

Các thiết lập Smart Assistant và Ticket AI:

- Bật Smart Support và chọn channel được phép.
- Chế độ chỉ phản hồi khi mention cho channel đông người.
- Rule threshold và AI threshold.
- Conversation memory, TTL và số tin nhắn ngữ cảnh.
- Clarification threshold.
- Multi-intent và số intent tối đa.
- Fuzzy matching.
- Cache response, retry AI và burst limit.
- Knowledge Base, grounded answer và escalation channel/role.
- Ticket compact mode và một-panel AI.
- Chế độ AI trong ticket: `off`, `passive`, `balanced`, `active`.
- Chỉ hỗ trợ chủ ticket, chỉ phản hồi câu hỏi, tự nhường sau claim.
- Ngưỡng confidence, cooldown, giới hạn số gợi ý và độ dài câu trả lời.
- Tự chuyển staff cho yêu cầu nhạy cảm và tự tạo tóm tắt ngắn.

Khi danh sách channel trống, bot chỉ phản hồi khi được mention. Bên trong ticket, luồng In-ticket AI riêng sẽ xử lý theo policy và không dùng luồng hỗ trợ công khai.


## Thiết lập cụm máy chủ

Vào:

```text
Dashboard → Cụm máy chủ
```

Mỗi cụm có thể cấu hình:

- Tên, key, emoji, màu và alias nhận diện.
- Discord category dùng để tạo/move ticket.
- Danh sách support channel để tự suy ra cụm.
- Danh sách staff role riêng của cụm.
- Trạng thái bật/tắt và thứ tự hiển thị.

Trong `Dashboard → Cấu hình → Smart AI`, bật **Yêu cầu xác định cụm**, **Chọn cụm trước khi tạo ticket** và khai báo channel map nếu cần:

```json
{
  "111111111111111111": "survival",
  "222222222222222222": "skyblock",
  "333333333333333333": "chunkysmp"
}
```

Đặt scope cho từng loại ticket tại `Dashboard → Loại ticket`, và scope tài liệu tại `Dashboard → Knowledge Base`. Dùng `*` cho nội dung toàn hệ thống.

## Quản lý Knowledge Base

Vào:

```text
Dashboard → Knowledge Base
```

Mỗi bài gồm tiêu đề, tóm tắt, nội dung, category, keywords, nguồn và action JSON.

```json
[
  { "type": "ticket", "label": "Tạo ticket mất đồ" },
  { "type": "escalate", "label": "Gọi staff" },
  { "type": "channel", "label": "Kênh hỗ trợ", "channelId": "123456789012345678" },
  { "type": "link", "label": "Xem quy định", "url": "https://example.com/rules" }
]
```

Không đặt token, mật khẩu, webhook bí mật hoặc thông tin thanh toán nhạy cảm trong Knowledge Base.

## AI & Actions

Vào:

```text
Dashboard → AI & Actions
```

Trang này hiển thị detection, helpful rate, intent/source/action phổ biến, action lỗi, hội thoại đang hoạt động, trường hợp chờ làm rõ và feedback chờ admin duyệt.

## Kiểm thử

```bash
npm run check
npm test
npm run build
```

Sau khi cài đầy đủ dependency:

```bash
npm run verify
```

## Cấu trúc Smart Assistant

```text
src/clusters/
├── clusterCatalog.js
└── clusterBootstrap.js

src/intelligence/
├── text.js
├── ruleEngine.js
├── aiRuntime.js
├── aiClassifier.js
├── intentRouter.js
├── conversationEngine.js
├── knowledgeSearch.js
├── embeddingClient.js
└── groundedAnswer.js

src/actions/
├── actionRegistry.js
└── smartActionHandler.js

src/bot/handlers/
├── smartMessageHandler.js
├── smartButtonHandler.js
├── formModalHandler.js
└── formWizardHandler.js
```

## Nguyên tắc bảo mật

- Không commit `.env`, database hoặc credentials.
- Không bật `ALLOW_INSECURE_BOT_API` ở production.
- Chỉ bật Smart Assistant tại channel cần thiết.
- AI không được tự tạo action mới.
- Action Engine không hỗ trợ console command.
- Hành động nhạy cảm phải có staff duyệt.
- Luôn sao lưu SQLite trước khi migrate/push schema.
