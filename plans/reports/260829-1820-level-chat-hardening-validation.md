# Level Chat hardening validation

## Summary

The cross-repository hardening contract was inspected and the requested quality gates were run. All requested bot and LobbySign checks pass against the latest state.

## Bot results

| Check | Result |
| --- | --- |
| `npm run check` | Pass — 163 JavaScript files and 33 Vue components |
| `npm run db:validate` | Pass |
| `npm run db:generate` | Pass — Prisma Client generated |
| `npm run build` | Pass — latest dashboard, including DEFERRED/FAILED manual retry UI |
| `npm run test:migrations` | Pass — 15 migrations, 36 expected tables, no missing tables or FK violations |
| latest `npm test` | Pass — 89/89 tests plus migration validation |

The post-validation change from `updateMany` to Prisma `update` for the known `(guildId, messageId)` ledger row was retested. Its in-memory test double was updated to match, and the full suite is green.

The migration hardening is present: grants snapshot `minecraftServiceId`, `maxAttempts`, and `retryBaseSeconds`; add an index on `(minecraftServiceId, status, nextAttemptAt)`; and persist only non-secret Minecraft service heartbeats. Grant statuses cover `PENDING`, `LEASED`, `DEFERRED`, `COMPLETED`, and `FAILED`. Default Level Chat config is disabled with an empty channel allow-list; service/retry defaults are `default`, 12, and 60 seconds.

Inspected behavior matches the hardening goals:

- An empty allow-list returns `allowlist_empty`, so no XP is earned.
- The idempotency ledger row is created before cooldown/similarity checks; a rejected replay remains duplicate and cannot earn XP later.
- Claim, complete, and defer all take the authenticated HMAC service ID and include it in their database predicates.
- Retry can restart `FAILED` or `DEFERRED` grants; automatic leasing only selects `PENDING`/`DEFERRED`, and exhausted attempts become `FAILED`.
- Setup status returns readiness, service ID, last-seen time, counts, and remediation only; it does not return an HMAC secret or headers.
- The bot’s HMAC test passed before the post-test-double change and verifies LobbySign-compatible raw-body base64url HMAC plus replay/tamper rejection.

## LobbySign results

`JAVA_HOME='C:\\Program Files\\Java\\jdk-21' .\\gradlew.bat test --rerun-tasks` passed: 132 tests across 34 suites, with 0 failures, errors, or skips. The default shell Java was JDK 25 and Gradle rejected it, but JDK 21 is installed and was explicitly selected for the successful run. Compilation emitted existing deprecation/unchecked warnings only.

`LevelChatSyncSettings` validates enabled service IDs, secret references and UTF-8 secret length (32–4096 bytes), HTTPS URL policy, bounded timeouts, and a lease strictly longer than two request timeouts plus the five-second margin. The worker uses the shared `ApiRequestSigner` protocol, caps concurrency at four, calculates a lease-safe claim limit, and retries only retryable transport/HTTP failures. It defers transient delivery problems, near-expiry leases, unavailable link data, and unmapped Discord identities. The checked-in defaults leave sync disabled and keep the secret outside YAML.

## Concerns

- Both repositories already had substantial uncommitted user work. The validation did not edit product files; Gradle/Prisma/build commands refreshed generated outputs as normal.
