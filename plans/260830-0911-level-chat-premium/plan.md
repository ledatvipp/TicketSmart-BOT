---
title: "Level Chat Premium"
description: "Premium Discord leveling, isolated reliability fixes, secure config, and guided Vietnamese dashboard."
status: completed
priority: P1
effort: ""
tags: [feature, bugfix, frontend, backend, security]
branch: master
blockedBy: []
blocks: []
created: 2026-08-30
---

# Level Chat Premium

## Overview

Approved for autonomous implementation and verification. Preserve XP math, ledger idempotency, outbox leases/statuses, Prisma schema, and LobbySign HMAC contract. Preserve unrelated dirty work. No deploy, restart, commit, or LobbySign edits.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Repair bot lifecycle, config refresh, scheduling, and error isolation | P1 |
| 2 | Local PNG rank/level-up cards with embed fallback and safe additive config | P1 |
| 3 | Guided Vietnamese Level Chat form, truthful operations, responsive accessible shell | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Start](./phase-01-start.md) | Pending |

## Success Criteria

- [x] Focused behavior/failure tests pass; full suite now 138/138, 0 failed/skipped, with no baseline regression.
- [x] Prisma generation/validation, syntax/security scans, temporary DB migration test, and final dashboard build pass.
- [x] Rank and level-up preview inspected; all 9 browser scenarios pass, including desktop/mobile, keyboard, failed-load and unsaved-state behavior.
- [x] Security audit records root 0 / web 2 remaining toolchain advisories without a forced major/engine bump.

## Execution and Ownership

- [Start: reliability](./phase-01-start.md): reliability worker owns supervisor/API cache/auto-actions/bot startup and its tests; may run independently.
- [Premium leveling](./phase-02-premium-leveling.md): controller owns Level Chat service/config security, commands/cards, messageCreate, dependencies, and associated tests.
- [Dashboard UX and verification](./phase-03-dashboard-ux-and-verification.md): frontend worker owns web source/tests; controller owns integration checks and final docs. UI implementation may run alongside phases 1–2; final verification waits for both.
- Shared contract: `imageEnabled: true`, `accentColor: '#5865F2'`; all prior config keys retained. No worker edits another owner's files or dependency locks.
- Completed 2026-08-30: `ak plan check` applied to every phase; authoritative `ak plan status` reports **3/3 phases, 8/8 tasks, 100%**. [Final verification](./reports/260830-final-verification.md).
- CLI quirk: `add-phase`/`check` do not refresh the original Phases table or YAML status. The CLI-owned table above is preserved and stale; all phase/root metadata is reconciled, and authoritative CLI progress plus this execution summary is current.

## Dependencies and Evidence

- No unfinished local plan found; no cross-plan dependency.
- Context: [README](../../README.md), [Level Chat contract](../../docs/LEVEL_CHAT_MINECRAFT.md), [dashboard](../../docs/DASHBOARD_V7.md), [baseline](../reports/260829-1820-level-chat-hardening-validation.md).
- Renderer decision: `@resvg/resvg-js@2.6.2`, bundled Noto Sans TTF with OFL license, isolated worker. Existing dashboard tokens retained.
- Self-review: [scope and risk check](./reports/260830-plan-self-review.md). No unresolved product choices; autonomous implementation already approved.

<!-- slug: level-chat-premium -->
