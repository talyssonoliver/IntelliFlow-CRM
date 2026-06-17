# Local verification harness (`tools/local-verify`)

Runnable checks that exercise the **real** local stack — real HTTP, real
Postgres — instead of mocks. Born out of PERF-08/09: the cross-origin auth
regression shipped green because every test mocked the tRPC client, so nothing
ever made a real cross-origin request. These scripts make the requests the
browser actually makes, and assert what the database actually does.

> The unit/integration suites still run in CI and are the gate. This harness is
> the **reality check** you run locally before trusting that a change behaves in
> the real world — and it deliberately surfaces enforcement **gaps** (see
> `FINDINGS.md`).

## Prerequisites

1. Docker infra up (postgres/redis):
   ```bash
   docker compose up -d postgres postgres-test redis redis-test
   ```
2. Schema + seed on the test DB (port 5433):
   ```bash
   cd packages/db
   DATABASE_URL="postgresql://postgres:postgres@localhost:5433/intelliflow_test?schema=public" \
   DIRECT_URL="postgresql://postgres:postgres@localhost:5433/intelliflow_test?schema=public" \
   npx prisma db push && npx tsx prisma/seed.ts
   ```
3. The API running locally against that DB, with the dev-auth fallback so an
   un-tokened request resolves to a seeded user (Sarah Johnson / tenant
   `…0001`). **Never use the default `pnpm dev:api`** — its dotenv loads the
   production `.env.local`. Use the safe explicit env instead:
   ```bash
   cd apps/api
   ALLOW_DEV_AUTH_FALLBACK=true npx dotenv -e ../../.env.test -- tsx src/main.ts
   # -> [API] HTTP server listening on http://localhost:4000
   ```
4. (Only for the browser proof) the web, pointed at the local API:
   ```bash
   cd apps/web
   NEXT_PUBLIC_API_URL=http://localhost:4000 \
   NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 \
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<supabase demo anon key> \
   npx next dev -p 3000
   # visit http://localhost:3000/dashboard — loads as Sarah, no /login redirect
   ```

## Run

```bash
node tools/local-verify/run-all.mjs
# or individually:
node tools/local-verify/verify-cors-auth.mjs       # the PERF-08/09 fix
node tools/local-verify/verify-db-rls.mjs           # is tenant RLS actually enforced?
node tools/local-verify/verify-tier-modules.mjs     # tier/module entitlements
```

Point any verifier at **production** to spot-check the deployed system, e.g.:

```bash
API_URL=https://api-production-e9c1.up.railway.app \
WEB_ORIGIN=https://intelli-flow-crm-web.vercel.app \
node tools/local-verify/verify-cors-auth.mjs
```

## What each verifier checks

| Script                    | Asserts                                                                                                                     | Notes                                            |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `verify-cors-auth.mjs`    | CORS preflight is answered (not the old 404) + `ACAO`; the real cross-origin `auth.getStatus` returns 200 + `ACAO` + a user | The exact PERF-08/09 regression                  |
| `verify-db-rls.mjs`       | Whether Postgres RLS **actually** isolates tenants for the connecting role                                                  | Surfaces the superuser-bypass gap (see FINDINGS) |
| `verify-tier-modules.mjs` | `moduleAccess.getEnabledModules` shape + resolved tier                                                                      | Flags that gating is frontend-only               |

Exit codes: `0` all good · `1` a check failed (a real finding to act on) · `2`
the verifier crashed (infra not up?).

## Conventions

- Plain dependency-free Node ESM (`.mjs`) — runs with bare `node`.
- Raw `node:http` (not `fetch`) so the forbidden `Origin` header is actually
  sent — CORS is the whole point of several checks.
- `lib/http.mjs` holds the shared request + tRPC + reporter helpers.
