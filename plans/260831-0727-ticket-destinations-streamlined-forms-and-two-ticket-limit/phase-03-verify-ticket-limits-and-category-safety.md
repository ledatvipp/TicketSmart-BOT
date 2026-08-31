---
title: "Phase 3: Verify ticket limits and category safety"
status: completed
---

# Phase 3: Verify ticket limits and category safety

## Overview

Make the two-ticket anti-spam rule a hard server-side ceiling and ensure no
configured cluster category is removed by close, delete, or startup cleanup.

## Requirements

- [x] Enforce a cap of two active ticket states regardless of legacy global or option-level values.
- [x] Preserve idempotent retry and transaction locking semantics.
- [x] Protect category IDs configured on both options and destinations.

## Implementation Steps

1. Change schema/default migration values and cap the server-side ticket limit at two.
2. Centralize the protected-category predicate and use it in all bot cleanup routes.
3. Run focused unit/migration/syntax tests, then the shared repository suite and web build.

## Todo

- [x] Test that a legacy option limit cannot bypass the cap.
- [x] Test protected category collection from both options and clusters.

## Success Criteria

- [x] Exactly two concurrent tickets are allowed; the third is denied with a stable 429 error.
- [x] A closed/failed ticket no longer counts; a configured category is never deleted automatically.
