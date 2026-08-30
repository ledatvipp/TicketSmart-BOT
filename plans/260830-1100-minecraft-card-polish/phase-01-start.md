---
phase: 1
title: "Minecraft card visual polish"
status: completed
priority: P1
dependencies: []
---

# Phase 1: Start

## Overview

Visual polish only, building on [completed card design](../260830-1037-minecraft-rank-cards/plan.md) and [current contract](../../docs/LEVEL_CHAT_MINECRAFT.md).

## Requirements

- Emerald/cyan radial atmosphere behind the right badge; layered embossed card corners/avatar frame; richer badge pedestal/diamond; fixed-count enchantment sparkles, especially for level-up.
- Add restrained depth to stat panels and XP gleam without covering text. Clip all filled-bar highlights to progress so 0% is truly empty and 100% reaches the end.
- Preserve dimensions, typography/fonts, escaping/clipping, avatar path/size/loading, finite/clamped XP, deterministic bounded SVG, worker limits/fallback, defaults and API/HMAC contracts. No remote assets/dependencies or unrelated changes.

## Files and Ownership

Controller: `src/bot/utils/rank-card.js` only. Frontend: `src/web/src/components/LevelRankPreview.vue` only. Tester: `tests/level-presentation.test.js` and existing isolated browser harness. Store before/after PNGs and validation evidence in this plan's `reports/`; do not overwrite prior plan artifacts.

## Implementation Steps

1. Save baseline rank/level-up real PNGs in this plan, then apply fixed-geometry decoration within existing text/XP boundaries; retain all security helpers unchanged.
2. Mirror restrained depth/glow/frame/panel/XP styling in the labeled preview, preserving props, local font, image-off disclosure and responsive sizing.
3. Run existing 22 focused tests and new polish invariants; render long Vietnamese names/guilds, large values, avatar, 0%/100%, and compare real before/after output visually.
4. Run syntax/build and all 9 isolated browser scenarios, inspect desktop/375px preview, review source for bounded work, then record exact evidence before completing the phase.

## Todo

- [x] Bounded renderer polish and before/after PNGs completed.
- [x] Matching accessible/responsive illustrative preview completed.
- [x] Focused/security tests, syntax/build, browser and visual review passed.

## Success Criteria

Visibly deeper artwork with unchanged readable content and truthful XP; all acceptance in [plan](./plan.md) verified against actual output, not just SVG assertions.

## Risks and Rollback

Glow/ornament may reduce contrast or simulate XP at 0%; keep atmosphere behind the badge and highlights inside progress clipping. Fixed sparkle counts and simple gradients avoid input-dependent work; no animation, filters or external resources needed. If refinement regresses readability/performance, revert only this polish diff and retain the earlier completed design plus unrelated work.

## Execution Result

Completed 2026-08-30. Every planned task maps to implemented renderer/preview work and [final verification](./reports/260830-final-verification.md): 24 focused tests (all 22 previous checks retained), 144 full-suite tests, final syntax/security/migration/build gates and 9 browser scenarios passed. Actual before/after PNGs and four preview themes were inspected; 0% gleam is additionally proven by real PNG identity. No source-review blocker, new dependency/font, contract change, deployment, restart or commit.
