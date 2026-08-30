# Level Chat + Minecraft rewards

Guild configuration is stored as `GuildConfig.chatLevelConfig`; it defaults disabled and is exposed by `GET/PUT /api/config`. It is a bounded JSON object with this shape:

```json
{
  "version": 1,
  "enabled": false,
  "requiredVerifiedRoleIds": ["1543196526946291783"],
  "allowedChannelIds": [],
  "xpPerMessage": 20,
  "minContentLength": 10,
  "cooldownSeconds": 60,
  "similarityWindow": 10,
  "similarityThreshold": 0.9,
  "levelRoles": [{ "minLevel": 10, "roleId": "..." }],
  "rewardSpins": 1,
  "rewardMilestones": [{ "minLevel": 10, "spins": 2 }],
  "minecraftServiceId": "default",
  "maxRewardAttempts": 12,
  "rewardRetryBaseSeconds": 60,
  "announcementEnabled": true,
  "announcementChannelId": null,
  "imageEnabled": true,
  "accentColor": "#5865F2",
  "adminRoleIds": []
}
```

When `requiredVerifiedRoleIds` is non-empty, only members holding at least one listed role can earn XP; an empty list disables that role gate. Eligible messages must also have at least the configured number of useful characters. When Level Chat is enabled, `allowedChannelIds` must contain at least one channel: an empty allow-list awards no XP. `!` commands never earn XP. The ledger makes Discord message processing idempotent; after static eligibility passes it also records cooldown/similarity rejects with zero XP, so a delayed replay cannot later earn XP. Levels start at 0 and crossing level `n` requires `100 + 25 × (n - 1)` XP. One durable reward grant is created per guild/user/level; the highest applicable milestone determines its spins. Each grant snapshots its `minecraftServiceId`, attempt limit, and retry base at creation.

Players can use `/level me`, `/level top`, `/level rewards`, `/rank`, and `/leaderboard`, or the `!level`, `!rank`, and `!leaderboard` equivalents. Discord Administrators and users with configured `adminRoleIds` can use `/level admin add-xp`, `set-level`, `sync-role`, and `retry-reward`.

Dashboard/bot APIs are `GET /api/chat-levels/leaderboard`, `GET /api/chat-levels/profiles/:userId`, `GET /api/chat-levels/grants`, `POST /api/chat-levels/grants/:id/retry`, and `GET /api/chat-levels/setup-status`. Dashboard routes require the existing `config.manage` permission. Setup status intentionally returns only readiness, the assigned service ID, its non-secret last-seen time, queue counts, and remediation labels; it never returns signing secrets or headers.

## Rank cards and announcements

`imageEnabled` controls PNG attachments for `/level me`, `/rank`, their prefix equivalents, and level-up announcements; its default is `true`. Setting it to `false` keeps text embeds and does not change XP or rewards. `accentColor` is a six-digit `#RRGGBB` color, default `#5865F2`, normalized to uppercase when saved. `announcementEnabled` controls level-up announcements independently; a null/blank `announcementChannelId` sends them in the channel where the member leveled up.

Cards use an original Minecraft-inspired SVG design: a dark voxel forest, grass blocks and diamond decoration, a beveled square inventory-style avatar, and a segmented lime XP bar. Emerald/cyan atmosphere, embossed frame/panel layers and five fixed sparkles add depth; XP gleam stays clipped to earned progress so 0% remains empty. `PLAYER STATS` and `LEVEL UP!` distinguish rank and level-up modes. Short ASCII headings and the large level number use Press Start 2P; Vietnamese names and supporting text use Noto Sans. `accentColor` colors trim/details, not the lime XP bar or the entire background. Long profile/guild names are clipped within their own areas, and progress is clamped to 0–100%. The server header uses the current Discord guild name passed by commands/announcements; IS7MC is sample branding only, and missing guild context uses the neutral `Tên server` placeholder.

Cards are rendered locally as 1000×360 PNGs with `@resvg/resvg-js`, in worker threads. The renderer permits two active jobs, has no waiting queue, and terminates a render worker after four seconds. Avatar loading precedes rendering and has its own two-second timeout: only Discord CDN PNG avatar paths are accepted, redirects are rejected, input is limited to 512 KiB and 1024×1024 pixels. An unavailable avatar uses the member's initial. Deployment artifacts must include all three files in `src/assets/fonts`: `noto-sans-regular.ttf`, `noto-sans-bold.ttf` and `press-start-2p.ttf`, together with the [Noto Sans OFL](../src/assets/fonts/OFL.txt) and [Press Start 2P OFL](../src/assets/fonts/press-start-2p-OFL.txt). Fonts load locally; system fonts and runtime Google Fonts requests are not required. This visual refresh adds no npm dependency or migration and leaves image/config defaults, API and XP behavior unchanged.

Disabled images, saturation or rendering failure keep the useful embed. Announcements skip attachments when the bot lacks Attach Files. A definite Discord attachment rejection can retry as embed-only; ambiguous transport errors are not retried automatically, to avoid duplicate sends. Embed-only fallback still requires Discord permissions to send messages/embeds. The rank field is derived from the top 100 leaderboard entries; outside that range it explicitly reports that the member is outside the top 100.

