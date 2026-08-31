---
title: "Chat XP moderation and repeat-spam protection"
description: "Make Level Chat reward less XP for configured profanity and deny XP for 70%+ repeated messages."
status: pending
priority: P2
effort: "2h"
tags: [feature, backend, frontend]
branch: master
blockedBy: []
blocks: []
created: 2026-08-31
---

# Chat XP moderation and repeat-spam protection

## Overview

Add a bounded, configurable profanity XP multiplier and make 70% content similarity the default repeat-spam cutoff. Preserve the existing ledger, XP formula, reward contract, database schema, and all old config fields.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Apply moderation and repeat detection | P2 |
| 2 | Verify XP moderation | P2 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Start](./phase-01-start.md) | Pending |

## Success Criteria

- [ ] A message containing configured profanity earns the configured fraction of normal XP; it earns 0 only when normal chat XP is the legacy minimum of 1.
- [ ] Exact and 70%+ near-duplicate eligible messages do not earn XP.
- [ ] Existing configs remain valid; dashboard exposes the new settings in Vietnamese.
- [ ] Focused regression tests, syntax check, full test suite, and web build pass.

## Decisions

- Default similarity threshold changes from `0.9` to `0.7`; persisted values above `0.7` are automatically tightened, while lower values remain available for stricter filtering.
- `profanityTerms` is a bounded, editable list normalized with the same accent/case/punctuation rules as chat content.
- `profanityXpMultiplier` defaults to `0.5`; awarded XP is floored. At the legacy minimum of 1 XP per message, profanity earns 0 so it is still strictly lower than clean chat.
- The change adds no Prisma migration and does not delete or rewrite ledger entries.

## Scope boundary

No Discord moderation action (delete, warn, timeout), no machine-learning toxicity service, no deployment/restart, and no LobbySign/HMAC changes.

<!-- slug: chat-xp-moderation-and-repeat-spam-protection -->
