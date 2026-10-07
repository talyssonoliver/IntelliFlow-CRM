# ADR-074: Territory-Based Account Owner Assignment

**Status:** Proposed

**Date:** 2026-10-07

**Deciders:** Talysson Oliveira (owner ruling A, 2026-10-07); PG-197 spec
session (Domain-Expert, Backend-Architect, Data-Engineer, Frontend-Lead,
Test-Engineer)

**Technical Story:** PG-197 — Module Settings: Territory Mapping

## Context and Problem Statement

Account owners are always the creating user: `handleAccountCreate` hard-codes
`ownerId: typedCtx.tenant.userId`
(`apps/api/src/modules/account/account.router.ts:200`). PG-183 added an
`AccountAutomationSetting.autoAssignOwner` toggle, but nothing reads it.
Accounts also carry no geography at all, so the territory rules that PG-197 asks
for ("by region/country/postcode") had nothing to match against. The owner chose
the full feature: add optional geography to `Account`, model territories, and
make `autoAssignOwner` assign new accounts through the matching territory.

How should a tenant's territories be modelled, and where should the assignment
decision live, so that it is deterministic, race-safe and tenant-isolated?

## Decision Drivers

- Hexagonal rule: business logic in `packages/domain`, zero infra deps.
- Playbook §8: a persisted toggle must have a runtime consumer.
- Tenant isolation: `prismaWithTenant` does not inject `tenantId`, and RLS is
  not FORCEd anywhere, so app-level scoping is the real boundary.
- Concurrency: parallel account creates must not hand the same round-robin slot
  to two accounts.
- Class A migration only (ADR-069): additive, nullable, new tables.
- Reuse over reinvention, but not by bending a model built for something else.

## Considered Options

1. **Reuse `RoutingRule` with a new `ACCOUNT` rule type** (the lead/ticket
   routing table, `schema.prisma:4124`).
2. **Dedicated typed territory tables + a pure domain engine + an API helper
   that does the I/O** (chosen).
3. **Post-create reassignment** through the IFC-311 reassign path.

## Decision Outcome

Chosen option: **2**.

- **Model.** `AccountTerritory` (name, colour, priority — higher first, the
  `RoutingRule` convention — strategy `ROUND_ROBIN | LOAD_BALANCE | MANUAL`,
  `isDefault`, `isActive`, `rrCursor`), `AccountTerritoryRule` (required ISO
  country, optional region, optional postcode prefix stored in match-key form),
  `AccountTerritoryMember` (user, order). Case-insensitive name uniqueness, "at
  most one default" and rule de-duplication are DB indexes; child rows reference
  the territory through a composite `(tenantId, territoryId)` FK.
- **Decision logic** is pure: `resolveTerritory` (first active territory
  matching by rule, highest priority, deterministic tie-break; default as
  fallback) and `pickTerritoryAssignee` (round-robin / least-loaded / none) live
  in `packages/domain/src/crm/account/territory/`.
- **I/O** lives in
  `apps/api/src/modules/account/account-territory-assignment.ts`: load
  territories with explicit `tenantId`, filter members through `tenantUserWhere`
  (ADR-071 memberships), advance the cursor with one atomic `UPDATE … RETURNING`
  (Prisma `{ increment: 1 }`), count owned accounts for load-balance.
- **Trigger.** Only `account.create`, only when no explicit `ownerId` is given
  and `autoAssignOwner` is on. Resolution happens **before** the insert, so the
  `AccountCreatedEvent` carries the final owner. Any resolution failure falls
  back to the creator; account creation never fails because of territories.

### Why not option 1

`RoutingRule.conditions`/`actions` are untyped JSON tied to lead and ticket
vocabularies; `LeadRoutingService` measures load with `AgentAvailability`, not
owned records, and overloads `RoutingAudit.ticketId`. A settings page needs
typed, constrained rows and DB-level invariants that JSON cannot carry.

### Why not option 3

Reassigning after create emits an owner-change event and notification for an
owner that never really held the account, and doubles the writes.

### Positive Consequences

- `autoAssignOwner` gets a real consumer (playbook §8 category 1).
- The engine is fully unit-testable without a database.
- Invariants that matter under concurrency are enforced by Postgres.

### Negative Consequences

- Three new tables and SQL-only indexes that Prisma cannot see (mitigated by
  schema comments and integration tests asserting them).
- Accepted drift: a cursor value is consumed if the create later fails, and
  load-balance is check-then-act (two simultaneous creates may pick the same
  member).

## Links

- Spec: `.specify/sprints/sprint-18/specifications/PG-197-spec.md`
- Owner ruling:
  `.specify/sprints/sprint-18/context/PG-197/PG-197-owner-ruling.md`
- ADR-069 (migration risk classes), ADR-071 (inherited tenant membership)
- Playbook: `docs/planning/module-settings-playbook.md`
