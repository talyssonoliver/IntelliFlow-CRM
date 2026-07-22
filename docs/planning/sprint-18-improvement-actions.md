# Sprint 18 — Improvement Actions (Evolveability)

> One action per root cause (RC-1…RC-5), plus the concrete residual register.
> Each action names: **prevention · gate · owner · rollback**. Derived from
> PM-OPS-002. Anchor: `origin/main @ 7f15fcaaf`.

## A. Systemic actions (one per root cause)

### AR-1 — Automate merge → CSV-status reconciliation (RC-1)

- **Prevention:** A post-merge job parses the merged PR title for a task id +
  feature-class prefix and proposes the CSV Status flip (Backlog/In Progress →
  Completed) as a follow-up commit/PR.
- **Gate:** New CI check `status-reconcile-drift` — fails if a task id has a
  merged title-hit feature PR on `main` but its CSV row is still
  `Backlog`/`In Progress`. (DOC-015 and IFC-211 would have tripped it.)
- **Owner:** DevOps + project-tracker maintainer.
- **Rollback:** The check is advisory-then-blocking; ship warn-only for one
  sprint, promote to blocking once false-positive rate is 0. Disable via
  workflow revert.

### AR-2 — Ban synthetic completion (RC-2)

- **Prevention:** Bulk sync must **never** write a `completed_at`/`duration` for
  a task that lacks a real `/exec` timing. Sync copies timings from
  `task-tracking.json`; if absent, it writes `null`, not a placeholder.
- **Gate:** `no-placeholder-timestamps` — fails if >1 completed task in a sprint
  shares an identical `completed_at`, or if `duration_minutes == 15` (the
  default) co-occurs with a missing attestation.
- **Owner:** project-tracker maintainer.
- **Rollback:** Gate is data-only (reads metrics tree); revert the check file.

### AR-3 — Make attestation a merge-blocking, per-task contract (RC-3) — **highest leverage**

- **Prevention:** A task cannot be flipped to `Completed` in the CSV without a
  matching `attestation.json` (verdict `COMPLETE`/`PARTIAL`) whose declared
  artifact hashes resolve on disk.
- **Gate:** Extend pre-ship / CI: `attestation-required-for-completed` — for
  every CSV row that _changes to_ Completed in the diff, assert the attestation
  exists and its `validation_results` is a full 4/4. (Catches all 18 gaps at
  source.)
- **Owner:** DevOps (pre-ship) + squad leads.
- **Rollback:** Scope to _newly-completed_ rows only (diff-based), so it never
  blocks historical debt; revert the gate step to disable.

### AR-4 — Verify telemetry as a live signal, not just as code (RC-4)

- **Prevention:** "Observability provisioned" is only Done when a live-endpoint
  smoke test returns a real trace/metric. Delivery of INFRA-TF-004 / IFC-032 is
  re-opened until that proof exists.
- **Gate:** `telemetry-liveness` smoke in the deploy pipeline: assert the OTel
  endpoint (a TF output) accepts a trace and Grafana/Tempo shows it. Emit a
  `dora-source.json` (deploy events + incidents) so future DORA is measurable.
- **Owner:** DevOps/SRE.
- **Rollback:** Smoke runs post-deploy, non-gating first; promote to gating.

### AR-5 — Time-box the sprint; lock the backlog (RC-5)

- **Prevention:** Every sprint gets a real `sprint_start_date` + `end_date`. New
  work filed after start goes to the **next** sprint's backlog, not the active
  one.
- **Gate:** `sprint-scope-lock` — fails if a task row is _born_ into a sprint
  whose `start_date` is in the past (the 2026-04-19 injection would have
  tripped).
- **Owner:** PM.
- **Rollback:** Dates + lock live in `_summary.json` schema; advisory first.

## B. Residual-action register (concrete, this sprint's debt)

| ID               | Action                                                                          | Tasks                                    | Owner                   | Done-when                                   |
| ---------------- | ------------------------------------------------------------------------------- | ---------------------------------------- | ----------------------- | ------------------------------------------- |
| **R-STATUS-2**   | Flip CSV Backlog → Completed (couple with attestation backfill, not standalone) | DOC-015, IFC-211                         | project-tracker         | CSV reconciled + attestation present        |
| **R-DOC016**     | Commit `.github/workflows/docs-integrity.yml` to main                           | DOC-016                                  | PM/DevOps               | Workflow on main + green run                |
| **R-ATTEST-18**  | Backfill real `/exec` attestation (re-hash + 4 validations)                     | 13 PG module-settings + 5 INFRA-TF       | delivering squads       | 18 `attestation.json` present               |
| **R-CSVPATH-13** | Fix CSV artifact paths to route-group-correct locations                         | PG-196–209                               | project-tracker         | `plan-lint` clean on the 13 rows            |
| **R-WIP-257**    | Finish or explicitly carry IFC-257 to Sprint 19                                 | IFC-257                                  | Frontend (STOA-Quality) | wired + tests ≥90% **or** carried with note |
| **R-KPI-CI**     | Run deferred Lighthouse + real-DB KPIs in CI                                    | IFC-212, PG-180, PG-189, PG-190, IFC-310 | DevOps + squads         | KPIs measured, not deferred                 |

## C. Sequencing

Do **AR-3** and **AR-5** first — they are the gates that would have prevented
the majority of Sprint 18's debt (unattested completions + unbounded scope).
AR-1/AR-2 are cheap data checks that ride behind them. AR-4 is the long pole
(needs live infra) and unblocks DORA for every future sprint.

**Guiding principle:** convert every skippable manual step into a diff-scoped,
warn-then-block gate. A control that can be skipped by omission is not a
control.
