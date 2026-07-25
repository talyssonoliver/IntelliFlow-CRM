# Retrospective Governance Audit — 2026-07-24 merge window

**Date**: 2026-07-25 **Anchor**: `origin/main` @ `f4ec0b0cb` **Scope**: the 10
PRs merged 2026-07-24, audited against the 6-gate definition of done in
[`sprint-18-orchestrator-prompt.md`](./sprint-18-orchestrator-prompt.md)
**Related**: ENG-OPS-003,
[`harness-hardening-ledger-2026-07-25.md`](./harness-hardening-ledger-2026-07-25.md)

---

## Why this audit exists

The 2026-07-24 PRs were dispatched via ad-hoc prompts instead of the documented
orchestrator pipeline
(`/loop "/full-pipeline <TASK-ID>" … --completion-promise "PIPELINE COMPLETE: …"`).
Root cause: the orchestrator never read the orchestrator prompt document, so
neither the invocation template nor the 6-gate DONE definition was applied.

---

## ⚠ Audit-method correction (recorded deliberately)

The first pass of this audit was **wrong**, and the error is recorded here
because the failure mode is reusable.

The audit was run in the primary working checkout, which sits on branch
`ssite_map_docs` (`db590826e`) — **behind** the 2026-07-24 merges. It therefore
reported that #622 and #626 had shipped no attestations, and that PG-206's CSV
row was `Completed` on empty evidence. Both conclusions were artifacts of
reading the wrong tree.

Two further method errors compounded it:

1. `apps/project-tracker/docs/metrics/sprint-*/**/*.json` is **gitignored**
   (`.gitignore:200`). Those files are generated locally and are never
   committed, so their absence in a fresh worktree proves nothing. The committed
   evidence of record is `.specify/sprints/<sprint>/attestations/<ID>/`.
2. `ssite_map_docs` and `origin/main` disagree about PG-206 in **opposite
   directions** — the feature branch had `Completed` with no attestation; `main`
   had the attestation with `Backlog`. Auditing either branch alone yields a
   different and wrong answer.

**Rule going forward: audit governance state against `origin/main` in a clean
worktree, never against the working checkout, and never treat a gitignored
generated path as evidence of absence.**

---

## Findings (corrected, verified against `origin/main` @ `f4ec0b0cb`)

| PR       | SHA         | Task ID    | Gates 1/4/5 (attestation, compliance, merged green)                                       | Gate 2 (spec+plan)  | Gate 6 (CSV)         | Classification              |
| -------- | ----------- | ---------- | ----------------------------------------------------------------------------------------- | ------------------- | -------------------- | --------------------------- |
| **#622** | `1235bcee1` | IFC-033    | ✅ ADR-068 attestation, 8/8 gates PASS                                                    | ❌ missing          | ✅ Completed / 100 % | Needed spec+plan only       |
| **#626** | `2ec7d0e49` | PG-206     | ⚠️ attestation, 4/4 validations, **6/7 DoD verified + 1 unevidenced** (Lighthouse — #640) | ❌ missing          | ❌ **still Backlog** | Needed CSV flip + spec+plan |
| #623     | `a88b9d804` | —          | n/a — merged green                                                                        | ❌                  | ❌                   | No registered task ID       |
| #625     | `c1c41546c` | —          | n/a — merged green                                                                        | ❌                  | ❌                   | No registered task ID       |
| #627     | `fd8f78c2f` | —          | n/a — merged green                                                                        | ❌                  | ❌                   | No registered task ID       |
| #628     | `d44e8a67d` | —          | n/a — merged green                                                                        | ❌                  | ❌                   | No registered task ID       |
| #629     | `baf69d823` | —          | n/a — merged green                                                                        | ❌                  | ❌                   | No registered task ID       |
| #630     | `1ce7055bc` | —          | n/a — merged green                                                                        | ❌                  | ❌                   | No registered task ID       |
| #631     | `f645d34c3` | —          | n/a — merged green                                                                        | ❌                  | ❌                   | No registered task ID       |
| #634     | `f4ec0b0cb` | —          | n/a — merged green                                                                        | ❌                  | ❌                   | No registered task ID       |
| #624     | `2333b7bbb` | PM-OPS-002 | ✅ landed 6 attestations (IFC-211 + INFRA-TF-001..005)                                    | n/a (governance PR) | ✅                   | Compliant                   |

