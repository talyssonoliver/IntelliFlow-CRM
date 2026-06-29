# Specification: IFC-309

**Server-side Terms Acceptance**

| Field | Value |
|-------|-------|
| Task ID | IFC-309 |
| Sprint | 18 |
| Status | Spec Complete |
| Persona/Lens | Compliance (primary) + Security-Lead (secondary) |
| Priority | High — legal compliance signal |

## Overview

Persists an IMMUTABLE server-side TermsAcceptance audit record (tenantId, userId,
termsVersion, acceptedAt, ipAddress, userAgent, route) via tRPC
`termsAcceptance.accept` mutation and `termsAcceptance.getAcceptance` query.
Wires a `TermsAcceptanceConfirm` UI component on `/terms` for authenticated users
only. Replaces the client-only localStorage tracker removed from PG-051, which
was a misleading legal-compliance signal.

## Related Documents

| Type | Path | Status | Action |
|------|------|--------|--------|
| PRD | `docs/planning/prd-legal-pages.md` | Draft | Referenced — already lists IFC-309 |
| ADR | N/A | — | No new architectural decision required; follows established tenantProcedure + direct-Prisma patterns |

## Dependency Verification

| Dependency | Claim | Verified | Method |
|-----------|-------|----------|--------|
| PG-051 | /terms page at `apps/web/src/app/(public)/terms/page.tsx` ships | TRUE | File exists on disk |
| PG-051 | `acceptance-tracker.ts` exports `getTermsOfService()` | TRUE | File at `apps/web/src/lib/legal/acceptance-tracker.ts` |
| PG-051 | Client localStorage tracker removed | TRUE | PG-051 attestation note: "removed out-of-scope TermsAcceptanceBanner and acceptance-tracker.client.ts" |
| IFC-058 | `audit-logger.ts` exists | TRUE | `apps/api/src/security/audit-logger.ts` on disk |
| IFC-124 | `encryption.ts` exists | TRUE | `apps/api/src/security/encryption.ts` on disk |

## Technical Approach

### Layer 1: Prisma Schema (packages/db)

New model `TermsAcceptance` in `packages/db/prisma/schema.prisma`:

```prisma
model TermsAcceptance {
  id           String   @id @default(cuid())
  tenantId     String
  tenant       Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  userId       String
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  termsVersion String
  acceptedAt   DateTime @default(now())          // server-set; never client-supplied
  ipAddress    String?  @db.VarChar(45)          // IPv6-mapped-IPv4 max per DBA-017
  userAgent    String?  @db.VarChar(512)
  route        String   @db.VarChar(255)

  @@unique([tenantId, userId, termsVersion])      // idempotency constraint
  @@index([tenantId])                              // RLS locality
  @@map("terms_acceptances")
}
```

Immutability is enforced by:
1. The router never exposes `update` or `delete` procedures.
2. The `@@unique` constraint plus `upsert({ update: {} })` makes re-acceptance a no-op.
3. No `updatedAt` field (consistent with `AuditLog` pattern at `schema.prisma:1649`).

Prisma reverse relations on Tenant and User models must be added with `@ignore` to
prevent inflating those types (consistent with `schema.prisma:20-50` Tenant pattern).

### Layer 2: tRPC Router (apps/api)

New file: `apps/api/src/modules/legal/terms-acceptance.router.ts`

Uses **plain `tenantProcedure`** (NOT `moduleTenantProcedure('LEGAL')`). Rationale:
all authenticated tenants — regardless of plan — must be able to accept the Terms of
Service. Using the LEGAL module gate would lock STARTER tenants out, a product defect.

Procedures:
- `termsAcceptance.accept` (mutation): idempotent upsert
- `termsAcceptance.getAcceptance` (query): returns current-version acceptance status

### Layer 3: Domain Model (packages/domain)

New file: `packages/domain/src/legal/TermsAcceptance.ts`

A lightweight domain value class (no repository dependency) that validates the
terms version format and models the immutable record. Zero infrastructure deps.

### Layer 4: Web Confirm Component (apps/web)

New file: `apps/web/src/components/legal/TermsAcceptanceConfirm.tsx`

Client component (`'use client'`) embedded in the existing `/terms` page RSC.
Conditionally renders only when: (1) auth is resolved, (2) user is authenticated,
(3) current terms version is not yet accepted. Calls
`api.termsAcceptance.accept.useMutation()`.

Placement: after the terms body, before the contact section. Not a separate route.

## Components

### Files to CREATE

