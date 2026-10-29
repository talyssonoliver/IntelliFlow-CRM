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

---

# Owner ruling 2 (2026-10-22) — ship blocker #1000

**Question:** IFC-074 is built and validated, but every lane's pre-ship now fails on new critical
advisories on main (next RCE in apps/project-tracker, @sentry/nextjs, dompurify) — filed as #1000, none
touched by IFC-074. How should IFC-074 ship?

**Options put:** A: separate fix PR first (recommended) · B: bump deps inside IFC-074 · C: stop and hand
to Aurora.

**Answer: A — "Separate fix PR first (Recommended)".** The lane opens a small dependency PR for #1000
(same shape as #975) from its own worktree, with its own pre-ship and PR (not merged by the lane).
IFC-074 waits for that fix to land on main, then merges main, runs its own pre-ship once and pushes.

---

# Owner ruling 3 (2026-10-28/29): ship code, gate the KPI after

**Source:** relayed to this lane by the coordinator (Aurora) on 2026-10-29. The owner's own words were not seen by the
lane. Relayed wording: "Ship code, gate KPI after": the attestation is NEEDS_HUMAN with the MTTD KPI `met:false`, and
MTTD < 120 s is measured after deploy over at least 72 h or 10 real errors. The span rule (#1040) and the Loki rule
(#1062) are the delivered detection paths.

**What it answers:** the "owner decision on detection tuning vs target" half of task-tracking blocker 6. It does not
lift AC-002 or AC-009. The Sprint_plan row stays In Progress (ruling 1).

**Questions put back to the owner on 2026-10-29 (via the coordinator), not yet answered:**
- Q1: the KPI statistic. Keep the per-incident mean (AC-004), or use the per-episode first alert from any rule with the
  per-incident mean co-reported? The spec addendum works on the second (option B), marked "assumed, pending owner".
- Q2: the measurement token. The working assumption is a separate Viewer secret, `GRAFANA_VIEWER_TOKEN` (F7). The
  workflow fails closed without it and never falls back to the Admin token.
