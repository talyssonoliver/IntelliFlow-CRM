# Sprint 18 — Full Audit & Factual Closure (PM-OPS-002)

> **Task:** PM-OPS-002 · **Generated:** 2026-07-22 · **Auditor:** Claude Opus
> 4.8 (Claude Code) · **Anchor ref:** `origin/main @ 7f15fcaaf` · **Method:**
> deterministic evidence collection (reproducible) + live git verification.
> **Zero fabricated metrics. Zero fictional evidence.**

> **Revision note (2026-07-22, post-verification pass).** Every load-bearing
> number in this audit was independently re-verified against `origin/main` (git
> `ls-tree`/`log`, on-disk file checks, committed `task-tracking.json` /
> `attestation.json`). Two corrections resulted and are reflected throughout:
> **(1) DOC-016** — its CI-gate limb `.github/workflows/docs-integrity.yml` **is
> present on `origin/main`** (blob `23a19fcf`, commit `f57490a91` / #598), so
> DOC-016 is **fully delivered** (C04, stale-Backlog status only), not a C09
> partial. The prior "absent" reading came from checking the `ssite_map_docs`
> working tree (where the file is untracked) rather than `origin/main`. **(2)
> Completion timestamps** — the earlier "28 synthetic placeholders (×16/×8
> clusters)" figure derived from the **gitignored, generated** `_summary.json`
> cache and is **not reproducible from committed sources**. Committed
> `task-tracking.json` shows a different (and cleaner) defect: **34
> `completed_at: null` + 5 tasks with no tracking file**, i.e. timing _absence_,
> with no duplicate cluster larger than ×2. The verdict is unchanged.

## 0. How to read this audit

Everything below is derived from four in-repo sources, cross-checked against
each other and against live `git`:

| Source                                                       | Role                                    | Trust            |
| ------------------------------------------------------------ | --------------------------------------- | ---------------- |
| `Sprint_plan.csv` @ origin/main                              | Committed task list + planned status    | SSoT (task list) |
| `.specify/sprints/sprint-18/attestations/*/attestation.json` | Per-task completion evidence            | SSoT (evidence)  |
| On-disk artifact existence @ origin/main (route-group-aware) | Did the deliverable actually ship?      | Ground truth     |
| `git log origin/main` (feature-class, title-hit by task id)  | Shipping trail                          | Ground truth     |
| metrics `_summary.json` (generated cache) + prior audits     | Timings + prior findings (corroborated) | Supporting       |

The full per-task evidence is machine-readable in
`artifacts/reports/sprint-18/task-evidence-matrix.json` and
`plan-versus-delivered.csv`. This document is the human narrative over that
data.

**A note on method.** The spec suggested fanning the 67 tasks across parallel
sub-agents. I deliberately used a **deterministic collector script** instead:
for an anti-fabrication audit, a reproducible file-existence +
attestation-parse + git-grep pass is _stronger_ evidence than LLM archaeology —
it cannot hallucinate a hash, a timestamp, or a passing test, and any reviewer
can re-run it. Narrative synthesis (this doc, the retro, root-causes) is the
only LLM-authored layer, and every number in it traces back to the collector
output.

---

## 1. Headline verdict

**CLOSED_WITH_RESIDUAL_ACTIONS.**

Sprint 18 **delivered** — 66 of 67 committed tasks have their primary
deliverable verifiable on `origin/main` right now, **0 are phantom, 0 are
genuinely undelivered** (only IFC-257 is a partial WIP). But the sprint did
**not close cleanly**: governance and evidence lag delivery badly (only 36/67
CSV-Completed rows carry a clean canonical attestation; ~39 completed tasks
carry no committed completion timestamp; 3 shipped rows still read "Backlog";
DORA is unmeasurable). The gap between _delivered_ (66) and _cleanly-attested_
(36) is the sprint's defining debt, and it is what the residual-action register
(§7 + `sprint-18-improvement-actions.md`) exists to burn down.

