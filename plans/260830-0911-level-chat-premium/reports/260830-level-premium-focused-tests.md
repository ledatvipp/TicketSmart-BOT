---
title: "Level premium focused tests"
created: 2026-08-30
status: passed
---

# Level premium focused tests

## Summary

Focused run: **32 passed, 0 failed, 0 skipped**, Node-reported duration **3.42 seconds**. Existing service cases retained; 22 new top-level tests added (18 presentation/event, one command-runtime, three configuration tests). No product files modified by this tester.

Command: `node --test tests/level-presentation.test.js tests/level-command-runtime.test.js tests/chat-level-service.test.js`.

All three test files also passed `node --check` before execution. Full suite/build intentionally left to controller. Coverage percentages were not measured.

## Verified Behavior

- Real renderer worker produces 1000×360 PNG rank/level-up cards; independent text-only probe paints Vietnamese font pixels with system fonts disabled.
- XML escaping, invalid/clamped numeric progress, avatar default, and wide-name clipping are protected.
- Avatar HTTPS hostname/path policy, disallowed protocol/credentials/port/hash, forced resize, MIME/header/streamed-size/PNG signature/IHDR/dimension bounds are covered.
- Real loopback HTTP redirect is rejected without following its target. A stalled HTTP body is aborted within its configured deadline.
- Concurrency saturation returns null without queueing; render failures, avatar failures, native worker errors/timeouts release capacity and permit subsequent real rendering.
- Disabled images skip rendering; saturation/render failure retain useful embeds. Definite Discord attachment rejection retries once as embed-only; ambiguous transport errors are not retried.
- Missing AttachFiles permission sends level-up embed without image; level-up reward wording describes queueing rather than delivery.
- Bot/disabled XP processing is skipped; award exceptions do not escape; role/announcement failures are isolated from one another.
- Actual level/rank/leaderboard slash and prefix handlers execute against a local HTTP fixture in a child process. No missing profile import, correct profile/placement/accent, image-disabled behavior, quiet mentions. Admin interaction acknowledgement precedes config fetch and unauthorized access edits the deferred reply.
- Additive defaults/normalized accent preserve benign nested extension keys across round-trip; nested token/secret/password/API-key/credential/private-key/signing-key/encryption-key names are rejected without echoing values; invalid accent/boolean values rejected.

## Preview Inspection

Inspected all three real output images. Vietnamese diacritics render, profile/XP/progress are readable, long W-name clips before the level column, and default avatar is visible. These are explicitly sample profiles, not production member data.

- [Sample rank](./sample-rank-card.png)
- [Sample level-up](./sample-level-up-card.png)
- [Sample wide name](./sample-wide-name-card.png)

To regenerate, set `LEVEL_CARD_PREVIEW_DIR` to this report directory before the focused test run. Normal test runs do not persist preview files.

## Limitations and Recommendations

No failing tests or newly discovered product bugs. Tests exercise API handlers through loopback fixtures and injected error seams, not Discord/Minecraft services. No actual bot/API service started; no runtime database accessed. Native rendering checked on the current Windows host only. Controller still owns full verification, dashboard interaction testing, and residual dependency-advisory documentation.
