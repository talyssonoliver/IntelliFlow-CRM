# PG-201 — Lighthouse waiver evidence (NOT approved)

- Task: PG-201 Module Settings — Scheduled Reports (`/analytics/scheduled-reports`)
- KPI: `GATE:lighthouse-gte-90` — **met: false** (not measured on the real page)
- Approver: **none** — awaiting the owner. Do not treat this file as an approval.

## Paths attempted (docs/claude-refs/lighthouse-playbook.md)

| Path | Attempted | Outcome |
| --- | --- | --- |
| A — unauthenticated base recipe | Yes, once (runner ruling) | Report `artifacts/lighthouse/PG-201/scheduled-reports-r1.report.json` (sha256 `a904a064abb4e0c5579e006c0199a7ca656852a377f299a7230dbdbe615dc339`). The build has no Supabase public env, so the route renders the global error page; scores 0.93 / 0.90 / 0.93 / 0.66 belong to that error page. |
| B — extended timeouts | No | Not applicable: Path A did not fail with NO_FCP; it rendered, but the wrong (error) content because of missing env, which timeouts do not change. |
| C — authenticated harness | No | Blocked by ruling: the only reachable Supabase is production; creating test users there is forbidden. |

## What would make it pass

An authenticated run against a non-production Supabase with a seeded ANALYTICS user
(ADMIN/MANAGER to see the write controls), or an explicit owner waiver.
