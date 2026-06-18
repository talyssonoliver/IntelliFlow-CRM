# IntelliFlow CRM — Performance Remediation Handoff

**Status:** Core plan COMPLETE — PERF-01..09 shipped, PERF-10 dropped, only
PERF-11 (optional) + PERF-12 (deferred) remain. See §0 (2026-06-17 PM).  
**Measured:** 2026-06-16, throttled-mobile Lighthouse against prod; cold-start
re-measured live 2026-06-17 (3.41 s → ~0.2 s warm)  
**Author:** Backend Architect  
**Plan revision:** PERF-05 PinnedSkeleton contradiction resolved (Option A); all
other content QA-approved

---

## 0. UPDATE — 2026-06-17 (PM): PERF-08/09 SHIPPED — cold-start fixed, verified live

PERF-08/09 are **complete and live on production**. Web SSR + client tRPC now go
over HTTP to the live Railway API (ADR-063 Option 3); the in-process
`@intelliflow/api` container no longer loads on Vercel SSR.

**Measured on prod** (`https://intelli-flow-crm-web.vercel.app/`): homepage TTFB
**3.41 s → 0.17–0.36 s warm** (1.19 s cold) — a ~10–20× drop; the in-process
container cold-start is gone. Homepage renders HTTP 200 with correct markup;
prod `/api/health` smoke 200.

**Shipped:**

- **PR #498** (`7bfcee7e3`) — `trpc-server.ts` → `createTRPCClient` at
  `${NEXT_PUBLIC_API_URL}/api/trpc`; 22 SSR call sites + 1 settings page gain
  `.query()`; deleted `apps/web/src/app/api/trpc/[trpc]/route.ts`;
  `providers.tsx getBaseUrl()` browser branch → `NEXT_PUBLIC_API_URL`;
  `.dependency-cruiser.cjs` adds error rule `no-web-imports-api-context-router`
  and `web-worker-boundary.test.ts` retires the ADR-063 debt note. Also removed
  the obsolete `/api/trpc/health.ping` container-mount probe from
  `web-boot-smoke` (that route no longer exists post-PERF-09).
- **PR #499** (`e43b7681`) — **the real unlock.** `cd.yml`'s prod + preview
  deploy steps now inject `NEXT_PUBLIC_API_URL` into the pulled
  `.vercel/.env.<target>.local` _after_ `vercel pull`, _before_ `vercel build`
  (stale value stripped first; value sourced from `vars.PRODUCTION_API_URL`).
- Prod deployed via `CD Pipeline` `workflow_dispatch`
  (`environment=production`); alias `intelli-flow-crm-web.vercel.app` repointed;
  blocking smoke passed.

**KEY DISCOVERY — why setting `vars.PRODUCTION_API_URL` alone was NOT enough:**
the deployed bundle is built by `vercel build`, which logs _"Build not running
on Vercel. System environment variables will not be available."_ It reads
**only** `.vercel/.env.<target>.local` pulled from Vercel's **dashboard** env —
the GH Actions step env (`NEXT_PUBLIC_API_URL` from the repo var) and the prior
`pnpm run build` `.next` are both discarded. Vercel's dashboard never had
`NEXT_PUBLIC_API_URL` (the old in-process caller never needed it), so #498 alone
would have baked an **empty** base URL and broken SSR — and the
`/api/health`-only smoke would not have caught it. #499 writes the value into
the exact file `vercel build` consumes, keeping the repo var as the single
source of truth (no dashboard/secret dependency).

**Known wart (pre-existing, out of scope):** the CD `Notify deployment` step
uses `slackapi/slack-github-action@v3` with an empty `SLACK_WEBHOOK_URL`, so it
errors ("Missing input!") and marks the otherwise-successful prod-deploy **job**
as failed. The deploy/build/smoke all pass — only the notify fails. Fix later
with `continue-on-error: true` or by wiring the webhook secret.

**PERF plan status after this pass:** PERF-01..06 shipped (#493); PERF-07 done
(§0.1); **PERF-08/09 done (this section)**; PERF-10 dropped (charts already lazy
via parents). Remaining are optional/deferred only: **PERF-11** (swap
`@scalar/api-reference-react` for a lighter OpenAPI renderer — build-artifact
size) and **PERF-12** (Supabase auth boundary split — explicitly DEFERRED).

---

## 0.1 UPDATE — 2026-06-17 (AM): PERF-07 verified hands-on; infra is LIVE; drift reconciled

A hands-on PERF-07 pass **with real Terraform + Railway access** disproved this
handoff's central premise. Corrected, verified facts (these supersede §1's
ADR-001 paragraph and the PERF-07 task below):

- **Infra is fully provisioned and applied.** The `intelliflow-crm-production`
  HCP workspace holds **117 real resources** — `vercel_project`,
  `supabase_project[0]` (prod DB, already adopted), all 5 Railway services +
  100+ env vars — every one refreshing against live APIs. There is **no
  empty-state first-apply risk**; `terraform apply` has already run.
- **The Railway API is LIVE and fast.**
  `https://api-production-e9c1.up.railway.app/api/health` → **200 in ~240 ms**.
  The "nothing resolves / never deployed" claim is wrong; the public domain
  exists and serves.
- **The cold-start gap is not the domain** — it's that the web app isn't pointed
  at the live API. `vars.PRODUCTION_API_URL` is unset, so Vercel bakes
  `NEXT_PUBLIC_API_URL=localhost:4000` and uses the in-process container. Fix =
  set `PRODUCTION_API_URL` → the Railway URL, then PERF-08/09. **PERF-08/09 are
  now unblocked and validatable against the live Railway URL.**

### Drift reconcile (the real PERF-07 work) — config-complete + value-verified

A production plan showed a 36-change drift, root-caused to (a) the prod CI jobs
not passing 8 env-var `TF_VAR_*` and (b) a wrong `SUPABASE_DB_POOLER_HOST`.
Fixed:

- **PR #495** wired the 8 `TF_VAR_*` (`PRISMA_FIELD_ENCRYPTION_KEY`,
  `AI_AUDIT_SIGNING_KEY`, `REDIS_*`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`)
  into the prod plan + apply jobs.
- **PR #496** moved `redis_port="6379"` / `redis_tls="false"` to committed prod
  tfvars (GitHub is at the 100-secret cap; both are non-secret).
- Secrets set **from the LIVE Railway worker** (read directly, never guessed):
  `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `REDIS_HOST`, `REDIS_PASSWORD`;
  `SUPABASE_DB_POOLER_HOST` = live `aws-1-eu-central-1.pooler.supabase.com`.
