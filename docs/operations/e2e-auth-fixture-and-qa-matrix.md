# E2E Auth Fixture & Authenticated QA Matrix

> Step 1–2 of the E2E rebalance (see `e2e-pyramid-rationalization.md`). A real
> auth + seed fixture that provisions QA users across **tiers × tenants ×
> industries** and an authenticated matrix that exercises module-gating,
> cross-tenant isolation and per-module authorized paths with **real tokens**.

## The fixture (Playwright `setup` project)

`tests/e2e/auth.setup.ts` provisions every persona and writes an authenticated
`storageState` per persona; `dependencies: ['setup']` projects consume them.

**How a persona becomes authoritative.** The API resolves a request's user by
`prisma.user.findUnique({ where: { id: supabaseId } })` (apps/api `context.ts`),
so we set the seeded `User.id` to the **Supabase auth user id** — the API then
uses our seeded tenant/plan with no JIT auto-provisioning.

Per persona (`tests/e2e/fixtures/`):

1. `provision.ts` — Supabase-admin creates/confirms the auth user (per-run
   random password, never committed) and signs in for a **real** access/refresh
   token; then seeds the **local test DB** (tenant, user, workspace
   `plan`+`industry`, membership, a marker account). Hard guard: refuses unless
   `DATABASE_URL` is `localhost:5433`.
2. `storage-state.ts` — builds the `storageState` a real login writes:
   `accessToken`/`refreshToken` in localStorage + an `accessToken` cookie for
   SSR/middleware. (The session fingerprint lives in sessionStorage and
   `verifySessionFingerprint()` passes when none is stored, so injected state is
   accepted.)
3. The Prisma client can't load under Playwright's ESM loader, so provisioning
   runs in a `node --import tsx` child (`provision-cli.ts`).

### Personas (`qa-personas.ts`)

| key            | plan         | industry | purpose                                                   |
| -------------- | ------------ | -------- | --------------------------------------------------------- |
| `enterprise`   | ENTERPRISE   | saas     | all modules; default authed user (unlocks existing specs) |
| `professional` | PROFESSIONAL | legal    | LEGAL granted, COMMERCE denied                            |
| `starter`      | STARTER      | legal    | LEGAL denied even for a legal-industry tenant             |
| `tenantB`      | STARTER      | finance  | 2nd tenant — cross-tenant isolation control               |

`tests/e2e/.auth/` (gitignored — real tokens) holds the `storageState` files +
`_meta.json` (tenant/account ids for matrix specs).

## Running it (Option B stack)

```bash
# API :4000 + web :3000 up on the Option B env (see local-real-auth-validation-runbook.md)
npx dotenv -e $TEMP/api-localb.env -- npx playwright test --project=setup --project=authenticated
```

The `setup` project mints fresh tokens (~60-min Supabase expiry) before each
run, so the matrix never runs on stale state.

## The authenticated matrix (`tests/e2e/matrix/`)

| Spec                      | Covers                                                                                                    | Result |
| ------------------------- | --------------------------------------------------------------------------------------------------------- | ------ |
| `auth-smoke.spec.ts`      | every persona lands authenticated on a protected route (no `/login` bounce) — the unlock proof            | 4 ✓    |
| `entitlement-api.spec.ts` | module-gating per tier: LEGAL denied to STARTER, granted to PRO/ENT; Core/AI/Analytics authorized for all | 8 ✓    |
| `cross-tenant.spec.ts`    | a tenant reads its own account but not another tenant's (≥2 tenants), symmetric                           | 3 ✓    |

All **16 green** on the Option B stack (real Supabase tokens → running API).

## Findings from the matrix

- **ModuleGate bypasses gating for tenant-admins** (frontend/backend mismatch).
  `apps/web/src/components/ModuleGate.tsx` renders children for ADMIN/owner
  roles, but the backend `requireModule` is plan-based with no admin bypass. A
  STARTER tenant-admin therefore sees the paid LEGAL UI while its data calls
  return FORBIDDEN — broken UX and the paywall is defeated for admins. Tracked
  as a follow-up; recommend dropping the tenant-admin bypass so the paywall
  shows. (Because all personas are ADMIN, UI-paywall assertions need a USER-role
  persona — see "Remaining".)
- **No industry-specific backend behaviour.** `industry` is a data field on
  accounts/leads; nothing branches on `workspace.industry`. The matrix records
  an industry per persona for realistic variety, but there is no industry gating
  to assert (reported honestly rather than fabricated).

## The unlock (done)

The authenticated Journey specs (agent-approvals, ai-features, case-timeline,
contact-crud, forms, home, navigation, pipeline-settings, tasks,
workflow-builder) now run under the `authenticated` project with the ENTERPRISE
storageState instead of bouncing to `/login`. Proof: `navigation.spec.ts` went
**0 → 13/20** passing on the fixture; the residual failures are leads-page
data/selector issues (a seeded dataset would close them), not auth. In CI
without the Supabase env the `setup` dependency fails and these specs are
skipped (clear signal) rather than producing ~100 login-bounce failures.

## Step 3 — actionable few (status)

- **signup auto-login** ✅ — both `/signup/success` assertions replaced with
  "auto-login lands off signup, not on login"; added a hydration gate (a cold
  App-Router page native-submitted before React attached `onSubmit`, leaking
  fields into the URL) + a real terms-checkbox click. Green on the live stack.
- **contact-crud** — already written defensively (count-guarded, no hard data
  assumptions); now fixture-ready to upgrade to a real authed create→edit→delete
  once a seeded contact is added.
- **features-tour** — recategorised to the unauthenticated project (public
  `/features`); **3/5 pass**. Residual: `?tour=1` replay-with-seen-flag and the
  PublicFeedbackFab dialog — spec-specific, not auth/banner.
