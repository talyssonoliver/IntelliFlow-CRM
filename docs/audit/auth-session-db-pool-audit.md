# Auth session / sign-out / slow-render — root-cause audit

**Date:** 2026-06-06 **Author:** engineering (with Claude) **Status:** root
cause PROVEN from prod; fix prescribed; primary fix needs Terraform coordination
**Symptoms reported (prod, `https://intelli-flow-crm-web.vercel.app`):**

1. After login, the user is signed out automatically after a short time.
2. Navigating to internal pages (`/dashboard`, `/calendar`, …) intermittently
   redirects to `/login` or renders blank.
3. Extreme slowness — some pages take ~30s to render.

> **Headline:** all three symptoms share **one** root cause — **Supabase
> Postgres connection-pool exhaustion under Vercel serverless concurrency**
> (`EMAXCONNSESSION … session mode … pool_size: 15`). It is **not** the
> auth/cookie/refresh code. The originally-proposed cookie/refresh fixes are
> **retired** (they were a hypothesis; the repro disproved them).

---

## 1. Where auth state lives, how SSR reads it, how refresh is wired

Verified against deployed `origin/main` (6/7 files identical to the working
branch; `providers.tsx` + `client.ts` read directly from `main`).

### 1.1 State locations

| Store                    | Keys                                                        | Set by                                                                                                                                  | Read by                                                                                                          | Notes                                                                                                                         |
| ------------------------ | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **localStorage**         | `accessToken`, `refreshToken`                               | `storeSessionTokens()` (`lib/shared/token-exchange.ts:208`)                                                                             | tRPC client (`app/providers.tsx`)                                                                                | Primary client store. `isTokenValid()` **deletes** `accessToken` when expired (`providers.tsx:59`).                           |
| **Cookie** `accessToken` | non-httpOnly, `max-age = JWT exp`, `samesite=lax`, `secure` | `syncTokenToCookie()` (`lib/shared/session-cleanup.ts:79`), called from `AuthContext` mount/refresh (`AuthContext.tsx:166,308,335,504`) | **Next SSR server components** via `getAccessToken()` (`lib/trpc-server.ts:13` → `cookies().get('accessToken')`) | **NOT set by the OAuth callback** (latent issue B below).                                                                     |
| **Supabase SDK session** | `sb-*` (localStorage)                                       | `setSession()` in `syncTokensToSupabase` (`AuthContext.tsx:289`)                                                                        | SDK refresh                                                                                                      | `persistSession:true`, **`autoRefreshToken:false`** (`supabase-browser.ts:68`); OAuth callback `clearSupabaseLocalStorage()`. |

### 1.2 How each layer authenticates a request

- **Client tRPC** (`app/providers.tsx:164,291`): sends
  `Authorization: Bearer <token>` using `getValidAccessToken()` — **only if the
  token is non-expired** (else no header).
- **API / tRPC context** (`@intelliflow/api/context` →
  `apps/api/src/context.ts:123` `extractBearerToken`): authenticates from the
  **`Authorization` header** (Bearer), `verifyToken()` against Supabase, then
  **DB user resolution**. → **Every authenticated request touches Postgres.**
- **Next SSR server components** (e.g. `app/dashboard/page.tsx`): read the
  **cookie** via `getAccessToken()` for prefetch only (non-fatal on miss).
- **Web tRPC route** `app/api/trpc/[trpc]/route.ts:31`: `createContext({ req })`
  — runs on **Vercel serverless**, opening a DB connection per invocation.

### 1.3 Refresh wiring (`AuthContext.tsx:274–393`)

- `autoRefreshToken:false` → SDK does **not** background-refresh.
- On mount: `syncTokensToSupabase()` → `setSession()` (re-establishes SDK
  session, refreshes if expired).
- Backup: a single `setTimeout` at `exp − 5min` →
  `supabase.auth.refreshSession()` (`:381`). Fragile (timer throttled in
  backgrounded tabs; refresh-token rotation).