- Fixed the broken GitHub `RAILWAY_TOKEN` secret (was unauthorized → the CI prod
  plan couldn't authenticate).
- ✅ **Plan confirmed CLEAN.** After the Supabase Management API recovered from
  a transient 504 outage, the production plan reads
  **`0 to change, 0 to destroy`** — the 36-change env-var drift is gone. The
  only 2 `to add` are `local_file.env_template` +
  `local_file.monitoring_manifest`, ephemeral `hashicorp/local` files the CI
  runner regenerates every run (not cloud infra). The **gated prod apply**
  (`terraform.yml` action=apply, `production` env) is now safe whenever you want
  it.

### Re-sequenced next steps (replaces the §3/§4 PERF-07 sequencing)

1. (Supabase API up) re-run prod plan → confirm clean → **gated prod apply**
   (`terraform.yml` action=apply, `production` environment, requires approval).
2. **PERF-08/09 (cold-start) — now unblocked:** set
   `vars.PRODUCTION_API_URL = https://api-production-e9c1.up.railway.app`;
   rewrite `apps/web/src/lib/trpc-server.ts` to `createTRPCClient` → Railway;
   delete `apps/web/src/app/api/trpc/[trpc]/route.ts`; point `providers.tsx`
   `getBaseUrl()` at the Railway URL; validate SSR against live Railway.
3. PERF-01..06 already shipped in **PR #493**.

> The §1 ADR-001 "What Is Live" paragraph and the PERF-07 task below are
> **superseded by this section** — they were written from a probe without live
> infra access and inverted the central facts.

---

## 1. Context and Verified State

### What Is Live on `origin/main` Today

The following items are confirmed implemented and shipped. Do not re-implement
any of them.

**ADR-001 (Railway long-running process):** The architectural decision to run
the API on Railway as a persistent process — specifically to avoid serverless
cold-starts — was made and recorded. The Terraform module
(`infra/docker/Dockerfile.api`, `infra/terraform/modules/railway/`) exists.
Docker images are built and pushed to GHCR on every push to main
(`ghcr.io/talyssonoliver/intelliflow-crm-api:latest`, latest successful build
`2026-06-16T17:53:10Z`). However, `terraform apply` has never been executed via
CI (all 30+ recorded `terraform.yml` runs are plan-only; `deploy-workers.yml`
has been skipped 99/99 times, gated on `vars.RAILWAY_WORKERS_DEPLOYED` which is
unset). The Railway project object (`8c2b7828-d508-4fb4-9ea4-98f9c35f9edc`)
exists in the account, but no Railway services are running behind it. No
`*.up.railway.app` URL resolves to the API.

**ADR-046 (Material Symbols font subsetting):** The ADR status field reads
"Proposed" — this is stale. `tools/scripts/subset-material-symbols.mjs` is live
and has already reduced the Material Symbols font from 3.55 MB to approximately
229 KB raw (280 KB transferred as two woff2 files). PERF-03 below corrects the
ADR status doc. Do not re-run the subsetting from scratch; CWV-5 / PERF-11
proposes a further per-route split as an incremental improvement.

**ADR-027 + IFC-196/IFC-182 (Home cache):** `HomeCacheService` and
`RedisCacheAdapter` are wired in `container.ts`. Cache key is
`home:summary:<userId>`. Redis-or-InMemory fallback is implemented. The PR #263
concern (cache key cross-tenant leak) was investigated and closed: `userId` is a
globally unique CUID derived from the user session, not from `tenantId`, so the
key is tenant-safe by construction.

**ADR-053 (N+1 query budget):** A 15-query budget is enforced via Prisma
`$allOperations` and `AsyncLocalStorage` in `packages/db/src/client.ts`. Every
piece of perf work that adds tRPC procedures must respect this budget or
explicitly raise it with a documented exception.

**ADR-063 (Web/API boundary):** The rule `no-web-imports-api-container` in
`.dependency-cruiser.cjs` (lines 94–123) and its companion test
`tests/architecture/web-worker-boundary.test.ts` are live. They do NOT currently
block the two acknowledged debt sites (`route.ts` and `trpc-server.ts`), which
are noted as "architectural debt" in the test at lines 107–122. PERF-08 and
PERF-09 retire this debt and add an enforcement rule.

**PR #474 (OOM flags):** `ignoreBuildErrors: true`,
`webpackMemoryOptimizations: true`, and
`experimental.webpackMemoryOptimizations: true` are in `apps/web/next.config.js`
on `origin/main`. These are absent from the local branch
`chore/ci-preship-hardening`, which is 61 commits behind main. See the
stale-branch warning in Section 5.

**PR #491 and #492:** Tenant-leak per-org provisioning fix and onboarding +
email-verify gating + live Stripe checkout were both merged and are live on main
today. The auth boundary is actively in flux from #492; PERF-12 (Supabase auth
boundary split) is deferred until the auth boundary stabilizes.

**`optimizePackageImports`:** `recharts`, `@tanstack/*`, `react-hook-form`, and
`zod` are already in `apps/web/next.config.js:55-65`. These barrel-file
optimizations are in effect on prod. They are insufficient alone to defer parse
(see PERF-10).

**`@scalar/api-reference-react` lazy import:**
`apps/web/src/components/shared/api-reference-client.tsx` already wraps the
Scalar renderer in a `dynamic import()` inside `useEffect`. The library is
lazy-loaded correctly. PERF-11 proposes replacing the library itself, not fixing
the lazy-load.

**`jspdf` and `temporal-polyfill` — DO NOT REMOVE:** An earlier probe
incorrectly identified these as dead dependencies.
`apps/web/src/app/governance/compliance/components/ExportReportButton.tsx:172`
uses `await import('jspdf')` dynamically — a correct lazy-load pattern.
`temporal-polyfill` is a legitimate `@schedule-x` dependency used by
`TaskCalendarInner.tsx:3` and `AppointmentCalendarInner.tsx:3`. Removing either
package would break PDF export and calendar Temporal API usage.

### Open Debt

**The primary open debt is the ADR-063 cold-start violation.** Two files in
`apps/web` import the full `@intelliflow/api` runtime container into the Vercel
process:

1. `apps/web/src/app/api/trpc/[trpc]/route.ts:23-24` — imports `createContext`
   from `@intelliflow/api/context` and `appRouter` from
   `@intelliflow/api/router`, constructing `container.ts` at module-load time on
   every Vercel cold-start.
2. `apps/web/src/lib/trpc-server.ts:2-3,31-32` — imports the same two modules
   and calls `appRouter.createCaller(ctx)` in-process; consumed by 14
   cached-query modules and 4 server components driving SSR prefetch.

The measured consequence: cold-start TTFB is approximately 3.5 seconds on
landing (container module-load measured at ~1,529 ms eval before any service
builds), against a target of <200 ms. Warm TTFB is ~10 ms (fine).

The decided fix is ADR-063 Option 3: replace the in-process SSR caller with an
HTTP client pointed at Railway, then delete the `/api/trpc` Vercel route
handler. Option 2 (split API entrypoints) and container lazy-wiring are both
off-strategy. The local branch `perf/container-lazy-wiring` is a proven no-op
and must be discarded.

---

## 2. Measured Reality vs Targets

All measurements are throttled-mobile Lighthouse against
`https://intelli-flow-crm-web.vercel.app/`, taken 2026-06-16.
Desktop/unthrottled LHCI (the current CI gate) scores approximately 100 on all
pages — the 16–17 point gap is invisible to CI, which is itself a problem
addressed by PERF-01.

| Metric            | Target | Home    | Login  | Pricing | Gap           |
| ----------------- | ------ | ------- | ------ | ------- | ------------- |
| Performance Score | ≥90    | 74      | 73     | 74      | -16 to -17    |
| FCP               | <1.0s  | 1.3s    | 1.1s   | 1.3s    | borderline    |
| LCP               | <2.5s  | 6.1s    | 6.4s   | 5.9s    | 2.4–2.6x over |
| TTI               | <1.0s  | 8.4s    | 8.1s   | 8.1s    | 8x over       |
| TBT               | <300ms | 230ms   | 240ms  | 240ms   | within budget |
| CLS               | <0.1   | 0.000   | 0.000  | 0.000   | PASS          |
| TTFB (warm)       | <200ms | 10ms    | 10ms   | 10ms    | PASS          |
| TTFB (cold)       | <200ms | ~3.5s   | ~3.5s  | ~3.5s   | 17x over      |
| JS transfer       | <300KB | 1,004KB | 948KB  | 996KB   | ~3x over      |
| Total payload     | <1MB   | 1.34MB  | 1.28MB | 1.31MB  | over          |

