# Security policy — v7.3.3

## Production requirements

- Serve the dashboard only through HTTPS. Keep `COOKIE_SECURE=true` and configure the exact `WEB_ORIGIN` allowlist.
- Set `TRUST_PROXY` to the exact reverse-proxy hop count or trusted subnet; never use a broad value copied from another deployment.
- Generate independent random values for `JWT_SECRET`, `BOT_API_SECRET`, Discord client secret, bot token and `WEBHOOK_ENCRYPTION_KEY`. The API and bot processes must share the same `WEBHOOK_ENCRYPTION_KEY` when using Dashboard-stored OpenRouter credentials.
- Keep all `ALLOW_LEGACY_*` and `ALLOW_INSECURE_BOT_API` flags disabled in production.
- Restrict `TRANSCRIPT_CHANNEL_ALLOWLIST` to staff-only archive channels.
- Do not expose SQLite over a shared/network filesystem. Use one API writer; move to PostgreSQL before horizontal scaling.

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