- `onAuthStateChange('TOKEN_REFRESHED')` → writes new tokens to localStorage +
  cookie (`:324–336`).

### 1.4 Redirect guard (`AuthContext.tsx:960–1040`, `useRequireAuth`)

- No server-side `redirect('/login')` exists anywhere in `app/` (grep clean).
- Redirect is **client-side**: `router.replace('/login')` when the token is
  missing (`:1039`) **or** present-but-`auth.getStatus`-says-unauthenticated
  (`:1033`). **A `getStatus` 500 is treated as unauthenticated.** ← the trigger.

---

## 2. Prod repro — captured live (symptom → cause)

Captured on `intelli-flow-crm-web.vercel.app` (browser console + network + JS).
**Finding 0:** the prod build **strips `console.*`** — AuthContext's logs do not
appear in prod; debugging must use network + state. (Recommend a prod-safe
diagnostic; see fix D.)

### 2.1 The decisive capture — `auth.getStatus` 500

With a **valid** Bearer token (TTL 60 min, ~3567 s left), called 4×:

```
GET /api/trpc/auth.getStatus?batch=1   → 500  (657–1801 ms)
body: {"error":{"message":"(EMAXCONNSESSION) max clients reached in session mode
       - max clients are limited to pool_size: 15","code":-32603,
       "data":{"code":"INTERNAL_SERVER_ERROR","httpStatus":500,"path":"auth.getStatus"}}}
```

Control: **without** a token, `getStatus` → **200 `{authenticated:false}` in 144
ms** (never touches the DB). → the 500 is exclusive to the **authenticated (DB)
path**.

### 2.2 The symptom, reproduced end-to-end

| Step                         | Observed                                       | Evidence                                             |
| ---------------------------- | ---------------------------------------------- | ---------------------------------------------------- |
| Fresh tab → `/dashboard`     | redirect → `/login`                            | `path:/login`, `at/rt/ck: MISSING`                   |
| Login w/ Google              | lands `/` unauth marketing ~5s, then dashboard | screenshots; `at:present, ck:SET, ttlMin:60`         |
| `/dashboard` again           | **bounced to `/login`**, tokens cleared        | `getStatus` **500**; post-bounce `at/rt/ck: MISSING` |
| State after a failed refresh | `accessToken` deleted, `refreshToken` orphaned | `{at:MISSING, rt:present, ck:MISSING}`               |

### 2.3 The causal chain (proven)

1. Vercel serverless `/api/trpc` opens DB connections via a node-postgres `Pool`
   with **no `max` cap** (`packages/db/src/client.ts`:
   `new PrismaPg({ connectionString })`, default `max:10`/instance).
2. `DATABASE_URL` is the Supabase **session-mode** pooler (`pool_size:15`) —
   proven by the error string.
3. Concurrent serverless instances exhaust the 15-slot session pool →
   **`EMAXCONNSESSION`** → authenticated tRPC procedures **500**.
4. `useRequireAuth` reads 500 as unauthenticated → clears tokens →
   `router.replace('/login')`. **= sign-out / redirect / blank.**
5. **30s slowness = same cause**: requests block waiting for a connection that
   session mode never frees.

Intermittency = a function of concurrent load vs. the 15-slot pool.

### 2.4 Why the original hypothesis was wrong

The cookie/refresh theory predicted a **valid token + set cookie** would work.
It did **not** — a valid token + `ck:SET` still produced the 500 bounce. The
cookie-not-set-after-OAuth and one-shot-refresh items are **real but secondary**
(latent issues A/B below); they are **not** the sign-out cause.

---

## 3. Fixes + risk analysis + preview verification

### Fix 1 (PRIMARY) — `DATABASE_URL` → Supabase **transaction-mode pooler**

