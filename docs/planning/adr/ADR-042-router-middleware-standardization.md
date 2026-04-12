# ADR-042: Router Middleware Standardization

**Status:** Accepted

**Date:** 2026-03-10

**Deciders:** Backend Team, Security Team

**Technical Story:** IFC-194

## Context and Problem Statement

IntelliFlow CRM's API routers have inconsistent tenant context access patterns.
Some routers use `tenantProcedure` (the recommended middleware chain that
provides `ctx.tenant.tenantId` and `ctx.tenant.userId`), while others use
`protectedProcedure` with manual `getTenantId(ctx)` and `getUserId(ctx)` helper
functions that duplicate the same validation logic. This inconsistency creates
maintenance burden, potential security gaps (different validation paths), and
makes the codebase harder to audit for tenant isolation compliance.

## Decision Drivers

- **Security consistency**: All tenant-scoped endpoints must use the same
  validated tenant context (IFC-127, ADR-004)
- **Code duplication**: 6 routers define their own `getTenantId`/`getUserId`
  helpers with slightly different implementations
- **Auditability**: A single middleware path is easier to audit and enforce
- **Developer experience**: New routers should follow one clear pattern
- **Test maintainability**: Fewer patterns to mock in tests

## Considered Options

- **Option 1**: Migrate all routers to `tenantProcedure` and remove manual
  helpers
- **Option 2**: Create a shared `getTenantId` utility function (keep
  protectedProcedure)
- **Option 3**: Leave as-is with documentation guidance

## Decision Outcome

Chosen option: "Option 1 — Migrate all routers to tenantProcedure", because it
provides defense-in-depth (tenant validation at middleware level), eliminates
code duplication, and aligns with ADR-004's multi-tenancy architecture which
mandates tenant isolation at every layer.

### Positive Consequences

- Single tenant validation path — easier to audit and update
- `ctx.tenant` provides both `tenantId` and `userId` — no more separate helpers
- Architecture test enforces the pattern going forward
- Aligns with ADR-004 and IFC-127 tenant isolation design

### Negative Consequences

- Test fixtures that mock `protectedProcedure` may need updating to mock
  `tenantProcedure` context shape instead
- Routers that genuinely need auth without tenant scope (e.g., user profile)
  should stay on `protectedProcedure` — migration must be selective

## Implementation Notes

### Routers Requiring Migration

| Router                     | Helper Functions           | Call Count | Current Procedure           |
| -------------------------- | -------------------------- | ---------- | --------------------------- |
| `analytics.router.ts`      | `getTenantId`              | 13         | `protectedProcedure`        |
| `home.router.ts`           | `getTenantId`, `getUserId` | 7+10       | `protectedProcedure`        |
| `activity-feed.router.ts`  | `getTenantId`              | 4          | `protectedProcedure`        |
| `feedbackSurvey.router.ts` | `getTenantId`              | 4          | `protectedProcedure`        |
| `ticket.router.ts`         | `getTenantId` (async)      | 7          | Mixed                       |
| `notifications.router.ts`  | `getUserId`                | 9          | `tenantProcedure` (partial) |

### Migration Pattern

```typescript
// BEFORE
const tenantId = getTenantId(ctx);
const userId = getUserId(ctx);

// AFTER
const tenantId = ctx.tenant.tenantId;
const userId = ctx.tenant.userId;
```

### Validation Criteria

- [ ] All 6 routers migrated to tenantProcedure
- [ ] Manual getTenantId/getUserId helpers removed
- [ ] Architecture test enforces tenantProcedure usage
- [ ] All existing tests pass with updated context mocks
- [ ] Zero functional regressions

### Rollback Plan

Revert the procedure change from `tenantProcedure` back to `protectedProcedure`
and restore the helper functions. Since the underlying auth and tenant
validation logic is unchanged, rollback is low-risk.

## Links

- Refines [ADR-004: Multi-tenancy Architecture](./ADR-004-multi-tenancy.md)
- Related:
  [ADR-025: Tenant ID Normalization](./ADR-025-tenant-id-normalization.md)
- Related: [ADR-003: Type-Safe API Design](./ADR-003-type-safe-api-design.md)
- Task:
  [IFC-194](../../apps/project-tracker/docs/metrics/_global/Sprint_plan.csv)