**Root-cause attribution (home page, from bootup-time and
mainthread-work-breakdown audits):**

- Script evaluation: 1,065 ms total
- Chunk `99732-a4949677.js`: 784 ms total bootup (641 ms scripting) — largest
  single-chunk cost; contents unknown until bundle analyzer runs (PERF-02)
- Chunk `74794-9fa9f7a8.js`: 181 ms total bootup, caused 171 ms long task at
  5,379 ms
- Stripe `stripe.js`: 127 ms bootup + 116 ms long task at 8,386 ms (172 KB
  unused = 73% waste on public pages)
- CSS `88543aff8803d17b.css`: 31.2 KB, render-blocking, ~300 ms FCP penalty
- Font transfer: 280 KB across two woff2 files (ADR-046 subsetted but further
  reduction possible)

---

## 3. Prioritized Opportunities

The following table ranks all identified opportunities by net impact and
executor unblocking order. Measurement gates (PERF-01, PERF-02) must run first
to validate all subsequent decisions.

| Priority | ID      | Opportunity                        | Est. Gain       | Effort | Risk |
| -------- | ------- | ---------------------------------- | --------------- | ------ | ---- |
| P0       | PERF-00 | Rebase stale local branch          | Gate            | S      | LOW  |
| P1       | PERF-01 | Throttled-mobile LHCI lane         | Measurement     | S      | LOW  |
| P1       | PERF-02 | Bundle analyzer wiring             | Measurement     | S      | LOW  |
| P1       | PERF-03 | ADR-046 status doc fix             | Hygiene         | XS     | LOW  |
| P2       | PERF-04 | Stripe lazy getter + 4 test files  | ~170ms TTI      | M      | LOW  |
| P2       | PERF-05 | @dnd-kit lazy on home page         | ~50-80KB        | S      | LOW  |
| P2       | PERF-06 | Cache-Control for bfcache          | Repeat-visit    | S      | LOW  |
| P3       | PERF-07 | Railway terraform import + apply   | Infra gate      | M      | HIGH |
| P3       | PERF-08 | SSR HTTP caller (21 call sites)    | -3s TTFB        | L      | MED  |
| P4       | PERF-09 | Delete /api/trpc + depcruiser rule | Debt retirement | S      | LOW  |
| P4       | PERF-10 | Recharts lazy on analytics pages   | ~292KB          | M      | LOW  |
| P5       | PERF-11 | Replace @scalar renderer           | Build artifact  | M      | LOW  |
| P5       | PERF-12 | Supabase auth boundary split       | ~144KB          | M      | MED  |

---

## 4. Executable Micro-Task Plan

### PERF-00 — Stale-Branch Housekeeping (PREREQUISITE)

**ADR:** None  
**Executor:** devops-lead  
**Effort:** S (<30 min)  
**Risk:** LOW — blocks all subsequent tasks

The local working branch `chore/ci-preship-hardening` is 61 commits behind
`origin/main`. It is missing `ignoreBuildErrors: true` and
`webpackMemoryOptimizations: true` from PR #474. Any perf PR branching from this
state will conflict with or re-introduce those regressions. Additionally, the
local branch `perf/container-lazy-wiring` is off-strategy per ADR-063 and was
proven a no-op by codex analysis; it must be discarded.

**Actions:**

1. Run
   `git fetch origin && git log --oneline chore/ci-preship-hardening..origin/main`
   to see the 61 diverged commits. Determine whether to rebase onto
   `origin/main` or abandon the branch. All perf work must branch from
   `origin/main`.
2. Discard `perf/container-lazy-wiring`:
   `gh api -X DELETE repos/{owner}/{repo}/git/refs/heads/perf/container-lazy-wiring`
   (no husky on API DELETE — safe; alternatively close via UI and let GitHub
   auto-delete).

**Acceptance criteria:**
`git rev-list --count chore/ci-preship-hardening..origin/main` outputs `0`
(rebased) OR the branch is closed. `perf/container-lazy-wiring` is absent from
`git branch -r`.

---

### PERF-01 — Throttled-Mobile LHCI Lane (MEASUREMENT GATE)

**ADR:** ADR-018 (performance budgets)  
**Executor:** devops-lead  
**Effort:** S (<4 hours)  
**Risk:** LOW  
**Dependencies:** PERF-00

The current LHCI gate (`lighthouserc.js:77-90`) uses `preset: 'desktop'`,
`rttMs: 40`, `throughputKbps: 10240`, `cpuSlowdownMultiplier: 1` against
localhost. These conditions eliminate the JS parse/eval penalty and network
latency that dominate prod mobile performance. The same targets (FCP <1s, LCP
<2.5s, TTI <1s) that fail prod mobile by 2.4–8x trivially pass under
desktop/unthrottled conditions. This 16–17 point gap is completely invisible to
CI.

**Actions:**

1. Create `lighthouserc.mobile.js` at the project root with the following
   settings:
   - `formFactor: 'mobile'`, `rttMs: 150`, `throughputKbps: 1638`,
     `cpuSlowdownMultiplier: 4`
   - `screenEmulation: { mobile: true, width: 375, height: 812, deviceScaleFactor: 2, disabled: false }`
   - Baseline assertions set to `warn` (not `error`) — measure without blocking
     CI today; flip to `error` after remediation shows improvement
   - Initial thresholds:
     `'categories:performance': ['warn', { minScore: 0.65 }]`,
     `'largest-contentful-paint': ['warn', { maxNumericValue: 8000 }]`,
     `'total-blocking-time': ['warn', { maxNumericValue: 1000 }]`
   - URLs: three public pages only (`/`, `/login`, `/pricing`); authenticated
     pages require a `puppeteerScript` and are scoped to a follow-on
   - Upload: `target: 'filesystem'`,
     `outputDir: './artifacts/lighthouse/mobile'`

2. Add a CI step in `.github/workflows/pr-checks.yml` that runs AFTER the Vercel
   preview deploy produces a preview URL. Discover the preview URL via the
   Vercel CLI or the existing deploy step's output — verify which mechanism your
   current `pr-checks.yml` exposes before assuming a variable name. Pass the
   resolved URL as the `--collect.url` target. Do NOT modify `lighthouserc.js` —
   the existing desktop/localhost gate is correct for its 27 URLs.

**Acceptance criteria:** CI produces `artifacts/lighthouse/mobile/` JSON on
every PR targeting main. Job is `warn`-level and never blocks a PR. Score and
LCP are visible in CI output. Confirmed running against the Vercel preview URL,
not localhost.

---

### PERF-02 — Bundle Analyzer Wiring (MEASUREMENT GATE)

**ADR:** ADR-018  
**Executor:** backend-architect or frontend-lead  
**Effort:** S (<2 hours)  
**Risk:** LOW  
**Dependencies:** PERF-00

The 300 KB JS budget (`lighthouserc.js:120`,
`infra/monitoring/performance-budgets.json:207`) is assessed only via Lighthouse
aggregate `resource-summary:script:size`, which does not distinguish initial
from deferred chunks. Without a bundle analyzer, decisions about which chunks to
split (especially chunk `99732`, identity unknown) are guesswork.

**Actions:**

1. `apps/web/package.json`: add `"@next/bundle-analyzer": "^16.0.0"` to
   `devDependencies`. The version must match the installed `next@16.0.10` major
   — using `^15.0.0` risks build failures from mismatched internal APIs.
2. `apps/web/next.config.js:1`: wrap the existing export:
   ```js
   const withBundleAnalyzer = require('@next/bundle-analyzer')({
     enabled: process.env.ANALYZE === 'true',
   });
   module.exports = withBundleAnalyzer(nextConfig);
   ```
   The current file uses `module.exports = nextConfig` — this is a 2-line
   change. `@next/bundle-analyzer` works only with webpack; the build script
   `"next build --webpack"` already forces webpack, so analyzer output is
   immediately available.