- **What it fixes:** the 500/sign-out and the 30s slowness (the whole headline).
- **Change:** point the web app's serverless `DATABASE_URL` at the **Supavisor
  transaction pooler** —
  `postgresql://postgres.<ref>:<pw>@<region>.pooler.supabase.com:6543/postgres?pgbouncer=true`
  (port **6543**, user `postgres.<ref>`). Transaction mode multiplexes, so
  serverless concurrency no longer holds/exhausts connections.
- **Keep direct/session URL only for migrations** (Prisma `directUrl`): the
  transaction pooler can't run DDL/migrations.
- **Flows touched:** every server-side DB read (all of tRPC). OAuth /
  email-password / multi-tab / logout are unaffected at the code level — they
  all just stop 500-ing.
- **Ownership / coordination:** `DATABASE_URL` is a **Vercel env var**, set in
  Terraform from `module.supabase.connection_string`
  (`modules/vercel/README.md:44`). Today the supabase module outputs the
  **direct** URL (`modules/supabase/main.tf:124` → `db.<ref>.supabase.co:5432`),
  and the deployed Vercel value is the **session pooler** — **both wrong for
  serverless.** → **This change belongs in the Terraform SSOT, which the
  parallel agent owns.** Do **not** hand-edit the Vercel dashboard (the next
  `terraform apply` would revert it). Coordinate via the tracked issue (below).
- **Verify (Vercel preview):** set the preview `DATABASE_URL` to the 6543 pooler
  → re-run the probe from §2.1 (`getStatus` ×N with a real Bearer) → expect
  **all 200, no `EMAXCONNSESSION`, sub-second** → then promote to prod.

### Fix 2 (DEFENSIVE) — cap the pg `Pool` `max` in `client.ts`

- **What it fixes:** prevents a single serverless instance from grabbing 10
  connections; bounds blast radius even if a wrong URL slips through.
- **Change:**
  `new PrismaPg({ connectionString: process.env.DATABASE_URL!, max: <small> })`
  (e.g. `max: 1` for serverless; env-driven so workers/long-lived processes can
  use a larger pool).
- **Flows touched:** all server DB access (web + any consumer of
  `@intelliflow/db`). Risk: too-low `max` could serialize a long-lived worker →
  make it env-driven (`DB_POOL_MAX`), default conservative for serverless.
- **Conflict-safety:** `packages/db/src/client.ts` is **not** touched by any
  open PR or the parallel Terraform/e2e branches (verified) → safe to ship in
  this PR.
- **Verify:** unit + integration tests for `@intelliflow/db`; preview smoke.

### Fix 3 (LATENT-A) — make refresh robust (only after Fix 1 lands)

- `autoRefreshToken:true` (SDK session is established via `setSession`;
  `onAuthStateChange('TOKEN_REFRESHED')` already persists tokens+cookie) →
  removes the throttled-`setTimeout` fragility.
- **Risk:** changes refresh behavior across OAuth/email/multi-tab — **do not
  bundle with Fix 1**; ship separately, preview-verify a >1h session.

### Fix 4 (LATENT-B) — set the cookie in the OAuth callback + prod-safe diag

- `oauth-callback.tsx`: call `syncTokenToCookie(session.access_token)`
  synchronously before redirect (fixes SSR-prefetch-after-OAuth; not the
  sign-out). Add a minimal prod-visible auth diagnostic since `console.*` is
  stripped.
- **Risk:** low (additive). Preview-verify SSR prefetch + login.

---

## 4. Sequencing & conflict-safety

- **This PR (off `main`, conflict-safe):** this audit doc + **Fix 2**
  (`client.ts` Pool cap, env-driven).
- **Coordination issue (filed):** **Fix 1** — `DATABASE_URL` → 6543 transaction
  pooler in the **Terraform supabase/vercel modules** (parallel agent's lane).
  This is the actual prod unblock; it must be applied via Terraform, not the
  dashboard.
- **Follow-up PRs:** Fix 3, Fix 4 — separately, each preview-verified.
- Verified: no open PR (#279/#282/#283) and none of the active Terraform/e2e
  branches modify the 7 auth files or `client.ts`.
