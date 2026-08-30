# Minecraft card render and browser verification

Status: DONE. Final focused renderer tests: **22/22 PASS**. Final isolated Chromium scenarios: **9/9 PASS**, exit 0 at 2026-08-30 10:53 ICT. Syntax checks passed for both changed test files.

## Renderer coverage

All 18 existing tests were retained, including text escaping, avatar URL/PNG validation, MIME/byte limits, redirects, stalled downloads, worker timeout, concurrency/capacity recovery, safe mentions, embed fallback, ambiguous send failures, and independent XP side effects. Four tests add bounded segmented XP geometry, distinct voxel-card modes/text bounds/accent, an actual pixel-font paint probe, and a locally generated PNG avatar.

- XP clips were checked at 0%, a tiny partial fill, 60%, 100%, excessive, negative, and infinite inputs. The fill stays within the 900×16 track; the 45px slot pattern supplies 20 segments.
- The real worker rendered both bundled Noto Sans Vietnamese and Press Start 2P ASCII. Pixel-font output differed from the equivalent Noto rendering, preventing a missing pixel font from passing through fallback.
- Actual worker PNGs remain 1000×360. Nine generated samples were directly inspected: normal rank, level-up, long Vietnamese name/guild, wide characters, largest safe integer values, empty/full XP, custom orange accent, and a generated pixel avatar. The empty bar has no green fill and the full bar reaches its end. Long text remains inside its region, clear of the level badge. Extreme level values shrink to stay inside the badge; ordinary values remain prominent.
- No live avatar endpoint was used. The sample avatar is original test SVG rasterized locally before being passed through the normal validated-PNG path.

Samples: [rank](sample-rank-card.png), [level-up](sample-level-up-card.png), [Vietnamese](sample-vietnamese-name-card.png), [wide text](sample-wide-name-card.png), [large values](sample-large-values-card.png), [empty XP](sample-empty-xp-card.png), [full XP](sample-full-xp-card.png), [custom accent](sample-custom-accent-card.png), [avatar](sample-avatar-card.png).

## Browser coverage and resolved finding

The first browser run exposed a real development-font failure: importing `src/assets/fonts/press-start-2p.ttf` through relative component CSS produced HTTP 403 because that directory was outside Vite's allowed web root. All nine scenarios failed the local-font guards or explicit font loading. The controller copied the identical font into `src/web/public/fonts/`; the frontend owner changed CSS to `/fonts/press-start-2p.ttf`. Vite's strict filesystem policy and all font assertions were retained. A fresh full run then passed 9/9.

The final run checked initial loading, form/JSON round trips and unknown-field preservation, successful saving, invalid JSON and failed-save draft retention, failed/malformed config save locks and recovery, manual/30-second periodic refresh preserving drafts, distinct reward states and truthful retry controls, unsaved navigation/reload/reset confirmations, keyboard palette navigation/focus/Escape/clear-query behavior, mobile menu focus/inert cleanup, and 375px horizontal overflow.

Added preview checks explicitly load Press Start 2P, verify its FontFaceSet entry is loaded, paint canvas glyph pixels, and compare glyph metrics against fallback. Every scenario asserts zero failed font requests, zero font HTTP errors, zero external host requests, zero uncaught page errors, and zero unspecified API requests. Default and orange custom accents were checked through computed CSS, and `imageEnabled: false` retains the embed-only notice.

Actual preview elements were scrolled into view and captured separately from full-page/viewport screenshots. All four desktop/mobile dark/light preview captures and the custom-accent disabled-image capture were directly inspected: pixel glyphs, grass/diamond detail, lime segmented XP, Vietnamese labels, and illustrative-data notices are visible. The mobile preview fits within 375px without horizontal page overflow.

- [Desktop dark preview](browser-rank-preview-desktop-dark.png)
- [Desktop light preview](browser-rank-preview-desktop-light.png)
- [Mobile dark preview](browser-rank-preview-mobile-dark.png)
- [Mobile light preview](browser-rank-preview-mobile-light.png)
- [Custom accent with images disabled](browser-rank-preview-custom-accent-image-disabled.png)
- [Scrolled mobile viewport](browser-rank-preview-mobile-dark-viewport.png)
- [Final machine-readable browser results](browser-smoke-results.json)

Historical `browser-failure-*` images document the initial font-403 run. Regular screenshot names and the final JSON contain the corrected passing run.

## Reproduce

Run from the repository root. This machine uses the already installed Playwright cache; no package or lockfile changes are required.

```powershell
$env:LEVEL_CARD_PREVIEW_DIR = 'C:/Users/hp/IdeaProjects/Discord/discord-bot-smart/plans/260830-1037-minecraft-rank-cards/reports'
node --test tests/level-presentation.test.js
$env:PLAYWRIGHT_MODULE = 'C:/Users/hp/AppData/Local/npm-cache/_npx/420ff84f11983ee5/node_modules/playwright/index.mjs'
$env:LEVEL_BROWSER_REPORT_DIR = $env:LEVEL_CARD_PREVIEW_DIR
node tests/browser/level-dashboard-smoke.mjs
node --check tests/level-presentation.test.js
node --check tests/browser/level-dashboard-smoke.mjs
```

The browser harness starts and closes its own strict localhost Vite server and fresh Chromium contexts. Test-only HTTP fixtures supply authentication/config/operations; unmocked API requests, external hosts, and Socket.IO are blocked. No production bot/API/database/Discord/Minecraft process or connection was started. Default browser reports remain portable at `plans/reports/level-dashboard-browser`, and an already resolvable Playwright package can be used without `PLAYWRIGHT_MODULE`.

## Limitations

This verifies actual local worker rasterization and the actual Vue app with isolated HTTP fixtures. It does not verify live OAuth/API/database/Discord/Minecraft integration, production HTTP security headers, other browsers, or a full assistive-technology audit. Screenshots are inspected artifacts, not an established pixel-diff baseline. No unresolved blocker remained in the executed scope.
