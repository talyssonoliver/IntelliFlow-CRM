# Spec Draft — ENG-OPS-003.Gap12-E2EAPIServerHarness

> **Status:** pre-invocation draft (handoff from ENG-OPS-003.Gap7-E2ESuiteHarness).
> Not a finalized spec — feed this into `/spec-session ENG-OPS-003.Gap12-E2EAPIServerHarness`
> as prior art. Authored 2026-07-25 from a live root-cause investigation of the
> failing **E2E Full Suite** on `main`.

## Problem statement

The nightly **E2E Full Suite** (`.github/workflows/e2e-full.yml`, chromium project)
is red on `main` and has been for consecutive nightly runs (e.g. run
`30143412983` @ `f4ec0b0cb`: ~17 failing specs). The dominant failure mode is a
tRPC client error surfaced in the browser as HTML-not-JSON:

```
[TRPCClientError]: Failed to parse URL from /api/trpc/lead.stats?batch=1&input=%7B%7D
  [cause]: TypeError: Failed to parse URL from /api/trpc/lead.stats...
    [cause]: TypeError: Invalid URL
```

Any spec that renders a page whose components issue tRPC queries/mutations (home
`/` → `lead.stats`, signup submit → `auth.signup`, inbound webhook →
`email.webhook`, feedback FAB submit) fails or times out. Purely client-side
specs (validation, navigation, UTM localStorage) pass.

**Gap #7 already fixed the two independent, test-side selector-drift failures**
(`signup.spec.ts` password-length strict-mode + keyboard-nav skip-link). What
remains — the tRPC/API failures — is **not** a test-maintenance problem; it is a
harness-infrastructure problem, deliberately carved out into this task.

## Root cause

The E2E environment **starts only the web server and never starts the tRPC API
backend**, and the web app does not (and is not meant to) serve `/api/trpc`
itself.

Evidence (file:line, on `main`):

1. **The web app has no `/api/trpc` route handler.** There is no
   `apps/web/src/app/api/**/trpc**` route, and `apps/web/next.config.js` has **no
   `rewrites()`** proxying `/api/trpc` to a backend (only `headers()`,
   `redirects()`, and an `env:` block). So the web origin returns its 404 HTML
   page for `/api/trpc/*` → `Unexpected token '<'`.

2. **The browser tRPC client targets `${NEXT_PUBLIC_API_URL}/api/trpc`.**
   `apps/web/src/app/providers.tsx:85` → `getBaseUrl()` returns
   `process.env.NEXT_PUBLIC_API_URL ?? ''` in the browser; used at
   `providers.tsx:286,310` as `url: ` + "`${getBaseUrl()}/api/trpc`". When
   `NEXT_PUBLIC_API_URL` is empty/unset the URL is the relative `/api/trpc`
   (→ web origin, no handler). SSR path is analogous
   (`apps/web/src/lib/trpc-server.ts:27,29`).

3. **`NEXT_PUBLIC_API_URL` is a build-time-baked Next.js public var.** Setting it
   at server *runtime* is too late for the already-bundled client. The nightly
   builds web **without** it: `e2e-full.yml:90` runs
   `pnpm --filter @intelliflow/web build` with `NEXT_PUBLIC_APP_URL` set
   (`e2e-full.yml:50`) but **not** `NEXT_PUBLIC_API_URL`.
   `playwright.config.ts:300` sets `NEXT_PUBLIC_API_URL` only as a webServer
   *runtime* env — ineffective for the client bundle. `next.config.js:183`
   documents: "in production, NEXT_PUBLIC_API_URL must be set explicitly."

4. **The real backend is a separate server that the harness never starts.**
   `apps/api` is a standalone tRPC server (`apps/api/package.json` →
   `"start": "node dist/main.js"`). `e2e-full.yml` builds only `@intelliflow/web`
   and starts no `@intelliflow/api` process; the DB service points at
   `localhost:5432` for the web build only.

**Conclusion:** for browser + SSR tRPC to resolve in E2E, the suite must run the
`@intelliflow/api` server AND bake `NEXT_PUBLIC_API_URL` into the web bundle at
build time pointing at it. That is a multi-server startup + build-order change to
the harness — the reason this was escalated out of Gap #7.

## In-scope for Gap #12

- Stand up `@intelliflow/api` in the E2E environment (build + start + health
  gate) alongside web, with a test database + the env it requires.
- Wire `NEXT_PUBLIC_API_URL` into the **web build step** (build-time) so the
  client and SSR bundles point at the running API origin. Reconcile the now-dead
  `playwright.config.ts:300` runtime env.
- Decide the topology: (a) API on its own port with `NEXT_PUBLIC_API_URL`
  pointing at it, or (b) a Next.js `rewrites()` proxy from the web origin's
  `/api/trpc` to the API — pick one and make it consistent across
  `e2e-full.yml`, `playwright.config.ts`, and any per-PR e2e job.
- Bring the API-dependent specs back to green: home `/` (`lead.stats`),
  `signup.spec.ts` full-registration + error-recovery + "UTM subsequent visits"
  (navigates through `/`), `email/inbound-webhook.spec.ts`,
  `features-tour.spec.ts:85` feedback submit.
- Consider whether the authenticated project (currently gated behind
  `HAS_QA_ENV` in `playwright.config.ts`) should also be enabled once the API +
  DB exist.

## Out of scope / separate follow-ups

- **`icons.spec.ts` font-loading failures** (~14 specs, `fonts-ready` class,
  font-family, CLS, FOUT). These are **not** API-related and **not**
  selector-drift — they are Material Symbols font-loading behavior in the
  headless CI browser. Investigate separately (font availability / `font-display`
  / readiness signal); do not fold into the API-server work.
- The broader "web should proxy vs. call API directly" production architecture
  decision, if it turns out E2E and prod disagree.

## Acceptance criteria (draft)

1. `e2e-full.yml` chromium project run on `main` is green for all
   previously-API-blocked specs listed above (icons excluded per above).
2. No `Failed to parse URL from /api/trpc/...` / `Unexpected token '<'` errors in
   the `[WebServer]` log.
3. `NEXT_PUBLIC_API_URL` resolution is consistent and documented across
   `e2e-full.yml`, `playwright.config.ts`, and `next.config.js`.
4. The harness change is mirrored into any per-PR E2E job so PRs catch
   regressions, not just the nightly.

## Key references

- `.github/workflows/e2e-full.yml` (build @ line 90; env @ 50; no api start)
- `playwright.config.ts` (`UNAUTH_SPECS` @ 39; chromium `testMatch` @ 222;
  webServer @ 287–300; `HAS_QA_ENV` gate)
- `apps/web/src/app/providers.tsx:85,286,310` (browser tRPC base URL)
- `apps/web/src/lib/trpc-server.ts:27,29` (SSR tRPC base URL)
- `apps/web/next.config.js:183,187` (`NEXT_PUBLIC_API_URL` note + env default;
  no `rewrites()`)
- `apps/api/package.json` (`start: node dist/main.js`)
- Failing evidence: e2e-full run `30143412983` (`f4ec0b0cb`).
- Sibling gaps: ENG-OPS-003.Gap7 (this handoff), Gap2 (#632), Gap1 (#630).
