# Sprint 18 — Retrospective

> Derived from PM-OPS-002 (`docs/audit/sprint-18-full-audit.md`). Every figure
> traces to `artifacts/reports/sprint-18/*`. Anchor: `origin/main @ 7f15fcaaf`,
> 2026-07-22.

## Snapshot

|                                 |                                                    |
| ------------------------------- | -------------------------------------------------- |
| Committed                       | 67 tasks                                           |
| Delivered-in-fact               | **66 (98.5%)** — primary artifact on `origin/main` |
| CSV-Completed                   | 63 (94.0%)                                         |
| Cleanly attested                | **36 (53.7%)**                                     |
| Phantom / genuinely undelivered | **0 / 0**                                          |
| Sprint span                     | ~149 days (nominal 14); SPI 0.36                   |
| DORA                            | all 4 UNKNOWN (no telemetry)                       |

## What went well 🟢

1. **The work actually shipped.** 66 of 67 primary deliverables are verifiable
   on `origin/main` today, and there are **zero phantoms** — a materially better
   result than the project-wide phantom rate (242/449 Completed rows across all
   sprints). Sprint 18's _delivery_ is trustworthy.
2. **Honest partials.** Every one of the 9 KPI-gap tasks self-reports its gap in
   its attestation (Lighthouse-not-in-CI, real-DB bench gated, one 70% branch
   coverage). Nobody papered over a miss — IFC-310's
   `merge_p95_ms_real_db: null, met: false` is exactly the kind of honesty we
   want.
3. **Deep, real evidence where governance ran.** The 36 clean attestations carry
   SHA-256 artifact hashes, real exit codes, and test counts (IFC-310 alone: 110
   test cases, 92.88% scoped coverage, ADR-050). When `/exec` ran, it ran well.
4. **Self-correcting audit culture.** The `backlog-truth-audit` and
   `phantom-completed-audit` (both 2026-07-21) already existed — the team was
   already hunting its own stale rows. This audit builds on that, and caught two
   tasks (DOC-015 #612, IFC-211 #597) that shipped _after_ those audits ran.

## What went badly 🔴

1. **Governance lagged delivery by ~2×.** 66 delivered vs 36 cleanly-attested.
   Half the "done" work has no clean governance trail.
2. **Completion timing is largely uncaptured.** In committed evidence, 34 tasks
   record `completed_at: null` and 5 have no `task-tracking.json` at all —
   completion was marked without recording when work finished. (A gitignored
   generated cache showed bulk-sync duplicate clusters, but that is not
   committed-reproducible; the committed defect is timing _absence_, not
   synthetic duplication.) The tracker _looks_ precise and isn't.
3. **Status drifted from reality.** DOC-015, IFC-211 and DOC-016 all shipped to
   `origin/main` yet still read "Backlog." The CSV — our single source of truth
   — was wrong on three rows.
4. **The sprint never closed to scope.** Null start/end dates + 13 tasks
   injected on 2026-04-19 turned a 2-week box into a ~149-day rolling bucket.
   SPI 0.36 is the arithmetic of a plan that never froze.
5. **We are blind to flow.** DORA is 4×UNKNOWN. We built the telemetry
   (INFRA-TF-004, IFC-032) but never verified it emits a live signal, so we
   still can't measure deploy frequency, lead time, CFR, or MTTR.
6. **CSV artifact paths drifted from disk.** 13 rows point at pre-route-group
   paths; PG-204 nearly mis-classified as phantom because of it.

## What confused us 🟡

- **Two different truths for "Sprint 18 status."** `origin/main` says 63/3/1;
  the `ssite_map_docs` branch says 55/11/1. Contributors on the wrong branch see
  the wrong sprint. (This audit anchors to `origin/main`.)
- **"Completed" means five different things** — cleanly attested, attested-with-
  gap, PR-evidenced-unattested, artifact-only-unattested, or stale-backlog-but-
  shipped. The single word hides the governance state entirely.

## The one lesson

> **Delivery is not the problem; proof-of-delivery is.** Sprint 18 built the
> product. It did not build the evidence that it built the product — because
> nothing _forced_ it to. Every root cause reduces to the same shape: a control
> that should be a gate (attestation, status reconciliation, scope-lock,
> telemetry-liveness) is instead a manual, skippable step.

Action register: `sprint-18-improvement-actions.md`. Closure:
`sprint-18-closure-decision.md`.
