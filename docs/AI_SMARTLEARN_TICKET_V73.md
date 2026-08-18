# AI / SmartLearn / Ticket Intelligence v7.3

## 1. Ticket AI context

For each new ticket message, the bot can request recent public conversation context through the bot-authenticated API. The default is 8 messages and the configured range is 2–20. Internal notes are excluded and staff messages are labeled separately from user/bot messages.

The current Discord message is removed from the history snapshot before classification so the model does not see it twice. For long tickets, the latest persisted `aiSummary` is also supplied as compact **ticket memory**, preserving the main issue without replaying the entire transcript on every message.

## 2. Evidence-gated Knowledge answers

Retrieval rank alone is not treated as proof. `evaluateKnowledgeEvidence()` combines:

- retrieval score;
- article quality/helpfulness;
- freshness;
- article lifecycle, pinned state, and review deadline;
- minimum score/confidence floor;
- ambiguity between similarly ranked but semantically different sources.

If evidence is weak, ambiguous, or the best article is overdue for review, Grounded Answer returns `sufficient=false` and the ticket is sent to human handling. It does not turn a weak/stale article into a confident answer.

Key settings:

- `smartEvidenceMinScore` — minimum combined evidence score, default `0.50`;
- `smartEvidenceMinTopGap` — ambiguity gap between top sources, default `0.04`;
- `smartKnowledgeFreshnessDays` — freshness window, default `180` days.

## 3. Structured ticket triage

Triage records:

- concise summary;
- suggested priority (`normal`, `high`, `urgent`);
- normalized tags;
- missing information;
- whether human review is required;
- escalation reason;
- triage confidence and evidence score.

Safety properties:

- triage cannot grant compensation, ban/unban, issue ranks or run console commands;
- auto-priority only raises severity;
- auto-tag merges instead of replacing staff tags;
- sensitive auto-escalation is opt-in and rate-limited;
- security, payment, appeal and other sensitive intents still require staff according to policy.

Settings:

- `ticketAiContextMessages` (default 8);
- `ticketAiTriageEnabled`;
- `ticketAiTriageMinConfidence` (default 0.75);
- `ticketAiAutoPriority`;
- `ticketAiAutoTags`;
- `ticketAiAutoEscalateSensitive` (default false).

## 4. SmartLearn Quality Engine

Each candidate now carries:

- `learningScore`: the candidate's learning value/maturity for review prioritization;
- `evidenceScore`: quality of the originating evidence;
- `sourceDiversity`: number of independent users/tickets/sources;
- `conflictScore`: degree of disagreement with existing Knowledge;
- `negativeSignalCount`: explicit failure/negative-feedback evidence;
- `lastSeenAt`: most recent supporting signal.

Candidate learning score blends recurrence, diversity, source confidence, evidence, answer completeness and source reliability. A frequent question from many independent sources is therefore stronger than repeated messages from one user.

Conflict detection includes negation mismatch, preventing high lexical similarity from hiding opposite statements. Explicit negative feedback is considered valuable evidence for review priority, but the failed AI answer is stored as `observedAnswer` and is **not** accepted as a replacement Knowledge answer. For a revision candidate without a verified `proposedAnswer`, reviewers must provide an explicit corrected answer before approval.

Settings:

- `smartLearnMinLearningScore` (default 0.45);
- `smartLearnMinSourceDiversity` (default 1);
- `smartLearnConflictThreshold` (default 0.70);
- `smartLearnReviewIntervalDays` (default 90).

## 5. Learn from resolved tickets

When enabled, closing a ticket can create/merge a SmartLearn candidate. The extraction intentionally uses only:

- the ticket creator's public questions;
- meaningful public replies from recognized staff/claimer.

It excludes internal messages and bot/AI replies. Common password/token/OTP/API-key, e-mail, IP, mention and long-ID patterns are redacted before entering the learning queue.

This feature does **not** publish directly: normal SmartLearn review/conflict/admin gates still apply.

Setting: `smartLearnFromResolvedTickets` (default true).


## 6. Outcome feedback loop

The ticket AI action buttons now create direct quality signals:

- **Đã giải quyết** records a positive feedback signal for the detection and any linked Knowledge source.
- **Cần Staff** records a negative signal before escalation.

This closes the loop between AI answers and real user outcomes. Existing Knowledge feedback thresholds can therefore demote repeatedly unhelpful articles into review instead of leaving them permanently trusted.

## 7. OpenRouter provider + optional model split (v7.3.2)

AI requests now use OpenRouter. The API key can be stored encrypted from **Dashboard → Smart Assistant → OpenRouter AI Provider** or provided through `.env`:

```env
OPENROUTER_API_KEY=
OPENROUTER_MODEL=google/gemma-4-26b-a4b-it:free
OPENROUTER_ANSWER_MODEL=
OPENROUTER_TRIAGE_MODEL=
OPENROUTER_EMBEDDING_MODEL=openai/text-embedding-3-small
```

`OPENROUTER_MODEL` is the fallback for classification, grounded answers and triage. The embedding model ID may still contain an `openai/` namespace, but the HTTP request is sent through OpenRouter's `/api/v1/embeddings` endpoint. See [`OPENROUTER.md`](OPENROUTER.md).

## 8. Production upgrade

Back up the database first, then:

```bash
npm ci
npm --prefix src/web ci
npm run db:generate
npm run db:deploy
npm run verify
```

The v7.3 migration is additive. Existing tickets/candidates receive safe defaults; new quality fields are populated by the new workflows.
