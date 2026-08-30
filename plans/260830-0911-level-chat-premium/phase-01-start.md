---
phase: 1
title: "Start: Core Reliability"
status: completed
priority: P1
dependencies: []
---

# Phase 1: Start

## Overview

Repair independently scoped runtime faults. Reliability worker owns this phase; messageCreate is deliberately owned by phase 2 to avoid overlap.

## Requirements

- Config refresh shares one in-flight request and recovers after failure without a refresh stampede; preserve existing public return envelope and stale-cache policy.
- Auto-actions consumes the API response envelope correctly, without modifying scheduling contracts.
- Supervisor remains alive while a restart is pending and still respects shutdown/restart limits.
- Failed command/event module loading cannot publish a partial command set or start a deceptively healthy bot.

## Related Code Files

Modify under `C:/Users/hp/IdeaProjects/Discord/discord-bot-smart/`: `index.js`, `src/bot/index.js`, `src/bot/utils/api.js`, `src/bot/jobs/autoActions.js`. Create narrowly scoped tests under `tests/` following local patterns. Do not edit `src/bot/events/messageCreate.js`, leveling service, frontend, package manifests, or locks.

## Architecture

Keep process/API boundaries unchanged. A single-flight promise wraps config refresh and clears in finally. Startup collects/validates modules before command registration. Restart timers remain referenced until shutdown cancels them.

## Implementation Steps

1. Add focused regressions for concurrent config reads, refresh rejection recovery, auto-action envelope, pending restarts, and startup import failure.
2. Patch only verified faults and preserve logging without leaking secrets.
3. Run each test file, then report changed files and results to controller for integration.

## Todo

- [x] Regression tests and fixes complete.
- [x] Syntax checks and focused tests pass.

## Success Criteria

Concurrent refresh sends one request; failed refresh does not poison later requests. Auto-actions reads intended config. A failed module prevents partial registration. Pending restarts survive loss of all children; intentional shutdown does not restart them.

Verified 2026-08-30: focused reliability coverage and final full suite pass; 138/138 tests, syntax/security gates green. See [final verification](./reports/260830-final-verification.md). Status and all phase checkboxes reconciled; no production process restarted.

## Risk Assessment and Rollback

Preserve stale-cache compatibility and shutdown timing. Use child-process/failure-path tests rather than starting production services. Roll back only this phase's reviewed diff if needed; never reset the dirty worktree. Integration gate is phase 3.
