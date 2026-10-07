# PG-196 Lighthouse — attempts and status (2026-10-07)

**Status: NF-001 / `GATE:lighthouse-gte-90` NOT MET — needs an authenticated run
or an owner-approved waiver.** No score here measures the Account Tiers page.

| Attempt | Setup | Final URL | Result |
| --- | --- | --- | --- |
| 1 (discarded) | `next start -p 3400` on a build without `NEXT_PUBLIC_SUPABASE_URL` (worktree has no `.env.local`) | `/accounts/account-tiers` | Rendered the global error page ("Something went wrong", console `supabaseUrl is required`). The sibling `/accounts/account-settings` failed the same way — environment, not PG-196. Reports deleted. |
| 2 (kept: `account-tiers-r1.report.json`) | Rebuilt with placeholder public env (local Supabase URL, placeholder anon key; no API, no Supabase running), `next start -p 3410`, 3 runs | `/login` (auth redirect) | performance 0.87–0.88, accessibility 0.93, best-practices 0.74 — this is the **login page** with connection-refused errors, not the tiers page. |

Why no authenticated run (Path C, `docs/claude-refs/lighthouse-playbook.md`):
it needs a running local Supabase plus the API against a database with the
PG-196 tables and a seeded admin user. Local `supabase start` fails on this host
(pgvector extension defect, recorded 2026-06-26), and production credentials must
not be used for a local test run.

Next step (owner): either run the authenticated harness where Supabase works, or
approve a waiver (`lighthouse_waiver_approved_by`). Command for the authenticated
run: copy `lighthouserc.authenticated.js` to a per-task config with
`url: ['http://localhost:3000/accounts/account-tiers']`, then
`npx lhci autorun --config=lighthouserc.PG-196.js`.
