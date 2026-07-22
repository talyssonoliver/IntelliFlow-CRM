# Sprint 18 — Closure Decision

> Formal closure record for PM-OPS-002. Anchor: `origin/main @ 7f15fcaaf`,
> 2026-07-22. Evidence: `docs/audit/sprint-18-full-audit.md` +
> `artifacts/reports/sprint-18/*`.

## Verdict

# `CLOSED_WITH_RESIDUAL_ACTIONS`

## Decision rationale

Sprint 18 is closed **because the work is real**: 66 of 67 committed tasks have
their primary deliverable verifiable on `origin/main`, with **zero phantom
completions and zero genuinely-undelivered tasks**. It is closed **with residual
actions** — not cleanly — **because the evidence trail lags the delivery**:

| Reason it is not a clean CLOSE                                  | Reason it is not NOT_CLOSED                            |
| --------------------------------------------------------------- | ------------------------------------------------------ |
| Only 36/67 carry a clean canonical attestation                  | 66/67 deliverables verifiable on disk                  |
| ~39 completed tasks carry no committed completion timestamp     | 0 phantom, 0 undelivered                               |
| 3 shipped rows still read "Backlog" (DOC-015, IFC-211, DOC-016) | 9 partials are honest & documented, not failures       |
| IFC-257 at 80% (the sole partial WIP)                           | The 3 "open" delivered items just need a CSV flip      |
| DORA unmeasurable (no telemetry)                                | The residuals are governance debt, not missing product |

A `NOT_CLOSED` verdict would be dishonest — it would imply the product isn't
built. A clean `CLOSED` would be equally dishonest — it would imply the evidence
is trustworthy. `CLOSED_WITH_RESIDUAL_ACTIONS` is the only factual verdict.

## Definition-of-Done ledger (sprint level)

| DoD dimension                               | State                  | Note                                                |
| ------------------------------------------- | ---------------------- | --------------------------------------------------- |
| All committed work delivered                | ✅ 66/67 on disk       | only IFC-257 (WIP) excepted                         |
| Every Completed row governed by attestation | ❌ 36/67 clean         | 18 gaps → R-ATTEST-18                               |
| Status = reality                            | ⚠️ 3 stale             | DOC-015, IFC-211, DOC-016 → R-STATUS-2              |
| Timings/evidence authentic                  | ❌ 34 null + 5 no-file | committed timing largely absent → AR-2 gate         |
| Flow measurable (DORA)                      | ❌ UNKNOWN×4           | → AR-4 (telemetry liveness)                         |
| No fabricated data in this audit            | ✅                     | deterministic collector, live git, real hashes only |

## Conditions carried into Sprint 19 (residual register)

Tracked in `docs/planning/sprint-18-improvement-actions.md` §B:

1. **R-STATUS-2** — flip DOC-015, IFC-211, **DOC-016** → Completed. DOC-015 and
   DOC-016 already carry clean COMPLETE attestations, so their flip is safe now;
   IFC-211 has no attestation yet, so its flip must ride **together with** the
   attestation backfill (R-ATTEST-18) to avoid minting the unattested-Completed
   defect this audit condemns (AR-3). **Deliberately deferred** out of this
   read-only audit PR to the tracker-owning change.
2. **~~R-DOC016~~ (already satisfied)** — `.github/workflows/docs-integrity.yml`
   **is already on `origin/main`** (blob `23a19fcf`, #598). No action; the item
   is retained here only to record that the prior "commit the workflow" residual
   was based on a false-negative reading and is now closed.
3. **R-ATTEST-18** — backfill 18 real attestations (re-hash + 4 validations).
4. **R-CSVPATH-13** — correct 13 module-settings artifact paths.
5. **R-WIP-257** — finish or formally carry IFC-257.
6. **R-KPI-CI** — measure the 5 CI-deferred KPIs (Lighthouse, real-DB p95).

Plus the five systemic gates AR-1…AR-5 (the durable fix so Sprint 19 does not
repeat this pattern).

## Explicitly out of scope of this closure

- The project-wide phantom-Completed backlog (242 rows across all sprints,
  `phantom-completed-2026-07-21.md`) — a separate initiative (#583).
- Backfilling historical attestations for sprints < 18.
- Any code change to product features — this audit is read-only over the
  product; its only writes are the audit artifacts and this task's own
  attestation. (The 3 CSV status flips — DOC-015, IFC-211, DOC-016 — are
  deferred to the tracker-owning change; see R-STATUS-2.)

## Sign-off

- **Auditor:** Claude Opus 4.8 (Claude Code), autonomous, PM-OPS-002.
- **Method attestation:** every quantitative claim is reproducible from
  `artifacts/reports/sprint-18/task-evidence-matrix.json` (regenerate via the
  collector) and live `git log origin/main`. No metric was estimated;
  unmeasurable metrics are reported `UNKNOWN`.
- **Human ratification required for:** promoting AR-1…AR-5 gates to blocking,
  and accepting R-ATTEST-18 as debt vs. requiring immediate backfill.
