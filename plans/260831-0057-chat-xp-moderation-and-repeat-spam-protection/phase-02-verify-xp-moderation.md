---
phase: 2
title: "Verify XP moderation"
status: pending
priority: P2
effort: "1h"
dependencies: [1]
---

# Phase 2: Verify XP moderation

## Overview

Prove the anti-spam and reduced-XP behavior without changing live data or starting the bot.

## Requirements

- [x] Run focused Level Chat service tests first.
- [x] Run repository syntax check, full test suite, and production web build after shared config changes.
- [x] Review the diff for API/schema/config compatibility and unrelated worktree changes.

## Related Code Files

- Verify: `tests/chat-level-service.test.js`
- Verify: `src/services/chatLevelService.js`
- Verify: `src/web/src/utils/level-dashboard.js`
- Verify: `src/web/src/components/LevelConfigForm.vue`

## Implementation Steps

1. Execute the focused Node test file.
2. Execute syntax and full unit/migration tests.
3. Build the Vue dashboard.
4. Inspect only this plan's product-code diff and report results.

## Todo

- [x] Focused test pass
- [x] Full verification pass
- [x] Compatibility review complete

## Success Criteria

- [x] All requested behavior has direct regression coverage.
- [x] No Prisma migration or public API route/signature change is introduced.
- [x] Existing Level Chat config continues to parse and serialize.

## Risk Assessment

The full suite is required because config is shared between bot, API, and dashboard. Existing untracked plan screenshots are explicitly out of scope and must remain untouched.
