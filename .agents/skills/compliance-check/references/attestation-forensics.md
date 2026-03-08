# Compliance Check — Attestation Forensics & Mock Coverage Audit

## Section 6b: Attestation Forensics (Dependency Verification)

**For tasks with dependencies**: Cross-check that each dependency's attestation claims are actually true in the current codebase.

**Why**: A dependency may have been marked "Completed" with a false attestation (e.g., claiming "service wired in container" when it wasn't). This check catches inherited lies before you build on a broken foundation.

**Steps:**

1. Read the current task's dependencies from Sprint_plan.csv
2. For each dependency with an attestation file:
   - Read `.specify/sprints/sprint-{N}/attestations/<DEP_ID>/attestation.json`
   - For each `definition_of_done_items` where `met: true`:
     - Verify the claim is ACTUALLY true by reading the referenced code
     - Focus on: container wiring, service instantiation, router registration, Prisma models
3. Report:

| Dependency | DoD Claim | Actually True? | Verification Method |
|-----------|-----------|----------------|---------------------|
| IFC-086 | Service wired in container | NO | container.ts missing instantiation |
| IFC-086 | Router registered | YES | router.ts has chainVersion merge |

**Verdict:**
- All claims verified TRUE → PASS
- Any claim FALSE → **FAIL** (dependency must be fixed first)
- No attestation file found → WARN (cannot verify, proceed with caution)

## Section 7: Mock Coverage Audit

**Detects unit tests that mock away the exact integration they should be testing.**

**Why**: Mocked tests can pass even when the real service/repository doesn't exist or isn't wired. This check ensures tests actually exercise real integration points.

**Steps:**

1. Identify test files created/modified by this task
2. For each test file, scan for mock patterns:
   ```
   vi.mock('...container...')    → Flag: mocking the DI container
   vi.mock('...context...')      → Flag: mocking the API context
   vi.mock('...prisma...')       → Note: acceptable for unit tests
   mockReturnValue(...)          → Check: is it mocking a service that should exist?
   ```
3. Cross-reference mocked services against `container.ts`:
   - If a test mocks `ChainVersionService` AND that service is NOT in `container.ts` → **FAIL**
   - If a test mocks a repository that doesn't have a Prisma implementation → **WARN**
4. Report:

| Test File | Mocked Service | In Container? | Verdict |
|-----------|---------------|---------------|---------|
| ChainVersionsTable.test.tsx | useChainVersions | N/A (hook) | OK |
| chain-version.router.test.ts | ChainVersionService | NO | FAIL |

**Verdict:**
- All mocked services exist in container → PASS
- Any mocked service missing from container → **FAIL** (test is hiding a gap)
- Only frontend hooks mocked → PASS (acceptable for component tests)
