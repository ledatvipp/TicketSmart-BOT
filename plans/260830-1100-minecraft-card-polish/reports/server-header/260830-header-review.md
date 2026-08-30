---
date: 2026-08-30
status: passed
---

# Server-name header: independent review

## Spec compliance and source findings

Source PASS; no concrete blocker found. `/level me`, `!level`, `/rank`, `!rank` and level-up announcements already pass the current Discord `guild.name`; `withRankCard` forwards it unchanged. The production renderer contains no IS7MC/test-community hardcoding. Missing/falsy guild context uses the neutral `Tên server` label; IS7MC is illustrative branding, not a forced runtime guild name.

The visual diff is bounded to a fixed fading nameplate/server icon and 16px guild text at y=45. Guild names still pass through NFC/control-character cleanup, a 48-codepoint limit, XML escaping and the existing x=54/y=28/620×30 clipping region. The nameplate ends at x=674; the separate right-hand LEVEL CHAT label and profile/level regions remain unchanged. No new external resource, dependency, font, user-driven geometry or worker/avatar/XP/config/API behavior is introduced.

Fresh `node --check src/bot/utils/rank-card.js` passed, exit 0. Source callers were read directly, not inferred from sample images.

## Focused tests and visual evidence

Fresh `node --test tests/level-presentation.test.js tests/level-command-runtime.test.js` passed **29/29**, 0 failed, 0 skipped, exit 0 (5.139 seconds). Includes arbitrary-name forwarding/escaping/neutral fallback, real slash/prefix command PNG comparison against each guild name, and a real level-up announcement PNG comparison. Existing renderer/worker/avatar/fallback tests remain green.

Directly inspected [rank](./sample-rank-card.png), [level-up](./sample-level-up-card.png), [long Vietnamese name/guild](./sample-vietnamese-name-card.png) and [wide-name clipping](./sample-wide-name-card.png). IS7MC appears clearly on the sample header; arbitrary Vietnamese names remain readable, and wide names stop before adjacent content. No concrete visual blocker found.

## Final regression and completion

Controller's fresh `npm run test:unit` passed **148/148**, 0 failed, 0 skipped, exit 0 (11.311 seconds); `npm run check` passed **172 JavaScript files / 35 Vue components**, exit 0. Controller also inspected the level-up and wide-name PNGs with no overlap. No browser/build rerun was required or claimed: this follow-up changes no Vue or dependencies, and earlier browser/build evidence remains historical.

Both phase tasks were checked through CLI; whole-plan status is **2/2 phases, 5/5 tasks, 100%**. Documentation and journal now distinguish dynamic live guild names from illustrative IS7MC branding. No blocker remains in the approved follow-up. No product edits, deployment, restart or commit were performed by the reviewer; no live Discord/Minecraft test is claimed.
