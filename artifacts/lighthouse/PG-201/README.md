# PG-201 Lighthouse — attempt and status (2026-10-13)

**Status: `GATE:lighthouse-gte-90` NOT MET — needs an authenticated run or an
owner-approved waiver.** No score here measures the Scheduled Reports page.

| Attempt | Setup | Final URL | Result |
| --- | --- | --- | --- |
| Path A, run 1 (kept: `scheduled-reports-r1.report.json`) | `pnpm --filter @intelliflow/web build` (exit 0, no `.env.local`, so no `NEXT_PUBLIC_SUPABASE_URL`), `next start -p 3400`, Lighthouse 12.6.1 `--preset=desktop --ignore-status-code`, all categories | `/analytics/scheduled-reports` (HTTP 200; the route is statically prerendered and auth is enforced client-side) | performance 0.93, accessibility 0.90, best-practices 0.93, SEO 0.66 — but the LCP element is the global error page text ("We encountered an error while loading the page…"), because the build has no Supabase public env. This measures the error page, not PG-201. |

Lighthouse exited 1 after writing the report: `chrome-launcher` could not delete its
temp profile on Windows (`destroyTmp` EPERM) — the report itself is complete
(`runtimeError: null`, fetchTime 2026-10-13T03:22:48Z).

## Why only Path A

Runner ruling (2026-10-13, `.specify/sprints/sprint-18/context/PG-201/PG-201-runner-rulings.md`):
these are authenticated pages and the only Supabase reachable here is PRODUCTION —
never create users there, so Path C (`lighthouse:auth`) is impossible tonight. Run
Path A once, record the evidence, mark the KPI `met: false`, verdict NEEDS_HUMAN, and
do **not** write `lighthouse_waiver_approved_by` (the owner decides in the morning,
as for PG-196 / PG-197).

## Next step (owner)

Either run the authenticated harness where a non-production Supabase is available
(`lighthouserc.authenticated.js` with
`LHCI_URLS=http://localhost:3000/analytics/scheduled-reports`, see
`docs/claude-refs/lighthouse-playbook.md` Path C), or approve a waiver with
`lighthouse_waiver_approved_by: <name>` in the attestation notes.
