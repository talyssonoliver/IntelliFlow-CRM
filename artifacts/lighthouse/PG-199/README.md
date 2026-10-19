# PG-199 Lighthouse — NEEDS_HUMAN (authenticated run not possible locally)

Gate: CSV `GATE:lighthouse-gte-90` on `/agent-approvals/model-config` (auth-gated).

## What ran (Path A, 2026-10-19)

Production build (`pnpm turbo build`, matrix step 12) served with `next start -p 3400`;
Lighthouse 12.6.1, desktop preset, unauthenticated:

| Category | Score |
|---|---|
| performance | 93 |
| accessibility | 90 |
| best-practices | 93 |
| seo | 66 |

Report: `model-config-path-a.report.json` (sha256 `f6c85f51dfa03f23eed0966fe2994773d12fc592e342b49d7a15ff56a283a8b0`). The final URL stayed on the route, but
without a session the page renders only its auth-pending shell, so this is NOT the authenticated
view and does not satisfy the gate.

## Why the authenticated recipe (Path C) did not run

- `tools/lighthouse/lhci-auth.js:9-11` needs `LHCI_TEST_EMAIL` / `LHCI_TEST_PASSWORD`. Neither is
  set in the environment or in any env file of the main checkout or this worktree (checked with
  grep, 2026-10-19).
- The only Supabase configured locally is the production project (main checkout `.env.local`);
  logging a test user into production is not allowed for this lane.
- Local Supabase is not used: known pgvector start failure on this host (memory
  reference_lighthouse_gate_local_recipe), and its ports collide with other projects.

## Needed from a human

Provide test credentials for a non-production Supabase (or run `pnpm --filter @intelliflow/web run
lighthouse:auth` where they exist) against `/agent-approvals/model-config`, then record the report
hash in the attestation.
