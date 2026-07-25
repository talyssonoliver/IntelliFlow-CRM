# Execution Plan: PG-206 (RETROSPECTIVE)

**Task**: Module Settings - Storage Policies **Sprint**: 18 **Spec**:
`.specify/sprints/sprint-18/specifications/PG-206-spec.md` **Date**: 2026-07-25

> ⚠ **RETROSPECTIVE ARTIFACT.** Reconstructed on 2026-07-25 from the merged
> implementation (PR #626, `2ec7d0e49`). The step checkboxes below are marked
> complete because the **merged code was read and verified**, not because this
> plan drove the work — it did not exist when the work was done. Provenance is
> stated plainly rather than backdated.

---

## Preflight Checks

1. Branch is `feat/pg-206-storage-policies-ui` — ✅ (recorded in attestation
   `environment.branch`)
2. Backend precheck — does a retention API already exist?
   ```
   grep -rn "retentionPolicies" apps/api/src/modules/legal/ --include=*.ts
   ```
   ✅ Returned `document-settings.router.ts:414` (sub-router) and `:474`
   (mount). **This precheck is what collapsed the task from a full vertical to a
   UI wire-up.**
3. Reusable component precheck:
   ```
   ls apps/web/src/app/documents/(list)/document-settings/components/RetentionPoliciesTab.tsx
   ```
   ✅ Exists and is a controlled component (accepts value + onChange).

---

## Implementation Reality Checks

| Surface                       | Production Consumer                                  | Replaces / Blocks                          | Verification Command                                                        |
| ----------------------------- | ---------------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------- |
| `page.tsx`                    | Next.js route `/documents/(list)/storage-policies`   | Replaces the 20-line "coming soon" stub    | `pnpm --filter @intelliflow/web exec vitest run "src/app/documents/(list)/storage-policies"` |
| `StoragePoliciesContent.tsx`  | Rendered by `page.tsx` inside `<Suspense>`           | N/A (new)                                  | same                                                                        |
| `loading.tsx`                 | Next.js route-level loading UI                       | N/A (new)                                  | route renders                                                               |
| `documentSettings.retentionPolicies` | **Pre-existing** — consumed, not modified     | Blocks the planned duplicate router        | `pnpm --filter @intelliflow/api test document-settings`                     |

**No API, validator, schema, or migration change.** If any step had required
one, the task would have needed a backend reviewer and a Prisma migration; it
did not.

---

## TDD Steps

### RED

- [x] **R1** — `page.test.tsx`: asserts the route renders the content component
      and no placeholder copy remains. Fails against the stub.
- [x] **R2** — `StoragePoliciesContent.test.tsx`: asserts `getAll` data renders
      as editable rows. Fails (component does not exist).
- [x] **R3** — save path: asserts `updateAll` is called with edited policies and
      `getAll` is invalidated on success.
- [x] **R4** — reset path: asserts `resetToDefaults` is called and `getAll` is
      invalidated on success.
- [x] **R5** — LEGAL-module-disabled path: asserts a graceful state rather than
      a thrown error.

### GREEN

- [x] **G1** — `loading.tsx` skeleton.
- [x] **G2** — `StoragePoliciesContent.tsx`: `trpc.useUtils()`, the three
      procedures, `PageHeader` + bento layout per the module-settings playbook,
      `RetentionPoliciesTab` for row editing, canonical `EmptyState`.
- [x] **G3** — `page.tsx` rewritten as a server component with `<Suspense>`
      (PG-200 pattern).
- [x] **G4** — all 5 RED tests green.

### REFACTOR

- [x] **F1** — DRY pass: confirmed no logic was copied out of
      `RetentionPoliciesTab`; it is imported and reused.
- [x] **F2** — 4 mandatory validations (TypeScript, Tests, Lint, Build) via the
      full pre-ship gate.
- [x] **F3** — Lighthouse ≥ 90 on the new route.

---

## Verification (independently re-run 2026-07-25 on `origin/main` @ `f4ec0b0cb`)

| Check                                              | Result                                                        |
| -------------------------------------------------- | ------------------------------------------------------------- |
| All 5 delivered files present                      | ✅ `page.tsx`, `StoragePoliciesContent.tsx`, `loading.tsx`, 2 test files |
| Component actually calls the 3 procedures          | ✅ `StoragePoliciesContent.tsx:37, 40, 50`                     |
| Invalidation wired on both mutations               | ✅ `StoragePoliciesContent.tsx:42, 52`                         |
| Reuses `RetentionPoliciesTab` (not a copy)         | ✅ `StoragePoliciesContent.tsx:28-30, 184`                     |
| Planned duplicate router/validator NOT created     | ✅ neither path exists — correct outcome                        |
| Backend destructive writes transactional           | ✅ `document-settings.router.ts:438, 450`                      |
| Cross-tenant isolation tests exist                 | ✅ `document-settings.router.test.ts:562, 848`                 |

---

## Estimated vs actual effort

| Phase                       | Estimate |
| --------------------------- | -------- |
| Backend precheck (decisive) | ~15 min  |
| RED                         | ~40 min  |
| GREEN                       | ~60 min  |
| REFACTOR + gates            | ~40 min  |
| **Total**                   | **~2.5 h** (vs CSV estimate 180/360/540 min — beat optimistic because the backend already existed) |
