# Delivery Report: PG-204 — Module Settings: Case Types

Run: `exec-PG-204-20261013` · Branch: `feat/pg-204-case-types` · Verdict: **NEEDS_HUMAN** (status In Progress, 90%)

> **PRISMA MIGRATION:** `packages/db/prisma/migrations/20261013120000_case_types` (Class A, additive). It must be
> applied to production manually, before the code that writes `cases.caseTypeId` ships.

## Implemented
- Domain `resolveCaseCreateDefaults` (explicit > case type > PG-190 module default), `CASE_REQUIRED_FIELD_KEYS`,
  `CASE_TYPE_LIMITS`, `CASE_TYPE_ADMIN_ROLES` (ADR-076, accepted).
- DB: `case_types`, `case_type_checklist_items`, `cases.caseTypeId` with a tenant-consistent composite FK, CHECKs, RLS.
- Validators `case-types.ts`; `createCaseSchema.priority` is optional; `caseTypeId` added.
- API `caseTypes` router (list, listActive, create, update, delete, setDefault). `cases.create` applies case types and
  PG-190 defaults, enforces required fields, seeds the checklist as tasks in the case transaction, and preflights the
  tenant. `getById` returns the case type.
- Web `/cases/case-types` (stub replaced in place), a New Case type picker (replaces the unpersisted category list),
  and a case-detail badge.
- Fixed beyond the row: the "Assign to me" default assignee, and a client picker that searched contacts while
  `clientId` references accounts.

## TDD log
RED → GREEN per layer: domain (25 tests), validators (+ case/enum tests), DB integration (16), router (34), case
creation wiring (23), SLA deadline (8), web (≈120 across 11 files). Commits: `9e20fd9c6` … `ed3fc4fb0`.

## Validation (all run in this session)
See `attestation.json` → `validation_results`: full suites domain 2957, validators 2557, adapters 2967, api 7281,
web 12658, integration 357. Typecheck, lint, sonar guard and the builds (incl. web) green; semantic review PASS after
4 real defects were fixed; a11y-expert PASS WITH MINOR (fixed); STOA domain WARN (migration not recorded on the shared
test DB).

## Open
- AC-CT15 Lighthouse ≥ 90: no LHCI credentials; the harness targets production auth (NEEDS_HUMAN).
- Push / PR / pre-ship: runner-owned.
- Tracked: #864, #865, #866, #867 (+ #853).
