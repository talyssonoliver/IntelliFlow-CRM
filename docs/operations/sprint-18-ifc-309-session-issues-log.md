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

## Codex Findings (post-implementation)

### Finding C-1: client-controlled termsVersion (HIGH, waived, out-of-scope)

**Codex fingerprint:**
`1a9b1daefb66f274712dc937ab33207efa8ac4ffc65d81cc1f9ffee480db04e6`

**File/line:** `apps/api/src/modules/legal/terms-acceptance.router.ts:86`

```
create: { tenantId, userId, termsVersion: input.termsVersion, ... }
```

**Risk:** An authenticated tenant user can POST `{ termsVersion: 'v2.0' }`
before v2.0 is published. When the server later enforces v2.0,
`getAcceptance({ termsVersion: 'v2.0' })` would find the pre-existing record and
treat the user as accepted — bypassing the future ToS prompt. Attack surface:
authenticated tenant users only; no privilege escalation.

**Why waived / out-of-scope for IFC-309:** The spec's AC-001..AC-012 and
NF-001..NF-005 do not require the mutation to validate `termsVersion` against a
server-owned canonical list. Implementing it requires either a new config
table/lookup or server-side current-version derivation inside the mutation —
both outside IFC-309's scope. The normal web path is authoritative (RSC reads
the current version from `getTermsOfService()` before rendering
`TermsAcceptanceConfirm`).

**Tracking (all three required locations):**

- `tools/audit/codex-review-waivers.yaml`: fingerprint `1a9b1daefb66...`,
  expires 2026-12-31
- `artifacts/metrics/debt-ledger.yaml`: `TERMS-VERSION-SERVER-ALLOWLIST-001`,
  severity low, remediation_sprint 20, gh issue #559
- This log entry (third location)
- gh issue: https://github.com/talyssonoliver/IntelliFlow-CRM/issues/559

### Finding C-2: immutable-upsert-update-path (MEDIUM, waived, design decision)

**Codex fingerprint:**
`0c767e2a267963f30f51e1632bdd0968b9ed872ce76c0f983a251a7b5134d663`

**File/line:** `apps/api/src/modules/legal/terms-acceptance.router.ts:92`

```
update: {}, // immutable — empty update is a no-op (NF-005)
```

**Concern:** Prisma's `upsert` on an existing row routes through the UPDATE code
path. If the table had a no-UPDATE privilege or an immutable-update trigger, the
empty `update: {}` would fail.

**Why waived:** The `terms_acceptances` table has no immutable trigger or
no-UPDATE policy. PostgreSQL with `update: {}` (zero columns set) is a
recognised no-op. This is the plan-approved idempotency pattern (IFC-309 plan
§Step 7, NF-005 coverage, plan-reviewer APPROVE). The alternative (create +
P2002 catch + findFirst) has a TOCTOU gap at high concurrency and is not
required by the spec.

**Tracking:** Waiver in `tools/audit/codex-review-waivers.yaml`, fingerprint
`0c767e2a...`. No separate debt-ledger entry needed (design decision, not a
gap).

## Red Flags: None

No disabled security controls, TODO stubs, or production mocks introduced. All
three required tracking locations populated for each waived finding (C-1 uses
all three; C-2 is a design decision with no follow-up action, waiver-only per
precedent).
