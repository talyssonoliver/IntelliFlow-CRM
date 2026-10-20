# PG-202 Lighthouse: Path A evidence (2026-10-17)

**Status: `GATE:lighthouse-gte-90` / AC-025 NOT MET. NEEDS_HUMAN.** No score here measures the Availability page
(`/calendar/availability`). No waiver approver is named, because approval is the owner's.

## Owner direction (lane modal, 2026-10-17)

> "We really need to automate it, but we should also be aware that we are using free quotas and no users yet, so that
> could burn our own resources without a chance to get the real customers."

Applied as: one local Path A attempt, with no hosted Supabase or Vercel calls. The automation route (local Supabase auth for
`lighthouse:auth`) is recorded on gh #527, which tracks local `supabase start` failing on the pgvector migration.

## Attempt (`docs/claude-refs/lighthouse-playbook.md` Path A)

| Attempt | Setup | Final URL | Result |
| --- | --- | --- | --- |
| 1 (kept: `calendar-availability-pathA-r1.report.json`, sha256 `da3dcd6967b6abe52e221a5396c9511671744e01d7cc082b8d62527ab7579bfa`) | The production build from the Validation Matrix (row 11, `next build --webpack`, head `4c6ac696e`), served by `next start -p 3412` (port 3400 was held by another process and left alone). Lighthouse 12.6.1, desktop preset, 1 run, fetch 2026-10-17T22:13:38Z. The worktree has no `.env.local`, so no Supabase URL is compiled in and no hosted service is called. | requested URL | The page rendered the global error page (console `Error: supabaseUrl is required`): perf 0.93, a11y 0.90, best-practices 0.93, SEO 0.66. These scores measure the **error page**, not PG-202. This is the same failure as PG-196 and PG-204 attempt 1. |

A placeholder-env rebuild (PG-204 attempt 2) would only redirect to `/login` client-side and measure the login page, so it
was not repeated.

## Why there is no authenticated run (Path C)

`tools/lighthouse/lhci-auth.js` signs in with `LHCI_TEST_EMAIL` / `LHCI_TEST_PASSWORD` against the Supabase project in
`NEXT_PUBLIC_SUPABASE_URL`. Neither credential exists in this worktree's env files (only variable names were checked). The
only Supabase project with real users is production, where agents never create users. Running against hosted projects
also spends the free quotas the owner wants protected.

## What covers the page meanwhile

- axe-core with no violations in five page states (`AvailabilityContent.test.tsx`; colour contrast is not checked in jsdom).
- a11y-expert WCAG 2.1 AA review: FAIL, then fixed in `015016c13`, then the re-check passed with minor items
  (`matop/a11y-review*.json`). Contrast ratios for the page's text were computed by hand.
- First-load JS 871.0 KB gzip vs 876.7 KB for `/cases/case-types` (`matop/first-load-js.json`, NF-003).

## What the owner can do

- Once gh #527 is fixed (local Supabase), run
  `LHCI_URLS=http://localhost:3000/calendar/availability LHCI_OUTPUT_DIR=artifacts/lighthouse/PG-202 pnpm --filter @intelliflow/web run lighthouse:auth`, or
- approve a waiver by setting `lighthouse_waiver_approved_by` in the attestation yourself.
