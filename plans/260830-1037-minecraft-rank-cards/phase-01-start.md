---
phase: 1
title: "Minecraft-inspired card redesign"
status: completed
priority: P1
dependencies: []
---

# Phase 1: Start

## Overview

Refresh presentation only. Source context: [current contract](../../docs/LEVEL_CHAT_MINECRAFT.md) and [research](./reports/260830-design-research-review.md).

## Requirements

- Original SVG voxel grass, trees/night sky and diamond details; square beveled inventory-style avatar frame, no copied Minecraft textures or logos.
- Press Start 2P for short English headings and level/rank numbers; Noto Sans for Vietnamese/member/guild text. Distinct rank and level-up labels; configurable accent retained, lime XP bar segmented.
- Keep 1000×360 output and all existing APIs/config, clamping, escaping, avatar fallback, worker timeout/concurrency, XP and HMAC behavior.

## Files and Ownership

Workspace `C:/Users/hp/IdeaProjects/Discord/discord-bot-smart/`: controller modifies `src/bot/utils/rank-card.js`, `rank-card-worker.js`, adds licensed font under `src/assets/fonts/` and web font copy/license only if preview requires it. Frontend owns `src/web/src/components/LevelRankPreview.vue`; tester owns `tests/level-presentation.test.js` and any narrowly necessary preview assertions. Presentation helper API stays intact; docs sync follows actual implementation. No shared-file parallel edits.

## Implementation Steps

1. Controller reviews this plan, bundles upstream Press Start 2P/OFL, then builds bounded original SVG scenery and typography; leave security helpers unchanged.
2. Frontend mirrors background/frame/type/progress styling in the existing illustrative preview, preserving its props, responsive sizing and disabled-image notice.
3. Tester checks actual worker PNGs, separate modes, custom accents, long Vietnamese/guild clipping, safe names, 0%/100% segmented progress and existing security/failure paths.
4. Inspect real PNG samples and desktop/mobile preview; fix visual defects, run focused tests/syntax/build, then update only relevant docs and verification report.

## Todo

- [x] Original Minecraft-inspired renderer and licensed fonts implemented.
- [x] Matching responsive preview implemented.
- [x] Focused/security tests, build and real-image visual review pass.

## Success Criteria

Cards look intentionally voxel/game-inspired at full size and typical Discord display size; Vietnamese names remain readable, clipping avoids level/rank overlap, 0% has no filled XP and 100% reaches the end. Avatar errors/render failures still fall back safely. Preview remains explicitly sample data, not an exact live PNG.

## Risks and Rollback

Pixel font coverage/width: restrict it to short ASCII headings/numbers; keep Vietnamese in Noto Sans and bound text zones. Scenery must not compete with foreground contrast. Keep SVG node count bounded and geometry deterministic. Preserve security tests rather than weakening them for changed markup. Roll back only the visual/font diff if needed, not unrelated dirty work.

## Execution Result

Completed 2026-08-30. Renderer and preview source review found no remaining blocker; 22 focused tests and 142 full-suite tests passed. Final preview syntax/build passed after moving the browser font into public assets, without widening Vite access or CSP. Nine fixture-backed Chromium scenarios passed, including local font rendering, custom accent/image-off disclosure and 375px layout. Real rank/level-up and edge-case PNGs plus desktop/mobile previews were inspected. See [verification and limitations](./reports/260830-final-verification.md). CLI checked all three tasks; no deploy/restart/commit or live Discord/Minecraft smoke test.
