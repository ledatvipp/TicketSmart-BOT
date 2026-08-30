# Level Chat dashboard implementation

Date: 2026-08-30

## Scope

- Guided Vietnamese settings, advanced JSON, additive image settings, and illustrative rank preview.
- Operational panels show exact reward states and permit retry only for DEFERRED or FAILED records.
- Saved baseline is separate from the draft. Config load failure cannot expose editable fallback defaults; save, reload, reset, navigation, and browser unload are guarded.
- Operational polling is single-flight, pauses for hidden documents, never replaces the draft, and disposes its timer/listeners on unmount.
- Shell components were released to the controller before any edits; no backend/package/lockfile changes by this worker.

## Owned files

- `src/web/src/views/LevelsView.vue`
- `src/web/src/components/LevelConfigForm.vue`
- `src/web/src/components/LevelRankPreview.vue`
- `src/web/src/utils/level-dashboard.js`
- `tests/level-dashboard.test.js`

## Verification

- `node --test tests/level-dashboard.test.js`: 7 passed, 0 failed.
- `npm run build`: passed; Vite 5.4.21 transformed 175 modules. Level route JavaScript approximately 34 KB, CSS approximately 17 KB before gzip.
- `git diff --check -- <owned files>`: no reported whitespace errors; these feature files are untracked in the existing user worktree, so this is not a substitute for the compiler checks.
- Real-browser interaction, responsive screenshot, and keyboard checks delegated to the controller's verification worker; pending when this implementation handoff was written.

## Important behavior

- Empty allowed channels means no EXP. Empty announcement channel means current channel. Empty admin roles preserves Discord Administrator access.
- JSON/form conversion retains benign unknown fields; validation rejects nested token/secret/password/API/private/signing/encryption key names consistently with the server.
- Preview uses clearly labeled sample values and fixed dark navy surface with configurable accent; it is not a real player profile or exact raster preview.
- Worker last-seen is presented as a past verified connection, not proof of current health.
