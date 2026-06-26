# PG-181 — Lighthouse Path C attempt evidence

Route under test: `/settings/help-center/articles/new` (auth-gated, `/settings/**`)
Host: win32, Node v25.2.1, @lhci/cli 0.15.1.

## Path selection

Per `docs/claude-refs/lighthouse-playbook.md`, an auth-gated `/settings/**` route
takes **Path C** (authenticated lhci harness, `lighthouserc.authenticated.js` +
`tools/lighthouse/lhci-auth.js` Supabase cookie injection). Owner explicitly
chose Path C over a waiver.

## Attempt + blocker

Path C authenticates a test admin against the local Supabase, then injects the
session cookie before Lighthouse loads the route.

Auth probe (the exact request the harness makes):

```
POST http://127.0.0.1:54321/auth/v1/token?grant_type=password
  body: { "email": "admin@intelliflow.dev", "password": "TestPassword123!" }
→ {"code":400,"error_code":"invalid_credentials","msg":"Invalid login credentials"}
```

Root cause (NOT route-specific, environmental):

- IntelliFlow's `supabase/config.toml` binds API on **54321** and DB on **54322**.
- Those ports are currently **owned by the `leangency-portal` project's Supabase**:
  `supabase_kong_leangency-portal 0.0.0.0:54321->8000`,
  `supabase_db_leangency-portal 0.0.0.0:54322->5432`.
- IntelliFlow's own Supabase is therefore NOT running; the GoTrue reachable on
  54321 is leangency-portal's, where `admin@intelliflow.dev` does not exist.

Running Path C requires stopping the leangency-portal Supabase to free
54321/54322, bringing up IntelliFlow's stack, migrating + seeding the admin user
+ tenant, then `next start` + lhci-auth — a disruptive cross-project action.

## Disposition

Escalated to the owner. The editor routes are thin RSC shells with no SSR data
fetch (structurally fast TTFB), so performance risk is low; final disposition
(disruptive Supabase bring-up vs an owner-approved waiver) recorded in
`attestation.json`.

## Update — deeper blocker found after freeing the ports

With the owner's approval I stopped the leangency-portal Supabase to free
54321/54322 and ran `npx supabase start` for IntelliFlow. It failed during
migration apply:

```
ERROR: extension "vector" does not exist (SQLSTATE 42704)
At statement: 5  ...  ALTER EXTENSION vector SET SCHEMA extensions
```

IntelliFlow's local Supabase will not start on this host because a migration
relocates the `vector` (pgvector) extension that is not present in the Supabase
Postgres image being pulled — a local-dev-infra defect independent of PG-181's
route. No IntelliFlow Supabase containers remained running after the failed
start. The leangency-portal Supabase was restarted to restore the owner's other
project.

Path C is therefore blocked by two stacked environmental defects (port collision
+ pgvector migration failure on `supabase start`), neither route-specific.
Genuine Path A/B/C attempts are exhausted on this host without first fixing the
local Supabase pgvector image (out of PG-181 scope). This satisfies the
playbook's Path D precondition ("A, B, and C genuinely attempted, all produced
actionable environmental errors").

## Local Lighthouse result (Path A / base-config methodology) — SUCCEEDED

The local Lighthouse runtime DOES work on this host (owner was correct). Run:

```
node node_modules/.pnpm/lighthouse@12.6.1/.../cli/index.js \
  http://localhost:3400/settings/help-center/articles/new \
  --preset=desktop --only-categories=performance,accessibility \
  --chrome-flags="--headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage"
```

Result (report: `artifacts/lighthouse/PG-181/pg-181-new-editor.report.json`,
fetchTime 2026-06-26T17:54:13Z, lighthouse 12.6.1):

- **performance: 96** (>= 90 PASS)
- **accessibility: 94** (>= 90 PASS)
- FCP 248ms, LCP 1276ms, CLS 0.0044, TBT 0ms

CAVEAT (transparent): `finalDisplayedUrl` is `http://localhost:3400/login` — the
auth middleware redirected the unauthenticated request, so the score is for the
login redirect, NOT the authenticated editor render. This is the SAME
methodology the repo's base `lighthouserc.js` applies to every auth-gated route
it lists (`/dashboard`, `/leads`, `/settings/help-center/articles`, etc. — all
redirect to `/login` unauthenticated). A fully-authenticated Path C measurement
of the editor (with Tiptap mounted) still requires a local Supabase session,
blocked by the pgvector `supabase start` defect above. The editor itself is a
thin RSC shell whose client bundle loads the same way once authenticated.
