# Independent integration review

Date: 2026-08-30

## Scope and method

Reviewed the parent-owned shell diff (`App.vue`, `Sidebar.vue`, `TopNav.vue`, `CommandPalette.vue`, `styles/main.css`, `index.html`) and actual new rank renderer, worker, presentation helpers, Level/Rank/Leaderboard commands, message handler, and Level Chat config normalizer. The guided Level Chat page was not self-reviewed as part of this independent review.

Controller reported prior spec-compliance PASS. Existing dirty Level Chat work predates this premium upgrade; issues in that earlier work are not automatically classified as new regressions. Product files remained read-only; this report is the only review output written.

## Finding and resolution

### Resolved P3: A cleared search briefly kept the previous result actionable

- `src/web/src/components/CommandPalette.vue:92-96` invalidates request generations but sets `loading` to false immediately for an empty or one-character query, without replacing `items` until the 200 ms debounce executes.
- `src/web/src/components/CommandPalette.vue:143` permits Enter to select the existing cursor whenever `loading` is false.
- Sequence: finish searching, clear the input, press Enter within 200 ms. The previous result can still be selected instead of the default commands expected for the cleared query. Old labels and `aria-activedescendant` also remain briefly visible/actionable.
- This retained-row behavior existed before the patch, but remains inside the specifically modified stale-search handling. It is not an authorization bypass or a release blocker.
- Bounded recommendation: handle short/empty queries synchronously by restoring permitted commands and cursor, while continuing to debounce remote searches. Add a clear-and-immediate-Enter interaction regression check.
- Confidence: deterministic source-level state transition; browser reproduction requested from the separate browser reviewer.
- Controller fixed this during review. Re-read current `CommandPalette.vue:92-104`: short queries now reset items, cursor, loading, and error synchronously and return without scheduling the remote-search debounce. The old selection window is removed at the source; the browser worker is adding the interaction regression check.

## Verified controls and non-findings

- Avatar URLs: `src/bot/utils/rank-card.js:30-38` permits only HTTPS Discord CDN PNG routes, disallows credentials/custom ports/fragments, and overwrites query parameters with a bounded size.
- Avatar input: `rank-card.js:41-76` enforces PNG/IHDR checks, dimensions, streaming byte cap, redirect rejection, timeout, and cancellation.
- SVG construction: `rank-card.js:79-117` bounds and XML-escapes user/guild names; accent color is strict hex; avatar content is embedded only after PNG validation. Re-reviewed the controller's additional guild-name clipping at lines 95 and 103: its 620 px clip prevents wide guild text from overlapping the right-hand tag.
- Work bounds: `rank-card.js:119-155` uses worker timeout, worker termination before slot release, a two-render concurrency cap, and embed fallback instead of an unbounded queue.
- Failure handling: `src/bot/ui/level-presentation.js:40-65` skips disabled images, keeps a text embed on render failures, retries only definite Discord rejections, and does not retry ambiguous transport failures. Mentions are suppressed.
- Config security: `src/services/chatLevelService.js:70-109` rejects nested sensitive key names before persistence without echoing values, bounds config bytes, validates additive presentation fields, and retains benign top-level extension objects.
- Message isolation: `src/bot/events/messageCreate.js:92-113` catches XP failures and executes role/announcement side effects independently after award completion. Normal ticket logging remains outside that failure boundary.
- Shell: closed mobile navigation is inert, main content is inert while the drawer is open, Escape/focus restoration is present, and navigation/palette controls have accessible labels. No additional concrete keyboard/security blocker found in source review.

## Font observation and resolution

Initial self-hosted Material Symbols asset was 3,963,852 bytes. The controller reported real browser font probes confirmed painting and attributed the early blank screenshot to capture readiness rather than a broken font. The controller replaced it with a static asset; this reviewer independently checked its current size is **329,240 bytes** and `src/web/src/styles/main.css:9` now declares weight 400 consistently. Same local URL and `font-display: block` are retained. Browser painting evidence belongs to the separate browser review, not this source review.

## Fresh verification

`node --test tests/level-presentation.test.js tests/level-command-runtime.test.js tests/chat-level-service.test.js`

Result: **32 passed, 0 failed**, rerun after the controller's changes, including real worker PNG generation, Vietnamese bundled font rendering, a wide guild/name render with clipping assertions, stalled avatar abort, redirect rejection, worker timeout recovery, definite/ambiguous send failures, config secret rejection, and real command calls through an isolated local HTTP fixture.

No production API, Discord server, database mutation, or deployment was performed. Browser-specific findings remain the responsibility of the already-running browser verification pass.

## Verdict

No open blocking correctness or security finding in the reviewed parent-owned integration. The one low-priority retained-search-row issue was fixed and source-reverified during review. Font size/declaration and wide-guild clipping follow-up changes are consistent with the intended behavior. Browser interaction/screenshot results remain independently owned by the browser verification pass.
