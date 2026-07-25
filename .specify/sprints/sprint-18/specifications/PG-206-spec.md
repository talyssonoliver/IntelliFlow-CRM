# PG-206 Specification: Module Settings — Storage Policies

**Task**: PG-206 — Module Settings - Storage Policies
(`/documents/(list)/storage-policies`) **Sprint**: 18 **Status**: Spec Complete
(RETROSPECTIVE) **Date**: 2026-07-25 **Agents**: frontend-lead (load-bearing),
backend-architect, a11y-expert

> ⚠ **RETROSPECTIVE ARTIFACT.** This specification was reconstructed on
> 2026-07-25 from the **already-merged** implementation (PR #626, merge SHA
> `2ec7d0e49`, merged 2026-07-24) as part of the ENG-OPS-003 governance
> catch-up. It was **not** authored before implementation, and it makes no claim
> to have been. Every statement below was verified by reading the merged code on
> `origin/main` at `f4ec0b0cb`; nothing is inferred from the PR description
> alone. It exists so PG-206 satisfies gate 2 of the orchestrator
> definition-of-done ("Spec + plan + exec artifacts all exist") with an honest
> provenance label rather than a fabricated timestamp.

---

## Executive Summary

`/documents/(list)/storage-policies` was a 20-line "coming soon" placeholder.
PG-206 replaces it with a real per-tenant document-retention settings page.

The decisive scoping finding: **the backend already existed.** The
`documentSettings.retentionPolicies` tRPC sub-router
(`getAll` / `updateAll` / `resetToDefaults`) and the `DocumentRetentionPolicy`
model were already shipped and tested, and the `RetentionPoliciesTab` controlled
component already rendered exactly this data inside the Document Settings page.
PG-206 is therefore a **UI-only wire-up with DRY reuse**, not a new vertical.

This directly supersedes two planned artifacts named in the CSV row —
`apps/api/src/modules/legal/storage-policies.router.ts` and
`packages/validators/src/storage-policies.ts`. Neither was created, and neither
should be: creating them would have duplicated a working, tenant-scoped,
transactional router. The CSV `Artifacts To Track` column was reconciled to the
delivered set in this same governance PR.

---

## Phase 0.75 — Codebase Exploration Evidence

All findings verified by reading actual files on `origin/main` @ `f4ec0b0cb`.

| Finding                                                       | File:Line                                              |
| ------------------------------------------------------------- | ------------------------------------------------------ |
| `retentionPolicies` sub-router already exists                 | `apps/api/src/modules/legal/document-settings.router.ts:414` |
| Mounted on the documentSettings root router                   | `apps/api/src/modules/legal/document-settings.router.ts:474` |
| `getAll` seeds defaults inside `$transaction`                 | `document-settings.router.ts:423-428`                  |
| `updateAll` destructive write wrapped in `$transaction`       | `document-settings.router.ts:438-444`                  |
| `resetToDefaults` destructive write wrapped in `$transaction` | `document-settings.router.ts:450-456`                  |
| All three use `tenantProcedure` + `ctx.prismaWithTenant`      | `document-settings.router.ts:415, 435, 449`            |
| Zod `superRefine` rejects duplicate `categoryKey`             | `packages/validators/src/document-settings.ts:198-215` |
| `.min(1)` guard — empty policy array is a compliance hole     | `packages/validators/src/document-settings.ts:204`     |
| Cross-tenant isolation tests already present                  | `apps/api/src/modules/legal/__tests__/document-settings.router.test.ts:562, 848-859` |
| `retentionPolicies` sub-router tests already present          | `document-settings.router.test.ts:699-707`             |
| Reusable controlled component                                 | `apps/web/src/app/documents/(list)/document-settings/components/RetentionPoliciesTab.tsx` |
| Placeholder page being replaced                               | `apps/web/src/app/documents/(list)/storage-policies/page.tsx` (pre-#626) |

---

## Scope

### In scope

1. Replace the placeholder `page.tsx` with a server component that renders a
   `<Suspense>`-wrapped client content component (the PG-200 pattern).
2. New `StoragePoliciesContent.tsx` client component wiring
   `trpc.documentSettings.retentionPolicies.getAll/updateAll/resetToDefaults`,
   reusing `RetentionPoliciesTab` for the row editor.
3. `loading.tsx` skeleton.
4. Component + page tests.
5. Graceful degradation when the LEGAL module is not entitled for the tenant.

### Explicitly out of scope (and why)

| Planned item                            | Disposition                                                                    |
| --------------------------------------- | ------------------------------------------------------------------------------ |
| `storage-policies.router.ts`            | **Superseded** — `documentSettings.retentionPolicies` already provides the API. |
| `packages/validators/src/storage-policies.ts` | **Superseded** — `document-settings.ts` already defines the schema.        |
| `colorToken` CHECK constraint           | **N/A** — retention policies carry no `colorToken`; that requirement belongs to the tags/document-types sub-features. |
| "AI defaults FALSE"                     | **N/A** — no AI-backed field exists on `DocumentRetentionPolicy`.               |
| Archival / cold-storage migration jobs  | **Deferred** — no such backend surface exists; would be a new vertical, not a settings page. Tracked as residual (see below). |

---

## Acceptance Criteria

| #   | Criterion                                                                         | Verification                                  |
| --- | --------------------------------------------------------------------------------- | --------------------------------------------- |
| AC1 | Route renders real retention data from the API; no placeholder text remains       | `page.test.tsx`, `StoragePoliciesContent.test.tsx` |
| AC2 | Save persists via `updateAll` and invalidates the `getAll` query                  | `StoragePoliciesContent.test.tsx`             |
| AC3 | Reset persists via `resetToDefaults` and invalidates                              | `StoragePoliciesContent.test.tsx`             |
| AC4 | Duplicate `categoryKey` is rejected and surfaced on the offending row             | validator `superRefine` + component test      |
| AC5 | `PageHeader` + module-settings-playbook layout; canonical `EmptyState`            | component test + visual review                |
| AC6 | Loading skeleton present (`loading.tsx`)                                          | file exists; route-level Suspense             |
| AC7 | LEGAL-module-disabled tenants get a graceful state, not a crash                   | component test                                |
| AC8 | 4 mandatory validations pass (TypeScript, Tests, Lint, Build) + Lighthouse ≥ 90   | pre-ship gate; attestation `lighthouse-gte-90` |

---

## Residual / follow-up

- **Archival & cold-storage thresholds** named in the CSV Definition of Done have
  no backend model. The delivered page covers **retention periods and legal-hold
  exceptions** only. This is a genuine scope residual, not a silent drop — see
  `docs/operations/governance-retro-audit-2026-07-25.md`.
- The DoD phrase "duplicate (docType, retentionPeriod) pairs" is implemented as
  duplicate **`categoryKey`**, which is the actual uniqueness key on the model.

---

## Evidence

- Merge: PR #626, squash `2ec7d0e49`, 2026-07-24
- Attestation: `.specify/sprints/sprint-18/attestations/PG-206/attestation.json`
  (verdict `COMPLETE`, 7/7 DoD, 4/4 validations, `lighthouse-gte-90` PASS)
- Context ack: `.specify/sprints/sprint-18/attestations/PG-206/context_ack.json`
