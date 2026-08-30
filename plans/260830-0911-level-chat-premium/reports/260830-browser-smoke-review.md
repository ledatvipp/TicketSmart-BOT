# Level dashboard browser verification

Status: DONE. Final run: **9/9 scenarios PASS**, process exit 0, 2026-08-30 09:41 ICT. `node --check tests/browser/level-dashboard-smoke.mjs` also passed.

## Scope and isolation

The reusable harness executes the actual Vue app with its real Vite configuration and Chromium. It owns a strict localhost-only server on `127.0.0.1:5191`, fresh browser profiles, and test-only auth/config/operations HTTP fixtures. External hosts and Socket.IO are blocked. A Vite middleware additionally rejects any API request that escaped fixture routing. No production bot, API, database, real authentication cookies, Discord, or Minecraft connections were started. Browser contexts, browser, and owned server are closed in `finally`.

## Executed checks

| Scenario | Result |
| --- | --- |
| Initial Levels loading resolves; five guided sections; unchanged save disabled | PASS |
| Guided form → JSON → form → save; benign unknown extension fields retained | PASS |
| Invalid JSON prevents save; HTTP save failure preserves editable draft | PASS |
| Failed config load prevents saving; explicit reload recovers | PASS |
| Malformed config prevents saving; explicit reload recovers | PASS |
| Manual refresh and actual 30-second scheduled polling preserve unsaved draft; all five raw reward states remain distinct; only DEFERRED/FAILED offer retry; deferred retry becomes PENDING | PASS |
| Cancelled navigation/reload/reset retain draft; accepted reset uses safe defaults; accepted reload/navigation work | PASS |
| Ctrl+K, search, arrows, Enter routing, focus trap, Escape; clearing query immediately replaces old selection before debounce | PASS |
| 375px mobile has no document/body horizontal overflow; menu focus trap, Escape, focus restoration, inert cleanup, mobile search, both themes | PASS |

Each passing scenario also asserts zero uncaught page errors and zero unspecified API requests. Expected fixture HTTP failures are intentionally tested, not hidden.

## Visual evidence

Full-page and viewport PNGs were captured for desktop/mobile dark/light, palette, mobile menu, config-load errors, malformed config, and save failure. Final desktop light, mobile light, and palette viewport captures were directly inspected; dark views were also inspected during the preceding passing run and final controller review. Layout and icons are legible, and no horizontal overflow was measured at 375px.

- [Desktop dark viewport](browser-levels-desktop-dark-viewport.png)
- [Desktop light viewport](browser-levels-desktop-light-viewport.png)
- [Mobile dark viewport](browser-levels-mobile-dark-viewport.png)
- [Mobile light viewport](browser-levels-mobile-light-viewport.png)
- [Keyboard palette](browser-command-palette-viewport.png)
- [Mobile menu](browser-mobile-menu-viewport.png)
- [Machine-readable final results](browser-smoke-results.json)

The self-hosted static Material Symbols font loaded with all external hosts blocked. The check explicitly loads the font, confirms its loaded state, measures the menu at 20px rather than literal ligature text width, and verifies 144 painted canvas glyph pixels. This avoids accepting `document.fonts.check()` alone when a screenshot is taken before font loading completes.

Earlier failed attempts were harness exact-text selectors that included icon/emoji prefixes in rendered text, not product save/reset failures. Selectors now scope their containing alert/toast/warning and match the message. Older `browser-failure-*` PNGs remain historical artifacts; the final JSON and regular screenshot names represent the passing run.

## Rerun

From repository root, using the already cached Playwright installation (no additional dependency installation required on this machine):

```powershell
$env:PLAYWRIGHT_MODULE = 'C:/Users/hp/AppData/Local/npm-cache/_npx/420ff84f11983ee5/node_modules/playwright/index.mjs'
$env:LEVEL_BROWSER_REPORT_DIR = 'C:/Users/hp/IdeaProjects/Discord/discord-bot-smart/plans/260830-0911-level-chat-premium/reports'
node tests/browser/level-dashboard-smoke.mjs
```

On a machine with an existing resolvable Playwright package, omit `PLAYWRIGHT_MODULE`. Default reports go to `plans/reports/level-dashboard-browser`; override `LEVEL_BROWSER_REPORT_DIR` to select another location. `LEVEL_BROWSER_PORT` can select another unused localhost port.

## Limitations

This is Chromium fixture-backed UI verification, not live OAuth/API/database/Discord/Minecraft integration verification. Production HTTP security headers are not served by Vite. The screenshots are inspected evidence, not a pre-existing pixel-diff baseline. Keyboard checks cover the changed shell and palette, not a full assistive-technology/WCAG audit. No new blocking UI issue remained in the executed scope.