---

## 2. Plan-vs-Delivered — the 67 tasks

**Canonical status on `origin/main`:** 63 Completed · 3 Backlog · 1 In Progress.

> The war-room baseline ("63 Completed / 3 Backlog / 1 In Progress") is correct
> for `origin/main`. The `ssite_map_docs` feature branch shows 55/11/1 — it is
> behind main's status reconciliation. **This audit anchors to `origin/main`.**

### 2.1 Classification — 10 categories

Each task is assigned exactly one primary category. Counts sum to 67.

| #   | Category                           |  Count | Meaning                                                                                 |
| --- | ---------------------------------- | -----: | --------------------------------------------------------------------------------------- |
| C01 | `DELIVERED_ATTESTED_CLEAN`         | **36** | Completed + attestation `COMPLETE` + 4/4 validations + all KPIs met + artifacts on disk |
| C02 | `DELIVERED_ATTESTED_KPI_GAP`       |  **9** | Attested, but ≥1 KPI unmet **or** validation array not 4/4 — honest partials            |
| C03 | `DELIVERED_PR_EVIDENCED_NO_ATTEST` |  **4** | Shipped via title-hit feature PR + artifacts on disk, **no** canonical attestation      |
| C04 | `DELIVERED_STALE_BACKLOG`          |  **3** | Shipped & merged to main, but CSV still says "Backlog" (DOC-015, IFC-211, DOC-016)      |
| C05 | `DELIVERED_ARTIFACT_ONLY`          | **14** | Completed, primary deliverable on disk, **no attestation & no feature-PR trail**        |
| C06 | `PHANTOM_COMPLETED`                |  **0** | Completed but deliverable absent on disk — **none found**                               |
| C07 | `IN_PROGRESS`                      |  **1** | IFC-257                                                                                 |
| C08 | `NOT_DELIVERED_BACKLOG`            |  **0** | Genuine deferral — **none found**                                                       |
| C09 | `PARTIALLY_DELIVERED`              |  **0** | — (DOC-016 reclassified C04: CI-gate limb confirmed present on `origin/main`)           |
| C10 | `STATUS_UNVERIFIABLE`              |  **0** | —                                                                                       |

**Delivered-in-fact (C01–C05): 66/67 (98.5%).** CSV-Completed: 63/67 (94.0%).
Cleanly-attested: **36/67 (53.7%)** among CSV-Completed rows (DOC-015 and
DOC-016 add 2 further clean attestations that sit on stale-Backlog rows).

### 2.2 The exception tasks (everything that is not C01)

