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

**Mechanism proven (2026-06-17):** creating a dedicated non-superuser role
(`NOSUPERUSER NOBYPASSRLS`) with DML grants and connecting as it makes RLS
enforce immediately — with the tenant session var set, a bogus tenant saw **0**
leads, the correct tenant saw **14**, no var set saw **0**. So the fix is
"connect as a non-superuser role" (a non-owner non-superuser is subject to RLS
automatically; `FORCE ROW LEVEL SECURITY` additionally covers the owner case).

**But this is a scoped hardening PROJECT, not a one-line change — do NOT flip
the prod connection role naively:**

1. **Raw `ctx.prisma` paths would break.** Only `prismaWithTenant`
   (`createTenantScopedPrisma`) issues `SET app.current_tenant_id`. Every query
   that uses the raw `ctx.prisma` on an RLS table would, under a non-superuser
   role, return **0 rows** (no tenant var set). All such call sites must first
   be routed through the tenant-scoped client.
2. **Connection-pool `SET` drift can _leak across tenants_.** A session-level
   `SET` on a pooled connection can outlive the request and be read by a later
   query on the same connection — the very reason the app-layer
   `createTenantWhereClause` exists. RLS via session var must therefore use
   `SET LOCAL` inside a transaction (pooler-safe), not a bare `SET`.
3. Complete the DML/sequence/function grants for the app role, add
   `FORCE ROW LEVEL SECURITY` to tenant tables (via migration), and cut the
   production Supabase connection string over to the new role with a rollback
   plan.

**Until that lands, the app-layer where-clauses are the _only_ real isolation —
test them as such.** `verify-db-rls.mjs` will flip from FINDING to OK once the
app connects as a role where RLS actually enforces.

> Note: `createTenantScopedPrisma` also short-circuits (skips the `SET`)
> entirely under `NODE_ENV=test` / `VITEST=true`, so the test suite never
> exercises the DB-layer path even where it would matter — wire a non-superuser
> integration lane to close that blind spot.

---

## ✅ FIXED — GAP 2: tier / module gating was FRONTEND-ONLY

Was: `<ModuleGate>`/`<ModulePaywall>` only hid UI; the `legal`/`commerce`
routers used `tenantProcedure` with no entitlement check, so a `STARTER` tenant
calling a `LEGAL` endpoint directly still received data.

**Fix:** `requireModule(moduleId)` middleware +
`moduleTenantProcedure(moduleId)` factory in `trpc.ts`, applied to the LEGAL
documents router. Deny only on an explicit `false` from the `moduleAccess` port
(ADMINs always pass), so the real adapter enforces exactly while `mockDeep` unit
tests are unaffected (200 legal tests still green). Fails OPEN on resolution
errors — this is a revenue/access gate atop the UI gate, not the isolation
boundary.

**Verified live:** a `STARTER` dev-fallback tenant calling `documents.list` now
gets **HTTP 403 FORBIDDEN** (`verify-tier-modules.mjs`). Apply the same
`moduleTenantProcedure('<MODULE>')` alias to any other add-on routers (e.g.
COMMERCE) as they gain real endpoints.

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
