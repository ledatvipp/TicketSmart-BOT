# Release Verification — Smart Ticket v7.3.3

Ngày kiểm tra: 2026-08-09

## Đã vượt qua trong release workspace

- JavaScript syntax check: 149 files.
- Vue component syntax check: 32 components.
- Node unit/security/RBAC/AI/SmartLearn/Move/OpenRouter tests: 75/75.
- Prisma migration SQL replay: 12/12.
- Expected database tables after migration: 31/31.
- SQLite foreign-key check: 0 lỗi.
- Security source scan: PASS.
- OpenRouter tests verify encrypted credential handling, AI Playground safety, free-model transient failover and paid-model no-fallback behavior.
- Package versions: root/web/lockfiles = 7.3.3.
- Database delta from v7.3.2: **không có migration mới**.

## Trial polish

- AI Playground is admin-only (`config.manage`), rate-limited and does not persist prompt content.
- Runtime metrics are in-memory diagnostics only and reset on API restart.
- Specific `:free` response models fail over once to `openrouter/free` only on transient/network/rate-limit/server errors.
- `OPENROUTER_FALLBACK_MODEL=off` disables free-model failover.
- Paid response models and embedding models do not automatically switch to the free router.

## Dependency/build limitation of the review environment

`npm ci` cannot finish in this sandbox because the internal npm mirror returns HTTP 404 for required tarballs (including `yargs-parser-21.1.1.tgz`; the web install also hits a missing `xmlhttprequest-ssl-2.1.2.tgz`). Therefore Prisma CLI `generate/validate` and the Vite production build must be rerun on the deployment host with a working npm registry.

Before trial deploy:

```bash
npm ci
npm --prefix src/web ci
npm run db:generate
npm run db:deploy
npm run verify
```

Because v7.3.3 adds no migration after v7.3.2, `db:deploy` is expected to report no new migration when the v7.3.2 database is already current.

## Nội dung không đóng gói

- `.env`, token và API key.
- Database runtime.
- `node_modules`.
- Upload, transcript và log runtime.
- Generated dashboard `dist` from an older source tree.
