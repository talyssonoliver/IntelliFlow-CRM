# packages/ai - AI Tools (⚠ PARKED / NOT WIRED)

## Purpose

`@intelliflow/ai` (private) is intended to hold reusable AI tools/services — the
Case RAG tool from **IFC-156** (`createRetrieveCaseContextTool`,
prompt-injection guards, case access verification, approval flow).

## ⚠ Current status: orphaned / exports disabled

- `src/index.ts` has its **entire export block commented out**, gated on a
  `TODO: Fix Prisma types in retrieve-case-context.ts (Case model missing from schema)`.
  **The package currently exports nothing.**
- **No other package declares `@intelliflow/ai` as a dependency**; zero source
  imports anywhere (only audit reports + config mention it).
- The `package-review` audit lists it `LOW` / "No coverage data".

## ⚠ The stated blocker is FALSE (IFC-156 audit, 2026-05-30)

The TODO's premise is wrong: the `Case` model **does exist**
(`packages/db/prisma/schema.prisma:1713`, re-exported by `@intelliflow/db`). The
package can be uncommented today. The real defects (read-only audit, NOT yet
fixed) are:

- `tools/retrieve-case-context.ts:66` validates `caseId` with `z.uuid()`, but
  `Case.id` is a **cuid** → every real ID is rejected. Use `z.cuid()`.
- `verifyCaseAccess` (lines ~310–318) queries `userRoleAssignment` **without
  `tenantId`** → cross-tenant privilege escalation.
- Tests never run: `vitest.config.ts` includes `src/**` but tests live under
  `tools/__tests__/` → attestation's "43 tests passed" is false
  (passWithNoTests).
- `requestApproval` (lines ~768–805) duck-types a non-existent `pendingApproval`
  delegate → approval requests are silently discarded.

## Pitfalls / for the next maintainer

- Do **not** delete it (real, intended IFC-156 work) and do **not** trust the
  CSV `Completed` status — the attestation self-reports 8/9 DoD items
  `met: false`.
- To revive: fix the bugs above, uncomment `src/index.ts`, wire one AI consumer
  (add `@intelliflow/ai` to its `package.json`), then re-attest.

## Code Map

- `tools/retrieve-case-context.ts` — the (currently type-broken) Case RAG tool.
- `tools/__tests__/` — its tests.
