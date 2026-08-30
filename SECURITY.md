# Security policy — v7.3.3

## Production requirements

- Serve the dashboard only through HTTPS. Keep `COOKIE_SECURE=true` and configure the exact `WEB_ORIGIN` allowlist.
- Set `TRUST_PROXY` to the exact reverse-proxy hop count or trusted subnet; never use a broad value copied from another deployment.
- Generate independent random values for `JWT_SECRET`, `BOT_API_SECRET`, Discord client secret, bot token and `WEBHOOK_ENCRYPTION_KEY`. The API and bot processes must share the same `WEBHOOK_ENCRYPTION_KEY` when using Dashboard-stored OpenRouter credentials.
- Keep all `ALLOW_LEGACY_*` and `ALLOW_INSECURE_BOT_API` flags disabled in production.
- Restrict `TRANSCRIPT_CHANNEL_ALLOWLIST` to staff-only archive channels.
- Do not expose SQLite over a shared/network filesystem. Use one API writer; move to PostgreSQL before horizontal scaling.
- Build the dashboard with `npm run build` and serve `src/web/dist` through the Express API behind HTTPS. Do not expose Vite dev/preview to untrusted networks; `npm --prefix src/web start` is a preview command, not the production server.

## Level Chat configuration and images

`chatLevelConfig` is returned to the dashboard and bot: it is not a secret store. The server rejects sensitive key names recursively, including nested objects/arrays and token, secret, password, credential, API-key, private-key, signing-key and encryption-key variants. Benign unknown fields are retained within the 20,000-byte config limit. This is a key-name guard, not a scanner that can safely identify every secret pasted into an arbitrary text field; never put credentials in this JSON. Minecraft HMAC secrets remain environment-only and the existing worker authentication contract is unchanged.

Rank cards use a local SVG-to-PNG worker, not a remote image-generation service. User text is escaped; avatars are restricted to PNG avatar routes on `https://cdn.discordapp.com`, with redirects rejected, a two-second fetch timeout, a 512 KiB streamed-size limit, and dimensions no larger than 1024×1024. SVG rendering is isolated in worker threads with a four-second render timeout, at most two active jobs, and no waiting queue. Saturation/errors fall back to an embed; unavailable avatars use a local initial. The worker's JavaScript heap limit is not a hard limit on all native renderer memory.

Keep bundled [Noto Sans fonts and SIL OFL license](src/assets/fonts/OFL.txt) with bot artifacts. Dashboard Material Symbols are [self-hosted with their Apache 2.0 license](src/web/public/fonts/material-symbols-LICENSE.txt); production CSP remains unchanged (`script-src 'self'`, `font-src 'self' data:`). Do not weaken CSP to restore an external font dependency.

## Dependency audit snapshot 2026-08-30

After compatible dependency updates, `npm audit --json` at the root reported **0 vulnerabilities**. `npm --prefix src/web audit --json` still reported **2**: esbuild (moderate) and Vite (high). The reported remediation upgrades Vite across a major version; that upgrade and any Node engine change are outside this compatibility-preserving update. Do not use `npm audit fix --force` without a separately tested upgrade.

These remaining packages belong to the web build/development toolchain. Vite and its Vue plugin are currently declared under the web package's `dependencies`, with esbuild pulled in transitively, so `--omit=dev` is not a remediation and must not be described as a clean web audit. Restrict development tooling to trusted local access and deploy the built dashboard through Express. This reduces development-server exposure but does not remove the advisories; reassess the audit and perform a separate Vite upgrade before relaxing that restriction. Counts are a dated snapshot, not a guarantee for future dependency resolutions.

## Upgrade an existing db-push database

1. Stop API and bot writers.
2. Copy the SQLite database and verify that the copy can be opened/restored.
3. Install dependencies and run `npm run db:generate`.
4. Run `BASELINE_EXISTING_DB=I_HAVE_A_VERIFIED_BACKUP npm run db:baseline-existing`.
5. Run `npm run db:deploy` and `npm run verify`.
6. Start the API first, then the bot, and inspect `/health`, logs and a test ticket.

Never use `prisma db push` as a production migration mechanism. The guarded `npm run db:push:dev` command is only for a disposable development database.

## Secret rotation after upgrading from an old archive

Rotate the Discord bot token, Discord OAuth client secret, JWT secret and bot API secret. Rotating `WEBHOOK_ENCRYPTION_KEY` requires re-entering/rotating every outgoing webhook secret **and every Dashboard-stored OpenRouter API key**, because existing ciphertext cannot be decrypted with the new key.

## Incident response

Revoke a staff member by removing/changing the staff record; the server revokes refresh sessions and disconnects active sockets. For suspected refresh-token reuse, the rotation logic revokes all active sessions for that account. For suspected bot-secret compromise, rotate `BOT_API_SECRET`, restart API and bot, and review audit/webhook delivery logs.

## Reporting

Do not include production secrets, raw database files, player private messages or OAuth codes in a report. Provide the release version, request ID, affected endpoint, minimal reproduction and relevant redacted logs.
