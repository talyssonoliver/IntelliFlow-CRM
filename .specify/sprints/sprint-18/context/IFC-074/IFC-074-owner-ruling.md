# IFC-074 — Owner ruling (2026-10-22)

**Question (asked in an AskUserQuestion modal by the IFC-074 lane):**
IFC-074 cannot honestly close before merge. Its close rule (2026-10-05) needs api logs
correlating in production, and the api sends zero logs to Loki today (verified read-only
against Grafana Cloud on 2026-10-22: `service_name` label values over 7 days = `["ai-worker"]`;
the api request log is `console.log`, not pino). ai-worker correlation and real alerts
(`ErrorRatioBreach` from real ai-worker span errors) already exist, so MTTD can be measured now.

**Options put:**
- A: Fix + real evidence (recommended)
- B: A + bring ws / events-worker / ingestion-worker into scope (production Railway env change)
- C: Close on ai-worker only (contradicts the 2026-10-05 close rule)

**Answer: A — "Fix + real evidence (Recommended)".**

**What that means for this lane:**
1. Route the api's per-request log through pino so it carries `trace_id`/`span_id` and exports
   over OTLP to Loki.
2. Add a read-only Grafana Cloud evidence collector that writes `artifacts/reports/correlation-test.csv`
   and `artifacts/reports/mttr-baseline.json` from real observed data (no hand-written IDs).
3. ai-worker correlation rows and MTTD are real now. The api row is NEEDS_HUMAN until the PR is
   merged and deployed; a collector re-run then closes it.
4. The Sprint_plan row stays **In Progress** until that post-deploy re-run. Do not mark it Completed.
