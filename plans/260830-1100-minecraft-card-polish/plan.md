---
title: "Minecraft Card Polish"
description: "Small bounded visual polish for existing Minecraft rank cards and illustrative preview."
status: completed
priority: P1
effort: ""
tags: [design, frontend]
branch: master
blockedBy: []
blocks: []
created: 2026-08-30
---

# Minecraft Card Polish

## Overview

Deepen the existing original Minecraft SVG with emerald/cyan atmosphere, embossed framing, richer diamond/badge, fixed-count enchantment sparkles, stat-panel depth and XP gleam. Preserve 1000×360, text/avatar geometry safeguards, XP and all API/config/security/worker contracts. No dependencies, fonts, remote assets, deployment, restart or commit.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Improve visual depth while retaining readable, truthful progression and a matching mobile preview | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Start](./phase-01-start.md) | Pending |

## Success Criteria

- [x] Before/after real PNGs inspected; rank/level-up, long Vietnamese names, large values, avatar and 0%/100% remain clear and correct.
- [x] Existing 22 renderer/presentation tests plus focused polish assertions pass; no weakened security/fallback checks.
- [x] Matching preview fits 375px; all 9 browser scenarios and final syntax/build pass.

## Ownership and Dependencies

Controller owns `src/bot/utils/rank-card.js`; frontend worker owns `src/web/src/components/LevelRankPreview.vue`; tester owns focused tests and browser harness. Preserve all other dirty edits. Previous Minecraft-card plan is completed; no unfinished dependency. Product changes begin only after controller reviews this plan. [Phase](./phase-01-start.md), [self-review](./reports/260830-plan-self-review.md).

## Server-name follow-up

User requested replacing the sample community title with the server name and a small visual refinement. [Server-name header](./phase-02-server-name-header.md) preserves runtime `guild.name`, improves its pixel nameplate, and regenerates examples with the existing IS7MC brand. Previous verification below records the completed first phase only.

Follow-up completed 2026-08-30: **29/29 focused tests, 148/148 full unit tests, 172 JS/35 Vue syntax PASS**; dynamic guild-name forwarding and actual PNGs reviewed with no blocker. [Header review and final evidence](./reports/server-header/260830-header-review.md). Browser/build were not rerun because this follow-up changes no frontend or dependencies. Current authoritative CLI status: **2/2 phases, 5/5 tasks, 100%**; both phase files are completed. The CLI-owned Phases table remains stale and untouched.

## Completion Evidence — first phase

Completed 2026-08-30: 24/24 focused tests, 144/144 full-suite tests, final syntax/security/migration/build gates and 9/9 browser scenarios passed; before/after PNGs and final desktop/mobile previews inspected. [Final verification](./reports/260830-final-verification.md).

`ak plan check` completed every phase task; authoritative `ak plan status` reports **1/1 phases, 3/3 tasks, 100%**. This CLI leaves the Phases table stale, so its Pending cell remains untouched; frontmatter and acceptance criteria above reflect completion.

<!-- slug: minecraft-card-polish -->