| File | Layer | Purpose |
|------|-------|---------|
| `packages/db/prisma/schema.prisma` | DB | Add TermsAcceptance model (MODIFY existing) |
| `packages/db/prisma/migrations/<ts>_add_terms_acceptance/migration.sql` | DB | Migration for new table |
| `packages/domain/src/legal/TermsAcceptance.ts` | Domain | Domain value class |
| `packages/domain/src/legal/__tests__/TermsAcceptance.test.ts` | Domain tests | Unit tests |
| `apps/api/src/modules/legal/terms-acceptance.router.ts` | API | tRPC router |
| `apps/api/src/modules/legal/__tests__/terms-acceptance.router.test.ts` | API tests | Unit + integration |
| `packages/validators/src/terms-acceptance.ts` | Validators | Zod schemas |
| `apps/web/src/components/legal/TermsAcceptanceConfirm.tsx` | Web | Confirm UI |
| `apps/web/src/components/legal/__tests__/TermsAcceptanceConfirm.test.tsx` | Web tests | Component tests |

### Files to MODIFY

| File | Change |
|------|--------|
| `packages/db/prisma/schema.prisma` | Add TermsAcceptance model + reverse relations on Tenant/User |
| `packages/domain/src/legal/index.ts` | Export TermsAcceptance (or create if missing) |
| `apps/api/src/router.ts` | Mount `termsAcceptanceRouter` at `"termsAcceptance"` key |
| `apps/web/src/app/(public)/terms/page.tsx` | Import and render TermsAcceptanceConfirm (RSC + Client component boundary) |

## Interfaces & Contracts

### Mutation: `termsAcceptance.accept`

```typescript
// Input (caller provides)
z.object({
  termsVersion: z.string().min(1).max(32),  // e.g. "v2026.08"
  route: z.string().min(1).max(255),         // e.g. "/terms"
  userAgent: z.string().max(512).optional(), // navigator.userAgent
})

// Server-extracted (NOT from input)
// ipAddress: pickTrustedForwardedIp(ctx.req.headers['x-forwarded-for']) ?? 'unknown'
// acceptedAt: database @default(now())
// tenantId: ctx.session.tenantId
// userId: ctx.session.userId

// Output
{ accepted: true, acceptedAt: Date }
```

### Query: `termsAcceptance.getAcceptance`

```typescript
// Input
z.object({ termsVersion: z.string().min(1).max(32) })

// Output
{ accepted: boolean, acceptedAt: Date | null }
```

## Integration Points

### Runtime Consumer

`TermsAcceptanceConfirm.tsx` is the sole production caller of
`termsAcceptance.accept` and `termsAcceptance.getAcceptance`.

The component:
1. Calls `api.termsAcceptance.getAcceptance.useQuery({ termsVersion })` on mount
   (with `enabled: isAuthenticated`)
2. Renders nothing while loading or if user is not authenticated
3. Renders a confirmation panel with checkbox + button if `accepted === false`
4. Calls `api.termsAcceptance.accept.useMutation()` on submit
5. Hides the panel after successful mutation (sets local state to accepted)

The current terms version (`termsVersion`) is passed down from the RSC parent via
prop. The RSC calls `getTermsOfService().metadata.version` at build time.

### Legacy Bypass Retirement

PG-051 already retired the client-side localStorage tracker. No existing bypass
path remains — IFC-309 is a net-new addition, not a replacement of a still-active
path.

## Runtime Wiring & Replacement Paths

| Surface | Must Be Called By | Replaces / Blocks | Notes |
|---------|-------------------|-------------------|-------|
| `termsAcceptanceRouter.accept` | `TermsAcceptanceConfirm` submit handler | localStorage tracker (already removed in PG-051) | No auth flow change |
| `termsAcceptanceRouter.getAcceptance` | `TermsAcceptanceConfirm` on mount | localStorage check (already removed) | Gated by `enabled: isAuthenticated` |

## Navigation & Reachability

The `/terms` page already exists at `apps/web/src/app/(public)/terms/page.tsx`
(PG-051). No new page is added. The `TermsAcceptanceConfirm` component is embedded
inline — no new route, no sidebar entry required.

Route conflict audit: no overlapping fake-data pages found in `/terms/**`.

## Acceptance Criteria

**AC-001** — A `TermsAcceptance` Prisma model exists in `schema.prisma` with fields
`id, tenantId, userId, termsVersion, acceptedAt, ipAddress, userAgent, route` and
`@@unique([tenantId, userId, termsVersion])`.

**AC-002** — `termsAcceptance.accept` mutation persists a new `TermsAcceptance` record;
calling it twice with the same `(tenantId, userId, termsVersion)` returns `{accepted: true}`
without creating a duplicate row.

**AC-003** — `acceptedAt` is set by the database (`@default(now())`); the mutation
input schema does NOT accept `acceptedAt`.

**AC-004** — `ipAddress` is extracted server-side from `x-forwarded-for` (rightmost
trusted hop via `pickTrustedForwardedIp`) and is NOT part of the mutation input.

**AC-005** — `tenantId` and `userId` are sourced from `ctx.session`; no caller can
supply them via input.

**AC-006** — `termsAcceptance.getAcceptance` returns `{ accepted: true, acceptedAt }` for
a user who has already accepted the given version, and `{ accepted: false, acceptedAt: null }`
otherwise.