3. Run locally to identify chunks:
   `ANALYZE=true pnpm --filter @intelliflow/web build` — produces
   `.next/analyze/client.html` and `server.html`.

**Acceptance criteria:** `ANALYZE=true pnpm --filter @intelliflow/web build`
completes without error and opens `.next/analyze/client.html`. Chunk `99732`
(784 ms bootup) is identified by module name. Stripe chunk is identified by
route. `@dnd-kit` home-page contribution is visible.

---

### PERF-03 — ADR-046 Status Field Fix (1-LINER)

**ADR:** ADR-046  
**Executor:** devops-lead (bundle with PERF-01 PR)  
**Effort:** XS (5 minutes)  
**Risk:** LOW

The ADR status field says "Proposed" but the work is live. This creates
confusion when future executors read the ADR before acting on font performance.

**Action:** In
`docs/architecture/adr/ADR-046-material-symbols-font-subsetting.md:3`, change:

```
**Status:** Proposed
```

to:

```
**Status:** Accepted — Phase 1 live (tools/scripts/subset-material-symbols.mjs; font reduced from 3.55 MB to ~229 KB). Phase 2 (per-route subset) tracked as PERF-11.
```

This may be bundled with PERF-01 to avoid a standalone one-line PR, per the
co-dependent-changes rule in CLAUDE.md.

**Acceptance criteria:**
`grep -n "Status" docs/architecture/adr/ADR-046-material-symbols-font-subsetting.md`
shows the updated line.

---

### PERF-04 — Stripe Lazy Evaluation + All Consumer Test Updates (CLIENT BUNDLE)

**ADR:** ADR-029 (billing architecture)  
**Executor:** frontend-lead  
**Effort:** M (4–8 hours including all 4 test file updates)  
**Risk:** LOW  
**Dependencies:** PERF-00, PERF-02 (to verify chunk membership pre/post)

Lighthouse shows `js.stripe.com/dahlia/stripe.js` (236 KB, 172 KB unused = 73%)
loading on home, login, and pricing pages with 127 ms bootup and a 116 ms long
task at 8,386 ms. The root cause is
`apps/web/src/lib/billing/stripe-client.ts:19`, which calls `loadStripe(key)` at
module-scope as a singleton. Even though `@stripe/react-stripe-js` and
`@stripe/stripe-js` are used only on `/billing/*` routes, their module
evaluation fires on every page that transitively imports `stripe-client.ts`.

**Part A — `apps/web/src/lib/billing/stripe-client.ts` (line 19):**

Replace the module-scope export:

```ts
// Remove:
export const stripePromise: Promise<Stripe | null> | null = key
  ? loadStripe(key)
  : null;

// Add:
let _stripePromise: Promise<Stripe | null> | null | undefined;
export function getStripePromise(): Promise<Stripe | null> | null {
  if (_stripePromise === undefined) {
    _stripePromise = key ? loadStripe(key) : null;
  }
  return _stripePromise;
}
```

Remove the old `stripePromise` named export. The `loadStripe` call is deferred
from module parse time to the first call of `getStripePromise()`.

**Part B — `apps/web/src/app/billing/checkout/page.tsx` (both occurrences):**

Both line 146 (null-guard) and line 154 (Elements prop) must be updated —
omitting either leaves a broken reference after Part A removes the named export.

- Line 18 import: change `stripePromise` to `getStripePromise`
- Line 146: `{stripePromise === null ? (` → `{getStripePromise() === null ? (`
- Line 154: `<Elements stripe={stripePromise}>` →
  `<Elements stripe={getStripePromise()}>`

Calling `getStripePromise()` twice per render is safe — the lazy getter memoizes
`_stripePromise` after the first call, so both calls in the same render return
the same cached value without re-invoking `loadStripe`. Do NOT add a
`next/dynamic` wrapper to `<CheckoutForm>` within this `'use client'` page — the
checkout page is already a separate route chunk via Next.js route-based code
splitting, and `<Suspense fallback={<CheckoutLoading />}>` at line 193 already
defers the client-rendered subtree. A `next/dynamic` wrapper here adds
complexity without bundle benefit.

**Part C — `apps/web/src/components/billing/payment-methods.tsx` (both
occurrences):**

Both line 415 (null-guard) and line 420 (Elements prop) must be updated — same
rationale as Part B.

- Import line: change `stripePromise` to `getStripePromise`
- Line 415: `{stripePromise === null ? (` → `{getStripePromise() === null ? (`
- Line 420: `<Elements stripe={stripePromise}>` →
  `<Elements stripe={getStripePromise()}>`

**Part D — Test files (all four must change in the same PR as Part A):**

_File 1: `apps/web/src/lib/billing/__tests__/stripe-client.test.ts` (4 existing
tests at lines 24–48):_

Remove all 4 existing tests (they assert singleton-per-module-load invariants
that no longer exist after Part A). Add three new tests:

- Test 1: `getStripePromise()` when key is undefined returns `null`
- Test 2: `getStripePromise()` when key is set returns a Promise and calls
  `loadStripe` with the key value
- Test 3: Lazy-singleton — calling `getStripePromise()` twice in the same module
  instance calls `mockLoadStripe` exactly once. The `vi.resetModules()` in
  `beforeEach` ensures each test gets a fresh `_stripePromise = undefined`.

_File 2:
`apps/web/src/components/billing/__tests__/payment-methods.test.tsx:202`:_

```ts
// Change from:
vi.mock('@/lib/billing/stripe-client', () => ({
  stripePromise: Promise.resolve(null),
}));

// To:
vi.mock('@/lib/billing/stripe-client', () => ({
  getStripePromise: () => Promise.resolve(null),
}));
```

_File 3:
`apps/web/src/components/billing/__tests__/payment-methods.supplementary.test.tsx:200`:_

Same change as File 2 — `stripePromise: Promise.resolve(null)` →
`getStripePromise: () => Promise.resolve(null)`.

_File 4: `apps/web/src/app/billing/checkout/__tests__/page.test.tsx:62`:_

```ts
// Change from:
vi.mock('@/lib/billing/stripe-client', () => ({
  stripePromise: Promise.resolve({}),
}));

// To:
vi.mock('@/lib/billing/stripe-client', () => ({
  getStripePromise: () => Promise.resolve({}),
}));
```

**Acceptance criteria:**

- PERF-01 mobile lane shows `js.stripe.com/dahlia/stripe.js` absent from network
  requests on `/`, `/login`, `/pricing`
- `ANALYZE=true` build shows `@stripe/stripe-js` in the `billing/checkout` chunk
  only, not in `_app` or layout chunks
- All 3 rewritten `stripe-client.test.ts` tests pass
- `payment-methods.test.tsx`, `payment-methods.supplementary.test.tsx`, and
  `checkout/__tests__/page.test.tsx` pass without changes to test logic
- Lighthouse `bootup-time` audit no longer shows `stripe.js` 127 ms contribution
  on public pages

---

### PERF-05 — Defer `@dnd-kit` on Authenticated Home Page (CLIENT BUNDLE)

**ADR:** ADR-027 (home composition)  
**Executor:** frontend-lead  
**Effort:** S (2–4 hours)  
**Risk:** LOW  
**Dependencies:** PERF-00, PERF-02

