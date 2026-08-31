---
phase: 1
title: "Apply moderation and repeat detection"
status: pending
priority: P2
effort: "1h"
dependencies: []
---

# Phase 1: Apply moderation and repeat detection

## Overview

Implement configurable profanity-aware XP calculation and a default 70% similarity cutoff at the durable Level Chat award boundary.

## Requirements

- [x] Normalize and validate `profanityTerms` (bounded string list) and `profanityXpMultiplier` (0.1–0.9); preserve benign extension fields.
- [x] Cap `similarityThreshold` at 0.7 in backend and dashboard validation, retaining lower values for stricter installations.
- [x] Match full normalized words or phrases only, preventing accidental substring matches.
- [x] Calculate reduced XP before profile/ledger updates, retaining `awardedExperience` as the actual XP awarded.
- [x] Surface the fields in the guided Vietnamese Level Chat form.

## Architecture

`messageCreate` continues to call `awardChatMessage`. The service normalizes config/content, rejects repeat messages before any XP mutation, then detects configured profanity and computes a reduced XP integer. The existing transaction writes the actual nonzero amount to the ledger/profile, so rewards and level-up logic naturally use the correct value; a 0-XP profanity entry remains recorded in the ledger only.

## Related Code Files

- Modify: `src/services/chatLevelService.js`
- Modify: `src/web/src/utils/level-dashboard.js`
- Modify: `src/web/src/components/LevelConfigForm.vue`
- Modify: `tests/chat-level-service.test.js`

## Implementation Steps

1. Add safe config defaults, normalizers and phrase matching helpers to the chat-level service.
2. Use the derived XP in the existing atomic award transaction and return whether moderation applied.
3. Align dashboard defaults/validation and add form controls with clear Vietnamese help text.
4. Add regression coverage for config handling, 70% duplicates, exact repeats, clean messages, profanity messages, and multi-level progress.

## Todo

- [x] Service behavior implemented
- [x] Dashboard config contract aligned
- [x] Focused tests added

## Success Criteria

- [x] 70%+ duplicate messages return `similar` and write zero awarded XP.
- [x] A configured profane message receives less XP than its clean equivalent (including 0 XP when normal XP is configured as 1).
- [x] Message, profile and reward updates use the same reduced XP value.

## Risk Assessment

Phrase matching is deliberately configuration-driven to avoid an opaque or over-broad hardcoded moderation policy. The initial default vocabulary is conservative and admins can edit it. Matching against normalized word boundaries avoids unrelated terms being penalized.
