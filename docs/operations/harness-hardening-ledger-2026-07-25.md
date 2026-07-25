# Harness Hardening Ledger — 2026-07-24 merge window

**Task**: ENG-OPS-003 **Created**: 2026-07-25 **Owner**: Tech Lead + DevOps
**Anchor**: `origin/main` @ `f4ec0b0cb`

Retroactive registration of the **8 CI / security / E2E-harness PRs merged on
2026-07-24 with no registered task ID**. Each ran the pre-ship gate and merged
green, but none produced a spec, plan, or attestation, so none is visible in
`Sprint_plan.csv` or the sprint metrics tree. This ledger is the record that
makes them visible.

**This ledger implies no code change.** All 8 PRs are already merged on `main`
and are not being re-opened. What was missing is provenance, not correctness.

---

## Ledger

| PR       | Merge SHA   | Merged (UTC) | Gap                | Change                                                                                                                                                                                     | Verification basis                                                         |
| -------- | ----------- | ------------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| **#623** | `a88b9d804` | 07-24 11:29  | E2E discovery      | Explicit `chromium` `testMatch` so the E2E Full Suite discovers specs (was `No tests found` for weeks)                                                                                     | CI green; nightly E2E Full Suite now discovers a non-zero spec count       |
| **#625** | `c1c41546c` | 07-24 13:29  | E2E database       | Wire nightly cross-browser E2E to a real `:5433` test DB (was a stub URL with no DB service)                                                                                               | CI green; `provision.ts` seed fixture no longer refuses to seed            |
| **#627** | `fd8f78c2f` | 07-24 15:43  | Gap #1 (secrets)   | Source the nightly E2E Postgres password from a repo secret — clears GitGuardian                                                                                                           | GitGuardian clean on the follow-up commit                                  |
| **#628** | `d44e8a67d` | 07-24 16:32  | OSV PR A           | Count Trivy criticals by CVSS `security-severity`, not SARIF `level` (SARIF `error` conflates high+critical → over-report)                                                                 | CI green; the dependency-scan critical count stops over-reporting          |
| **#629** | `baf69d823` | 07-24 19:34  | **Gap #4**         | `preship:full` / `PRESHIP_MODE=full` cross-browser E2E matrix (chromium+firefox+webkit) + nightly workflow running it against `main`                                                       | CI green; nightly workflow runs the full gate with **no bypass**           |
| **#631** | `f645d34c3` | 07-24 21:40  | OSV PR B           | Pin vulnerable transitive deps to patched versions so the OSV / npm-audit set is clean                                                                                                     | CI green; OSV job passes                                                   |
| **#630** | `1ce7055bc` | 07-24 22:39  | **Gap #1**         | Local gitleaks rule + workflow-YAML secret linter for the `postgres:postgres` literal that slipped past the local scan 3× (#622, #625, #627) and only reddened on GitGuardian in the cloud | CI green; the literal is now caught **locally**, pre-push                  |
| **#634** | `f4ec0b0cb` | 07-24 23:49  | Gap #1 (follow-up) | Replace the 18 `# secret-lint-allow`-annotated Postgres credential literals across 5 workflows with `${{ secrets.* }}`                                                                     | CI green; zero hardcoded throwaway CI DB passwords remain in workflow YAML |

**Reconciles 8/8.** Gaps #2 and #3 are not represented in this window — no PR
merged on 2026-07-24 claims them.

---

## Why this happened

The orchestrator dispatched these as ad-hoc prompts rather than through the
documented pipeline in
[`sprint-18-orchestrator-prompt.md`](./sprint-18-orchestrator-prompt.md)
(`/spec-session → /plan-session → /exec → PIPELINE COMPLETE`). Root cause: the
orchestrator never read that document, so neither the invocation template nor
the 6-gate definition of done was applied.

The failure is **narrow but real**: it is a provenance failure, not a quality
failure. Every one of the 8 PRs passed the non-bypassable pre-ship gate and
merged green. What is missing is the ability to answer "why does this change
exist, and who decided it was done" from the repo alone.

Note the reflexive shape of the window: #630 exists because a secret literal
escaped the local gate three times, and #634 exists to clean up what #630 made
visible. Harness work is exactly the category most likely to be treated as "just
plumbing" and skipped past governance — which is why it needs the ledger most.

---

## Registration decision

Registered as a **single umbrella task (ENG-OPS-003)**, not 8 individual tasks:

- The 8 PRs share one root cause and one remediation (this ledger).
- Retro-registering 8 separate tasks would inflate sprint counts with work that
  was never scoped, estimated, or scheduled — distorting velocity and burndown
  for Sprint 19.
- The unit that matters for governance is the **window**, not each PR.

**Not** filed under `ENG-OPS-002.R16` ("backfill 18 missing Sprint-18
attestations"): R16's scope is Sprint-18 tasks that were CSV-marked Completed
without attestation. These 8 PRs have no task ID at all and are Sprint-19
harness work — a different defect class.

---

## Cross-references

- Audit that produced this ledger:
  [`governance-retro-audit-2026-07-25.md`](./governance-retro-audit-2026-07-25.md)
- Attestation:
  `.specify/sprints/sprint-19/attestations/ENG-OPS-003/attestation.json`
- Pipeline that was skipped:
  [`sprint-18-orchestrator-prompt.md`](./sprint-18-orchestrator-prompt.md)
