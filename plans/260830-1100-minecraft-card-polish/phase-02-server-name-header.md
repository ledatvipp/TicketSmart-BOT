---
title: "Phase 2: Server Name Header"
status: completed
---

# Phase 2: Server Name Header

## Overview

Refine the card's server-name header and remove the confusing test-community label from generated examples. Runtime already passes Discord guild.name through rank/level commands and level-up events; preserve that behavior.

## Requirements

- Preserve dynamic server names and escaping/clipping; never hardcode IS7MC in the production renderer. Missing guild context uses the neutral placeholder `Tên server`.
- Add a restrained pixel server icon and embossed nameplate; retain all other geometry, XP and security behavior. Generated examples use IS7MC as the repository's sample brand, not a live guild-name lookup.

## Implementation Steps

1. Controller owns only rank-card.js: improve server header and neutral fallback. Existing website preview already displays IS7MC; no frontend changes required.
2. Tester owns level-presentation.test.js and level-command-runtime.test.js only as needed: update example guild names and assert dynamic guild forwarding/escaping. Render new examples under reports/server-header, preserving prior snapshots.
3. Reviewer checks the source/callers, actual PNGs, focused and broad tests; update the existing docs/journal with the dynamic-name distinction. No deployment/restart/commit or dependency change.

## Todo

- [x] Server-name header and sample labels updated without hardcoding production names.
- [x] Dynamic name tests, render/visual checks and regression suite pass.

## Success Criteria

Real PNG shows IS7MC sample name rather than the test-community label; arbitrary live guild names remain escaped/clipped and flow unchanged through commands/announcements. Long Vietnamese names remain readable with no overlaps. Existing 1000x360 output, worker/avatar limits and fallback remain unchanged.

## Review and rollback

Controller reviewed source callers and this bounded plan before implementation. No missing product decision; IS7MC is illustrative only. Revert only the small header diff if readability regresses; preserve the prior completed polish and unrelated changes.

## Execution Result

Completed 2026-08-30: source/callers and actual IS7MC/long-name PNGs passed review; 29/29 focused tests and 148/148 full unit tests passed with 0 failures/skips, plus syntax for 172 JS/35 Vue. Existing dynamic `guild.name` behavior is proven through real command/announcement PNGs; missing context remains neutral. [Final evidence](./reports/server-header/260830-header-review.md). No frontend/dependency changes, so no new browser/build run; no deployment/restart/commit. Both tasks checked through CLI.
