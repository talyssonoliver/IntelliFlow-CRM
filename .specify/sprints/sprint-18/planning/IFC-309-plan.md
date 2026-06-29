# Execution Plan: IFC-309

**Server-side Terms Acceptance**

| Field | Value |
|-------|-------|
| Task ID | IFC-309 |
| Sprint | 18 |
| Spec | `.specify/sprints/sprint-18/specifications/IFC-309-spec.md` |
| Persona | Compliance (primary) + Security-Lead (secondary) |
| Created | 2026-06-29 |

## Files Summary

**Total files: 16**

### Files to CREATE (10)
1. `packages/domain/src/legal/TermsAcceptance.ts` — Domain value class
2. `packages/domain/src/legal/__tests__/TermsAcceptance.test.ts` — Domain unit tests
3. `packages/validators/src/terms-acceptance.ts` — Zod input/output schemas
4. `apps/api/src/modules/legal/terms-acceptance.router.ts` — tRPC router
5. `apps/api/src/modules/legal/__tests__/terms-acceptance.router.test.ts` — API tests
6. `apps/web/src/components/legal/TermsAcceptanceConfirm.tsx` — Confirm UI component (NEW verified: no shared component covers terms-acceptance confirmation flow; searched shared/ by keywords confirm, accept, consent, checkbox)
7. `apps/web/src/components/legal/__tests__/TermsAcceptanceConfirm.test.tsx` — Component tests
8. `packages/db/prisma/migrations/20260629000000_add_terms_acceptance/migration.sql` — DB migration
9. `docs/operations/sprint-18-ifc-309-session-issues-log.md` — Issues log
10. `packages/domain/src/legal/index.ts` — Create if missing (export TermsAcceptance)

### Files to MODIFY (6)
11. `packages/db/prisma/schema.prisma` — Add TermsAcceptance model + reverse relations
12. `packages/validators/src/index.ts` — Add `export * from './terms-acceptance'`
13. `apps/api/src/router.ts` — Mount termsAcceptanceRouter at "termsAcceptance"
14. `apps/web/src/app/(public)/terms/page.tsx` — Import + render TermsAcceptanceConfirm
15. `docs/architecture/diagrams/complete-dependency-chains.md` — Add IFC-309 to legal chain
16. `docs/planning/prd-legal-pages.md` — Update status from Draft to Updated, confirm IFC-309 listed

## CSV Artifact Alignment

