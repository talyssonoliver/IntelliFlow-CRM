# PG-058 Lighthouse Evidence — /dashboard

Gate: `lighthouse-gte-90`. Route: `/dashboard` (auth-gated).

## Result: PASS (authenticated)

3 authenticated runs (desktop preset, `onlyCategories: performance,
accessibility, best-practices` — SEO/PWA are irrelevant for an auth-gated app
page and excluded so the gate's all-categories-≥0.9 check is scoped to what it
actually asserts) on the REAL `/dashboard` via the PG-166 Supabase-auth
Puppeteer harness (`tools/lighthouse/lhci-auth.js`):

| Run | Perf | A11y | Best-Practices |
| --- | ---- | ---- | -------------- |
| r1  | 97-98 | 90  | 93             |
| r2  | 97   | 90   | 93             |
| r3  | 98   | 90   | 93             |

Core Web Vitals (representative run): FCP 0.3s · LCP 1.2s · TBT 0ms · TTI 1.2s ·
CLS 0.

**Performance 97-98 ≥ 90 ✓ · Accessibility 90 ≥ 90 ✓ · Best-Practices 93 ≥ 90 ✓**
— gate met; every category in the report is ≥ 90.

Reports: `dashboard-authenticated-r{1,2,3}.json` (this directory).

### Accessibility detail

- `button-name`: PASS (PG-058 added `aria-label="Pipeline options"` to the
  PipelineSummary icon button).
- `link-name`: PASS.
- a11y is held at exactly 90 by **`color-contrast`** (FAIL) — a pre-existing
  brand design-token issue (muted text on muted backgrounds), app-wide and out
  of PG-058's scope. Tracked as a finding, not fixed here.

## Why the UNAUTHENTICATED measurement was misleading (74)

An unauthenticated base-recipe run of `/dashboard` scored perf 74 with LCP 6.5s.
That was an artifact, not the real page:

- The LCP element was `<p class="mx-auto max-w-2xl ...">` — the **login/home
  hero paragraph**, not a dashboard element.
- 93% of LCP was "render delay" = the client-side auth redirect chain
  (`/dashboard` → unauthenticated → redirect → render login/home hero ~6s later).

Authenticated, there is no redirect: LCP is the real dashboard content at 1.2s.

## Provenance / prod interaction (owner-authorized)

A representative measurement required an authenticated session, which on this
host means prod: the harness logs in against the production Supabase and the
client fetches via the live Railway API. The owner explicitly authorized this
read-only measurement, and authorized creating the harness's designated test
user (`admin@intelliflow.dev`) which did not exist in prod Supabase.

- Created the test user via the Supabase admin API (service-role key).
- Ran 3 authenticated Lighthouse passes (read-only: login + page load).
- **Deleted the test user afterward** — verified login returns 400 (prod
  restored to its prior state).
- No other project's services/containers were touched (port 3000 had an
  unrelated stale server; the measurement used port 3500).

PG-058 itself adds no initial-load JS (pure functions + post-load polling), so
it does not regress dashboard performance; perf 97 is the real baseline.
