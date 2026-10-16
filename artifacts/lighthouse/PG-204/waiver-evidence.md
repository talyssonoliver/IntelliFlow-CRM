# PG-204 Lighthouse — Path A evidence and waiver request (2026-10-13)

**Status: `GATE:lighthouse-gte-90` / AC-CT15 NOT MET — NEEDS_HUMAN.** No score here measures the Case Types page
(`/cases/case-types`) or the New Case page (`/cases/new`). No waiver approver is named: approval is the owner's.

Runner ruling (owner delegated, 2026-10-13): run Path A once and record the evidence; both routes are
authenticated, and Path C would need a test admin on **production** Supabase, which agents never create.

## Attempts (`docs/claude-refs/lighthouse-playbook.md` Path A)

| Attempt | Setup | Final URL | Result |
| --- | --- | --- | --- |
| 1 (kept: `cases-*-r1.report.json`) | `next start -p 3400`; the placeholder public env did not reach the build (shell-function env prefix), so `NEXT_PUBLIC_SUPABASE_URL` was empty | requested URL | Rendered the global error page (console `Error: supabaseUrl is required`): perf 0.93, a11y 0.90 — the **error page**, not PG-204. Same failure as PG-196 attempt 1. |
| 2 (kept: `cases-*-r2.report.json`) | Rebuilt with exported local placeholders (`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`, placeholder anon key; no Supabase or API running), `next start -p 3400`, Lighthouse 12.6.1 desktop preset, 1 run per route | `/login` for both | The auth guard redirects both routes to `/login` client-side (server answers 200, the page is a client component). Scores — perf 0.87, a11y 0.93, best-practices 0.74, SEO 0.61 — measure the **login page** (with connection-refused auth/API calls), not PG-204. Matches PG-196 attempt 2. |

## Why no authenticated run (Path C)

`tools/lighthouse/lhci-auth.js` signs in with `LHCI_TEST_EMAIL` / `LHCI_TEST_PASSWORD` against the Supabase project
in `NEXT_PUBLIC_SUPABASE_URL`. Neither credential exists in `.env.local`, `.env.test` or the main checkout's
`.env.local` (variable names checked, values never read), the only Supabase project with real users is production,
and agents never create users there. Local `supabase start` is broken on this host (pgvector defect, recorded
2026-06-26, PG-196).

## What the owner can do

- Run the authenticated harness where a non-production Supabase works:
  `LHCI_URLS=http://localhost:3000/cases/case-types,http://localhost:3000/cases/new
  LHCI_OUTPUT_DIR=artifacts/lighthouse/PG-204 pnpm --filter @intelliflow/web run lighthouse:auth`, or
- approve a waiver by setting `lighthouse_waiver_approved_by` in the attestation himself.

Accessibility of both pages is covered meanwhile by axe checks in the component tests and an a11y-expert WCAG 2.1 AA
review (PASS WITH MINOR, fixes in `3a10045ad`).