`apps/web/src/components/home/AuthenticatedHomePage.tsx:8-21` statically imports
`DndContext`, `closestCenter`, `PointerSensor`, `KeyboardSensor`, `useSensor`,
`useSensors` from `@dnd-kit/core` and `SortableContext`,
`verticalListSortingStrategy`, `arrayMove`, `sortableKeyboardCoordinates` from
`@dnd-kit/sortable`. All DnD logic lives inside the `PinnedSection`
sub-component (lines 313–374). Drag is a secondary UX gesture; it does not need
to be in the home page's initial parse.

`PinnedSkeleton` (lines 212–226) is defined in the same file and is rendered
internally by `PinnedSection` at line 353
(`if (isLoading) return <PinnedSkeleton />`). This internal guard handles the
skeleton within the already-loaded async chunk (e.g., on a data re-fetch after
initial mount). The `dynamic()` loading callback handles the skeleton during the
initial async chunk download. These are two distinct loading phases; both guards
are correct and must both be preserved.

**Chosen approach: Option A — co-locate `PinnedSkeleton` in the extracted
file.**

**Actions:**

1. Create `apps/web/src/components/home/PinnedItemsDndRegion.tsx`. Move into it:
   - `PinnedSkeleton` (lines 212–226 from `AuthenticatedHomePage.tsx`) — export
     it
   - `PinnedSection` (lines 313–374 from `AuthenticatedHomePage.tsx`) — export
     it
   - All `@dnd-kit/core` and `@dnd-kit/sortable` imports (move them)
   - The `DraggablePinnedItem` import (move it)

2. In `AuthenticatedHomePage.tsx`, replace the static DnD imports and the
   `PinnedSection` definition with:

   ```ts
   import { PinnedSkeleton } from './PinnedItemsDndRegion';

   const PinnedItemsDndRegion = dynamic(
     () => import('./PinnedItemsDndRegion').then(m => ({ default: m.PinnedSection })),
     { ssr: false, loading: () => <PinnedSkeleton /> }
   );
   ```

3. Remove the now-unused static `@dnd-kit/core` and `@dnd-kit/sortable` imports
   from `AuthenticatedHomePage.tsx`.

**Acceptance criteria:** `@next/bundle-analyzer` confirms `@dnd-kit/core` and
`@dnd-kit/sortable` are absent from the home page initial parse chunk. PERF-01
mobile lane shows TTI improvement on `/` (target: any measurable reduction from
8.4s baseline). `pnpm --filter @intelliflow/web test` passes including any
existing `DraggablePinnedItem` tests. Drag-to-reorder works after the async
chunk loads (manual verification via `verify` skill or Playwright smoke).

---

### PERF-06 — `Cache-Control` Headers for bfcache (CWV)

**ADR:** ADR-020 (public site auth)  
**Executor:** frontend-lead or devops-lead  
**Effort:** S (<2 hours)  
**Risk:** LOW  
**Dependencies:** PERF-00

The bfcache audit scores 0 with 3 failures across all three public pages — all
caused by `Cache-Control: no-store` on the main document, which is Next.js's
default for dynamic routes. `/login` and `/pricing` are confirmed
non-personalized: no user data is prefetched in their SSR paths. The root route
`/` is explicitly excluded —
`apps/web/src/lib/cached-queries/home-queries.ts:21` bakes per-user `userName`,
greeting, stats, and pinned items into the SSR HTML, making it ineligible for a
public cache directive.

**Actions:**

In `apps/web/next.config.js:96-138` `headers()` function, add a second entry in
the returned array:

```js
{
  source: '/(login|pricing)',
  headers: [
    {
      key: 'Cache-Control',
      value: 'public, s-maxage=60, stale-while-revalidate=3600',
    },
  ],
},
```

Do NOT use a pattern that matches `/` (the root). Do NOT apply to `/dashboard`,
`/leads`, or any auth-gated route.

**Acceptance criteria:** Lighthouse bfcache audit on `/login` and `/pricing`
goes from 0 failures to 0 (pass).
`curl -I https://intelli-flow-crm-web.vercel.app/login` shows
`Cache-Control: public, s-maxage=60, stale-while-revalidate=3600`.
`curl -I https://intelli-flow-crm-web.vercel.app/` does NOT show a public cache
header. No regressions on auth-gated routes.

---

### PERF-07 — Railway Terraform Import + First Apply (INFRA GATE)

**ADR:** ADR-001 (Railway long-running process), ADR-063 (Option 3 execution
gate)  
**Executor:** devops-lead  
**Effort:** M (half-day)  
**Risk:** HIGH — wrong `apply` order destroys production Supabase or duplicates
the Vercel project  
**Dependencies:** PERF-00

The Railway project object exists but no services are running.
`NEXT_PUBLIC_API_URL` is baked into every Vercel build as
`http://localhost:4000` (the `cd.yml:176` fallback, since
`vars.PRODUCTION_API_URL` is unset). PERF-08 and PERF-09 are blocked until a
live Railway URL exists.

**CRITICAL: `terraform import` MUST run before `terraform apply`. Read
`docs/operations/runbooks/terraform-import.md` in full before executing any
Terraform command.**

**Actions:**

1. Run `terraform import` for all live resources. Minimum set:
   - `module.railway.railway_project.main` (ID
     `8c2b7828-d508-4fb4-9ea4-98f9c35f9edc`)
   - `module.railway.railway_environment.main` (discover env UUID via Railway
     dashboard or CLI)
   - `module.railway.railway_service.services["api"]` and
     `services["ai-worker"]`
   - `module.vercel.vercel_project.main` (`prj_AQ1IS7N9VOtxgF48oYCe4mZdVYgd`)
   - `module.supabase.supabase_project.main[0]`

2. Run `terraform plan`. If it shows ANY destroy operations for existing
   resources, STOP. Diagnose before proceeding. Never apply a plan that destroys
   live resources.

3. After a clean plan, run `terraform apply` to provision only the new Railway
   service resources (`infra/terraform/modules/railway/main.tf:34-40`).

4. After the Railway API service has a generated `.up.railway.app` domain, add a
   `railway_service_domain` data source to
   `infra/terraform/modules/railway/main.tf` for the `api` service. Update
   `infra/terraform/modules/railway/outputs.tf:18-21` to use it as a fallback:
   `value = var.api_domain != "" ? "https://${var.api_domain}" : local.api_service_domain`.

5. Set `vars.PRODUCTION_API_URL` and `vars.STAGING_API_URL` in GitHub Actions
   repository variables to the Railway API URL.

6. Verify: `curl https://<railway-url>/api/health` returns 200.

**Acceptance criteria:** `terraform state list | grep railway` shows
`railway_project.main`, `railway_environment.main`,
`railway_service.services["api"]`. `vars.PRODUCTION_API_URL` is set in GitHub
Actions. `cd.yml:176` resolves to the real Railway URL.
`curl https://<railway-api-url>/api/health` returns 200. Cold-start TTFB
measurement via PERF-01 mobile lane shows improvement from ~3.5s baseline.

---

### PERF-08 — Replace `trpc-server.ts` In-Process Caller with HTTP Client (COLD-START)

**ADR:** ADR-063 (Option 3, SSR path)  
**Executor:** backend-architect  
**Effort:** L (6–10 hours)  
**Risk:** MED  
**Dependencies:** PERF-07 (Railway API URL must be live before staging
verification)

`apps/web/src/lib/trpc-server.ts` builds an in-process tRPC caller via
`appRouter.createCaller(ctx)`, forcing `container.ts` to load on Vercel for
every SSR page render. It is consumed by 14 cached-query files and 4 server
components. This task replaces it with an HTTP client using `createTRPCClient`
from `packages/api-client/src/vanilla-client.ts:56-66`, which already provides
the `httpBatchLink`-based proxy.

