# ADR-024: Scheduling & Calendar Integration

**Status:** Accepted  
**Date:** 2026-02-02  
**Deciders:** Scheduling Lead, Product Lead, Integration Lead  
**Related Tasks:** IFC-136, IFC-137, IFC-138, IFC-172

## Context and Problem

- Scheduling/appointments and calendar sync (Google/Microsoft) need
  deterministic conflict handling, buffers, ICS correctness, and bidirectional
  sync guarantees.

## Decision

1. **Conflict Policy:** Deterministic conflict detection with buffers; rejects
   overlapping events unless explicitly overridden with audit log.
2. **Buffers/Recurrence:** Buffer rules stored per tenant; recurrence persisted
   as RFC5545; server-side expansion for conflicts.
3. **Calendar Sync:** Bidirectional sync with idempotent upserts; reconciliation
   job resolves drift; webhook retries with backoff.
4. **ICS/Timezone:** ICS uses TZ-aware UTC offsets; all stored timestamps are
   UTC with source TZ metadata.
5. **Evidence:** E2E tests for conflict detection, ICS round-trip, and sync
   reconciliation; artifacts include sync logs and fixture ICS files.

## Considered Options

- Client-side conflict checks only (rejected).
- Poll-only sync (rejected: drift).
- Webhooks + reconciliation + idempotent upserts (chosen).

## Consequences

Positive: Predictable booking, fewer double-bookings, reliable sync. Negative:
More infra for reconciliation and retries.

## Implementation Notes

- Store external event ids + etags; use hash to detect changes; reconciliation
  scheduled; retry policy for webhook failures.
- Timezone library pinned; ICS fixtures checked into tests; drift metrics
  recorded.

## Verification

- MATOP Domain + Automation STOAs verify conflict tests, ICS fixtures, sync
  logs; block on missing evidence.

## Links

- ADR-005 Workflow, ADR-017 Workflow Reliability, ADR-015 Security.

---

## Addendum: UI Library Decision (2026-02-28)

The calendar UI rendering has been migrated from hand-rolled HTML tables to
**Schedule-X** (see ADR-040-calendar-ui-library.md). This decision is purely
presentational — all sync, conflict detection, buffer, and recurrence decisions
in this ADR remain unaffected. The appointment data model, tRPC procedures, and
conflict resolution logic are unchanged.
