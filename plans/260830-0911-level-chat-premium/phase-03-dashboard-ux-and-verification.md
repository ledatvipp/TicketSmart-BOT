---
phase: 3
title: "Dashboard UX and Verification"
status: completed
priority: P1
dependencies: [1, 2]
---

# Phase 3: Dashboard UX and Verification

## Overview

Frontend worker builds the guided Level Chat experience alongside backend work using the fixed additive contract. Controller performs final integration and docs after phases 1–2. Reuse existing dashboard tokens rather than introducing an unrelated design system.

## Requirements

- Vietnamese form grouped by eligibility, XP/anti-spam, role milestones, Minecraft rewards, and announcement/card settings; retain advanced JSON and benign unknown keys.
- Draft preview is clearly a preview, never fake operational data. Preserve unsaved edits across operational polling; confirm before navigation/reload/reset discards them.
- A config load failure or malformed response cannot expose savable fallback defaults. Loading/saving/error/empty/read-only states are explicit.
- Distinguish PENDING, LEASED, DEFERRED, COMPLETED, FAILED; offer manual retry only where backend supports it (DEFERRED/FAILED).
- Empty channel allow-list means no XP. Blank announcement channel means current channel. Admin role copy reflects Discord Administrator fallback.
- Shell navigation/search, mobile layout, keyboard/focus semantics, accessible labels and meaningful status/error announcements work.

## Related Code Files

Frontend worker may modify under `C:/Users/hp/IdeaProjects/Discord/discord-bot-smart/`: `src/web/src/views/LevelsView.vue`, `src/web/src/App.vue`, `src/web/src/components/Sidebar.vue`, `src/web/src/components/TopNav.vue`, `src/web/src/router/index.js`, existing web styles and narrowly scoped helpers/tests as needed. Do not edit package manifests/locks (controller owns them). Controller updates `docs/LEVEL_CHAT_MINECRAFT.md`, `docs/DASHBOARD_V7.md`, README/security guidance only where behavior warrants, after reading each existing document.

## Architecture

Maintain a loaded server baseline separately from the editable draft; form and JSON operate on one validated draft. Operational refresh updates leaderboard/rewards/setup-status only. Save is enabled only after a successful config load with valid dirty data. Exact shared fields: `imageEnabled`, `accentColor`; no alternate names or migration.

## Implementation Steps

1. Add focused validation/draft/status tests, then implement form/JSON conversion without dropping unknown fields.
2. Add preview, load failure lock, dirty guard, operational refresh separation, retry truthfulness, and corrected explanatory text.
3. Fix shell navigation/mobile/a11y within existing visual language; check desktop/mobile widths and keyboard-only navigation.
4. Controller integrates all owners, runs focused tests then `npm run verify` (Prisma generate/validate, syntax, security scan, unit tests, temporary DB migrations, Vite build).
5. Inspect actual PNG previews and local dashboard UI. Cover save/load failure, JSON syntax error, valid form/JSON round-trip, unknown keys, refresh while dirty, and retry states. Do not claim authenticated/live Discord behavior without executing it.
6. Update scoped user-facing docs and write final verification report with exact counts, commands, residual advisories, and smoke-test limitations.

## Todo

- [x] Guided form, preview, guards, truthful operations, and shell fixes verified.
- [x] Focused and full verification complete without hiding failures.
- [x] Visual artifacts inspected; docs/verification report match actual results.

## Success Criteria

Guided and advanced editing round-trip all supported config; failed initial load cannot save. PENDING is neither relabeled DEFERRED nor offered retry. Polling cannot overwrite draft. Desktop/mobile and keyboard behavior are usable. All baseline tests plus new regressions pass, and full local verification completes against disposable databases only.

Verified 2026-08-30: final browser run 9/9 PASS at 02:41:22.858Z, final full `npm run verify` exit 0 (138 tests, 172 JS/35 Vue, 15 migrations/36 tables, zero FK violations, build 175 modules). Final screenshots/icons and PNGs inspected; independent review has no remaining blocker. See [final verification](./reports/260830-final-verification.md) for fixtures, evidence and limits.

## Risk Assessment and Rollback

Prevent unintended config overwrite and UI/backend validation drift with failure/round-trip tests. Keep preview data labeled and isolate local preview tooling from production credentials. No deploy/restart or production DB mutation. Revert only scoped UI changes if required; preserve dirty user work. Record residual dev-only Vite risk instead of forcing a breaking major.