**Sub-step 1 — Rewrite `apps/web/src/lib/trpc-server.ts`:**

```ts
import { createTRPCClient } from '@intelliflow/api-client';
import type { AppRouter } from '@intelliflow/api';
import { cookies } from 'next/headers';
import { isTokenUsable } from '@/lib/auth/jwt';

export async function getAccessToken(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('accessToken')?.value ?? null;
  return isTokenUsable(token) ? token : null;
}

export async function createCallerFromToken(token: string | null) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? '';
  return createTRPCClient({
    url: `${apiUrl}/api/trpc`,
    headers: token ? () => ({ Authorization: `Bearer ${token}` }) : undefined,
  });
}
```

Use `createTRPCClient` from `@intelliflow/api-client`, not
`createTRPCProxyClient` from `@trpc/client` directly — this reuses the existing
typed wrapper and avoids duplicating `httpBatchLink` config. The
`import type { AppRouter }` is a type-only import, which is permitted by ADR-063
Constraint 3.

**Sub-step 2 — Update all 21 call sites across 14 cached-query files:**

The current in-process caller uses `caller.procedure()` syntax. The new HTTP
proxy client uses `caller.procedure.query()` for every query. All 14 files must
be updated atomically — a partial update causes runtime errors because
`createCallerFromToken` returns the new client for all callers simultaneously.

Complete inventory (verified against source):

| File                          | Current                                       | New                                                 |
| ----------------------------- | --------------------------------------------- | --------------------------------------------------- |
| `lead-queries.ts:14`          | `caller.lead.stats()`                         | `caller.lead.stats.query()`                         |
| `lead-queries.ts:23`          | `caller.lead.list({...})`                     | `caller.lead.list.query({...})`                     |
| `contact-queries.ts:14`       | `caller.contact.stats()`                      | `caller.contact.stats.query()`                      |
| `contact-queries.ts:23`       | `caller.contact.list({...})`                  | `caller.contact.list.query({...})`                  |
| `account-queries.ts:14`       | `caller.account.stats()`                      | `caller.account.stats.query()`                      |
| `deal-queries.ts:41`          | `caller.opportunity.list({...})`              | `caller.opportunity.list.query({...})`              |
| `deal-queries.ts:71`          | `caller.opportunity.forecast()`               | `caller.opportunity.forecast.query()`               |
| `home-queries.ts:21`          | `caller.home.getWelcomeSummary()`             | `caller.home.getWelcomeSummary.query()`             |
| `ai-insights-queries.ts:43`   | `caller.home.getAIInsights()`                 | `caller.home.getAIInsights.query()`                 |
| `notifications-queries.ts:42` | `caller.notifications.getUnreadCount()`       | `caller.notifications.getUnreadCount.query()`       |
| `activity-feed-queries.ts:49` | `caller.activityFeed.getUnifiedFeed({...})`   | `caller.activityFeed.getUnifiedFeed.query({...})`   |
| `task-queries.ts:28`          | `caller.task.list({...})`                     | `caller.task.list.query({...})`                     |
| `task-queries.ts:54`          | `caller.task.stats()`                         | `caller.task.stats.query()`                         |
| `ticket-queries.ts:27`        | `caller.ticket.list({...})`                   | `caller.ticket.list.query({...})`                   |
| `ticket-queries.ts:53`        | `caller.ticket.stats({} as never)`            | `caller.ticket.stats.query({} as never)`            |
| `calendar-queries.ts:49`      | `caller.appointments.list({...})`             | `caller.appointments.list.query({...})`             |
| `calendar-queries.ts:72`      | `caller.appointments.stats()`                 | `caller.appointments.stats.query()`                 |
| `analytics-queries.ts:50`     | `caller.analytics.getOverview({...})`         | `caller.analytics.getOverview.query({...})`         |
| `analytics-queries.ts:89`     | `caller.analytics.getConversionFunnel({...})` | `caller.analytics.getConversionFunnel.query({...})` |
| `module-access-queries.ts:45` | `caller.moduleAccess.getEnabledModules()`     | `caller.moduleAccess.getEnabledModules.query()`     |
| `help-article-queries.ts:19`  | `caller.helpArticle.list({...})`              | `caller.helpArticle.list.query({...})`              |

All procedures in cached-query files are queries — none require `.mutate()`.
Verify procedure types against tRPC router definitions:
`pnpm --filter @intelliflow/web tsc --noEmit` will error at any call using the
wrong suffix.

**Sub-step 3 — Architecture test update:**

`tests/architecture/web-worker-boundary.test.ts:107-122` documents the debt as
"currently imports" without blocking it. After PERF-08 removes the runtime
imports from `trpc-server.ts`, add a new `describe` block:

```ts
describe('Web Tier Boundary — PERF-08 debt retirement', () => {
  test('trpc-server.ts MUST NOT import @intelliflow/api/context or @intelliflow/api/router (ADR-063 debt retired)', () => {
    const trpcServerPath = path.join(
      projectRoot,
      'apps/web/src/lib/trpc-server.ts'
    );
    const content = fs.readFileSync(trpcServerPath, 'utf-8');
    // Type-only imports (import type ...) are permitted by ADR-063 Constraint 3
    const runtimeImportRegex =
      /^import\s+(?!type\s)[^;]+['"]@intelliflow\/api\/(context|router)['"]/gm;
    const violations = [...content.matchAll(runtimeImportRegex)];
    expect(violations).toHaveLength(0);
  });
});
```

This test fails on the current codebase (correct) and passes after PERF-08 lands
(regression guard).

**Sub-step 4 — Environment wiring:**

Add `NEXT_PUBLIC_API_URL` to `.env.test` pointing at the Railway staging URL.
Verify it is listed in `apps/web/next.config.js:169-171` `env` bake section.

**Acceptance criteria:** `pnpm --filter @intelliflow/web tsc --noEmit` exits 0
with no type errors across all 14 cached-query files. `pnpm test:architecture`
passes including the new debt-retirement test. Staging deploy: SSR pages (`/`,
`/dashboard`) load with data (network inspector shows requests to
`<railway-url>/api/trpc`). PERF-01 mobile lane cold-start TTFB improves from
~3.5s baseline.

---

### PERF-09 — Delete `/api/trpc` Route Handler + Add Enforcement Rule (COLD-START COMPLETION)

**ADR:** ADR-063 (Option 3 completion), ADR-010 (boundary enforcement)  
**Executor:** backend-architect  
**Effort:** S (2–3 hours)  
**Risk:** LOW (once PERF-08 is validated in staging)  
**Dependencies:** PERF-08 validated in staging; PERF-07 (Railway URL live)

With the SSR path using HTTP (PERF-08), the in-process `/api/trpc` Vercel route
handler is the last remaining runtime coupling to `@intelliflow/api` on the web
tier. Deleting it completes ADR-063 Option 3 and removes the last cold-start
debt site from Vercel.

**Actions:**

1. Delete `apps/web/src/app/api/trpc/[trpc]/route.ts` (38 lines). This removes
   the last runtime import of `@intelliflow/api/context` and
   `@intelliflow/api/router` from the Vercel deployment.

2. `apps/web/src/app/providers.tsx:84-92` `getBaseUrl()`: change
   `if (typeof globalThis.window !== 'undefined') return '';` to
   `if (typeof globalThis.window !== 'undefined') return process.env.NEXT_PUBLIC_API_URL ?? '';`.
   This routes browser tRPC calls to Railway instead of the now-deleted local
   handler.

