# CI Cost Monitoring — Operational Runbook

**Document ID**: RUN-CI-002 **Version**: 1.0 **Last Updated**: 2026-05-25
**Owner**: Platform Engineering

## Overview

The 2026-05-25 CI cost audit
([`docs/operations/ci-cost-audit-2026-05-25.md`](../ci-cost-audit-2026-05-25.md))
established a baseline ($178.51 / 29,661 compute minutes over 24 days) and
documented eleven ranked mitigations. This runbook is the **living** half of
that work: how the cost number is regenerated, where the artifact lives, how the
platform-health dashboard consumes it, and how the chronic failure patterns are
tracked as enforced knowledge rather than prose.

## Artifacts

| Path                                               | Schema                                                                                                                                | Refresh                                                 |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `artifacts/reports/ci-cost/latest.json`            | [`ci-cost-metrics.schema.json`](../../../apps/project-tracker/docs/metrics/schemas/ci-cost-metrics.schema.json)                       | governance-metrics workflow (weekly)                    |
| `artifacts/reports/ci-cost/latest.provenance.json` | [`ci-cost-metrics-provenance.schema.json`](../../../apps/project-tracker/docs/metrics/schemas/ci-cost-metrics-provenance.schema.json) | same as above                                           |
| `artifacts/reports/ci-cost/history/<ISO8601>.json` | same as latest                                                                                                                        | append-only on every refresh                            |
| `artifacts/reports/ci-failures/registry.json`      | [`ci-failure-registry.schema.json`](../../../apps/project-tracker/docs/metrics/schemas/ci-failure-registry.schema.json)               | hand-edited when a chronic pattern recurs or is guarded |

## Quick Reference

| Symptom                                                                                                             | Action                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `latest.provenance.json.is_stale === true`                                                                          | Re-export GitHub Actions usage CSV, re-run the parser. The threshold is 30 days.                                                                                       |
| Platform-health dashboard reports `metrics_staleness:ci_cost: failed` (the actual check name emitted by `route.ts`) | Same as above — the dashboard reads `latest.provenance.json`                                                                                                           |
| A new chronic failure pattern surfaces                                                                              | Add an entry to `artifacts/reports/ci-failures/registry.json` (see schema). Run `tools/scripts/parse-actions-usage.mjs` on the latest CSV to update the cost baseline. |
| A guard for an existing pattern lands                                                                               | Flip `guard_added: true`, add the PR URL to `guard_prs`, and ensure the `verification_command` actually passes.                                                        |

## How the cost number is refreshed

### Manual (today)

Export the usage CSV from <https://github.com/settings/billing/usage> (or the
org-level export) and run:

```bash
node tools/scripts/parse-actions-usage.mjs <usage.csv> --emit-json=artifacts/reports/ci-cost
```

This writes:

- `latest.json` — full aggregation (totals, by_workflow, by_user, by_day,
  by_user_workflow)
- `latest.provenance.json` — source CSV SHA256, min/max date, git HEAD, an
  `is_stale` flag computed against `staleness_threshold_days` (default 30)
- `history/<ISO8601>.json` — immutable per-run snapshot (use this to build a
  trend line)

The artifact schema **separates `compute_cost_usd` from `storage_cost_usd`** and
computes `grand_total_usd` as the sum — do not conflate them in downstream
reporting (this was a confirmed audit-doc bug).

### Scheduled

`.github/workflows/governance-metrics.yml` has a `ci-cost-metrics` job (runs
weekly on Monday + manual + push to main). The job does two things:

1. **Re-aggregate** (`Emit CI cost artifact` step): when
   `artifacts/inputs/actions-usage.csv` is present, runs the parser with
   `--emit-json=artifacts/reports/ci-cost --gh-freshness=$REPO` to write a fresh
   `latest.json` + `latest.provenance.json`.
2. **Refresh freshness** (`Refresh CI cost freshness` step, unconditional): runs
   `tools/scripts/refresh-ci-cost-freshness.mjs $REPO` on every tick. Reads the
   existing `latest.provenance.json`, calls
   `gh api /repos/{owner}/{repo}/actions/runs?per_page=1`, and updates
   `latest_observed_workflow_run_at` + `is_stale` + `stale_reason`. This step
   runs even if no new CSV was exported — so `is_stale` becomes true as soon as
   CI runs after the source CSV's max date (>24h slack for timezone alignment).

