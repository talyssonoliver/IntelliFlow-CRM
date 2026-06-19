# Local Real-Auth Validation Stack ("Option B") — Runbook

> **Purpose.** Reproduce the local stack that lets you validate **real**
> authentication, onboarding, RLS/tenant scope, tier/industry gating and
> per-module behaviour **without** deploying to Vercel/Railway and **without**
> the dev-auth fallback masking the real flow. This is the stack used to find +
> verify the `getStatus` refetch storm (727→0), the signup auto-login fix, and
> the onboarding redesign (PR #502). Use it to deep-dive e2e failures and to run
> the system-QA matrix (tiers × industries × modules).
>
> **Why "Option B".** Web + API run **locally**, auth goes to the **production
> Supabase** project (we have no real users/data there beyond our own seed), and
> the database is the **local test DB** — so writes never touch prod, but
> tokens, JWT verification, email-confirm state and provisioning are all _real_.

## ⚠️ Non-negotiables

- **Never point `DATABASE_URL` at prod.** `.env.local`'s `DATABASE_URL` is
  production Supabase. Option B uses the **local test DB** (`DATABASE_TEST_URL`,
  port `5433`). Writes (provisioning, QA users) must land there, not prod.
- **Dev-auth fallback OFF.** `ALLOW_DEV_AUTH_FALLBACK` must be empty. With it on
  (+ `NODE_ENV != production`) every unauthenticated request resolves to the
  Sarah-Johnson fallback user (tenant `…0001`) and you validate nothing real.
  Symptom you're masked: `localStorage['authenticated-user-info']` shows
  `{ id: 0, loginMethod: "dev", name: "Local Dev" }` — stale cruft is fine, but
  a _live_ dev-fallback means the API returned it.
- **Never echo secrets.** Build env files by reading `.env.local`; print key
  **names/lengths**, never values. Redact URLs in logs.

## Prerequisites

- Local test DB on `localhost:5433` (`docker ps` /
  `Get-NetTCPConnection -LocalPort 5433`).
- Redis on `localhost:6379` (used by the API container wiring).
- `.env.local` present at repo root (prod Supabase keys + `NEXT_PUBLIC_*`).
- A worktree to run from (these examples use `iflow-perf89`).
- Test-DB schema applied (integration setup uses `prisma db push`; the test DB
  already has `company`/`department` etc.).

## 1. Build the env files (secret-free construction)

The two processes need different env. Generate both from `.env.local` so secrets
never appear in commands or the repo. (Windows `%TEMP%`; POSIX `/tmp`.)

**API env** (`$TEMP/api-localb.env`) — start from `.env.local`, then override:

```
NODE_ENV=development
ALLOW_DEV_AUTH_FALLBACK=        # <-- empty: fallback OFF
DATABASE_URL=postgresql://<user>:<password>@localhost:5433/intelliflow_test  # local test DB on :5433
DIRECT_URL=postgresql://<user>:<password>@localhost:5433/intelliflow_test
# Keep the PROD Supabase keys from .env.local (SUPABASE_URL, SUPABASE_ANON_KEY,
# SUPABASE_SERVICE_ROLE_KEY, the JWT/JWKS settings) — JWT verification must be real.
# Keep REDIS_URL, Stripe TEST keys, etc.
```

**Web env** (`$TEMP/web-localb.env`) — only `NEXT_PUBLIC_*`, with the API
pointed local. One-liner that copies every `NEXT_PUBLIC_*` from `.env.local` and
rewrites the API URL:

```bash
node -e '
const fs=require("fs"); const src=fs.readFileSync(".env.local","utf8");
const out=[]; let api=false;
for (const ln of src.split(/\r?\n/)) {
  const m=ln.match(/^(NEXT_PUBLIC_[A-Z0-9_]+)=(.*)$/); if(!m) continue;
  let [,k,v]=m; if(k==="NEXT_PUBLIC_API_URL"){v="http://localhost:4000"; api=true;}
  out.push(k+"="+v);
}
if(!api) out.push("NEXT_PUBLIC_API_URL=http://localhost:4000");
fs.writeFileSync(process.env.TEMP+"/web-localb.env", out.join("\n")+"\n");
'
```

This yields `NEXT_PUBLIC_API_URL=http://localhost:4000` plus the prod
`NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` / `_STRIPE_PUBLISHABLE_KEY` (needed for
the onboarding Stripe step).

## 2. Launch (two background processes)

```bash
# API — tsx runs the TS source directly (no build); dotenv-cli injects the env.
cd apps/api && npx dotenv -e "$TEMP/api-localb.env" -- tsx src/main.ts        # :4000
# Web — next dev (HMR picks up source edits without restart).
cd apps/web && npx dotenv -e "$TEMP/web-localb.env" -- next dev -p 3000       # :3000
```

The API reads **source** (tsx), so code edits to `apps/api` need a **restart**;
the web HMRs. Workspace deps (`@intelliflow/db` prisma client,
`@intelliflow/validators`) are consumed as **dist** — rebuild them
(`pnpm --filter @intelliflow/db db:generate && pnpm turbo build --filter=@intelliflow/api-client`)
and restart the API if you change schema/validators.

## 3. Verify it's really up (and really real)

```bash
curl -s -o /dev/null -w "%{http_code} %{time_total}s\n" http://localhost:4000/api/health   # 200, ~5ms
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/login                        # 200
```

Then confirm auth is **real** (not dev-fallback) via an in-page fetch using the
browser's own token — token never leaves the browser:

```js
// run in the authenticated tab (DevTools or the browser-automation js tool)
(async () => {
  const t = localStorage.getItem('accessToken');
  const claims = JSON.parse(atob(t.split('.')[1])); // iss=supabase, email=real user
  const r = await fetch(
    'http://localhost:4000/api/trpc/auth.getStatus?batch=1&input=' +
      encodeURIComponent('{}'),
    { headers: { authorization: `Bearer ${t}` } }
  );
  return (await r.json())[0].result.data; // { authenticated:true, user:{ emailVerified } }
})();
```

**tRPC wire format (no superjson):** queries are
`GET /api/trpc/<proc>?batch=1&input=%7B%7D` (i.e. `{}`). For a single proc with
no input that's all you need.

## 4. Measuring perf / catching refetch loops

The `getStatus` storm was invisible to unit tests; it was found by **counting
network requests** in the browser. Reusable technique:

1. Arm tracking: `read_network_requests({ urlPattern:'trpc', clear:true })` (or
   DevTools Network, filter `trpc`).
2. Sit **idle** on a page ~8s, then count by procedure. A healthy page is **0**
   while idle; a clean nav fires only its own queries (e.g. `/contacts` → 2: the
   `contact.filterOptions` GET + its CORS preflight OPTIONS).
3. **Red flag:** hundreds of identical `auth.getStatus` (the storm was
   ~727/nav). Tally:
   `grep -oE "api/trpc/[a-zA-Z.]+" | sort | uniq -c | sort -rn`.
4. A **full-page navigation resets** the extension's network tracking — measure
   across **client-side** nav (clicking `<Link>`s), and re-arm after any reload.

## 5. Mock-signup harness (browser)

To exercise the real signup → auto-login → onboarding → navigate flow:

1. Clear the tab's session for a clean start (`localStorage.clear()`), then
   navigate to `/signup`.
2. Fill name / email (use a throwaway like `qa.<tier>.<n>@example.com`) /
   password / confirm.
3. **Gotcha — the terms checkbox:** `form_input`/setting `.checked` does **not**
   update React's controlled state (submit fails "must accept terms"). Use a
   **real click** on the checkbox element (by `ref`), then submit.
4. Expect: lands authenticated on `/` (header shows the user), onboarding modal
   appears (Company + Department), `updateProfile` POST 200, `getState` →
   `{ completed:true, flowDone:true, emailConfirmed:true }`, then nav to
   `/dashboard` etc. with **no** redirect to `/login`.
5. Auto-confirm: the Supabase project has `mailer_autoconfirm=true`, so signup
   returns a session immediately and the user is `emailVerified=true`.

## 6. Teardown

```powershell
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  ? { $_.CommandLine -match 'api-localb\.env|web-localb\.env|main\.ts|next dev' } |
  % { Stop-Process -Id $_.ProcessId -Force }
```

Leftover artifacts: throwaway Supabase **auth** users (autoconfirm) persist in
the prod Supabase project (no prod-DB row since writes went to the test DB) —
cleared on the next prod wipe. The local test DB holds the provisioned app
users/tenants.

## Gotchas index

- **CORS preflight:** adding non-allowlisted headers (`x-csrf-token`,
  `content-type`) to a cross-origin **query** GET triggers a preflight the API
  rejects → `TypeError: Failed to fetch`. Mirror what the app sends (just
  `authorization`) for read probes.
- **Stale `authenticated-user-info`:** old dev-session localStorage cruft is
  harmless; the live auth state comes from `auth.getStatus`, not this key.
- **Token expiry:** Supabase access tokens are ~1h. A 401 on a
  previously-working probe usually means the token expired — re-auth in the
  browser.
- **Network tracking reset on full reload** (see §4).
- **`git restore`/`checkout -- <path>` are guard-blocked** — to revert a file
  ask the owner or use `git show HEAD:path > path`.

## Deep-diving the Playwright e2e failures on this stack

The Playwright suite runs against `localhost:3000` with `reuseExistingServer`
(local) — so it reuses the stack above. Known failures to investigate here
(observed 15 passed / 3 failed; all looked environmental, none touched the PR's
files — confirm with this stack):

- `features-tour` (×2): the **cookie-consent banner overlay intercepts** the
  click on the feedback FAB / tour controls. Repro on the stack, then either
  dismiss the banner in a test fixture or raise the FAB's z-index / pointer
  handling.
- `contact-crud` "edit route shell resolves": the edit route needs a **seeded
  contact**; with an empty test DB the shell doesn't resolve. Seed a contact (or
  make the smoke tolerant of empty data) and re-run.

Run a focused set against the live stack:

```bash
E2E_BASE_URL=http://localhost:3000 \
  npx playwright test --project=chromium tests/e2e/features-tour.spec.ts -g "feedback"
```