**Counts**: 11 merges audited · 1 compliant (#624) · 2 real tasks needing
backfill (IFC-033, PG-206) · 8 with no registered task ID.

**#627 was absent from the originally supplied target list** — found by
enumerating the merge window rather than trusting the handed-over list. The
untracked set is **8**, not 7.

---

## The PG-206 CSV inversion — how it happened

A clean causal sequence, not a random inconsistency:

1. **12:13** — #624 (PM-OPS-002) reconciles Sprint-18 residual statuses. PG-206
   is a "coming soon" stub at that moment, so it is correctly recorded as
   **`Backlog`**.
2. **15:29** — #626 lands the real implementation and a `COMPLETE` attestation —
   but **does not flip the CSV row**.

Result: `main` carries a fully-attested, fully-implemented PG-206 sitting at
`Backlog`. This governance PR closes it. Note the direction of the error: the
repo **under**-claimed. That is the safe direction, but it still means the
sprint plan misreports delivered work.

---

## 🔴 Collision warning — ENG-OPS-002.R16 stranded commit

A stranded, never-PR'd commit exists in the worktree
`../iflow-r16-attest-backfill`:

```
51ba1261f  chore(eng-ops-002.r16): honest attestation backfill for sprint-18 completed tasks
```

It is 1 commit ahead of a **stale base** (`cd82f0ae7`), predating this merge
window. It contains 18 attestations. **6 of them are now superseded on `main`:**

| Path in R16                                       | Superseded by          | Conflict severity                                                                                                                                                                                                                        |
| ------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sprint-18/attestations/PG-206/attestation.json`  | **#626** (`2ec7d0e49`) | 🔴 **High** — R16 asserts `verdict: INCOMPLETE` ("20-line placeholder, no feature logic"). That was true on 2026-07-22 and is **false now**. Landing R16 unchanged would overwrite a substantiated `COMPLETE` with a stale `INCOMPLETE`. |
| `sprint-18/attestations/INFRA-TF-001..005/*.json` | **#624** (`2333b7bbb`) | 🟠 Medium — duplicate attestations for the same 5 tasks; needs reconciliation, not blind overwrite.                                                                                                                                      |

The remaining 12 (PG-196..PG-209 minus PG-206) appear unaffected and still carry
real value.

**Required before R16 is landed:**

1. Rebase onto current `main`.
2. **Drop** R16's `PG-206/attestation.json` — `main`'s post-#626 attestation is
   authoritative.
3. Reconcile the 5 INFRA-TF attestations against #624's versions; keep one set.
4. Re-verify the other 12 verdicts against current `main` — several PG-19x/20x
   stubs may have been implemented since the branch was cut, exactly as PG-206
   was.

R16's scope shrinks from 18 → 12. Its stated goal (18 missing Sprint-18
attestations) is now partly achieved by other means.

**Why this matters beyond the merge conflict:** R16's PG-206 entry was _correct
when written_. A retroactive attestation is a snapshot, and a stranded snapshot
silently rots into a false claim. Attestation backfill branches should be landed
promptly or re-verified before landing — never both delayed and trusted.

---

## Remediation applied (this PR)

| #   | Action                                                                                                                                                                                                                                 |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | PG-206 `Backlog` → `Completed` / 100 %, citing `2ec7d0e49`                                                                                                                                                                             |
| 2   | PG-206 `Artifacts To Track` reconciled — planned `storage-policies.router.ts` + `packages/validators/src/storage-policies.ts` were superseded by DRY reuse of `documentSettings.retentionPolicies`; neither exists, and neither should |
| 3   | Retrospective spec + plan for IFC-033 and PG-206, explicitly labelled RETROSPECTIVE                                                                                                                                                    |
| 4   | ENG-OPS-003 registered with spec, plan, attestation, and the 8-PR ledger                                                                                                                                                               |
| 5   | This audit + the R16 collision warning recorded                                                                                                                                                                                        |
| 6   | Sprint plan splits + `SESSION_CONTEXT.md` regenerated                                                                                                                                                                                  |

**No production code was changed.** Every finding was a provenance gap; none
required a code fix.

### Deliberate deviation: force-adding spec/plan files

`.specify/sprints/.gitignore` ignores `sprint-*/specifications/` and
`sprint-*/planning/` — by design, it tracks only `attestation.json`,
`attestation-latest.json`, `task-tracking.json`, and `_summary.json`.

The 6 spec/plan files in this PR are therefore added with `git add -f`. The
reasoning:

1. The `attestation.schema.json` contract has `spec_path` and `plan_path`
   fields. An attestation that cites a path no reviewer can open is not
   evidence.
2. There is existing precedent on `main` — `IFC-247-spec.md`, `IFC-247-plan.md`,
   `IFC-309-spec.md`, `IFC-309-discussion.md`, `IFC-309-plan.md` are all tracked
   despite the same rule.
3. Left ignored, these files would live only in a throwaway worktree and vanish
   with it — which would defeat the entire purpose of the backfill.

This is a **narrow, deliberate exception for governance evidence**, not a change
to the ignore policy. Routine per-task spec/plan output should continue to be
ignored; if the project wants these tracked as a rule, that is a separate
decision to make in `.specify/sprints/.gitignore` rather than by accumulating
`-f` exceptions.

---

## Gate 4 — `/compliance-check` results

Run for PG-206 against `origin/main` @ `f4ec0b0cb`.

| Guard                                      | Result                                      | Basis                                                                                                                                                   |
| ------------------------------------------ | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `check-attestation-phrases` (Guards 6 + 8) | ✅ OK                                       | No "runtime-ready" / "deferred to CI" self-justifying phrases                                                                                           |
| `check-nav-wiring` (Guard 7)               | ✅ OK                                       | Verified **substantively**, not just by the guard: `sidebar/configs/documents.ts:22` has `href: '/documents/storage-policies'` — the route is reachable |
| `check-lighthouse-evidence` (Guard 9)      | ⚠️ **passed on a technicality** — see below |
| Tests / typecheck / lint                   | ✅ OK                                       | Covered by the full pre-ship run (all packages, not a focused subset)                                                                                   |

### ⚠️ Guard 9 blind spot — filed as #640

`check-lighthouse-evidence.mjs` returned
`OK — no Lighthouse KPI in attestation. N/A.` That is **not** a clean bill of
health. PG-206's attestation _does_ claim a Lighthouse gate:

```json
"gate_results": [{ "gate_id": "lighthouse-gte-90", "passed": true }]
```

with **no supporting artifact** — no `artifacts/lighthouse/PG-206/`, and no
Lighthouse report in `artifact_hashes`. The guard passed only because it
inspects `kpi_results` and PG-206 recorded the claim in `gate_results`. **The
field choice, not the evidence, decided whether the guard fired** — so any task
can bypass Guard 9 by recording Lighthouse as a gate rather than a KPI, and gets
a clean `OK` rather than a skip.

This is the Build/Coverage self-attestation anti-pattern (same shape as PG-184's
false PASS) reaching `main` through a hole in the gate built to stop it.

**This does not invalidate PG-206's CSV flip.** The implementation is genuinely
complete and was verified against real code. But the "7/7 DoD met" figure in its
attestation should be read as **6/7 verified + 1 unevidenced**, and this audit
declines to ratify the Lighthouse claim.

---

## Residual (not fixed here)

- **PG-206's `lighthouse-gte-90` claim is unevidenced** — #640. Needs either a
  real report (`docs/claude-refs/lighthouse-playbook.md`; PG-195 proved the
  recipe works on this host) or a human-approved waiver. The guard fix is the
  more important half.
- **R16 must be reconciled before landing** — see above. Not fixed here because
  that branch has a separate owner (orchestrator Global Rule 11: a
  branch/worktree is an exclusive single-writer resource).
- **PG-206 archival / cold-storage thresholds** named in the CSV Definition of
  Done have no backend model. Delivered scope is retention periods + legal-hold
  exceptions. Genuine scope residual.
- **IFC-033's 36 % `429` over-drive figure** is a single-user harness artifact,
  not a system ceiling — re-run with per-VU `userId` if IFC-034's Gate-3 review
  needs a higher headroom number.

---

## Process fix

The orchestrator prompt is only load-bearing if it is read. Concretely:

1. Read `docs/operations/sprint-18-orchestrator-prompt.md` **before**
   dispatching anything, and quote its 6-gate DONE definition back as an
   alignment check.
2. Harness/CI/security work gets a task ID **before** the branch is cut. "It's
   just plumbing" is precisely the rationalisation that produced this window.
3. Audit governance state against `origin/main` in a clean worktree.
