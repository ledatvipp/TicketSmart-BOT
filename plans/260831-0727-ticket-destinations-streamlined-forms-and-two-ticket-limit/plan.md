---
title: "Ticket destinations, streamlined forms, and two-ticket limit"
description: "One-step destination tickets, service destinations, category safety, and a two-ticket ceiling."
status: completed
priority: P1
effort: 6h
tags: [discord, tickets, multicluster, anti-spam]
created: 2026-08-31
---

# Ticket destinations, streamlined forms, and two-ticket limit

## Overview

Turn the public ticket panel into a single destination selection followed by a
two-field Discord modal. Every game cluster, plus the Ủng hộ and Tài khoản
service destinations, routes to its configured Discord category and staff.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Make the destination model configurable and safely bootstrap service destinations. | P1 |
| 2 | Replace the second public select with the standard IGN/support-request modal. | P1 |
| 3 | Enforce two concurrent tickets and protect configured categories from cleanup. | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Design and compatibility](./phase-01-start.md) | Completed |
| 2 | [Implement destination data and ticket workflow](./phase-02-implement-destination-data-and-ticket-workflow.md) | Completed |
| 3 | [Verify ticket limits and category safety](./phase-03-verify-ticket-limits-and-category-safety.md) | Completed |

## Success Criteria

- [x] Public panel displays game clusters plus Ủng hộ and Tài khoản, then opens exactly one two-field modal.
- [x] A destination uses its configured Discord category and role permissions; user-managed categories are never auto-deleted.
- [x] A creator can hold at most two tickets in creating, open, or claimed states, without race-condition bypasses or stale failures blocking them.
- [x] Existing direct option, AI, wizard, and staff workflows remain compatible.

<!-- slug: ticket-destinations-streamlined-forms-and-two-ticket-limit -->
