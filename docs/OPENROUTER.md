# OpenRouter AI Provider — v7.3.3

v7.3.3 keeps all optional real-AI workloads on OpenRouter and adds trial diagnostics/failover:

- Intent classification when the deterministic Rule Engine is uncertain.
- Grounded answers over verified Knowledge Base evidence.
- Ticket triage (summary, priority suggestion, tags, missing information, escalation signal).
- Embeddings used by hybrid Knowledge search/reindex.

The deterministic Rule Engine, keyword Knowledge search and safe ticket workflows continue to work without an API key.

## Dashboard setup

1. Sign in as a staff account with `config.manage`.
2. Open **Cấu hình → Smart Assistant**.
3. In **OpenRouter AI Provider**, paste the key into **OpenRouter API Key**.
4. Keep the default main model `google/gemma-4-26b-a4b-it:free` or enter another OpenRouter model slug.
5. Click **Test OpenRouter** to validate an unsaved key/model, then **Lưu cấu hình** to persist it.
6. Enable only the AI features you need (`smartAiEnabled`, Knowledge AI, ticket triage, etc.).

The Dashboard never receives the saved key again. It only receives a masked hint such as `sk-or-v1…abcd`, provider status, and key source.

## Secret storage

Dashboard keys are stored in `AiProviderCredential`, not `GuildConfig`:

- AES-256-GCM via the existing `WEBHOOK_ENCRYPTION_KEY` key material.
- A short SHA-256 fingerprint is stored only for operational identification.
- Audit logs record the masked hint/fingerprint, never the raw key.
- Updating or deleting a key clears the API-process credential cache.
- Bot-side credential lookup has a short cache and reads the same encrypted database record.

For production, keep `WEBHOOK_ENCRYPTION_KEY` stable and backed up. Rotating it requires re-encrypting stored secrets or re-entering provider/webhook secrets.

## Environment fallback

A secret manager can be used instead of Dashboard storage:

```dotenv
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_MODEL=google/gemma-4-26b-a4b-it:free
OPENROUTER_FALLBACK_MODEL=openrouter/free
OPENROUTER_ANSWER_MODEL=
OPENROUTER_TRIAGE_MODEL=
OPENROUTER_EMBEDDING_MODEL=openai/text-embedding-3-small
OPENROUTER_HTTP_REFERER=https://ticket.example.com
OPENROUTER_APP_TITLE=Discord Smart Ticket
```

A valid Dashboard key takes precedence over `OPENROUTER_API_KEY`; deleting it automatically falls back to the environment key if one exists.

## Workload model routing

- `OPENROUTER_MODEL` / Dashboard **Model chính**: Intent Router and default fallback model.
- `OPENROUTER_ANSWER_MODEL`: optional Grounded Answer model.
- `OPENROUTER_TRIAGE_MODEL`: optional Ticket Triage model.
- `OPENROUTER_EMBEDDING_MODEL`: embedding model sent to OpenRouter `/api/v1/embeddings`.

The default embedding slug is `openai/text-embedding-3-small`; the `openai/` prefix is the OpenRouter model namespace and does not mean the app calls `api.openai.com` directly.

## Reasoning

The Dashboard can enable reasoning and choose `minimal`, `low`, `medium`, or `high`. The request forwards only the effort setting to OpenRouter for compatible models. The bot extracts only final output text/structured output and never sends model reasoning details to Discord or stores them as ticket content.

For this support workload, `low` is the default to limit latency. Grounded-answer correctness still depends primarily on the Evidence Gate and verified Knowledge, not on increasing reasoning effort.

## Failure behavior

Provider failures use existing timeout/retry/circuit-breaker logic. The system does not turn a provider outage into an unsafe privileged action:

- Intent routing falls back to deterministic rules/unknown handling.
- Grounded answers can use verified source text when policy permits, otherwise escalate.
- Ticket triage falls back to heuristic triage.
- Embedding search falls back to lexical Knowledge search.

The **Test OpenRouter** endpoint maps authentication, credit, and rate-limit failures to safe Dashboard messages and does not echo provider secrets.

## Trial Playground and runtime diagnostics (v7.3.3)

Dashboard → **Smart Assistant → OpenRouter AI Provider** includes an AI Playground. It sends a short test prompt through the same encrypted/env credential path and displays final text, actual model, latency and usage counters. Prompt content is not persisted or copied into audit metadata.

The provider status endpoint also exposes in-memory request/retry/failure/circuit metrics for OpenRouter services. These counters reset on API restart and are intended only for trial/debugging.

## Free-model failover (v7.3.3)

When the selected response model is a `:free` model, transient provider/network failures can trigger one additional request using `OPENROUTER_FALLBACK_MODEL` (default `openrouter/free`). Authentication/credit/forbidden failures do not trigger model failover, paid response models are left unchanged, and embeddings keep their configured embedding model. Set `OPENROUTER_FALLBACK_MODEL=off` to disable this behavior.

## Production migration

Back up the database, then run:

```bash
npm ci
npm --prefix src/web ci
npm run db:generate
npm run db:deploy
npm run verify
```

Migration `20260809090000_openrouter_provider_v732` adds provider settings and the encrypted `AiProviderCredential` table. Do not use `prisma db push` in production.
