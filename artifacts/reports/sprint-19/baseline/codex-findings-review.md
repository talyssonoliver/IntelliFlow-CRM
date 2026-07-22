# ENG-OPS-002 — Codex Independent Findings Review (second opinion)

**Reviewer:** Codex (GPT-5, `codex` CLI) — independent adversarial pass, run
2026-07-22 (`task-mrw9341p-1o9yoa`, 15m run, read-only against `origin/main`
code). **Scope:** all 29 Critical/High candidates in `remediation-candidates.json`.

> **Provenance note.** Codex completed the full review but its sandbox identity
> (`CodexSandboxUsers`) had only `ReadAndExecute` on the worktree, so it could not
> write its own report file. This document **transcribes Codex's verdicts verbatim
> from its run log** (`~/.claude/plugins/data/codex-inline/state/…/task-mrw9341p-1o9yoa.log`);
> it is Codex's conclusion, not a re-derivation. The per-finding evidence Codex
> cited is summarized where the log preserved it; the full table Codex composed was
> lost to log truncation, but every substantive verdict below is quoted/paraphrased
> from Codex's own messages.

## Headline (Codex's independent conclusion)

- **All 29 Critical/High candidates reviewed. FALSE POSITIVES FOUND: NONE.** Every
  finding reproduces against the real code (agrees with the prior
  `findings-validation.md` from #605).
- **Already fixed (Codex personally verified the fix is present):** SEC-001,
  QUAL-001, QUAL-003, QUAL-004, STALE-001.
- **One partial:** **QUAL-002** — `Task.assertLinkable()` is present (terminal-
  linkage guards, from R10), **but `Task.changeStatus` still lacks transition-table
  enforcement and the RACE-PURE-09 tests remain skipped.** Independently confirms
  the R10 deferral.

## ⚠️ Disagreements with the prior validation (#605)

1. **SEC-002 — Codex says HIGH, prior said Medium.** This is the one substantive
   severity dispute. Codex: *"SEC-002 remains High, because the codebase itself
   documents a privileged role that bypasses RLS and app-layer filtering is not an
   equivalent DB control."* The prior validation downgraded it to Medium citing
   app-layer scoping as mitigation; **Codex rejects that reasoning** — defense-in-
   depth at the app layer is not a substitute for the missing DB-level control.
   **→ Decision needed:** SEC-002 severity (High per Codex vs Medium per #605).
2. **HEX-005 — Codex AGREES with the downgrade to Medium.** *"HEX-005 drops to
   Medium, because direct-read is a sanctioned convention."* No dispute.

## GOV-A-003 — NEEDS-INFO (citation drift, not a defect in the finding)

Codex marked GOV-A-003 **NEEDS-INFO** strictly under its grounding rule: the
finding cites `tool-runs/validate-schemas.log`, which **does not exist** — the file
was renamed to `validate-schemas.txt` when the audit committed the raw logs (`.log`
is gitignored). Codex confirmed *"the schema-drift finding's substance is visible in
`validate-schemas.txt` with the 272/175/447 summary"* — so **the finding is REAL**;
only the cited path is stale. **Fix:** update the citation in `governance-findings.json`
from `.log` to `.txt` (a one-line doc fix; the 175/447 evidence stands).

## Other findings — Codex reproduced (spot conclusions from the log)

- **STALE-002** still reproduces (`_summary.json` says 3/43 from Apr 11 vs 63/67 in
  the July-22 reports) — real.
- **STALE-004** still real (`Sprint_plan_J.csv` omitted from the CLAUDE.md split
  table).
- **QUAL-012** reproduces (ADR-054 claims a `no-skipped-tests` ESLint rule enforced
  in CI; `eslint.config.mjs` has no such rule).
- **GOV-A-001 / GOV-A-002** reproduce from committed artifacts (18 Sprint-18 dirs
  lack `attestation.json`; reconciliation CSV = 408 rows / 404 completed / 177
  provenance-incomplete).
- **DDD-001/002/003/004, HEX-001/002/003/004, SEC-003/004, PERF-003, QUAL-013**:
  Codex reviewed each and found none to be false positives (consistent with #605).

## Net effect on the validation

| Item | #605 verdict | Codex verdict | Action |
|---|---|---|---|
| False positives | 0 | **0 (confirmed)** | none — proceed on all findings |
| SEC-002 severity | Medium | **High (disputed)** | **user decides** |
| HEX-005 severity | Medium | Medium (agree) | keep Medium |
| QUAL-001 | open | **fixed (R10)** | close |
| QUAL-002 | open | **partial (R10; RACE-PURE-09 open)** | reduce scope to RACE-PURE-09 |
| GOV-A-003 | High | High (evidence real; **citation `.log`→`.txt`**) | fix citation |

**Bottom line:** the independent Codex pass and the prior validation **converge on
zero false positives** — the remediation backlog is sound, no wasted-effort risk.
The only open judgment call is **SEC-002 severity (High vs Medium)**, where Codex
and the prior validator disagree.
