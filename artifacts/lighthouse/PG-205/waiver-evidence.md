# PG-205 Lighthouse: Path A evidence and waiver request (2026-10-17)

**Status: `GATE:lighthouse-gte-90` (DoD 12) NOT MET, NEEDS_HUMAN.** No score here measures the Contact Types page
(`/contacts/contact-types`) or the New Contact page (`/contacts/new`). No waiver approver is named: approval is the
owner's.

## Attempt (`docs/claude-refs/lighthouse-playbook.md` Path A, same method as PG-204)

| Run | Setup | Final URL | Scores (perf / a11y / best-practices / SEO) |
| --- | --- | --- | --- |
| `contacts-contact-types-r1.report.json` (2026-10-17T22:03:57Z) | Web build at `7319f0d2c` with placeholder public env (`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`, a placeholder anon key; no Supabase or API running), `next start -p 3400`, Lighthouse 12.6.1, desktop preset, 1 run | `/login` | 0.87 / 0.93 / 0.74 / 0.69 |
| `contacts-new-r1.report.json` (2026-10-17T22:04:14Z) | same | `/login` | 0.88 / 0.93 / 0.74 / 0.69 |

The server answers 200 for both routes. The client auth guard then redirects to `/login`, so these numbers measure
the **login page**, not PG-205. This matches PG-196 and PG-204.

## Why no authenticated run (Path C)

`tools/lighthouse/lhci-auth.js` signs in with `LHCI_TEST_EMAIL` / `LHCI_TEST_PASSWORD`. These were checked on
2026-10-17 by variable name only (values never read): `.env.test` in this worktree, plus `.env.local` and
`.env.test` in the main checkout. None of them defines either variable, and neither is set in the environment.
The only Supabase project with real users is production, and agents never create users there. Local
`supabase start` is broken on this host (pgvector defect, recorded 2026-06-26).

## What the owner can do

- Run the authenticated harness where a non-production Supabase works:
  `LHCI_URLS=http://localhost:3000/contacts/contact-types,http://localhost:3000/contacts/new
  LHCI_OUTPUT_DIR=artifacts/lighthouse/PG-205 pnpm --filter @intelliflow/web run lighthouse:auth`, or
- approve a waiver by setting `lighthouse_waiver_approved_by` in the attestation.

Meanwhile, the pages' accessibility is covered by axe checks in the component tests (colour-contrast rule off in
jsdom) and by an a11y-expert WCAG 2.1 AA review (PASS_WITH_FIXES, fixes in `7319f0d2c`, record in the exec run's
`matop/a11y-review.md`).
