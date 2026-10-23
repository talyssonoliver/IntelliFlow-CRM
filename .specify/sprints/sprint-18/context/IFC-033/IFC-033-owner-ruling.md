# IFC-033 owner ruling

**Date:** 2026-10-22 **Asked in:** AskUserQuestion modal, IFC-033 lane (runner: Aurora)

## Question

IFC-033's close criterion (#795 reopen, `task-tracking.json` blockers) is a k6 run against a
deployed environment, with owner approval. No staging environment exists: `staging.intelliflow-crm.dev`
does not resolve, and the repo has no STAGING variables or secrets. The only deployed target is the
production Railway API (`PRODUCTION_API_URL`). The nightly k6 job from #887 has never run: it stays
queued for a self-hosted runner and is cancelled every night.

Options offered:

- **A. Prod, test tenant (recommended).** A 3-minute k6 run at about 1.5x the 5,000 leads/hour budget,
  against the production API, in a dedicated load-test tenant. About 400 synthetic leads and 60
  conversions, tagged and left in place (no deletion without the owner). A production test login is needed.
- B. Prod, read-only paths only. This does not prove throughput, so the verdict stays PARTIAL.
- C. Build a staging environment first. This means external spend and a separate infra task.
- D. Leave it PARTIAL and record NEEDS_HUMAN.

## Answer

**A. Prod, test tenant.**

## Constraints carried into execution

- Target: the production API only, inside a dedicated load-test tenant. No other tenant's data is read or written.
- Load is capped at about 1.5x the budget (about 7,500 leads/hour) for about 3 minutes.
- Synthetic records are identifiable as load-test data. Nothing is deleted from production without a
  separate owner instruction.
- The database is never driven directly: all writes go through the deployed API.

## Follow-up ruling: AI scoring cost (2026-10-22)

**Found during preparation:** every production `lead.create` enqueues one AI scoring job
(`apps/api/src/modules/lead/lead.router.ts:532-559`). The ai-worker's `ai.scoring.enabled` flag is an
in-memory seed that is on for every tenant (`apps/ai-worker/src/lib/feature-flags.ts`). Its only
off-switch is the global `ENABLE_AI_SCORING_JOB` env var, so a test tenant cannot opt out. Each
synthetic lead therefore costs one LLM call. The production model could not be confirmed because the
Railway CLI login had expired; the code default is `gpt-4-turbo-preview`.

Options offered: A. go as planned (3 min at 1.5x, about 450 calls); **B. a smaller run (2 min at about
1.1x, about 200 calls)**; C. disable production scoring for the window; D. don't run.

**Answer: B. Go, smaller run.**

Execution parameters derived from it:

- Ingestion: 23 leads per 15 s, i.e. 1.53 leads/s or 5,520 leads/hour (1.10x the 5,000/h budget), for 2 minutes.
- Conversion pool: 20 leads, set to QUALIFIED through `lead.bulkUpdateStatus` and converted at 1 every 6 s.
- In total about 205 leads and 205 scoring calls.

## Third ruling: verdict after the production run (2026-10-22)

**Run:** 2026-10-22 23:06:36Z to 23:08:54Z, against `https://api-production-e9c1.up.railway.app`, in a dedicated
tenant (21 synthetic leads before the run, all `@loadtest.example.com`).

**Result:** 185 leads in 123 s, about 5,435 leads/hour (budget 5,000): PASS. Error rate 0 %: PASS.
Atomic conversions 20/20. Client p95 was 1,137 ms against the 200 ms budget: **FAIL**. Server-side, Grafana
Cloud shows POST p95 2,024 ms and GET p95 701 ms. A Tempo trace of `lead.create` shows every Postgres
round-trip costing about 147 ms (BEGIN, SET, COMMIT, INSERT, SELECT alike): network latency between the API
and the database, not load. k6 exited 99 because the latency thresholds were crossed.

Options offered: A. a PR with verdict PARTIAL plus an issue, the row staying In Progress; **B. close as
COMPLETE**, since the row's KPI (5,000 leads/hour) passes, recording p95 as the identified bottleneck and
tracking it in an issue; C. hold until the region is fixed.

**Answer: B. Close COMPLETE.**

The attestation records p95 as a measured FAIL against the ADR-018 budget, and that `pnpm test:load` exits
non-zero on it. The bottleneck is tracked in a GitHub issue, `artifacts/metrics/debt-ledger.yaml` and
`docs/shared/bottleneck-analysis.md`. The COMPLETE verdict rests on this owner ruling, not on every
threshold passing.
