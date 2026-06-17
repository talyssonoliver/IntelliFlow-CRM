# Local verification — findings (2026-06-17)

What the harness proved by exercising the **real** local stack. Two buckets: the
auth regression (fixed + verified) and standing **enforcement gaps** the green
test suites never surfaced.

## ✅ FIXED + VERIFIED — cross-origin auth (PERF-08/09)

**Symptom:** after login the page renders briefly, the authenticated header is
missing, and every click bounces back to `/login`.

**Root cause:** PERF-08/09 made the web a cross-origin tRPC client (browser →
Railway `/api/trpc`). Every authed call carries `Authorization`, so the browser
sends a CORS **preflight (OPTIONS)** — and the API HTTP server had **no CORS
handling**. The preflight 404'd, the browser blocked the real request, and the
failed `auth.getStatus` was read as "not authenticated" → redirect loop. The
`CORS_ALLOWED_ORIGINS` / `API_CORS_ORIGIN` env vars existed but were never wired
up. Mocked tests passed because none make a real cross-origin request.

**Fix:** `apps/api/src/http-server.ts` now answers the preflight (204) and
echoes `Access-Control-Allow-Origin` for allow-listed origins. No
`Allow-Credentials` (auth is a Bearer token, not cookies). Regression test in
`apps/api/src/__tests__/http-server.test.ts` (real `http.request`, so the
`Origin` header is actually sent).

**Verified, not asserted:**

- `verify-cors-auth.mjs`: preflight 204 + `ACAO`; cross-origin `auth.getStatus`
  → 200 + `ACAO` + `{authenticated:true, sarah.johnson@…}`.
- Browser: `/dashboard` loads as Sarah, header present; clicking **Leads**
  navigates without a `/login` bounce; console logs
  `[useRequireAuth] User is authenticated, no redirect needed` — zero CORS/401
  errors.

---

## ⚠️ GAP 1 — DB row-level security is BYPASSED (tenant isolation is app-layer only)

`verify-db-rls.mjs` output: 81 `tenant_isolation` policies exist and RLS is
_enabled_ on `leads`/`contacts`/`accounts` — but it does **not** enforce:

- the tables are **not** `FORCE ROW LEVEL SECURITY`, and
- the app connects as `postgres` (`rolsuper=t`, `rolbypassrls=t`).

Proof: `SET app.current_tenant_id='<bogus>'; SELECT count(*) FROM leads;` still
returns **all 14 rows**. So Postgres RLS is a no-op for this connection, and
tenant isolation rests **entirely** on the application-layer
`createTenantWhereClause`. A single missing where-clause on any tenant table is
a cross-tenant leak that RLS will **not** catch (cf. the prior leak incident,
which RLS did not catch — consistent with this).

**Recommended fix:** connect Prisma as a dedicated non-superuser role without
`BYPASSRLS`, **or** add `FORCE ROW LEVEL SECURITY` to tenant tables — then the
~80 policies become a real second line of defence. Until then, treat the
app-layer where-clauses as the _only_ isolation and test them accordingly.

> Note: `createTenantScopedPrisma` also short-circuits (skips the `SET`)
> entirely under `NODE_ENV=test` / `VITEST=true`, so the test suite never
> exercises the DB-layer path even where it would matter.

---

## ⚠️ GAP 2 — Tier / module gating is FRONTEND-ONLY

`verify-tier-modules.mjs`: `moduleAccess.getEnabledModules` resolves the tenant
to a plan and returns its modules (seeded tenant → `STARTER` →
`CORE_CRM, SUPPORT, AI_INTELLIGENCE, ANALYTICS`). Correct as an _advisory_
signal — but the backend does **not** enforce it. `<ModuleGate>` /
`<ModulePaywall>` only hide UI; the `legal` / `support` / `commerce` routers use
`tenantProcedure` with **no `requireModule` middleware**, so a `STARTER` tenant
that calls a `LEGAL`/`COMMERCE` endpoint directly still receives data.

**Recommended fix:** add a `requireModule(module)` middleware (composed onto the
relevant routers) that throws `FORBIDDEN` when the tenant's plan does not
include the module — mirroring how `adminProcedure` enforces role.

---

## ⚠️ GAP 3 — No per-tenant AI cost cap; mock provider reports 0 tokens

`CostTracker` (`apps/ai-worker`) accumulates token cost **in-memory, per
process** after each real LLM call — there is no DB record per call and no
per-tenant budget enforcement. The ADR-053 query budget (15 DB queries/request)
defaults to **observe** (warn-only), not throw. Locally `AI_PROVIDER=mock`
returns 0 tokens, so cost can't be asserted via the mock — a real assertion
needs `AI_PROVIDER=ollama` and reading `CostTracker.getDailyCost()`.

**Recommended fix (if cost control matters):** record token usage per call to
the DB keyed by tenant, and add a per-tenant budget guard that fails closed when
a tenant exceeds its allowance. Not built here — flagged for a product decision.

---

## Industry (no gap, for the record)

`Account.industry` is free-text with a tenant-scoped vocabulary
(`AccountIndustryOption`). The only behavioural branching is in the AI
enrichment/inference chains (`apps/ai-worker`), which drop industries not in the
tenant vocabulary. There is no tier-like industry gating — it's a data
attribute.
