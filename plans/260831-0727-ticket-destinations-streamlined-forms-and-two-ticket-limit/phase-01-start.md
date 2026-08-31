---
title: "Phase 1: Design and compatibility"
status: completed
---

# Phase 1: Design and compatibility

## Overview

Reuse the existing Cluster, Option, transactional ticket creation, and Discord
modal architecture without adding a second ticket-routing system.

## Requirements

- [x] Treat Ủng hộ and Tài khoản as regular service destinations in the existing cluster catalog.
- [x] Store an optional default option per destination, with a safe compatible fallback while an administrator completes configuration.
- [x] Keep configured category IDs user-owned in every cleanup path.

## Implementation Steps

1. Add `defaultOptionId` to Cluster and expose it through the existing cluster API and dashboard edit form.
2. Bootstrap the two service destinations through the same default-cluster mechanism as game clusters.
3. Define a shared resolver for active, in-scope default options and a shared predicate for protected categories.

## Todo

- [x] Map existing public-panel, create-ticket, category-cleanup, API, schema, and dashboard touchpoints.
- [x] Obtain the dashboard microcopy review.

## Success Criteria

- [x] The data model has one source of truth for destination-to-option/category/staff routing.
- [x] No existing cluster becomes unusable when `defaultOptionId` has not yet been configured.
