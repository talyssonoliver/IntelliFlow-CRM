# Sprint 18 — IFC-309 Session Issues Log

**Task:** IFC-309 Server-side Terms Acceptance **Executor:** task-executor agent
**Session date:** 2026-06-29

## Issues Encountered

### Issue 1: Plan file name CSV mismatch

**Category:** CSV Artifact Alignment

**Description:** The Sprint_plan.csv "Artifacts To Track" column lists
`apps/api/src/modules/legal/legal.router.ts` for IFC-309. This file does not
exist in the codebase — the existing legal module routers are `cases.router.ts`,
`appointments.router.ts`, `documents.router.ts`, etc. The correct implementation
file is `terms-acceptance.router.ts`.

**Resolution:** Implemented as `terms-acceptance.router.ts`. The plan documented
this delta with justification. The orchestrator will update the CSV post-merge.

### Issue 2: Test DB migration conflict

**Description:** The local test DB (`intelliflow-postgres-test:5433`) had a
migration conflict on `20260608000003_add_opportunity_stripe_customer` — the
column `stripeCustomerId` already existed in `opportunities` (migration had been
applied manually without recording in `_prisma_migrations`). A second migration
(`20260609000001_adr_007_data_governance`) was in a failed state.

**Resolution:**

1. Marked `20260608000003_add_opportunity_stripe_customer` as applied via
   `prisma migrate resolve --applied`
2. Marked `20260609000001_adr_007_data_governance` as rolled-back then
   re-applied via `prisma migrate resolve --applied`
3. Applied IFC-309 migration `20260629000000_add_terms_acceptance` successfully

**Impact:** No impact on IFC-309 schema. Pre-existing DB state issue, not
introduced by this task.

### Issue 3: Domain package barrel export rebuild required

**Description:** After adding `export * from './legal/TermsAcceptance'` to
`packages/domain/src/index.ts`, the build was required immediately (per
CLAUDE.md: "Always rebuild affected package after modifying barrel exports").
Vitest resolves `@intelliflow/domain` from `dist/index.mjs`.

**Resolution:** Ran `pnpm --filter @intelliflow/domain build` before running
tests. All tests passed after rebuild.

## No Security Issues Found

- No PII logged or span-attributed in `terms-acceptance.router.ts`
- No client-supplied fields (acceptedAt, ipAddress, tenantId, userId) accepted
  in input schemas
- Cross-tenant isolation enforced: `getAcceptance` always filters by `tenantId`
  from session context

## Red Flags: None

No disabled security controls, TODO stubs, or production mocks introduced.