| Task                                                                            | Cat | What is true                                                                                                                                                                                                                       | Residual                                      |
| ------------------------------------------------------------------------------- | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| DOC-015                                                                         | C04 | Route-count reconcile shipped via **#612** (`chore(doc-015): reconcile … canonical 211`). CSV still "Backlog".                                                                                                                     | Flip CSV → Completed                          |
| IFC-211                                                                         | C04 | Goal Settings RBAC shipped via **#597** (`feat(IFC-211): goal settings RBAC`, `home-rbac.test.ts` on main, 2026-07-22). CSV "Backlog".                                                                                             | Flip CSV → Completed                          |
| DOC-016                                                                         | C04 | **Fully delivered.** `docs-integrity-audit.ts` + test **and** the CI-gate limb `.github/workflows/docs-integrity.yml` all present on `origin/main` (blob `23a19fcf`, #598). Clean COMPLETE attestation (4/4). CSV still "Backlog". | Flip CSV → Completed                          |
| IFC-257                                                                         | C07 | Contact-detail action-button wiring, 80%. Real WIP, aged ≥5 weeks.                                                                                                                                                                 | Carry to Sprint 19                            |
| INFRA-TF-002/003/004/005                                                        | C03 | Shipped via title-hit feature PRs (#289/#299/#286/#296+#291), Terraform artifacts on disk. No attestation.                                                                                                                         | Backfill attestation _or_ accept-with-note    |
| INFRA-TF-001                                                                    | C05 | TF provider-schema fix folded into #286; artifacts on disk; no title-hit PR, no attestation. Backlog-audit: "needs owner confirm `terraform validate` green".                                                                      | Confirm + attest                              |
| PG-196,197,198,199,201–209 (13)                                                 | C05 | Every module-settings **page exists on disk** (verified route-group-aware). No attestation; CSV-declared secondary artifacts (`*Content.tsx`, router, validators) **do not resolve at the declared paths** (path drift).           | Backfill attestation + fix CSV artifact paths |
| IFC-212, IFC-230, IFC-234, PG-180, PG-189, PG-190, IFC-309, IFC-310, PG-200 (9) | C02 | Attested `COMPLETE` with an honest gap — see §2.3.                                                                                                                                                                                 | Close the named gap in CI                     |

### 2.3 The honest KPI gaps (C02) — none are hidden failures

| Task                     | Documented gap                                                                                                                                            |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IFC-212                  | `enqueue_success_rate` / `scoring_p95` / `queue_failure_rate` "not measured in CI" — production BullMQ metrics deferred to `FOLLOWUP-IFC-212-PROD-KPIS`.  |
| IFC-230                  | LOC reduction 18.7% vs ≥30% target; **owner-approved** deferral (30% would require dropping the create wizard).                                           |
| PG-180                   | Lighthouse ≥90 route added to `lighthouserc.js`; full run deferred to CI promotion.                                                                       |
| PG-189                   | Lighthouse ≥0.90 deferred — no Chrome/Lighthouse binary in local exec; must run in CI against prod.                                                       |
| PG-190                   | Web-component **branch coverage 70.12% < 80%** (stmts/funcs/lines all ≥90%). Genuine sub-threshold limb.                                                  |
| IFC-310                  | `merge_p95_ms_real_db = null` — real-DB bench exists but gated behind `RUN_INTEGRATION_TESTS=1` (no live Postgres in that CI run). Mocked p95 = 0.033 ms. |
| IFC-234, IFC-309, PG-200 | Verdict `COMPLETE`, no unmet KPI, but `validation_results` array not a full 4/4 set — evidence-shape gap, not a delivery gap.                             |

None of these are silent failures — each is self-reported in its attestation.
The pattern is uniform: **CI cannot run Lighthouse or a real Postgres**, so
performance/DB KPIs are structurally deferred. That is a fixable infra gap
(RC-4), not a per-task defect.

---

## 3. Evidence-gap resolution — the 18 tasks without attestation

The spec's "18 gaps" resolve **exactly**: 13 module-settings PG tasks + 5
INFRA-TF tasks are `Completed` on main with **no `attestation.json`**.

**Resolution (no fabrication):** I did **not** manufacture back-dated
attestations with invented hashes/timestamps — that would violate the anti-
fabrication rule and misrepresent weeks-old work as freshly verified. Instead,
for each of the 18, the `task-evidence-matrix.json` records the _real,
present-tense_ evidence:

- **Primary deliverable on disk?** — verified for all 18 (route-group-aware). ✅
- **Shipping trail?** — 4 INFRA-TF have title-hit feature PRs; the 13 PG pages
  shipped via the module-settings batch (born Backlog 2026-04-19, page files
  present).
- **What is genuinely missing** — the canonical `attestation.json` (governance
  artifact) and, for the 13 PG rows, correctly-resolving CSV artifact paths.

The honest resolution is therefore: **these are delivered, evidence-thin
tasks**, not incomplete work. Backfilling a _real_ attestation requires
re-running `/exec` attestation (which re-hashes the current files and re-runs
the 4 validations) — that is the residual action **R-ATTEST-18**, owned by the
delivering squads, not something to synthesise in this audit.

---

## 4. Reconciliation of the 4 "open" items (factual DoD validation)

| Item    | CSV               | Factual DoD state on origin/main                                                                                             | Verdict                    |
| ------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| IFC-257 | In Progress (80%) | Buttons partially wired (#410 landed earlier); remaining mutations open. Real WIP.                                           | **Stays open** → Sprint 19 |
| DOC-015 | Backlog           | DoD met: route totals reconciled to canonical 211 across design docs via #612.                                               | **Delivered** — flip CSV   |
| DOC-016 | Backlog           | **DoD fully met:** tool + tests + CI-gate workflow all on `origin/main` (#598, blob `23a19fcf`); clean COMPLETE attestation. | **Delivered** — flip CSV   |
| IFC-211 | Backlog           | DoD met: manager/admin/self RBAC + audit via #597; `home-rbac.test.ts` present.                                              | **Delivered** — flip CSV   |

Net: of the 4 "open" items, **3 are actually done** (DOC-015, IFC-211, DOC-016 —
all delivered, all needing only a CSV Backlog→Completed flip), and **1 is
genuinely in-flight** (IFC-257).

---

## 5. DORA metrics — `dora-metrics.json`

**All four resolve to `UNKNOWN`, and that is the correct, non-fabricated
answer.** The instrumentation to measure them does not exist in-repo.

| Metric                | Value   | Why UNKNOWN                                                                                                                         | Proxy (labelled, not the metric)                                                       |
| --------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Deployment Frequency  | UNKNOWN | No deploy log; Railway/Vercel deploy events not recorded in repo                                                                    | 49 feature commits referencing S18 ids merged to main (Apr 9 / May 2 / Jun 34 / Jul 3) |
| Lead Time for Changes | UNKNOWN | Squash-merge collapses authoring history; no deploy timestamp; committed completion timestamps largely absent (34 null + 5 missing) | single-session exec duration median ~145 min (generated cache; not lead time)          |
| Change Failure Rate   | UNKNOWN | No deploy↔incident linkage                                                                                                          | 0 revert commits referencing S18 in window                                             |
| MTTR                  | UNKNOWN | No incident open/resolve timestamps in-repo                                                                                         | none                                                                                   |

The prerequisite to _ever_ measuring these — a live monitoring stack + deploy/
incident telemetry — was itself Sprint-18 work (INFRA-TF-004 monitoring module,
IFC-032 OTel). It shipped as **code** but was never verified as a **live
signal** (RC-4). Until that verification exists, sprint-level DORA is
unmeasurable by construction. **No estimates are provided**, per the
anti-fabrication rule.

---

## 6. Flow metrics — `flow-metrics.json`

| Metric                                     | Value                                                                       | Note                                                                                                                                |
| ------------------------------------------ | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Commitment reliability (delivered-in-fact) | **66/67 (98.5%)**                                                           | primary artifact on disk                                                                                                            |
| Commitment reliability (CSV-Completed)     | 63/67 (94.0%)                                                               |                                                                                                                                     |
| Commitment reliability (cleanly-attested)  | **36/67 (53.7%)**                                                           | the honest governance number                                                                                                        |
| Scope churn                                | **+13 mid-window (19.4%)**, −0                                              | see §8                                                                                                                              |
| Cycle time                                 | **UNRELIABLE / UNKNOWN**                                                    | committed: 34 `completed_at:null` + 5 no-tracking-file; duration/SPI below from _generated_ cache only                              |
| WIP aging                                  | 1 item (IFC-257), aged ≥5 weeks                                             | no WIP limit enforced                                                                                                               |
| Throughput                                 | 63 completed / ~149-day window                                              | 34 of 49 feature commits in June — burst, not flow                                                                                  |
| Sprint duration                            | **~149 days** vs 14 nominal (≈10.6×); SPI 0.36; SV −12,290 min ("critical") | ⚠ from **gitignored generated** `_summary.json` cache — supporting-only, not committed-reproducible; start/end dates null in-source |

The single most important flow signal: **there was no fixed commitment
baseline** (null start/end dates + continuous scope injection), so "reliability
against plan" is only measurable against a plan that never froze.

---

## 7. Root causes (Five Whys) — `root-causes.json`

Five defect classes, each traced to observed evidence:

- **RC-1 Status staleness** → _No automated merge→CSV-status reconciliation;
  status is a manual after-thought decoupled from the merge event._ (DOC-015,
  IFC-211)
- **RC-2 Missing completion evidence** → _"Completed" can be set without an
  attestation or a real timing capture; completion is minted without recording
  when work finished._ (committed: 34 `completed_at:null` + 5 tasks with no
  tracking file)
- **RC-3 Unenforced DoD** → _DoD is prose, not an executable contract wired into
  the merge gate; attestation is optional in practice._ (18 no-attestation
  tasks)
- **RC-4 Telemetry gap** → _Telemetry was delivered as code but never verified
  as a live signal; DORA is unmeasurable by construction._ (all DORA UNKNOWN)
- **RC-5 No commitment baseline** → _Sprint is modelled as an open label, not a
  time-boxed commitment with locked scope + dates._ (149-day span, +13
  mid-window)

These five are not independent — RC-5 (open sprint) enables RC-1/RC-2/RC-3
(delivery outruns governance because there is no closing bar), and RC-4 keeps
the whole system blind to its own flow. Fix RC-3 and RC-5 first; they gate the
rest.

---

## 8. Scope churn — `scope-churn.json`

- **2026-03-06 (`c060bd40e`)** — bulk task-registration created S18 rows
  (DOC-015/016, IFC-211–287, PG-160) via a tracker-sync commit, not planning.
- **2026-04-19 (`d726f6a34`)** — **13 module-settings rows injected mid-window**
  as Backlog (PG-196–209 minus already-shipped), ~8 weeks after the first S18
  completions. Scope was _continuous_, not committed once.
- Added mid-window: **13**. Removed: **0**. Churn ratio: **19.4%**.

---

## 9. Data-integrity defects found (and their fixes)

1. **Status staleness** — DOC-015, IFC-211, **DOC-016** all shipped but
   "Backlog". → CSV flip (deferred to ride with attestation backfill; see
   R-STATUS-2).
2. **Missing committed completion evidence** — 34 tasks record
   `completed_at: null` and 5 have no `task-tracking.json` at all; timing was
   never captured at completion. (The earlier "28 synthetic ×16" figure came
   from the gitignored generated cache and is not committed-reproducible; the
   real committed defect is timing _absence_.) → RC-2 gate.
3. **13 artifact-path-drift rows** — CSV declares `.../account-tiers/…` while
   the page lives at `.../(list)/account-tiers/…`. Nearly caused a false
   "phantom" classification (PG-204). → CSV artifact-path fix (residual).
4. **18 attestation gaps** — delivered, ungoverned. → R-ATTEST-18.
5. **CSV/code sync gap on DOC-016** — the docs-integrity workflow **is** on main
   (#598), yet the CSV row still reads Backlog. Not a missing artifact; a stale
   status. → CSV flip (R-STATUS-2).

---

## 10. Closure

See `docs/planning/sprint-18-closure-decision.md` for the formal decision, the
residual-action register with owners + gates, and the go/no-go. **Verdict:
`CLOSED_WITH_RESIDUAL_ACTIONS`.**

**Artifacts produced by this audit** (`artifacts/reports/sprint-18/`):
`task-evidence-matrix.json` · `plan-versus-delivered.csv` · `dora-metrics.json`
· `flow-metrics.json` · `scope-churn.json` · `root-causes.json`. **Narrative:**
this file · `sprint-18-retrospective.md` · `sprint-18-improvement-actions.md` ·
`sprint-18-closure-decision.md`. **Attestation:**
`.specify/sprints/sprint-18/attestations/PM-OPS-002/attestation.json`.
