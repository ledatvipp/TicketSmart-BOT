---
date: 2026-08-30
status: source-passed
---

# Minecraft card polish: independent review

## Spec compliance

Renderer PASS against the approved visual-only phase. The actual SVG includes emerald/cyan radial atmosphere behind the badge, layered corners/avatar framing, deeper stat panels, enlarged diamond and badge pedestal, and five fixed enchantment sparkles with stronger level-up opacity. No additional font, dependency, remote asset or gameplay feature is introduced. Preview source also matches the scoped styling; final browser acceptance remains a separate pending integration gate.

## Quality and contract review

No concrete blocking renderer defect found. Public function signatures, progress normalization, text escaping/truncation, text/avatar clip rectangles, font selection and 1000×360 output remain unchanged from the preceding reviewed implementation. Decoration is fixed geometry: five sparkle paths plus the existing seven stars; no user-driven repetition, animation, filter or external SVG resource is added.

Both XP gleam/shadow paths are inside the existing `xp-fill` clipped group, alongside the lime fill. Its width remains `900 * ratio`, with finite ratio clamped to 0–1: 0% cannot paint gleam into the track and 100% reaches its full width. New scenery is behind content; avatar corners, stat shadows and badge pedestal remain outside the text regions.

Avatar URL/PNG/fetch helpers and worker lifecycle retain the prior restrictions: exact HTTPS Discord CDN PNG routes, rejected redirects, 512 KiB/1024-pixel bounds, two-second fetch deadline, four-second render timeout, two active renders/no queue and safe fallback/recovery. This cosmetic patch does not alter config/API/XP/HMAC behavior.

## Fresh verification

- `node --check src/bot/utils/rank-card.js`: exit 0.
- `node --test tests/level-presentation.test.js`: **22/22 passed**, 0 failed, 0 skipped, exit 0; duration 4.244 seconds.
- Independently inspected [before level-up](./before/sample-level-up-card.png), [after level-up](./after/sample-level-up-card.png) and [after 0% XP](./after/sample-empty-xp-card.png). Added depth is visible; Vietnamese/name/level remain legible, and the empty track has no filled XP gleam.

## Handoff and limits

Renderer and preview source reviews are complete with no blockers. Await focused polish assertions, final browser/build evidence and controller's wider edge-case image inspection before marking the plan complete. No product edits, deployment, restart, commit, or live Discord/Minecraft smoke test were performed by this review.

## Preview integration review

Read the finished `LevelRankPreview.vue`. Its props and validated accent computed value, local `/fonts/press-start-2p.ttf` source, sample values, 61.25% sample progression, text/disclosure, image-off notice and mobile rules remain unchanged. New gradients, fixed decorative sparkle/diamond paths, inset/outer shadows and border/pedestal pseudo-elements add depth without any API, polling, data or animation change. Decorative SVG remains `aria-hidden`/unfocusable; overlay pseudo-elements use `pointer-events: none`. XP gleam is painted on the existing filled span, not the unfilled track.

Fresh independent Vue parse, script/template compilation and scoped-style compilation all PASS, exit 0. Real desktop/mobile browser inspection is still required before completion; compilation alone is not a visual/accessibility claim.
