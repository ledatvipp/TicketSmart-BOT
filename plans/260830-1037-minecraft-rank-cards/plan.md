---
title: "Minecraft Rank Cards"
description: "Minecraft-inspired rank and level-up cards, preserving existing rendering and XP contracts."
status: completed
priority: P1
effort: ""
tags: [design, frontend, feature]
branch: master
blockedBy: []
blocks: []
created: 2026-08-30
---

# Minecraft Rank Cards

## Overview

Visual-only upgrade: original voxel night/forest scenery, beveled square avatar, pixel headings/numbers, readable Vietnamese names and segmented lime XP. Preserve PNG 1000×360, config/API, worker/avatar limits, fallback, XP/outbox/schema/HMAC. No new npm dependencies, deploy/restart/commit, or unrelated worktree edits.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Make real rank/level-up PNGs and dashboard preview clearly Minecraft-inspired and readable | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Start](./phase-01-start.md) | Pending |

## Success Criteria

- [x] Actual PNGs inspected: rank, level-up, long Vietnamese names/guilds, 0%/100% XP, custom accent and avatar fallback.
- [x] Press Start 2P is bundled with OFL; Vietnamese remains Noto Sans; no remote font request at runtime.
- [x] Existing security/failure tests pass; focused visual assertions and dashboard build pass.
- [x] Preview matches the visual language, remains responsive and clearly labeled illustrative.

## Ownership and Dependencies

Controller owns renderer/worker/font assets; frontend worker owns `LevelRankPreview.vue` only; tester owns visual regression tests. Product code begins after controller reviews this plan. Prior premium plan is completed; no unfinished dependency. [Phase detail](./phase-01-start.md), [research and self-review](./reports/260830-design-research-review.md).

## Completion Evidence

Completed 2026-08-30: 22 focused tests, 142 full-suite tests, final syntax/build and 9 browser scenarios passed; real PNGs and final desktop/mobile previews inspected. [Final verification](./reports/260830-final-verification.md).

`ak plan check` marked all phase tasks done; authoritative `ak plan status` reports **1/1 phases, 3/3 tasks, 100%**. This CLI build leaves the Phases table stale; its Pending cell is retained untouched, while frontmatter and acceptance criteria are synchronized here.

<!-- slug: minecraft-rank-cards -->