| CSV Artifact | Plan File | Match? | Note |
|-------------|-----------|--------|------|
| `packages/db/prisma/schema.prisma` | Step 4 | YES | |
| `packages/domain/src/legal/TermsAcceptance.ts` | Step 5 | YES | |
| `apps/api/src/modules/legal/legal.router.ts` | N/A — plan creates `terms-acceptance.router.ts` | DELTA | CSV uses old name from task creation; actual file is `terms-acceptance.router.ts` (cleaner, doesn't conflict with existing LEGAL module routers) |
| `apps/web/src/components/legal/TermsAcceptanceConfirm.tsx` | Step 8 | YES | |
| `.specify/sprints/sprint-18/attestations/IFC-309/context_ack.json` | Step 14 | YES | |

Note: CSV "Artifacts To Track" lists `apps/api/src/modules/legal/legal.router.ts` — this was the original plan name. The spec and implementation use `terms-acceptance.router.ts` to avoid confusion with the existing LEGAL module-gated routers. The CSV will be updated post-merge by the orchestrator.

## Shared Component Audit

| Need | Searched | Result | Action |
|------|----------|--------|--------|
| Terms accept confirmation panel | `apps/web/src/components/shared/*.tsx`, `packages/ui/src/components/**/*.tsx` — keywords: confirm, accept, consent, checkbox, terms | No shared component covers terms-acceptance confirmation flow | NEW (verified) — in `components/legal/` consistent with `dpa-signature-panel.tsx` |
| Auth state access | `useAuth()` from `apps/web/src/lib/auth/AuthContext.tsx:945` | `isAuthenticated`, `isLoading`, `user` exposed | REUSE |
| tRPC mutation call pattern | `trpc.*.useMutation()` throughout web app | Pattern established | REUSE |

## Estimated Effort

| Phase | Files | Estimate |
|-------|-------|----------|
| RED — Tests | 3 test files | 45-75 min |
| GREEN — Implementation | 7 new impl files + 6 modifications | 90-150 min |
| REFACTOR | security hardening | 20-30 min |
| VALIDATION | cheap gates + coverage + codex | 30-60 min |
| **Total** | **16 files** | **3-5 hours** |

## Preflight Checks

- [ ] `pnpm --filter @intelliflow/domain test` passes (baseline)
- [ ] `pnpm --filter @intelliflow/api test` passes (baseline)
- [ ] `pnpm --filter @intelliflow/web test` passes (baseline)
- [ ] Docker test DB healthy: `docker ps --filter name=postgres-test`
- [ ] Confirm `termsAcceptance` key is NOT already in `apps/api/src/router.ts`
- [ ] Confirm `terms-acceptance.router.ts` does NOT already exist in `apps/api/src/modules/legal/`
- [ ] Confirm no `TermsAcceptance` model in `packages/db/prisma/schema.prisma` (grep for "TermsAcceptance")

---

## Phase 1: RED — Write Failing Tests

### Step 1: Write failing domain tests

**Type:** test
**Files to Create:**
- `packages/domain/src/legal/__tests__/TermsAcceptance.test.ts`

**Acceptance Criteria Addressed:** AC-012

**Test cases (all must FAIL — TermsAcceptance.ts does not exist yet):**
- [ ] `TermsAcceptance.create()` instantiates with valid fields (id, tenantId, userId, termsVersion, route)
- [ ] `termsVersion` rejects empty string (throws)
- [ ] `termsVersion` rejects values over 32 chars (throws)
- [ ] Domain class has zero imports from `@intelliflow/db`, `@prisma/client`, or any infra package (static check via grep in test)
- [ ] `toRecord()` returns plain object with all 7 expected fields

**Validation:**
```bash
pnpm --filter @intelliflow/domain test -- --testPathPattern="legal/__tests__/TermsAcceptance"
# Expected: FAIL (file not found or import errors)
```

---

### Step 2: Write failing API router tests

**Type:** test
**Files to Create:**
- `apps/api/src/modules/legal/__tests__/terms-acceptance.router.test.ts`

**Acceptance Criteria Addressed:** AC-002, AC-003, AC-004, AC-005, AC-006, AC-007, NF-002, NF-005

**Test cases (all must FAIL — router file does not exist yet):**
- [ ] `accept` mutation — first call persists record, returns `{ accepted: true, acceptedAt: Date }`
- [ ] `accept` mutation — second call with same `(tenantId, userId, termsVersion)` is idempotent (no duplicate row, same accepted result)
- [ ] `accept` mutation — Zod schema REJECTS `acceptedAt` field in input (AC-003)
- [ ] `accept` mutation — Zod schema REJECTS `ipAddress` in input (AC-004)
- [ ] `accept` mutation — Zod schema REJECTS `tenantId` in input (AC-005)
- [ ] `accept` mutation — Zod schema REJECTS `userId` in input (AC-005)
- [ ] `accept` mutation — `ipAddress` stored equals value from mocked `x-forwarded-for` header (not from input) (AC-004)
- [ ] `getAcceptance` query — returns `{ accepted: true, acceptedAt }` for existing record (AC-006)
- [ ] `getAcceptance` query — returns `{ accepted: false, acceptedAt: null }` for non-existent record (AC-006)
- [ ] `getAcceptance` query NEGATIVE — userId who accepted under tenantId-A returns `{ accepted: false }` when queried from tenantId-B context (NF-002 cross-tenant isolation)
- [ ] `accept` mutation NEGATIVE — unauthenticated call (no ctx.user) throws UNAUTHORIZED (AC-007 — tenantProcedure auth)
- [ ] Router exports ONLY `accept` and `getAcceptance` — no `update`, no `delete`, no `remove` (NF-005)
- [ ] `accept` uses `tenantProcedure` (not `moduleTenantProcedure`) — verified by checking no `moduleTenantProcedure` import in router (AC-007)

**Test setup pattern (follow `apps/api/src/modules/legal/cases.router.ts` test pattern):**
- Mock `ctx.tenant` with `{ tenantId: 'tenant-A' }` (from `assertTenantContext`)
- Mock `ctx.user` with `{ userId: 'user-1', ... }`
- Mock `ctx.prisma.termsAcceptance.upsert` returning stub record
- Mock `ctx.prisma.termsAcceptance.findFirst` returning stub or null
- Mock `ctx.req?.headers?.get` to return `'1.2.3.4'` for `'x-forwarded-for'`

**Validation:**
```bash
pnpm --filter @intelliflow/api test -- --testPathPattern="legal/__tests__/terms-acceptance.router"
# Expected: FAIL (router file not found — import error)
```

---

### Step 3: Write failing UI component tests

**Type:** test
**Files to Create:**
- `apps/web/src/components/legal/__tests__/TermsAcceptanceConfirm.test.tsx`

**Acceptance Criteria Addressed:** AC-008, AC-009, AC-010

**Test cases (all must FAIL — component does not exist yet):**
- [ ] Renders `null` when `isAuthenticated = false`, `isLoading = false` (unauthenticated — AC-008)
- [ ] Renders `null` when `isLoading = true` regardless of auth state (loading — AC-008)
- [ ] Renders `null` when `getAcceptance` returns `{ accepted: true }` (already accepted — AC-009)
- [ ] Renders `null` while `getAcceptance` query is loading
- [ ] Renders confirmation section with role="region" + aria-labelledby when authenticated and `accepted = false`
- [ ] Confirmation section contains a checkbox with `aria-required="true"`
- [ ] "I Agree" button is DISABLED until checkbox is checked
- [ ] Calls `accept` mutation on "I Agree" button click (after checking checkbox)
- [ ] Panel becomes hidden (null) after successful mutation (AC-009)
- [ ] Error message appears when mutation fails

**Mocking pattern:**
- Mock `useAuth` from `@/lib/auth/AuthContext` returning `{ isAuthenticated, isLoading, user }`
- Mock `trpc.termsAcceptance.getAcceptance.useQuery` returning `{ data, isLoading }`
- Mock `trpc.termsAcceptance.accept.useMutation` returning `{ mutate, isPending, isError, isSuccess }`

**Validation:**
```bash
pnpm --filter @intelliflow/web test -- --testPathPattern="components/legal/__tests__/TermsAcceptanceConfirm"
# Expected: FAIL (component file not found)
```

---

## Phase 2: GREEN — Make Tests Pass

### Step 4: Add TermsAcceptance Prisma model and run migration

**Type:** implementation
**Files to Modify:**
- `packages/db/prisma/schema.prisma`

**Files to Create:**
- `packages/db/prisma/migrations/20260629000000_add_terms_acceptance/migration.sql`

**Implementation — add after existing models in schema.prisma:**

```prisma
model TermsAcceptance {
  id           String   @id @default(cuid())
  tenantId     String
  tenant       Tenant   @relation("TenantTermsAcceptances", fields: [tenantId], references: [id], onDelete: Cascade)
  userId       String
  user         User     @relation("UserTermsAcceptances", fields: [userId], references: [id], onDelete: Cascade)
  termsVersion String
  acceptedAt   DateTime @default(now())
  ipAddress    String?  @db.VarChar(45)
  userAgent    String?  @db.VarChar(512)
  route        String   @db.VarChar(255)

  @@unique([tenantId, userId, termsVersion])
  @@index([tenantId])
  @@map("terms_acceptances")
}
```

**Add reverse relations on Tenant model** (using `@ignore` pattern per `schema.prisma:30-50`):
```prisma
// In model Tenant block (after existing @ignore relations):
termsAcceptances TermsAcceptance[] @relation("TenantTermsAcceptances") @ignore
```

**Add reverse relation on User model** (after line ~340):
```prisma
// In model User block:
termsAcceptances TermsAcceptance[] @relation("UserTermsAcceptances") @ignore
```

**Migration steps (LOCAL TEST DB ONLY — never prod Supabase):**
```bash
cd packages/db
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/intelliflow_test \
DIRECT_URL=postgresql://postgres:postgres@localhost:5433/intelliflow_test \
pnpm db:migrate:create -- --name add_terms_acceptance

# Apply migration:
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/intelliflow_test \
DIRECT_URL=postgresql://postgres:postgres@localhost:5433/intelliflow_test \
pnpm db:migrate

# Regenerate client:
pnpm db:generate
```

**Covers:** AC-001, AC-011

**Validation:**
```bash
pnpm --filter @intelliflow/db typecheck
# Confirm Prisma client has termsAcceptance member
```

---

### Step 5: Implement TermsAcceptance domain class

**Type:** implementation
**Files to Create:**
- `packages/domain/src/legal/TermsAcceptance.ts`
- `packages/domain/src/legal/index.ts` (create if not present, or add export)

**Implementation (zero infra deps — AC-012):**
```typescript
// packages/domain/src/legal/TermsAcceptance.ts
// No imports from @intelliflow/db, @prisma/client, or any infra package

export interface TermsAcceptanceProps {
  id: string;
  tenantId: string;
  userId: string;
  termsVersion: string;
  acceptedAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
  route: string;
}

export class TermsAcceptance {
  private constructor(private readonly props: TermsAcceptanceProps) {}

  static create(
    props: Omit<TermsAcceptanceProps, 'acceptedAt'>
  ): TermsAcceptance {
    if (!props.termsVersion || props.termsVersion.length > 32) {
      throw new Error('termsVersion must be 1-32 chars');
    }
    return new TermsAcceptance({ ...props, acceptedAt: new Date() });
  }

  static fromRecord(props: TermsAcceptanceProps): TermsAcceptance {
    return new TermsAcceptance(props);
  }

  toRecord(): TermsAcceptanceProps {
    return { ...this.props };
  }

  get termsVersion(): string { return this.props.termsVersion; }
  get tenantId(): string { return this.props.tenantId; }
  get userId(): string { return this.props.userId; }
  get acceptedAt(): Date { return this.props.acceptedAt; }
}
```

`packages/domain/src/legal/index.ts`:
```typescript
export { TermsAcceptance } from './TermsAcceptance';
export type { TermsAcceptanceProps } from './TermsAcceptance';
```

**Covers:** AC-012

**Validation:**
```bash
pnpm --filter @intelliflow/domain test -- --testPathPattern="legal/__tests__/TermsAcceptance"
# Expected: PASS (Step 1 tests now green)
pnpm --filter @intelliflow/domain typecheck
```

---

### Step 6: Implement Zod validator schemas

**Type:** implementation
**Files to Create:**
- `packages/validators/src/terms-acceptance.ts`

**Files to Modify:**
- `packages/validators/src/index.ts` — add `export * from './terms-acceptance';`

**Implementation:**
```typescript
// packages/validators/src/terms-acceptance.ts
import { z } from 'zod';

// NOTE: acceptedAt, ipAddress, tenantId, userId are NEVER accepted as input (AC-003, AC-004, AC-005)
export const acceptTermsInputSchema = z.object({
  termsVersion: z.string().min(1).max(32),
  route: z.string().min(1).max(255),
  userAgent: z.string().max(512).optional(),
});

export const getAcceptanceInputSchema = z.object({
  termsVersion: z.string().min(1).max(32),
});

export const acceptTermsOutputSchema = z.object({
  accepted: z.literal(true),
  acceptedAt: z.date(),
});

export const getAcceptanceOutputSchema = z.object({
  accepted: z.boolean(),
  acceptedAt: z.date().nullable(),
});

export type AcceptTermsInput = z.infer<typeof acceptTermsInputSchema>;
export type GetAcceptanceInput = z.infer<typeof getAcceptanceInputSchema>;
```

**Covers:** AC-003, AC-004, AC-005

**Validation:**
```bash
pnpm --filter @intelliflow/validators typecheck
```

---

### Step 7: Implement tRPC terms-acceptance router and wire to app router

**Type:** implementation
**Files to Create:**
- `apps/api/src/modules/legal/terms-acceptance.router.ts`

**Files to Modify:**
- `apps/api/src/router.ts` — add import + mount at `"termsAcceptance"` key in "Legal domain" block

**Implementation:**
```typescript
// apps/api/src/modules/legal/terms-acceptance.router.ts
// NF-003: ipAddress/userAgent are PII — never log, never add to OTel spans/attributes

import { createTRPCRouter, tenantProcedure } from '../../trpc';
import { acceptTermsInputSchema, getAcceptanceInputSchema } from '@intelliflow/validators/terms-acceptance';
import { pickTrustedForwardedIp } from '../../security/client-ip';
import { assertTenantContext } from '../../security/tenant-context';

export const termsAcceptanceRouter = createTRPCRouter({
  accept: tenantProcedure
    .input(acceptTermsInputSchema)
    .mutation(async ({ ctx, input }) => {
      assertTenantContext(ctx);
      const tenantId = ctx.tenant.tenantId;
      // userId from session — never from input (AC-005)
      const userId = ctx.user!.userId;

      // IP extracted server-side — never from input (AC-004)
      // NF-003: do NOT add ipAddress/userAgent to logger or OTel attributes
      const forwardedFor = ctx.req?.headers?.get?.('x-forwarded-for') ?? null;
      const ipAddress = pickTrustedForwardedIp(forwardedFor) ?? null;

      // Idempotent upsert — re-acceptance returns same result, no duplicate (AC-002)
      const record = await ctx.prisma.termsAcceptance.upsert({
        where: {
          tenantId_userId_termsVersion: {
            tenantId,
            userId,
            termsVersion: input.termsVersion,
          },
        },
        create: {
          tenantId,
          userId,
          termsVersion: input.termsVersion,
          ipAddress,
          userAgent: input.userAgent ?? null,
          route: input.route,
        },
        update: {}, // immutable — empty update is a no-op (NF-005)
      });

      return { accepted: true as const, acceptedAt: record.acceptedAt };
    }),

  getAcceptance: tenantProcedure
    .input(getAcceptanceInputSchema)
    .query(async ({ ctx, input }) => {
      assertTenantContext(ctx);
      // ALWAYS filter by tenantId from session — never from input (NF-002)
      const tenantId = ctx.tenant.tenantId;
      const userId = ctx.user!.userId;

      const record = await ctx.prisma.termsAcceptance.findFirst({
        where: { tenantId, userId, termsVersion: input.termsVersion },
        select: { acceptedAt: true },
      });

      return {
        accepted: record !== null,
        acceptedAt: record?.acceptedAt ?? null,
      };
    }),
  // NF-005: No update or delete procedures — immutability contract
});
```

**router.ts modification** (in "Legal domain" block after existing legal routers):
```typescript
import { termsAcceptanceRouter } from './modules/legal/terms-acceptance.router';
// ...
// In appRouter:
termsAcceptance: termsAcceptanceRouter, // IFC-309: server-side terms acceptance (all plans — plain tenantProcedure)
```

**Covers:** AC-002, AC-004, AC-005, AC-006, AC-007, NF-002, NF-003, NF-005

**Validation:**
```bash
pnpm --filter @intelliflow/api test -- --testPathPattern="legal/__tests__/terms-acceptance.router"
# Expected: PASS (Step 2 tests now green)
pnpm --filter @intelliflow/api typecheck
```

---

### Step 8: Implement TermsAcceptanceConfirm UI component and wire to /terms page

**Type:** implementation
**Files to Create:**
- `apps/web/src/components/legal/TermsAcceptanceConfirm.tsx`

**Files to Modify:**
- `apps/web/src/app/(public)/terms/page.tsx` — add import + render `<TermsAcceptanceConfirm>`

**Implementation:**
```typescript
// apps/web/src/components/legal/TermsAcceptanceConfirm.tsx
'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';
import { trpc } from '@/lib/trpc';

interface Props {
  termsVersion: string; // passed from RSC parent — never fetched client-side (server-only module)
}

export function TermsAcceptanceConfirm({ termsVersion }: Props) {
  const { isAuthenticated, isLoading } = useAuth();
  const [agreed, setAgreed] = useState(false);
  const [locallyAccepted, setLocallyAccepted] = useState(false);

  const { data, isLoading: queryLoading } = trpc.termsAcceptance.getAcceptance.useQuery(
    { termsVersion },
    { enabled: isAuthenticated && !isLoading }
  );

  const mutation = trpc.termsAcceptance.accept.useMutation({
    onSuccess: () => setLocallyAccepted(true),
  });

  // AC-008: hide for unauthenticated or while auth/query loading
  if (!isAuthenticated || isLoading || queryLoading) return null;
  // AC-009: hide if already accepted (server record or local optimistic)
  if (data?.accepted || locallyAccepted) return null;

  const handleSubmit = () => {
    if (!agreed) return;
    mutation.mutate({
      termsVersion,
      route: '/terms',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    });
  };

  return (
    <section
      role="region"
      aria-labelledby="terms-accept-heading"
      className="mt-8 rounded-lg border border-[#137fec]/30 bg-[#137fec]/5 p-6"
    >
      <h2
        id="terms-accept-heading"
        className="text-lg font-semibold text-slate-900 dark:text-white"
      >
        Confirm Terms Acceptance
      </h2>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
        Please confirm that you have read and agree to these Terms of Service
        (version {termsVersion}).
      </p>
      <div className="mt-4 flex items-start gap-3">
        <input
          type="checkbox"
          id="terms-accept-checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          aria-required="true"
          className="mt-1 h-4 w-4 cursor-pointer accent-[#137fec]"
        />
        <label
          htmlFor="terms-accept-checkbox"
          className="text-sm text-slate-700 dark:text-slate-300"
        >
          I have read and agree to the Terms of Service version {termsVersion}.
        </label>
      </div>
      <button
        type="button"
        onClick={handleSubmit}
        disabled={!agreed || mutation.isPending}
        aria-disabled={!agreed || mutation.isPending}
        className="mt-4 rounded-md bg-[#137fec] px-4 py-2 text-sm font-medium text-white
                   disabled:cursor-not-allowed disabled:opacity-50"
      >
        {mutation.isPending ? 'Saving...' : 'I Agree'}
      </button>
      {mutation.isError && (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          Something went wrong. Please try again.
        </p>
      )}
    </section>
  );
}
```

**terms/page.tsx modification** — add after the final contact/questions section:
```typescript
// Add at top with other imports:
import { TermsAcceptanceConfirm } from '@/components/legal/TermsAcceptanceConfirm';

// Add inside the JSX return, after the terms body sections:
<TermsAcceptanceConfirm termsVersion={terms.metadata.version} />
```

Note: `terms.metadata.version` is already resolved in the RSC via `getTermsOfService()` (a server-only module). The RSC passes it as a plain string prop to the client component — no server-only import leaks to client. (AC-010)

**Covers:** AC-008, AC-009, AC-010

**Validation:**
```bash
pnpm --filter @intelliflow/web test -- --testPathPattern="components/legal/__tests__/TermsAcceptanceConfirm"
# Expected: PASS (Step 3 tests now green)

# AC-010 regression: public page still renders for unauthenticated users
pnpm --filter @intelliflow/web test -- --testPathPattern="\(public\)/terms/__tests__/page"

pnpm --filter @intelliflow/web typecheck
```

---

## Phase 3: REFACTOR

### Step 9: Security hardening and PII guard

**Type:** refactor
**Files to Modify:**
- `apps/api/src/modules/legal/terms-acceptance.router.ts`

**Actions:**
- [ ] Verify `ipAddress` and `userAgent` have JSDoc `// NF-003: PII — do NOT log or span-attr` comment (already in implementation above)
- [ ] Run grep to confirm no logger call includes ipAddress or userAgent:
  ```bash
  grep -n "ipAddress\|userAgent" apps/api/src/modules/legal/terms-acceptance.router.ts
  # Must ONLY appear in: prisma.create fields and the assignment lines
  ```
- [ ] Confirm no `console.log`, `logger.info`, or `setAttribute('ipAddress'` in router
- [ ] Run API lint:
  ```bash
  pnpm --filter @intelliflow/api lint
  ```

---

### Step 10: Update dependency chain docs

**Type:** documentation
**Files to Modify:**
- `docs/architecture/diagrams/complete-dependency-chains.md`
- `docs/planning/prd-legal-pages.md`

**Actions:**
- [ ] Add IFC-309 to the legal compliance chain in `complete-dependency-chains.md`:
  - IFC-309 depends on: PG-051 (terms page), IFC-058 (GDPR baseline), IFC-124 (audit logging)
  - IFC-309 is a terminal node (no downstream deps yet)
- [ ] Update `docs/planning/prd-legal-pages.md`:
  - Status: Draft -> Updated
  - Confirm IFC-309 already listed in Related Tasks (it is)
  - Add a note: "IFC-309 shipped server-side acceptance record"

**Validation:**
```bash
npx prettier --write docs/architecture/diagrams/complete-dependency-chains.md
npx prettier --write docs/planning/prd-legal-pages.md
```

---

### Step 11: Run full touched-package test suites

**Type:** validation
```bash
pnpm --filter @intelliflow/domain test
pnpm --filter @intelliflow/validators typecheck
pnpm --filter @intelliflow/api test
pnpm --filter @intelliflow/web test -- \
  --testPathPattern="components/legal/__tests__/TermsAcceptanceConfirm|\(public\)/terms/__tests__/page"
```

- [ ] Domain suite: all pass
- [ ] Validators: typecheck pass
- [ ] API suite: all pass (including pre-existing legal tests)
- [ ] Web regression: terms page test still passes (AC-010)

---

## Phase 4: VALIDATION

### Step 12: Cheap gates

**Type:** validation
```bash
# Format all new/modified docs and specs
npx prettier --write \
  docs/operations/sprint-18-ifc-309-session-issues-log.md \
  .specify/sprints/sprint-18/specifications/IFC-309-spec.md \
  .specify/sprints/sprint-18/planning/IFC-309-plan.md \
  docs/architecture/diagrams/complete-dependency-chains.md \
  docs/planning/prd-legal-pages.md

# Cheap gate sweep
node scripts/pre-ship.mjs \
  --only=format-check,lint,typecheck,governance-schema,lint-artifacts,lint-runtime-paths,material-symbols-audit,architecture
```

- [ ] format-check: PASS
- [ ] lint: PASS
- [ ] typecheck: PASS (all 4 touched packages)
- [ ] architecture: PASS (no new circular deps)

---

### Step 13: Scoped coverage check (NF-004 — coverage >= 90%)

**Type:** validation
```bash
pnpm --filter @intelliflow/domain test -- --coverage \
  --testPathPattern="legal/__tests__/TermsAcceptance"

pnpm --filter @intelliflow/api test -- --coverage \
  --testPathPattern="legal/__tests__/terms-acceptance.router"

pnpm --filter @intelliflow/web test -- --coverage \
  --testPathPattern="components/legal/__tests__/TermsAcceptanceConfirm"
```

- [ ] `TermsAcceptance.ts` coverage >= 90% statements/branches/functions/lines
- [ ] `terms-acceptance.router.ts` coverage >= 90%
- [ ] `TermsAcceptanceConfirm.tsx` coverage >= 90%

---

### Step 14: Create context_ack.json and write issues log

**Type:** process
**Files to Create:**
- `.specify/sprints/sprint-18/attestations/IFC-309/context_ack.json`
- `docs/operations/sprint-18-ifc-309-session-issues-log.md`

**context_ack.json contents:**
```json
{
  "task_id": "IFC-309",
  "acknowledged_at": "<real wall-clock timestamp>",
  "files_read": [
    "packages/db/prisma/schema.prisma",
    "apps/api/src/modules/legal/cases.router.ts",
    "apps/api/src/trpc.ts",
    "apps/api/src/context.ts",
    "apps/api/src/security/client-ip.ts",
    "apps/api/src/router.ts",
    "apps/web/src/app/(public)/terms/page.tsx",
    "apps/web/src/lib/legal/acceptance-tracker.ts",
    "apps/web/src/lib/auth/AuthContext.tsx",
    ".specify/sprints/sprint-17/attestations/PG-051/attestation.json"
  ],
  "invariants_acknowledged": [
    "TermsAcceptance records are IMMUTABLE (no update/delete paths in router)",
    "acceptedAt is server-set via DB @default(now()) — never client-supplied",
    "ipAddress extracted server-side via pickTrustedForwardedIp — never from input",
    "tenantId and userId sourced from ctx.session only",
    "All tenants (all plans) can accept Terms — plain tenantProcedure, not moduleTenantProcedure",
    "NF-003: ipAddress and userAgent are PII — not logged or span-attributed",
    "getAcceptance always filters by tenantId+userId+termsVersion — never userId alone"
  ]
}
```

---

### Step 15: Codex review (standalone convergence)

**Type:** validation
```bash
# Commit implementation first (all files), then:
node scripts/codex-review.mjs  # run 1
# Fix any real findings; waive FPs with evidence in tools/audit/codex-review-waivers.yaml
node scripts/codex-review.mjs  # run 2
node scripts/codex-review.mjs  # run 3 — must be CLEAN
```

- [ ] Run 1: fix or waive all findings
- [ ] Run 2: fix or waive remaining
- [ ] Run 3: CLEAN (no findings)

---

### Step 16: Commit full evidence trail + request gate-lock

**Type:** process

- [ ] Stage all implementation files
- [ ] Stage `.specify/sprints/sprint-18/specifications/IFC-309-spec.md`
- [ ] Stage `.specify/sprints/sprint-18/planning/IFC-309-plan.md`
- [ ] Stage `.specify/sprints/sprint-18/attestations/IFC-309/attestation.json`
- [ ] Stage `.specify/sprints/sprint-18/attestations/IFC-309/task-tracking.json`
- [ ] Stage `.specify/sprints/sprint-18/attestations/IFC-309/context_ack.json`
- [ ] Stage `docs/operations/sprint-18-ifc-309-session-issues-log.md`
- [ ] Commit with subject <= 100 chars, NO `Co-Authored-By: Claude` trailer
- [ ] **Message orchestrator: "READY FOR GATE-LOCK IFC-309" and wait for grant**

---

### Step 17: Full pre-ship (ONE run — AFTER gate-lock grant)

**Type:** gate (serialized — MUST wait for orchestrator gate-lock grant)

```bash
# Clean stale coverage dirs first
Remove-Item -Recurse -Force artifacts/coverage-parts -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force artifacts/coverage-vitest -ErrorAction SilentlyContinue

# Full gate — must end with "pre-ship: PASS"
node scripts/pre-ship.mjs
```

- [ ] TypeScript: PASS (all packages)
- [ ] Tests: PASS (all packages)
- [ ] Lint: PASS
- [ ] Build: PASS (`pnpm --filter @intelliflow/web build`)
- [ ] diff-coverage: >= 80% on changed lines
- [ ] Codex: PASS (cached from Step 15)
- [ ] format-check: PASS

---

## Validation Matrix

| Step | Command | Expected |
|------|---------|----------|
| 1 | `pnpm --filter @intelliflow/domain test -- --testPathPattern=TermsAcceptance` | RED (fail — no impl) |
| 2 | `pnpm --filter @intelliflow/api test -- --testPathPattern=terms-acceptance.router` | RED (fail — no impl) |
| 3 | `pnpm --filter @intelliflow/web test -- --testPathPattern=TermsAcceptanceConfirm` | RED (fail — no impl) |
| 4 | `pnpm --filter @intelliflow/db typecheck` | PASS |
| 5 | `pnpm --filter @intelliflow/domain test -- --testPathPattern=TermsAcceptance` | PASS |
| 5 | `pnpm --filter @intelliflow/domain typecheck` | PASS |
| 6 | `pnpm --filter @intelliflow/validators typecheck` | PASS |
| 7 | `pnpm --filter @intelliflow/api test -- --testPathPattern=terms-acceptance.router` | PASS |
| 7 | `pnpm --filter @intelliflow/api typecheck` | PASS |
| 8 | `pnpm --filter @intelliflow/web test -- --testPathPattern=TermsAcceptanceConfirm` | PASS |
| 8 | `pnpm --filter @intelliflow/web test -- --testPathPattern=terms/__tests__/page` | PASS (AC-010 regression) |
| 8 | `pnpm --filter @intelliflow/web typecheck` | PASS |
| 11 | `pnpm --filter @intelliflow/api test` | PASS (full suite) |
| 11 | `pnpm --filter @intelliflow/web test` | PASS (full suite) |
| 12 | `node scripts/pre-ship.mjs --only=format-check,lint,typecheck,...` | PASS |
| 13 | Scoped coverage all 3 packages | >= 90% on new lines |
| 15 | `node scripts/codex-review.mjs` x3 | CLEAN x3 |
| 17 | `node scripts/pre-ship.mjs` | pre-ship: PASS |

## AC Traceability Matrix

| AC/NF | Spec Reference | Plan Step | Test Case | Status |
|-------|---------------|-----------|-----------|--------|
| AC-001 | spec: Prisma model | Step 4 | — | COVERED |
| AC-002 | spec: idempotent upsert | Steps 2, 7 | router test: idempotency | COVERED |
| AC-003 | spec: acceptedAt server-set | Steps 2, 6 | router test: Zod rejects acceptedAt | COVERED |
| AC-004 | spec: IP server-extracted | Steps 2, 7 | router test: IP from header | COVERED |
| AC-005 | spec: tenantId/userId from ctx | Steps 2, 7 | router test: Zod rejects tenantId/userId | COVERED |
| AC-006 | spec: getAcceptance shape | Steps 2, 7 | router test: accepted + not-accepted cases | COVERED |
| AC-007 | spec: tenantProcedure key | Steps 2, 7 | router test: no moduleTenantProcedure | COVERED |
| AC-008 | spec: hide when unauthed | Steps 3, 8 | component test: null for unauthed | COVERED |
| AC-009 | spec: hide when accepted | Steps 3, 8 | component test: null when accepted | COVERED |
| AC-010 | spec: /terms regression | Steps 3, 8 | existing page.test.tsx re-run | COVERED |
| AC-011 | spec: migration file | Step 4 | — (file must exist) | COVERED |
| AC-012 | spec: domain class | Steps 1, 5 | domain tests | COVERED |
| NF-001 | spec: p95 < 200ms | Step 7 | single upsert + unique index | COVERED by design |
| NF-002 | spec: tenant isolation | Steps 2, 7 | router test: cross-tenant negative | COVERED |
| NF-003 | spec: no PII in logs/spans | Steps 9, 12 | grep in Step 9 | COVERED |
| NF-004 | spec: coverage >= 90% | Step 13 | scoped coverage | COVERED |
| NF-005 | spec: no update/delete | Steps 2, 7 | router test: no update/delete exports | COVERED |

## Category Y — UI Reachability Verdict

**Category Y: UI Reachability — PASS (no action required)**

This task MODIFIES the existing `/terms` page (`apps/web/src/app/(public)/terms/page.tsx`), which was created by PG-051 and is already fully reachable:
- Listed in sitemap: `apps/web/src/app/sitemap.ts`
- Linked from signup page: `apps/web/src/app/(public)/signup/page.tsx:303`
- Linked from AUP page: `apps/web/src/app/(public)/aup/page.tsx:192`
- No new page is created — no new sidebar entry or parent link required

The `TermsAcceptanceConfirm` component is embedded inline in the existing reachable page. It does not introduce any new route.

Evidence: `apps/web/src/app/sitemap.ts` already includes `/terms`; `apps/web/src/app/(public)/terms/page.tsx` (PG-051, attestation COMPLETE) is the target of the modification.

## Category CC — Page Documentation Co-Change Check

**Category CC: PASS (no new page.tsx created)**

This plan MODIFIES `apps/web/src/app/(public)/terms/page.tsx` — it does NOT create a new page. The page count does not change. Therefore:
- `docs/design/PAGE_MAP_AND_FLOWS.md` does NOT need a new entry (page already listed)
- `apps/web/src/app/__tests__/sitemap-reconciliation.test.ts` hard-coded count does NOT change
- `docs/design/sitemap.md` total count does NOT change

No Category CC action required.

## Integration Checkpoints Summary

| After Step | Verification | Status |
|------------|-------------|--------|
| 1-3 | All 3 test suites RED | Confirms tests are real |
| 4 | DB typecheck + migration applied | Schema valid on local test DB |
| 5 | Domain GREEN | TermsAcceptance.ts correct |
| 7 | API GREEN + typecheck | Router correct, isolation proven |
| 8 | Web GREEN + regression | UI correct, /terms unaffected for unauthed |
| 11 | Full package suites | No cross-package regressions |
| 12 | Cheap gates | Format, lint, typecheck, architecture |
| 15 | Codex 3x clean | Security/quality gate clear |
| 17 | Full pre-ship PASS | Gate-lock honored, ready for PR |

## Plan-Reviewer Sign-off

<!-- plan-reviewer: subagent -->

`reviewer_subagent: plan-reviewer-ifc309@session-eed3fc91`

**Awaiting plan-reviewer verdict from subagent plan-reviewer-ifc309.**
