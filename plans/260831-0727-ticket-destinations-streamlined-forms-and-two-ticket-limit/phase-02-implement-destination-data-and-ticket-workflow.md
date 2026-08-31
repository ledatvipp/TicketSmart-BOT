---
title: "Phase 2: Implement destination data and ticket workflow"
status: completed
---

# Phase 2: Implement destination data and ticket workflow

## Overview

Implement the one-select public workflow. Selecting a configured destination
opens a native Discord modal asking only for the player IGN and support request.

## Requirements

- [x] The destination select contains all active clusters, including the two service destinations.
- [x] Selected destination resolves exactly one active ticket option and preserves option-level staff permissions.
- [x] Modal data is recorded as `minecraft_name` and `support_request`; no password or OTP is requested.

## Implementation Steps

1. Add the schema migration, API validation, cluster bootstrap entries, and dashboard selector.
2. Replace `ticket_cluster_start`'s type-preselect reply with the standard two-field modal and an explicit default-option resolver.
3. Keep direct option, Smart Assistant, complex-form wizard, and existing modal submit paths unchanged.

## Todo

- [x] Add regression tests for option resolution and the destination modal payload.
- [x] Update concise multi-cluster documentation for setup and service destinations.

## Success Criteria

- [x] Select destination → modal → ticket routes to the selected destination’s category.
- [x] Missing/disabled default options fall back to an active in-scope option, avoiding player-facing creation failures.