XP/reward writes complete before role synchronization and level-up announcements. Role and announcement failures are isolated from one another; an XP error does not abort ticket logging or AI handling. A level-up message says Minecraft rewards are queued, not already delivered. Rendering does not change XP math, reward snapshots, outbox leases/statuses, Prisma schema or worker HMAC; no new database migration is introduced by this presentation update.

The bot shares an in-flight config refresh across concurrent callers, retains its five-minute cache, and delays retries for five seconds after a refresh failure. Existing cached config may be used during an API outage; no cache means the error is propagated. Auto-action ticks consume the API's `data.actions` envelope and do not overlap. Startup module errors stop the bot before Discord login rather than registering an incomplete command set. Supervisor restart timers remain active even if both children exit, while normal shutdown cancels pending restarts; the existing restart budget still applies.

## Safe dashboard editing

Dashboard → Level Chat provides a Vietnamese guided form, advanced JSON and a clearly labeled sample-card preview. Both editing modes preserve benign extension fields. The server rejects sensitive key names recursively, including nested objects and arrays; do not put tokens, passwords, API/private/signing/encryption keys or secrets anywhere in config. The 20,000-byte bound remains in force.

The editor loads a saved baseline before allowing changes. Failed or malformed config responses block editing/saving rather than introducing savable defaults. Changes are not applied until Save succeeds; failed saves retain the draft. Reload/reset and navigation guard against discarding an unsaved draft. Operational polling is separate from the draft and pauses while the tab is hidden.

Reward states remain distinct: `PENDING` waits for a worker, `LEASED` has an active claim, `DEFERRED` waits for retry, `COMPLETED` is finished, and `FAILED` exhausted its policy or needs intervention. Only `DEFERRED`/`FAILED` expose manual retry in the dashboard. A worker heartbeat is evidence of a previous signed request, not proof that the worker is currently online. See [dashboard workflow](DASHBOARD_V7.md) for editing and diagnostics.

## LobbySign worker contract

The Minecraft worker calls these signed routes:

- `POST /api/chat-levels/minecraft/grants/claim` body `{ "limit": 20, "leaseSeconds": 120 }`
- `POST /api/chat-levels/minecraft/grants/complete` body `{ "grantId": "...", "leaseToken": "...", "deliveryReference": "optional" }`
- `POST /api/chat-levels/minecraft/grants/defer` body `{ "grantId": "...", "leaseToken": "...", "retryAfterSeconds": 60, "reason": "optional" }`

Claim returns `data` items with `id`, `guildId`, `userId`, `level`, `spins`, `leaseToken`, and `leaseExpiresAt`. A worker only claims grants assigned to its `X-LeDat-Server`; completion and defer enforce that same assignment. A completion/defer only succeeds while that token owns an unexpired lease. Expired leases and explicit defers use exponential backoff from the grant's `rewardRetryBaseSeconds` (capped at 24 hours, honoring a longer defer request). At `maxRewardAttempts`, the grant becomes `FAILED` with an explanatory error and is never claimed automatically. A dashboard/manual retry intentionally resets a `FAILED` grant to a fresh pending attempt.

All three routes reuse LobbySign `ApiRequestSigner` exactly:

```text
X-LeDat-Server: server ID
X-LeDat-Timestamp: Unix epoch seconds
X-LeDat-Nonce: unique nonce
X-LeDat-Content-SHA256: SHA-256 hex of the exact UTF-8 JSON body
X-LeDat-Signature: HMAC-SHA256 base64url without padding
```

The canonical payload is `METHOD\nPATH\nTIMESTAMP\nNONCE\nCONTENT_SHA256\nSERVER_ID`. Configure the secret only through `MINECRAFT_LEVEL_SERVICE_SECRETS` (JSON server-id map), `MINECRAFT_LEVEL_SERVICE_SECRET_<NORMALIZED_SERVER_ID>` (uppercase and replace every non-alphanumeric character with `_`), or the `default` fallback. Secrets are deliberately never accepted in config JSON or persisted in SQLite. A validated request upserts only its server ID and `lastSeenAt` heartbeat for setup diagnostics.

## Deployment checklist

1. In Dashboard → Level Chat, set `minecraftServiceId` to the worker's `level-chat-sync.service-id`, enable Level Chat, and add at least one `allowedChannelIds` entry. A blank allow-list intentionally disables XP awards even while Level Chat is enabled.
2. In the bot environment, put a 32–4096-byte UTF-8 secret under that exact service ID in `MINECRAFT_LEVEL_SERVICE_SECRETS` (or use its matching per-service environment variable). In the LobbySign process, set the environment variable named by `level-chat-sync.secret-env` to the same secret. Do not place the secret in either dashboard JSON or `config.yml`.
3. Enable `level-chat-sync` in LobbySign and set its HTTPS `api-url`. LobbySign is a Java 21 Paper plugin; build and run it with JDK 21. From `LeDatLobbySign` on Windows, for example:

   ```powershell
   $env:JAVA_HOME = 'C:\path\to\jdk-21'
   .\gradlew.bat test shadowJar
   ```

4. Use the Dashboard setup-status panel after the worker starts. `serviceLastSeenAt` updates only after a fully valid signed worker request; the panel also reports pending/deferred/failed grants and non-secret remediation labels. A `FAILED` grant requires the dashboard/manual retry action after its cause is addressed.
