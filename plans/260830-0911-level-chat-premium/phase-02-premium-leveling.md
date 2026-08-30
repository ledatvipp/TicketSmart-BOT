---
phase: 2
title: "Premium Leveling"
status: completed
priority: P1
dependencies: []
---

# Phase 2: Premium Leveling

## Overview

Controller delivers locally rendered Discord rank/level-up cards and safe config additions while keeping XP/reward data contracts intact. Context: [Level Chat contract](../../docs/LEVEL_CHAT_MINECRAFT.md).

## Requirements

- Add exact defaults `imageEnabled: true`, `accentColor: '#5865F2'`; normalize/validate them and preserve benign unknown config keys.
- Reject sensitive keys recursively on server-side config writes, including nested objects/arrays; errors must not echo values. Keep signing secrets environment-only.
- Share rank/level-up presentation; all existing slash and prefix commands work, including the missing profile import fix.
- Always retain useful embeds; rendering, avatar, Discord role/announcement, or XP failures cannot prevent ticket logging/AI processing.
- Do not change XP curve, role/reward semantics, outbox schema/statuses/leases, worker HMAC, auth/RBAC, or runtime engine minimum.

## Related Code Files

Modify under `C:/Users/hp/IdeaProjects/Discord/discord-bot-smart/`: `src/services/chatLevelService.js`, `src/bot/commands/level.js`, related `rank.js`/`leaderboard.js` only as needed, `src/bot/events/messageCreate.js`, `src/api/controllers/configController.js` only if required at write boundary, `package.json`, `package-lock.json`, frontend manifests/locks only for compatible security fixes. Create focused renderer/worker helpers in `src/bot/utils/`, licensed font asset, and tests under `tests/`. No schema/migration edits expected. Controller exclusively owns manifests/locks.

## Architecture

Use `@resvg/resvg-js@2.6.2` plus bundled Noto Sans TTF/OFL. Escape all user text in SVG, bound text/layout sizes, render PNG in an isolated worker. Maximum two active jobs; no unbounded waiting queue. Enforce timeout/termination and embed fallback on saturation/failure. Avatar fetch allows HTTPS Discord CDN PNG only, no redirects, maximum 512 KB, maximum 1024 pixels per dimension, two-second timeout; missing/invalid avatars use local default illustration. Do not accept arbitrary renderer URLs or persist rendered cards in SQLite.

## Implementation Steps

1. Add tests protecting config round-trip/defaults, nested sensitive-key rejection, benign unknown keys, command profile lookup, and message XP-failure isolation.
2. Implement additive config validation and shared presentation builder, repair missing API import, and isolate XP handling inside messageCreate.
3. Implement bounded worker rendering, font licensing, CDN image validation, default avatar, and embed fallback. Use existing profile values rather than recomputing XP.
4. Add real PNG signature/dimension tests and timeout/saturation/malformed-avatar/XML escaping failure coverage. Verify optional rendering never blocks core behavior indefinitely.
5. Audit dependency trees; apply compatible security patches only. Record unresolved Vite dev-only advisory if remediation requires a major/engine bump.

## Todo

- [x] Config, commands, event isolation, and renderer implemented with regression coverage.
- [x] Local rank and level-up PNG previews produced for visual inspection.
- [x] Dependency patches remain within compatible engine/API constraints.

## Success Criteria

Rank and level-up include a valid PNG when enabled and available; disabled/saturated/failed rendering still produces a useful embed. Timed-out workers release capacity. Sensitive config never reaches persistence or realtime output; benign extensions survive normalization. Existing XP/outbox/HMAC tests remain green.

Verified 2026-08-30: final combined focused tests 39/39 and full suite 138/138 pass; real PNG/font/failure-path cases and final sample images inspected. Root audit 0; two web toolchain advisories remain documented. See [final verification](./reports/260830-final-verification.md). No schema/HMAC change or live Discord/Minecraft smoke test.

## Risk Assessment and Rollback

Native renderer distribution/fonts are installation risks: verify package compatibility and actual PNG rendering locally, retain OFL attribution, document architecture limits honestly. Worker timeout bounds CPU; fetch timeout/size/type/CDN gates bound avatar risk. Disable `imageEnabled` for presentation rollback without changing persisted XP/rewards. Do not use broad dependency force-fix.
