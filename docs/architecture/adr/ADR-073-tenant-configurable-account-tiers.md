# ADR-073: Tenant-Configurable Account Revenue Tiers

**Status:** Proposed

**Date:** 2026-10-07

**Deciders:** Talysson Oliveira (owner ruling A, 2026-10-07), PG-196 spec
session

**Technical Story:** PG-196

## Context and Problem Statement

Account tiers are computed from four hard-coded annual-revenue bands in the
domain (`packages/domain/src/crm/account/Account.ts` — `ACCOUNT_TIERS`,
`getAccountTier`, IFC-273). A divergent copy lives in
`packages/application/src/services/AccountService.ts`, and the web hard-codes
labels and colours in `AccountCard.tsx`, `AccountDetail.tsx`,
`AccountHierarchy.tsx`, the Account Settings hierarchy tab and the accounts
sidebar. The sidebar tier links (`/accounts?tier=…`) are read by nothing.

PG-196 must let each tenant configure tiers (names, thresholds, colour,
benefits, default tier, up/down rules) while every consumer reads one
configuration. Where should tier classification live, and is the tier stored or
derived?

## Decision Drivers

- One tier system; owner ruling forbids a second parallel vocabulary.
- Domain stays infrastructure-free (`packages/domain/CLAUDE.md`).
- Migration must be Class A (additive, no backfill) per ADR-069.
- Zero visible change for tenants who never edit their tiers.
- Server-side filtering must agree with what the UI displays.

## Considered Options

1. **Derived tier from tenant config through one pure domain resolver** — config
   persisted per tenant; `resolveAccountTier(revenue, config)` in the domain;
   defaults equal today's constants.
2. **Persisted tier column on Account** — recomputed on revenue/config change,
   enabling hysteresis and manual overrides.
3. **Keep domain constants, overlay labels/colours only in the web** — no
   threshold configurability.

## Decision Outcome

Chosen option: **1**, because it is the only option that meets every driver:
configuration is data, classification stays a pure domain function, the
migration only adds tables, and changing a threshold re-tiers every account
immediately and truthfully. Option 2 needs a backfill and recalculation jobs
(Class B) for features nobody has asked to be wired; option 3 contradicts the
ruling (thresholds must be configurable).

### Positive Consequences

- `getAccountTier`, `AccountService`, API filters and the web all resolve via
  `resolveAccountTier`; the default config reproduces IFC-273 behaviour exactly.
- `account.list` can translate a tier key to a revenue band in SQL.
- No data migration; tenants without rows get in-memory defaults.

### Negative Consequences

- Tier history, hysteresis and manual overrides are not possible without a later
  persisted-tier decision (would supersede part of this ADR).
- Every tier consumer needs the tenant config (one cached query on the web; one
  read per request on the API).
- Tier-change notifications are sent from the API layer after a revenue update
  (best-effort pre-read). The future home is a handler on the existing domain
  `AccountRevenueUpdatedEvent`, which cannot resolve tenant config itself.

### Constraints recorded during the spec session

- Writes are ADMIN-only (`adminTenantProcedure`); there is no OWNER role.
- `UNKNOWN` is a reserved key (null revenue with no default tier).
- Configuration is replaced by delete-and-recreate inside one transaction,
  serialised by an optimistic `updatedAt` check on the config row, so threshold
  swaps never collide with the `(tenantId, minRevenue)` unique index.

## Links

- Spec: `.specify/sprints/sprint-18/specifications/PG-196-spec.md`
- PRD: `docs/planning/prd-module-settings.md` (PG-196 Addendum)
- Related: IFC-273 (canonical tier vocabulary), ADR-069 (migration risk classes)