3. Add a new rule to `.dependency-cruiser.cjs` immediately after the existing
   `no-web-imports-api-container` rule (after line 123). The existing rule does
   NOT contain an exemption for `route.ts` or `trpc-server.ts` and does NOT scan
   for `@intelliflow/api/context` or `@intelliflow/api/router` — there is
   nothing to remove from it. The correct action is additive:

   ```js
   {
     name: 'no-web-imports-api-context-router',
     severity: 'error',
     comment:
       'apps/web must not import @intelliflow/api/context or @intelliflow/api/router at runtime. ' +
       'Acknowledged architectural debt (ADR-063) retired by PERF-08/PERF-09. ' +
       'Type-only imports (import type) are allowed. ' +
       'Use createTRPCClient from @intelliflow/api-client for all tRPC calls from web.',
     from: {
       path: '^apps/web',
       pathNot: ['\\.(test|spec)\\.(ts|tsx)$', '__tests__', '__mocks__'],
     },
     to: {
       path: [
         '^@intelliflow/api/context',
         '^@intelliflow/api/router',
       ],
     },
   },
   ```

4. Update `tests/architecture/web-worker-boundary.test.ts:107-122`: change the
   comment from "currently import" to "previously imported (debt retired by
   PERF-08/PERF-09; see ADR-063)" to preserve the historical record.

**Acceptance criteria:** `ls apps/web/src/app/api/trpc/` returns "no such file
or directory". `pnpm exec depcruise apps/web --config .dependency-cruiser.cjs`
exits 0, and `no-web-imports-api-context-router` appears in the rule list.
Browser network inspector shows tRPC calls going to `<railway-url>/api/trpc`,
not `/api/trpc`. PERF-01 cold-start TTFB on a Vercel preview drops toward <200
ms. `pnpm test:architecture` passes.

---

### PERF-10 — Recharts Lazy-Loading on Analytics/Deals Pages (CLIENT BUNDLE)

**ADR:** ADR-018  
**Executor:** frontend-lead  
**Effort:** M (4–8 hours; repetitive pattern across 13 files)  
**Risk:** LOW  
**Dependencies:** PERF-00, PERF-02

`apps/web/next.config.js:59` already lists `recharts` in
`optimizePackageImports` for barrel-file tree-shaking, but 13 chart component
files import recharts statically. `optimizePackageImports` is insufficient to
defer parse — `next/dynamic` with `ssr: false` is required. Built chunk
`21714-18e56e6634c4369f.js` is 292 KB and currently part of analytics/deals
routes' initial parse.

**Actions:**

1. Confirm via PERF-02 (`@next/bundle-analyzer`) that these chart components are
   in the initial parse (not already async) and that no home-page chart imports
   are static — verify before touching any file.

2. For each of the 13 chart component files (confirmed by grep:
   `RevenueTrendChart.tsx`, `DealsCharts.tsx`, `NpsTrendChart.tsx`, and 10
   others under `apps/web/src/components/`), apply the pattern:

   ```ts
   // Move the actual component to *Inner.tsx:
   // RevenueTrendChartInner.tsx — contains all recharts imports and the component

   // In the original file:
   const RevenueTrendChart = dynamic(() => import('./RevenueTrendChartInner'), {
     ssr: false,
     loading: () => <div className="animate-pulse bg-muted rounded-lg" style={{ height: 300 }} />,
   });
   ```

   `<ChartSkeleton>` can be an inline `<div>` — no new dependency required.

3. Scope strictly to analytics/deals pages. Do not apply to any chart that
   appears in the home page dashboard widget.

**Acceptance criteria:** `@next/bundle-analyzer` shows the recharts chunk is
async (not in initial JS parse for the analytics route). Lighthouse TBT on
`/analytics` decreases. Chart skeletons are visible for approximately 100–300 ms
on page load. All existing chart tests pass.

---

### PERF-11 — Replace `@scalar/api-reference-react` with Lighter OpenAPI Renderer (BUILD ARTIFACT)

**ADR:** None (developer tooling)  
**Executor:** frontend-lead  
**Effort:** M  
**Risk:** LOW  
**Dependencies:** None (developer-only route, no user perf impact)

`@scalar/api-reference-react` bundles Vue 3 runtime, CodeMirror, Prism, and 600+
SVG icons — 6 lazy chunks totalling 3,256 KB (`82317.js` at 2,569 KB is the
largest). These only load on `/docs/api`, which is a developer-only route, so
they do not affect CRM user Lighthouse scores. However, they inflate build
artifact size and cause a multi-second parse hit on any first visit to
`/docs/api` on mobile. The `api-reference-client.tsx` wrapper is already
correctly lazy — the problem is the library itself.

**Actions:** Replace `ApiReferenceReact` from `@scalar/api-reference-react` in
`apps/web/src/components/shared/api-reference-renderer.tsx:1-12` with
`@stoplight/elements` (~200 KB), `swagger-ui-react` (~350 KB), or an iframe
pointing to a Redoc CDN serving `/api-spec.json`. Update
`api-reference-renderer.tsx` accordingly. Verify that the API docs still render
and interactive features work before submitting the PR.

**Acceptance criteria:** `@next/bundle-analyzer` shows the `/docs/api` route
lazy chunk size drops by approximately 3,000 KB. Vue 3 runtime (`createApp`,
`defineComponent`) is absent from the build. API docs page renders the
IntelliFlow tRPC routes in the chosen renderer.

---

### PERF-12 — Supabase Auth Boundary Split (CLIENT BUNDLE, DEFERRED)

