---
title: "Minecraft renderer independent review"
date: 2026-08-30
status: passed
---

# Minecraft renderer independent review

## Verdict

Source review PASS: no concrete blocking correctness or security regression found in the renderer slice. This is not completion of the wider plan; frontend/browser and final integrated verification remain controller gates.

## Scope and evidence

- Read the current `rank-card.js`, `rank-card-worker.js`, bundled Press Start 2P OFL, plan and phase requirements. No production files changed during review.
- Public exports, PNG 1000×360, progress calculation and image-disabled/embed-fallback behavior remain compatible. Changes are original bounded SVG decoration/layout plus the local pixel-font entry; no new package, XP, schema, outbox or HMAC change.
- The fixed night/forest geometry, grass blocks and diamond are procedural SVG, not copied game textures. Rank and level-up headings/badge colors distinguish modes; configurable accent remains visible on framing/details, while progression stays lime.
- Short English headings and the large level number use Press Start 2P; Vietnamese names/guilds and supporting text retain Noto Sans. The unmodified 118,204-byte pixel font has its accompanying SIL OFL 1.1 license.
- Escaped user text, bounded name/guild strings and separate clip regions protect adjacent content. Level-number font size scales down for long finite values. Progress is finite and clamped, with a bounded segmented bar that supports empty/full states; decoration has no unbounded input-driven loop or nondeterministic source.
- Avatar restrictions remain HTTPS Discord CDN PNG paths only, no redirects, 512 KiB/1024-pixel bounds and a two-second fetch deadline. Rendering retains two active jobs/no queue, four-second worker timeout, worker termination/recovery and local-only font loading. Security helpers were not expanded or weakened by the visual changes.

## Fresh verification

- `node --check src/bot/utils/rank-card.js`: exit 0.
- `node --check src/bot/utils/rank-card-worker.js`: exit 0.
- `node --test tests/level-presentation.test.js`: **22 passed, 0 failed, 0 skipped**, exit 0, 2.836 seconds. Includes real PNG/font/avatar output, finite/segmented progress, escaping/geometry, URL/image/fetch boundaries, concurrency/timeout recovery and presentation fallbacks.
- Visually inspected real [rank PNG](./minecraft-rank.png) and [level-up PNG](./minecraft-level-up.png): readable Vietnamese, clear pixel headings/level number, square avatar and segmented XP, with no visible overlap in these samples.

## Limits and handoff

No live Discord/Minecraft or Linux native-rendering smoke test was performed. This review does not claim final frontend parity, browser coverage, full-suite/build completion or inspection of every edge-case image; the controller/tester own those remaining gates. No deployment, restart or commit occurred. Documentation should be synchronized after frontend ownership is released.
