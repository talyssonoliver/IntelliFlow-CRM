# IntelliFlow Sprint 0 Audit v2

This is an **operator-grade** audit procedure designed for a repo where:

- the CSV plan is the plan-of-record,
- runtime status is recorded by the orchestrator,
- and we need a defensible “what is actually done” baseline before auditing
  quality.

---

## 0) Non-negotiables (audit definition)

A task is **Accepted** only if:

- It is marked Completed in the runtime truth source (see Section 1), **and**
- It has an Evidence Pack (Section 2), **and**
- System-wide gates for the day are green (Section 3), **and**
- Tier-A review is done (Section 4).

Anything else is **In Review** (even if the CSV says Completed).

---

## 1) Establish the “done/completed” constraint (source-of-truth)

You must start the audit by producing a single table: **Task ID → Status → Last
Updated → Evidence Links**.

### 1.1 Preferred runtime truth source: `artifacts/status/*.json`

If you have `artifacts/status/<TASK>.json` produced by the orchestrator, treat
it as primary.

**Extraction (bash):**

```bash
# list all known task statuses from orchestrator artifacts
jq -s '
  map({
    task_id: .task_id,
    status: .status,
    updated_at: .updated_at,
    notes: (.notes // ""),
    execution_log: (.execution_log // ""),
    validation_log: (.validation_log // "")
  })
  | sort_by(.status, .task_id)
' artifacts/status/*.json > artifacts/reports/status-snapshot.json

# optional: markdown view
jq -r '
  ["task_id","status","updated_at"] as $h
  | ($h|@tsv),
    (.[]|[.task_id,.status,.updated_at]|@tsv)
' artifacts/reports/status-snapshot.json | column -t > artifacts/reports/status-snapshot.txt
```

### 1.2 Secondary truth source: CSV `Status` column (only if reliable)

Use CSV only if:

- orchestrator is the single writer, and
- updates are robust (proper CSV writer), and
- status matches artifact JSON.

**Extraction (bash):**

```bash
python3 - <<'PY'
import csv
from pathlib import Path
p=Path("tasks/sprint-plan.csv")
with p.open() as f:
  r=csv.DictReader(f)
  rows=[x for x in r]
done=[x for x in rows if x.get("Status","").strip() in {"Completed","Done"}]
print("completed_rows", len(done))
print("\n".join(sorted({x["Task ID"] for x in done})))
PY
```

### 1.3 Canonical “Completed set”

Define:

- `COMPLETED_TASKS = tasks where status == Completed (from artifacts/status if present else from CSV)`
- Save as `artifacts/reports/completed-task-ids.txt` (one per line)
- This file is the audit’s starting constraint.

---

## 2) Evidence Pack requirements (per task)

For each task in `COMPLETED_TASKS`, collect/verify:

### 2.1 Required artifacts (minimum)

- Spec: `.specify/specifications/<TASK>.md`
- Plan: `.specify/planning/<TASK>.md`
- Validation output: a log segment showing gates executed + timestamp
- Attestation: `artifacts/attestations/<TASK>.json` (or equivalent)
- Code reference: PR/commit hash

### 2.2 Tier-A add-ons

Tier-A tasks (unblockers, CI/infra/security/auth/architecture) also require:

- Tests executed (proof, not “generated”)
- Typecheck executed
- Lint executed
- Audit result (Gemini or equivalent), or a written waiver with expiry
- ADR link if architecture changed

### 2.3 Evidence audit checks (fast rules)

A Completed task is **downgraded** to In Review if any occur:

- Spec/Plan missing
- Validation log missing or stale (older than the completion timestamp)
- No code reference
- Tests required by policy but not executed
- Gate waivers exist with no expiry date

---

## 3) System-wide audit gates (daily totals)

This is what you asked for: **typecheck, lint, SonarQube, knip, dependency
audits, etc.** Run these once per audit session and store outputs under
`artifacts/reports/system-audit/<run-id>/`.

### 3.1 Suggested “baseline” toolchain for a PNPM monorepo

Run from repo root (adjust scripts to your repo conventions):

**Build + Type Safety**

- `pnpm -w -r typecheck` (or `turbo run typecheck`)
- `pnpm -w -r build` (or `turbo run build`)

**Lint + Formatting**

- `pnpm -w -r lint`
- `pnpm -w -r format:check` (or prettier check)

**Tests**

- `pnpm -w -r test` (unit)
- `pnpm -w -r test:e2e` (if applicable)

**Dead code / unused exports**

- `pnpm -w knip` (or `pnpm -w -r knip`)

**Dependency hygiene**

- `pnpm -w audit --prod`
- `pnpm -w audit` (optional; include dev)
- `pnpm -w outdated`
- `pnpm -w licenses list` (if license policy matters)

**Static security**

- Secret scan: `gitleaks detect` (or equivalent)
- SAST: `semgrep` (or equivalent)
- OSV: `osv-scanner` (recommended for dependency vuln confirmation)

**Containers / Infra (if applicable)**

- `docker compose config -q`
- `trivy fs .` and/or `trivy config .` (if you use trivy)

**Code quality platform**

- SonarQube: run scanner in CI and fetch the quality gate result.
  - Store the server URL + analysis id + quality gate status in the audit
    report.
  - If you cannot fetch, store the scanner output and the project key.

### 3.2 Required outputs

For each gate, store:

- command executed
- exit code
- start/end timestamps
- output log path
- (for sonar) quality gate status and metrics snapshot

This gives you “totals are available” without rereading tool output.

---

## 4) Sprint 0 task audit (comprehensive, but scalable)

Once you have `COMPLETED_TASKS`, the sprint audit is:

