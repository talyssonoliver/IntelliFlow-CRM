# Spec Session Discussion: IFC-309

**Session Date**: 2026-06-29
**Lead**: Task-Executor (compliance persona)
**Agents**: Compliance, Backend-Architect, Frontend-Lead

## Phase 0: Context Hydration

- Task ID: IFC-309, Sprint 18
- PRD: `docs/planning/prd-legal-pages.md` (existing, already references IFC-309)
- Dependencies: PG-051 (COMPLETE), IFC-058 (COMPLETE), IFC-124 (COMPLETE)
- All dependency artifacts verified on disk

## Phase 0.5: Agent Selection

Selected 3 agents:
1. **Compliance** — primary persona (GDPR Art.7, consent fields, immutability)
2. **Backend-Architect** — Prisma model, tRPC router, procedure selection
3. **Frontend-Lead** — /terms page structure, TermsAcceptanceConfirm component

## Phase 0.75: Codebase Exploration

### Key findings:

- **Schema**: No TermsAcceptance model in schema.prisma (grep confirmed empty result)
- **Router**: No `termsAcceptanceRouter` exists in apps/api/src/router.ts
- **Legal module pattern**: Existing legal routers use `moduleTenantProcedure('LEGAL')`
  — BUT terms acceptance must use plain `tenantProcedure` (all plans)
- **IP extraction**: `pickTrustedForwardedIp` at `apps/api/src/security/client-ip.ts:20`
  is the established pattern (used in auth.router.ts:58, public-feedback.router.ts:36)
- **Terms version**: "v2026.08" from `docs/shared/terms-content.md:3`
- **/terms page**: RSC at `(public)/terms/page.tsx` — no auth check, purely static
- **Legal components**: Only `dpa-signature-panel.tsx` exists in `components/legal/`
- **Auth hook**: `useAuth()` from `apps/web/src/lib/auth/AuthContext.tsx:945`

## Phase 0.76: Shared Component Audit

| Need | Existing | Action |
|------|----------|--------|
| Terms confirm panel with checkbox + button | None — closest is `dpa-signature-panel.tsx` but it is legal-domain-specific, not a shared primitive | NEW — create `TermsAcceptanceConfirm.tsx` in `components/legal/` |
| Auth state check | `useAuth()` hook from AuthContext | REUSE |
| tRPC mutation | `api.*useMutation()` pattern | REUSE pattern |

## Phase 0.77: Route Conflict Audit

Route searched: `/terms/**`
- Only file: `apps/web/src/app/(public)/terms/page.tsx` (real content, no fake data)
- No overlapping fake-data pages found
- No route conflict

## Phase 0.9: Dependency Verification

| Dep | Status | Verified |
|-----|--------|---------|
| PG-051 | COMPLETE | `/terms` page + acceptance-tracker.ts exist; localStorage tracker removed |
| IFC-058 | COMPLETE | audit-logger.ts exists; GDPR baseline in place |
| IFC-124 | COMPLETE | encryption.ts + compliance-report.md exist |

All dependencies deliver what they claim. No blocking follow-ups.

## Round 1: ANALYSIS

### Compliance Agent Analysis

- GDPR Art. 7(1) requires: userId, tenantId, termsVersion, acceptedAt, ipAddress, userAgent, route
- `acceptedAt` MUST be server-set (`@default(now())`) — never client-supplied
- Immutability pattern: no `updatedAt`, no update/delete procedures (per `AuditLog` pattern at `schema.prisma:1649`)
- `ipAddress` uses `@db.VarChar(45)` per DBA-017 (IPv6-mapped-IPv4 max)
- PII (`ipAddress`, `userAgent`) must NOT appear in OTel spans
- Idempotency constraint: `@@unique([tenantId, userId, termsVersion])`

### Backend-Architect Agent Analysis

- NEW file `apps/api/src/modules/legal/terms-acceptance.router.ts` — plain `tenantProcedure`
- Rationale against `moduleTenantProcedure('LEGAL')`: STARTER tenants must accept ToS
- `upsert({ create: {...}, update: {} })` = idempotent no-op on re-acceptance
- `ctx.req?.headers['x-forwarded-for']` for IP extraction (follows public-feedback pattern)
- No container.ts wiring needed (direct prisma, no orchestration layer)
- Router key: `"termsAcceptance"` in the "Legal domain" block of router.ts

### Frontend-Lead Agent Analysis

- `/terms` is a public RSC — `TermsAcceptanceConfirm` is a `'use client'` component embedded inline
- Auth via `useAuth()` — check `isLoading`, then `isAuthenticated`
- `api.termsAcceptance.getAcceptance.useQuery` with `enabled: isAuthenticated`
- Component placed in `apps/web/src/components/legal/` (consistent with dpa-signature-panel.tsx)
- `termsVersion` prop passed from RSC parent (server knows the version)

## Round 2: PROPOSAL

### Agreed proposal (all 3 agents):

1. Prisma model `TermsAcceptance` with `@@unique([tenantId, userId, termsVersion])`,
   no `updatedAt`, `acceptedAt @default(now())`
2. New router `terms-acceptance.router.ts` with `tenantProcedure`
3. Domain class `packages/domain/src/legal/TermsAcceptance.ts` (zero infra deps)
4. Zod schemas in `packages/validators/src/terms-acceptance.ts`
5. `TermsAcceptanceConfirm.tsx` in `apps/web/src/components/legal/`

## Round 3: CHALLENGE

### Challenge 1: Plan module gating

Backend-Architect confirms: `moduleTenantProcedure('LEGAL')` is WRONG for this endpoint.
All tenants must accept ToS. `tenantProcedure` is correct. Risk mitigated.

### Challenge 2: acceptedAt server-only

Compliance confirms: input schema must not expose `acceptedAt`. DB default enforces.
Test must verify that supplying `acceptedAt` in input is rejected by Zod schema.

### Challenge 3: PII leak in spans

Risk identified: `ipAddress` and `userAgent` could be inadvertently logged.
Mitigation: explicit exclusion from OTel attributes; negative test asserts no PII in spans.

### Challenge 4: Cross-tenant probe

`getAcceptance` must always filter `{ tenantId: ctx.session.tenantId, userId, termsVersion }`.
A cross-tenant test must verify that userId from TenantA cannot probe TenantB's acceptance.

## Round 4: CONSENSUS

All agents: APPROVE spec as written.

Spec written to: `.specify/sprints/sprint-18/specifications/IFC-309-spec.md`