- **icons** ⚠️ — 8 failing under `next dev`: the `fonts-ready` class is never
  added (self-hosted Material Symbols font doesn't load the same way in dev as
  in the production build). Needs verification against a production build;
  likely a dev-only environment difference rather than a product regression.

## Remaining

- **UI module-gating**: add a USER-role STARTER persona and assert
  `ModulePaywall` renders on a gated route — **gated on the ModuleGate
  admin-bypass decision** (#18). Today all personas are ADMIN, so the frontend
  gate is bypassed.
- **Seed a richer dataset** (contacts/leads/deals for the ENTERPRISE tenant) to
  close the data-dependent residuals (navigation leads page, contact-crud edit).
- **Step 4 — computer-use**: not required for the matrix — the fixture lets
  Playwright reach the authenticated UI directly. Reserve it for any rich
  AI/legal surface that proves un-drivable in Playwright.
- **Step 5 — reconcile metrics/attestation** for the now-authorized paths
  (project-tracker metrics tree) — pending.
- **icons** dev-vs-prod font verification (above).

---

## 2026-06-19 Update — matrix complete, E2E remediation, #11 fix

This section supersedes the stale status notes above (e.g. "navigation 0→13/20",
"seed a richer dataset: pending"). Owner directive for this pass: **"forget CI
until they pass + are trustworthy locally; investigate WHY each fails — stale vs
real — never blind-trim."**

### Access-control coverage (the matrix), by pyramid layer — all green

| Layer       | What                                                                                                                                                       | Result                            |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| unit        | `ModuleGate.test.tsx` — plan-based UI gating (tenant-admin bypass removed, #18)                                                                            | 4 ✓                               |
| unit        | agent approval by-actionId tenant guard (#11, below)                                                                                                       | in `agent.router.test.ts` (129 ✓) |
| integration | `tier-module-gating` + `rls-tenant-isolation` (real repo + test DB)                                                                                        | 14 ✓                              |
| integration | `legal-module-entitlement` caller-guard (enumerates `_def.procedures`)                                                                                     | 8 ✓                               |
| API E2E     | `entitlement-api` (LEGAL denied STARTER / granted PRO+ENT; Core/AI/Analytics always-on incl. the **calendar-shared `appointments.list`** regression guard) | 9 ✓                               |
| API E2E     | `cross-tenant` (own-account read OK; cross-tenant denied; symmetric)                                                                                       | 3 ✓                               |

**Module-entitlement + tenant-isolation are fully proven at
unit/integration/API.** The browser **UI E2E** specs (`auth-smoke`,
`module-gating-ui`) are the thin top of the pyramid and are **environmentally
blocked locally**: the `next dev` web OOMs (JS-heap, even at
`--max-old-space-size=8192`) under sustained E2E load and serves the `/login`
fallback, so those specs bounce. Their _logic_ is covered by the layers above; a
stable green needs a prod `next build`/`start` web (the same definitive fix
called out in `e2e-pyramid-rationalization.md`).

### Real finding fixed — `entitlement-api` was a true positive (stale API process)

`appointments.list` (shared calendar) 403'd STARTER ("plan does not include
LEGAL"), but the **source was already correct** (reverted to the cloak
`tenantProcedure`, gated only on `caseId`). The running `tsx` API (no
hot-reload) was serving the pre-revert `moduleTenantProcedure('LEGAL')` version.
**Restarting the API → 9/9 green.** Lesson: restart `apps/api` after any edit —
a stale process silently invalidates API-tier tests.

### #11 closed — agent approval-workflow tenant-scoped (owner-approved)

Deeper than first noted: the agent `actionStore` was a **single shared bucket**
under a hardcoded `DEFAULT_TENANT_ID`; `getPendingAction` ignored `ctx` and
`get(id)` had no tenant filter → any authed user could read another tenant's
pending-action content by `actionId` (low risk: 122-bit UUIDs, RBAC on
approve/reject). **Fix:** `executeTool` stamps `ctx.user.tenantId`; the store
persists/surfaces it; `getPendingAction` / `approveAction` / `rejectAction`
enforce `action.tenantId === ctx.user.tenantId` → `NOT_FOUND` on cross-tenant
(no existence probe). Resolves the "wire tenantId through background contexts"
TODO (jobs read it off the row). +4 caller-guard regression tests (129 agent
tests green). Scoped tight; the broader `buildAgentContext` tenant-threading is
a separate follow-up.

### Findings reconciliation

- **ModuleGate admin-bypass (#18): FIXED** — gates by plan now (unit-tested).
  The earlier "gated on the decision" caveat is resolved.
- **No industry-specific backend gating** — unchanged/honest; `industry` is data
  only.
- **Observability/system-health (#8): verified operational** — OTel tracing
  (console dev / OTLP prod) + Sentry wired; health probes green
  (`alive`/`ready`/`check`). Minor: `health.dbStats` returns `unsupported`
  (Prisma metrics not enabled in this client build) — gracefully handled, not a
  failure.

### E2E remediation (the broader suite, for context)

Authenticated journey suite went **136 failed → 3 (env blank-flake) / 183
passed** via: a tenant-scoped domain seeder (`tests/e2e/fixtures/seed-domain.ts`
— closes the old "seed a richer dataset" item), an onboarding-modal
click-interception fix, harness hardening (retries 2 / `expect` 15s / authed
timeout 60s / `--workers=2`), and 8 specs re-pointed at the real UI. **Zero real
product regressions found** — every failure was a stale test (product evolution)
or the dev-server OOM/flake. All **working-tree only, not committed/pushed**.