**AC-007** — The tRPC router `termsAcceptanceRouter` is mounted at key `termsAcceptance`
in `apps/api/src/router.ts` and uses plain `tenantProcedure` (not `moduleTenantProcedure`).

**AC-008** — `TermsAcceptanceConfirm.tsx` renders nothing for unauthenticated users or
while auth state is loading.

**AC-009** — `TermsAcceptanceConfirm.tsx` hides itself after a user who has already
accepted the current version loads the page.

**AC-010** — The existing `/terms` page continues to render correctly for unauthenticated
users (the RSC layer is unaffected; the client component gracefully hides).

**AC-011** — A Prisma migration SQL file is present at
`packages/db/prisma/migrations/<ts>_add_terms_acceptance/migration.sql`.

**AC-012** — The `TermsAcceptance` domain model exists at
`packages/domain/src/legal/TermsAcceptance.ts` with zero infrastructure dependencies.

## Non-Functional Requirements

**NF-001** — Mutation p95 latency < 200ms (single upsert, indexed on unique key).

**NF-002** — 100% tenant isolation: `getAcceptance` query always filters by
`tenantId AND userId AND termsVersion` — never by userId alone.

**NF-003** — `ipAddress` and `userAgent` must NOT appear in application logs or OTel
spans (PII protection, GDPR Art. 9).

**NF-004** — Scoped test coverage >= 90% on new lines.

**NF-005** — No UPDATE or DELETE path exposed in the router for TermsAcceptance records
(immutability contract).

## Test Requirements

### New test files

| File | What it tests |
|------|--------------|
| `packages/domain/src/legal/__tests__/TermsAcceptance.test.ts` | Domain value class instantiation, version validation |
| `apps/api/src/modules/legal/__tests__/terms-acceptance.router.test.ts` | accept mutation (first call), accept idempotency (second call returns same result, no duplicate row), getAcceptance (accepted / not accepted), tenant isolation (cross-tenant query returns false), missing auth rejects |
| `apps/web/src/components/legal/__tests__/TermsAcceptanceConfirm.test.tsx` | Renders null for unauthenticated, renders null when already accepted, renders form when not accepted, calls accept mutation on submit, hides after success |

### Existing regression suites to re-run

- `pnpm --filter @intelliflow/web test -- src/app/(public)/terms/__tests__/page.test.tsx`
  (AC-010 regression: public page must still render for unauthenticated users)
- `pnpm --filter @intelliflow/api test` (full API suite; `tenantProcedure` auth tests)
- `pnpm --filter @intelliflow/domain test` (domain package suite)

### Security-sensitive negative-path tests (MANDATORY)

- `accept` with mismatched `tenantId` from ctx vs input must be rejected
  (tenantId is never accepted as input — test that supplying a fake tenantId via any
  path does NOT affect the stored record)
- `getAcceptance` must return `{ accepted: false }` for a valid userId that accepted
  under a DIFFERENT tenantId (cross-tenant probe)
- Unauthenticated call to `termsAcceptance.accept` must throw UNAUTHORIZED

## Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|-----------|
| PII in spans: ipAddress logged | HIGH | Explicitly exclude `ipAddress`/`userAgent` from OTel attributes; add a lint guard |
| acceptedAt client-writable | HIGH | Zod input schema must NOT include `acceptedAt`; DB `@default(now())` is the sole source |
| Cross-tenant getAcceptance leak | HIGH | Always filter by `tenantId` from `ctx.session`, never from input |
| User deletion + erasure | MEDIUM | `onDelete: Cascade` on User relation — acceptable; preserves record only while user exists |
| termsVersion mismatch | MEDIUM | The UI reads `terms.metadata.version` from `getTermsOfService()` — must be the same string stored in DB |
| `/terms` page performance | LOW | Client component added; RSC shell is unaffected; component lazy-loads only for authenticated sessions |

## Agent Sign-offs

| Agent | Files Reviewed | Decision |
|-------|---------------|----------|
| Compliance | `apps/api/src/security/client-ip.ts:20-27`, `packages/db/prisma/schema.prisma:1649-1673,2461-2524,2072`, `.specify/sprints/sprint-17/attestations/PG-051/attestation.json:85` | APPROVE |
| Backend-Architect | `apps/api/src/router.ts:118,150-154`, `apps/api/src/trpc.ts:291-327,388-391`, `apps/api/src/context.ts:97-107`, `apps/api/src/modules/public-feedback/public-feedback.router.ts:36-39`, `packages/db/prisma/schema.prisma:20-50` | APPROVE |
| Frontend-Lead | `apps/web/src/app/(public)/terms/page.tsx`, `apps/web/src/lib/legal/acceptance-tracker.ts`, `apps/web/src/components/legal/dpa-signature-panel.tsx`, `apps/web/src/lib/auth/AuthContext.tsx` | APPROVE |
| Task-Executor (lead) | All files above | APPROVE — consensus achieved |