Both steps then run `node tools/scripts/verify-ci-failure-guards.mjs` which
exits non-zero on REGRESSION verdicts (PASS, TODO, and PROMOTE verdicts do not
fail the job — see §"Failure-pattern registry").

**Open follow-up:** the parser currently consumes a manually-exported CSV. The
next iteration should fetch usage directly via
`gh api /repos/{owner}/{repo}/actions/runs` (paginated) +
`/runs/{run_id}/timing` and assemble the CSV inline, then set
`collection_method: 'gh_actions_api'`. Today the `is_stale` flag is the safety
net.

## Platform-health integration

`apps/project-tracker/app/api/governance/platform-health/route.ts` consumes
`artifacts/reports/ci-cost/latest.provenance.json` directly (see the
`metrics_staleness:ci_cost` + `source_confidence:ci_cost` checks added to
`computeProvenanceChecks`). If the sidecar's `is_stale: true`, those checks fail
and the maturity criterion's `provenance_fresh` aggregate flips to false — the
dashboard shows the ci-cost slot as stale alongside the existing
self-service-metrics staleness check.

If the sidecar does NOT exist (e.g. fresh clone, parser never run), no check is
added — absence is bootstrap, not regression. The runbook tells the owner to run
the emitter once.

Sidecar fields the route reads:

- `is_stale` (precomputed by the emitter / refresh script)
- `stale_reason`
- `source_csv_max_date`
- `latest_observed_workflow_run_at`
- `confidence` (`low` / `medium` / `high`)
- `collection_method`

## Failure-pattern registry

Chronic failure patterns are tracked in
`artifacts/reports/ci-failures/registry.json` as structured data (not prose).
Each entry has:

- `first_seen` / `last_seen` / `occurrences` — frequency tracking so a
  recurrence is visible.
- `affected_workflows` — which workflow file(s) the failure surfaces in.
- `owner` — who is on the hook for the guard.
- `guard_added` + `guard_prs` + `guard_pattern` — the fix-shape and PRs that
  landed it.
- `verification_command` — a shell snippet that exits zero if the guard is still
  in place. Run all of these as a single nightly job and any regression surfaces
  as an explicit failure.

### Verify all guards (manual)

```bash
jq -r '.patterns[] | "echo === \(.id) ===; \(.verification_command)"' \
  artifacts/reports/ci-failures/registry.json | bash
```

Any non-zero exit means a guard has regressed (or the verification command
itself is stale — fix one or the other).

### When a pattern recurs

1. Find the entry in `registry.json` by `id`.
2. Update `last_seen` and bump `occurrences`.
3. If the existing `guard_pattern` would have prevented it, the regression was a
   guard that got removed — track down the PR that removed it and restore.
4. If the existing guard does NOT cover the new occurrence, add a sibling entry
   with a new `id` rather than mutating the existing one (preserves history).

### When a new pattern emerges

Add a new entry. The minimum useful set: `id`, `title`, `summary`, `first_seen`,
`last_seen` (same date), `occurrences: 1`, `affected_workflows`, `owner`,
`guard_added: false` (until landed), `guard_pattern` (the intended fix shape),
`verification_command` (a check that fails until the guard is in place),
`evidence` (the failed run URL or PR that surfaced it).

## Escalation

- **Cost spike >2× baseline in 24h**: Page Platform Eng. Check the by-workflow
  breakdown in `latest.json` for the new heavy hitter and the Dependabot
  drill-down for a bot churn storm.
- **Same pattern recurs after a guard landed**: Page the `owner` in the registry
  entry. Treat as a P2 incident (per
  [`incident-runbook.md`](../incident-runbook.md)).
- **`is_stale: true` for >7 days**: Owner is on the hook to re-export the usage
  CSV (or, post-automation, debug why the gh-api fetch job is failing).

## See also

- [`../ci-cost-audit-2026-05-25.md`](../ci-cost-audit-2026-05-25.md) — the
  baseline audit and the 11 ranked mitigations
- [`./workflow-troubleshooting.md`](./workflow-troubleshooting.md) — Temporal /
  BullMQ workflow troubleshooting (different scope, not GitHub Actions)
- [`../incident-runbook.md`](../incident-runbook.md) — incident severities and
  escalation
- [`../../../apps/project-tracker/app/api/governance/platform-health/route.ts`](../../../apps/project-tracker/app/api/governance/platform-health/route.ts)
  — the route that will surface the staleness check
