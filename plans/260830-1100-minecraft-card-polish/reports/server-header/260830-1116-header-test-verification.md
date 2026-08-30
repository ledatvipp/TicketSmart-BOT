---
type: tester
date: 2026-08-30
---

# Server-name header test verification

## Summary

Status: DONE. **29/29 focused tests passed**, zero failures/skips, approximately 4 seconds: 27 presentation tests and 2 command-runtime tests. Both edited test files passed Node syntax checks. Nine 1000×360 sample PNGs were regenerated in this directory.

## Findings

- Sample fixtures now use **IS7MC**, the repository sample brand, rather than the confusing test-community phrase. This is illustrative data, not a live Discord guild-name query or a production hardcoded default.
- Direct SVG tests verify distinct supplied guild names, XML escaping, unchanged 620×30 header clipping, and the neutral `Tên server` fallback for missing/null/empty context. Missing context never substitutes IS7MC.
- The existing injectable `withRankCard` renderer seam confirms guild names pass through unchanged in profile and level-up modes.
- Actual worker PNG byte comparisons prove all four real `/level` and `/rank` slash/prefix paths forward their individual guild names. A separate actual announcement test verifies two different guild names through the level-up event path. No production test hooks were added.
- Existing font/avatar safety, timeout/concurrency, safe-mention, embed-fallback, deterministic decoration, and XP-gleam tests remain passing.

Directly inspected [IS7MC rank](sample-rank-card.png), [IS7MC level-up](sample-level-up-card.png), [long Vietnamese guild](sample-vietnamese-name-card.png), and [wide-character guild](sample-wide-name-card.png). The enlarged server-name text and small server icon remain readable without overlapping the main heading or right badge. The other five regenerated samples cover 0%/100% XP, custom accent, large values, and generated avatar.

## Executed commands

```powershell
node --check tests/level-presentation.test.js
node --check tests/level-command-runtime.test.js
$env:LEVEL_CARD_PREVIEW_DIR = 'C:/Users/hp/IdeaProjects/Discord/discord-bot-smart/plans/260830-1100-minecraft-card-polish/reports/server-header'
node --test tests/level-presentation.test.js tests/level-command-runtime.test.js
```

API interactions used owned localhost HTTP fixtures. Avatar fetching was disabled in the real-command/announcement cases by supplying no avatar URL; rendered avatar samples are generated locally. No production bot/API/database/Discord/Minecraft connection, deployment, commit, or dependency change occurred.

## Recommendations and limits

No blocking fix remains in the tested scope. Browser checks were intentionally not rerun because no Vue code changed. These focused checks do not constitute live Discord delivery testing, a coverage-percentage audit, or a production deployment check; the controller owns broader verification.

## Unresolved questions

None.