### 4.1 Build the Sprint 0 working set

- `SPRINT0_TASKS = all tasks with Target Sprint = 0`
- `SPRINT0_COMPLETED = SPRINT0_TASKS ∩ COMPLETED_TASKS`
- `SPRINT0_ACTIVE = SPRINT0_TASKS with status in {In Progress, Validating}`
- `SPRINT0_EXCEPTIONS = SPRINT0_TASKS with status in {Needs Human, Failed, In Review, Blocked}`

### 4.2 Tiering (so humans don’t drown)

Tier-A = must review:

- highest dependency fan-out tasks
- any task touching CI/CD, infra, security, auth, repo tooling, architecture

Tier-B = sample:

- 10–20% random sample of remaining completed tasks
- plus any flagged (large diff, new dependency, custom gate, waiver)

Tier-C = auto-accept unless flagged

### 4.3 “Fake green” detection rules (must run)

A Sprint 0 Completed task is flagged if:

- completion has no corresponding validation log excerpt
- tests were not executed but expected by tier/gate profile
- acceptance criteria are not measurable (no deterministic check exists)
- diff is large and scope exceeds plan (requires code review)
- new abstractions introduced with no consumers (overengineering signal)

Flagged tasks go to **Review Queue**.

---

## 5) Overengineering and drift review (human procedure)

For each Tier-A task and any flagged task:

### 5.1 Plan match

- Does code implement Spec acceptance criteria?
- Does it stay within Plan steps?
- Any extra behavior not described?
  - If yes: either update Spec/Plan (if intended) or revert.

### 5.2 Architecture match (Hexagonal)

- Domain not importing adapters/framework
- Ports explicit
- Adapters thin
- Aggregates enforce invariants
- Cross-package boundaries respected

### 5.3 “Overengineering” heuristics

Flag if:

- new generic framework built for one use
- refactor unrelated modules to deliver small change
- dependency added without clear need
- abstractions created without immediate consumers

Result:

- Accept / Accept-with-debt / Reject (downgrade status)

---

## 6) Debt ledger (mandatory for waivers/exceptions)

Any of these creates a debt item:

- gate waiver
- audit waiver
- tests skipped where expected
- flaky gate
- accepted missing evidence

Debt item must have:

- owner
- severity
- expiry date
- remediation plan
- evidence links

No expiry date = not allowed for Tier-A.

---

## 7) Outputs of this audit (what “comprehensive” means)

Produce these artifacts each audit run:

1. `artifacts/reports/completed-task-ids.txt`
2. `artifacts/reports/status-snapshot.json`
3. `artifacts/reports/system-audit/<run-id>/` logs + summary
4. `artifacts/reports/sprint0-audit.md` (narrative + lists)
5. `artifacts/reports/review-queue.json` and `.md`
6. `artifacts/debt-ledger.md` (updated)

---

## 8) What you need to change (summary of required system improvements)

This is the “do this next” list, based on prior iterations and your
requirements.

### P0 (must have to make audits real)

- Define the canonical Completed set from runtime artifacts (or CSV if proven
  reliable).
- Add daily system audit gates (typecheck, lint, tests, knip, pnpm audit,
  sonar).
- Require Evidence Pack + Attestation per Completed task (or a post-run verifier
  that downgrades).

### P1 (reduce manual audit cost)

- Introduce Tiering in the plan (A/B/C) and enforce Tier-A strictness.
- Generate Review Queue automatically from drift/waiver signals.
- Add Debt Ledger with mandatory owner + expiry for any waiver, skipped test, or
  missing evidence acceptance.

### P2 (plan correctness)

- Add plan linting in CI (cycles, later-sprint deps, missing Tier-A metadata).
- Fix Sprint 0 cross-sprint violations that block execution.

---

## 9) What Claude sub-agents should be given for their audit

To avoid “the audit is incomplete” feedback, provide these inputs to Claude:

- `tasks/sprint-plan.csv`
- `artifacts/status/*.json`
- `artifacts/reports/system-audit/<latest-run-id>/*`
- `artifacts/attestations/*` (if present)
- `artifacts/reports/review-queue.*`
- `artifacts/debt-ledger.*`
- `logs/` relevant to Sprint 0

Claude should verify:

- Completed set is correct
- system audit gates ran and are green
- Tier-A tasks have evidence and are reviewed
- exceptions are logged as debt with expiry

---

## Appendix: minimal “system audit command set” (copy/paste template)

Use a single run-id per day:

```bash
RUN_ID="$(date -Iseconds | tr ':' '-')"
OUT="artifacts/reports/system-audit/$RUN_ID"
mkdir -p "$OUT"

# Typecheck
(pnpm -w -r typecheck) >"$OUT/typecheck.log" 2>&1; echo $? >"$OUT/typecheck.exit"

# Lint
(pnpm -w -r lint) >"$OUT/lint.log" 2>&1; echo $? >"$OUT/lint.exit"

# Unit tests
(pnpm -w -r test) >"$OUT/test.log" 2>&1; echo $? >"$OUT/test.exit"

# Knip
(pnpm -w knip) >"$OUT/knip.log" 2>&1; echo $? >"$OUT/knip.exit"

# Dependencies
(pnpm -w audit --prod) >"$OUT/pnpm-audit-prod.log" 2>&1; echo $? >"$OUT/pnpm-audit-prod.exit"
(pnpm -w audit) >"$OUT/pnpm-audit.log" 2>&1; echo $? >"$OUT/pnpm-audit.exit"

# Sonar (example; adapt)
# (sonar-scanner ...) >"$OUT/sonar.log" 2>&1; echo $? >"$OUT/sonar.exit"
```
