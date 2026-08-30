# Minecraft card polish verification

Status: DONE. Baseline **22/22 PASS**; polished renderer **24/24 PASS**; isolated Chromium **9/9 PASS**. Both test files passed Node syntax checks. Browser completion: 2026-08-30 11:05 ICT.

## Before/after renderer evidence

Before production edits, the real worker generated nine baseline PNGs in `before/`. All nine SHA256 hashes exactly matched the completed previous card design; those baseline files were rechecked and remain unchanged. The same fixtures generated nine polished PNGs in `after/`, each still 1000×360.

All nine after images were directly inspected: rank, level-up, long Vietnamese name/guild, wide characters, largest safe integer values, 0%/100% XP, orange accent, and generated pixel avatar. The baseline and polished level-up images were compared directly. The new depth/framing/sparkles do not cover names, values, or progress text. Gold level-up decoration remains distinct from rank decoration. Empty XP is visually empty; full XP reaches the end.

- Rank: [before](before/sample-rank-card.png) · [after](after/sample-rank-card.png)
- Level-up: [before](before/sample-level-up-card.png) · [after](after/sample-level-up-card.png)
- Bounds: [Vietnamese](after/sample-vietnamese-name-card.png) · [wide text](after/sample-wide-name-card.png) · [large values](after/sample-large-values-card.png)
- Variants: [empty XP](after/sample-empty-xp-card.png) · [full XP](after/sample-full-xp-card.png) · [custom accent](after/sample-custom-accent-card.png) · [avatar](after/sample-avatar-card.png)

All existing 22 tests remain intact, including font painting, avatar validation/download bounds, redirects/timeouts, worker capacity/recovery, safe mentions, and embed fallbacks. Two focused tests were added:

1. Repeated SVG generation is deterministic; both modes contain exactly five bounded sparkle paths; large member/guild/level inputs do not change sparkle geometry; mode colors are preserved; no filters or animation are introduced.
2. Both XP gleam paths sit inside the existing progress clip. Real PNG rendering with and without those paths is identical at 0% and different at 100%, proving the decoration paints only when progress exists. Existing partial/clamped progress assertions also pass.

## Browser and preview evidence

The unchanged reusable browser harness passed all nine scenarios: initial loading, form/JSON unknown-field round trip and save, invalid JSON/save failure draft protection, failed/malformed configuration recovery, manual/periodic refresh preserving drafts, reward-state/retry truth, unsaved navigation/reload/reset confirmation, keyboard palette behavior, and mobile menu/focus/overflow.

Press Start 2P loaded from the local asset and painted distinct canvas glyph metrics; Material Symbols also painted correctly. Every scenario had zero font HTTP failures, failed font requests, external-host requests, unexpected API requests, and uncaught page errors. Default/custom accents and the image-disabled embed notice passed. The actual labeled preview was scrolled into view; all four desktop/mobile dark/light captures plus custom-accent/image-disabled capture were directly inspected. At 375px there was no document/body horizontal overflow.

- [Desktop dark](browser/browser-rank-preview-desktop-dark.png) · [desktop light](browser/browser-rank-preview-desktop-light.png)
- [Mobile dark](browser/browser-rank-preview-mobile-dark.png) · [mobile light](browser/browser-rank-preview-mobile-light.png)
- [Custom accent, images disabled](browser/browser-rank-preview-custom-accent-image-disabled.png)
- [Machine-readable browser result](browser/browser-smoke-results.json)

## Executed commands

From the repository root (the baseline used `reports/before`; final render used `reports/after`):

```powershell
$env:LEVEL_CARD_PREVIEW_DIR = 'C:/Users/hp/IdeaProjects/Discord/discord-bot-smart/plans/260830-1100-minecraft-card-polish/reports/after'
node --test tests/level-presentation.test.js
$env:PLAYWRIGHT_MODULE = 'C:/Users/hp/AppData/Local/npm-cache/_npx/420ff84f11983ee5/node_modules/playwright/index.mjs'
$env:LEVEL_BROWSER_REPORT_DIR = 'C:/Users/hp/IdeaProjects/Discord/discord-bot-smart/plans/260830-1100-minecraft-card-polish/reports/browser'
node tests/browser/level-dashboard-smoke.mjs
node --check tests/level-presentation.test.js
node --check tests/browser/level-dashboard-smoke.mjs
```

The harness used the existing Playwright installation, its own localhost Vite server and fresh browser profiles, test-only auth/config/operations fixtures, and blocked sockets/external hosts. It closed its owned server/browser cleanly. No production bot/API/database/Discord/Minecraft process or connection was started. No package/font changes or browser-harness edits were needed for this polish verification.

## Limits

This is real local worker rasterization plus Chromium testing of the actual Vue app with isolated HTTP fixtures. Live authentication/services, production security headers, other browsers, full assistive-technology coverage, and production deployment were not tested. The before/after images are inspected evidence rather than an automated visual-diff threshold. No unresolved blocker remained in the tested scope.