**ADR:** ADR-020 (public site auth), ADR-009 (zero trust)  
**Executor:** frontend-lead  
**Effort:** M  
**Risk:** MED (auth boundary actively in flux post-PR #492)  
**Dependencies:** CS category complete; auth boundary stable

`apps/web/src/app/providers.tsx` is a `'use client'` file in the root layout. It
imports `AuthProvider` which chains to `AuthContext.tsx` → `supabase-browser.ts`
→ `@supabase/supabase-js` (GoTrueClient), producing chunk
`28835-158d2842440c79bb.js` (144 KB) on every page — including the public
landing, login, and pricing pages — before any user authenticates.

**Action:** Create a nested `(authenticated)/layout.tsx` that wraps only
auth-gated routes with `AuthProvider`. Public pages use a stripped root layout
without GoTrueClient. Requires a full route audit to identify any auth-gated
component that might end up in a public route boundary.

**Deferred until:** PR #492 (onboarding + email-verify gating + Stripe checkout)
has settled and the auth boundary is stable. Do not start this task while the
auth boundary is in active flux.

**Acceptance criteria:** `@next/bundle-analyzer` confirms chunk `28835` is
absent from the public page initial load.
`curl -s https://intelli-flow-crm-web.vercel.app/ | grep "GoTrue"` returns
nothing (no GoTrueClient in page HTML). All auth-gated routes still protect
correctly.

---

## 5. Risks and Guardrails

### Stale Local Branch (CRITICAL)

The local branch `chore/ci-preship-hardening` is 61 commits behind
`origin/main`. It is missing `ignoreBuildErrors: true` and
`webpackMemoryOptimizations: true` (PR #474). All perf work must branch from
`origin/main`. Do not open any perf PR from a branch that has not been rebased.
Measure with `git rev-list --count <branch>..origin/main` before creating any
PR.

### ADR-053 Query Budget

The 15-query budget enforced in `packages/db/src/client.ts` is not affected by
PERF-04 through PERF-06 (client bundle changes) or PERF-08/PERF-09 (transport
changes). However, PERF-08 changes query routing — queries now traverse an HTTP
hop to Railway where the budget is enforced on the Railway process, not on
Vercel. Any new tRPC procedures introduced by future work must be checked
against the budget. If a new procedure exceeds 15 queries, a documented
exception must be raised before the PR is merged.

### ADR-063 Boundary Direction

PERF-08 moves the web/API boundary in the correct direction (web stops importing
`@intelliflow/api` runtime). PERF-09 completes it. Any new server component that
needs tRPC data after PERF-08 lands MUST use the HTTP client path
(`createTRPCClient` from `@intelliflow/api-client`), not create a new in-process
caller. The new `no-web-imports-api-context-router` rule added by PERF-09
enforces this at lint time.

### PERF-07 Terraform Destruction Risk

The Railway project exists in the account but Terraform state is empty —
`terraform apply` on empty state will attempt to CREATE all resources from
scratch, treating the existing Railway project as a new resource to provision
alongside the existing one, or will attempt to DESTROY AND RECREATE it if
Terraform detects ID conflicts. This can result in Supabase database destruction
or Vercel project duplication. **The `terraform import` step is
non-negotiable.** See `docs/operations/runbooks/terraform-import.md:12-19` for
the exact import sequence. No executor should run `terraform apply` without
first running `terraform plan` and confirming zero destroy operations.

### Pre-Ship Gate Quirks

The pre-ship gate (`scripts/pre-ship.mjs`) runs on every push via husky
`pre-push`. For PERF-04, note that `pnpm test:coverage` with the Istanbul
provider can timeout non-deterministically under heavy parallelism (known issue
from IFC-242). If coverage times out during pre-ship, re-run once before
diagnosing — the `COVERAGE_RUN=1` timeout guards (`testTimeout: 120000` for
coverage runs) should be in place but may need verification on the working
branch after rebase. For PERF-07/PERF-08/PERF-09, the architecture tests
(`pnpm test:architecture`) are part of the pre-ship gate — the new
`no-web-imports-api-context-router` rule causes `depcruise` to fail on the
current codebase (correct by design), so PERF-09 must be submitted as one atomic
PR with PERF-08 completion or the depcruise check will block push of
intermediate states.

---

## 6. Explicit Do-Not-Do List

**Do not implement container lazy-wiring.** The local branch
`perf/container-lazy-wiring` is off-strategy per ADR-063 and was proven a no-op
by codex analysis. The correct fix is ADR-063 Option 3 (HTTP client), executed
by PERF-07 through PERF-09. Discard the branch.

**Do not re-subset the font from scratch.** ADR-046 Phase 1 is complete.
`tools/scripts/subset-material-symbols.mjs` is live. PERF-11 is an incremental
per-route split, not a redo of the subsetting work.

**Do not remove `jspdf`, `html2canvas`, or `temporal-polyfill`.** All three are
in active use: `jspdf` via `await import('jspdf')` in
`ExportReportButton.tsx:172`, `html2canvas` as a transitive dependency of
`jspdf`, and `temporal-polyfill` in `TaskCalendarInner.tsx:3` and
`AppointmentCalendarInner.tsx:3`. Removing any of them breaks PDF export or the
calendar Temporal API.

**Do not re-add `ignoreBuildErrors: true` or
`webpackMemoryOptimizations: true`.** Both are already in
`apps/web/next.config.js` on `origin/main` from PR #474. They are only absent
from the stale local branch — fix the branch, not the config.

**Do not add a `next/dynamic` wrapper to `<CheckoutForm>` inside
`checkout/page.tsx`.** The checkout page is already a separate route chunk via
Next.js route-based splitting. Adding `next/dynamic` with `ssr: false` inside a
`'use client'` route page adds complexity without bundle benefit. The
`<Suspense>` at line 193 already defers the subtree correctly.

**Do not wrap the root `/` route in a `Cache-Control: public` header.** The home
page SSR bakes per-user data (username, greeting, stats, pinned items) into the
HTML via `home-queries.ts:21`. A public edge cache would serve one user's
personalized HTML to other users. Only `/login` and `/pricing` are eligible for
PERF-06.

**Do not remove the exemption from the existing `no-web-imports-api-container`
rule in `.dependency-cruiser.cjs`.** That rule does not contain an exemption for
`route.ts` or `trpc-server.ts` — there is nothing to remove. PERF-09 adds a new,
separate rule (`no-web-imports-api-context-router`). The existing rule remains
untouched.

**Do not deploy or raise PRs from `chore/ci-preship-hardening` until it has been
rebased onto `origin/main`.** The branch is 61 commits behind. Any PR from it
will conflict with the OOM flags from PR #474 and may reintroduce regressions
that are already fixed on prod.

---

## Key File References

| File                                                                                   | Relevant to                                                                 |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `apps/web/src/components/home/AuthenticatedHomePage.tsx:8-21`                          | PERF-05 — DnD imports to remove                                             |
| `apps/web/src/components/home/AuthenticatedHomePage.tsx:212-226`                       | PERF-05 — `PinnedSkeleton` to move                                          |
| `apps/web/src/components/home/AuthenticatedHomePage.tsx:313-374`                       | PERF-05 — `PinnedSection` to extract                                        |
| `apps/web/package.json:8`                                                              | PERF-02 — confirms `next@16.0.10`, requires `@next/bundle-analyzer@^16.0.0` |
| `apps/web/src/lib/billing/stripe-client.ts:19`                                         | PERF-04 Part A — module-scope singleton to replace                          |
| `apps/web/src/app/billing/checkout/page.tsx:146,154`                                   | PERF-04 Part B — both null-guard and Elements prop                          |
| `apps/web/src/components/billing/payment-methods.tsx:415,420`                          | PERF-04 Part C — both null-guard and Elements prop                          |
| `apps/web/src/components/billing/__tests__/payment-methods.test.tsx:202`               | PERF-04 Part D — mock to update                                             |
| `apps/web/src/components/billing/__tests__/payment-methods.supplementary.test.tsx:200` | PERF-04 Part D — mock to update                                             |
| `apps/web/src/app/billing/checkout/__tests__/page.test.tsx:62`                         | PERF-04 Part D — mock to update                                             |
| `apps/web/src/lib/billing/__tests__/stripe-client.test.ts:24-48`                       | PERF-04 Part D — 4 tests to rewrite                                         |
| `.dependency-cruiser.cjs:94-123`                                                       | PERF-09 — new rule added after line 123                                     |
| `apps/web/src/lib/trpc-server.ts:2-3,31-32`                                            | PERF-08 — in-process caller to rewrite                                      |
| `packages/api-client/src/vanilla-client.ts:56-66`                                      | PERF-08 — `createTRPCClient` wrapper to use                                 |
| `apps/web/src/app/api/trpc/[trpc]/route.ts`                                            | PERF-09 — file to delete                                                    |
| `apps/web/src/app/providers.tsx:84-92`                                                 | PERF-09 — `getBaseUrl()` to update                                          |
| `apps/web/next.config.js:96-138`                                                       | PERF-06 — `headers()` to extend                                             |
| `apps/web/src/lib/cached-queries/home-queries.ts:21`                                   | PERF-06 — confirms root `/` SSR bakes personalized data                     |
| `tests/architecture/web-worker-boundary.test.ts:107-122`                               | PERF-08/PERF-09 — comment to update + new test block                        |
| `infra/terraform/modules/railway/outputs.tf:18-21`                                     | PERF-07 — `api_url` output to update                                        |
| `docs/operations/runbooks/terraform-import.md`                                         | PERF-07 — mandatory reading before any `terraform apply`                    |
| `.github/workflows/cd.yml:176`                                                         | PERF-07 — `PRODUCTION_API_URL` fallback currently `http://localhost:4000`   |
| `docs/architecture/adr/ADR-046-material-symbols-font-subsetting.md:3`                  | PERF-03 — status field to update                                            |
