# IntelliFlow Sprint 0 Audit Cutover and "All Tools" Audit System

A standalone implementation brief for establishing (1) an **audit cutover**
during an ongoing Sprint 0 and (2) a comprehensive, tiered **all-tools** audit
framework with evidence bundles.

---

## 1) Intent

Sprint 0 is already in progress. The objective is to **stop new errors now**
without stalling delivery by:

- introducing an **Audit Cutover** moment (new definition of "Completed" from
  this point forward), and
- operationalizing the audit toolchain into a repeatable **Audit Run Bundle**
  and deterministic **Audit Matrix**.

This is not an observability/operator playbook; it is strictly audit
governance + implementation guidance.

**In-repo implementation (this repo):**

- Cutover config: `audit-cutover.yml`
- Tool matrix: `audit-matrix.yml`
- Audit runner: `tools/audit/run_audit.py`
- PR affected-scope detection: `tools/audit/affected.py`
- Tool version capture: `tools/audit/tool_versions.py`
- Completed snapshot: `tools/audit/status_snapshot.py`
- Sprint 0 audit + review queue + rendered debt ledger:
  `tools/audit/sprint0_audit.py`
- CI (PR): `.github/workflows/system-audit.yml`
- CI (nightly): `.github/workflows/system-audit-nightly.yml`
- CI (integrity / cache-bypass): `.github/workflows/system-audit-integrity.yml`
- Operator docs: `docs/ops/system-audit.md`
- Performance + iteration doc: `docs/ops/audit-performance-and-iteration.md`

**Implementation status (this repo):**

- [x] Cutover policy file (`audit-cutover.yml`)
- [x] Tiered tool matrix (`audit-matrix.yml`)
- [x] Deterministic run bundles + summaries (`tools/audit/run_audit.py`)
- [x] Affected-only PR scope outputs (`tools/audit/affected.py` ->
      `artifacts/reports/affected/`)
- [x] Tool versions captured per run (`tool-versions.json`)
- [x] Resume + retries + concurrency (`--resume`, per-tool `retries`,
      `--concurrency`)
- [x] Sprint 0 governance reports (`tools/audit/status_snapshot.py`,
      `tools/audit/sprint0_audit.py`)
- [x] CI workflows wired (PR + nightly + cache-bypass integrity)
- [x] Prettier stability for generated evidence (`.prettierignore` ignores
      `artifacts/**`; metrics sync formats JSON via
      `apps/project-tracker/lib/data-sync.ts`)
- [x] Project Tracker audit UI (real-time run + stream)
      (`apps/project-tracker/components/AuditView.tsx`,
      `apps/project-tracker/app/api/audit/*`)
- [x] Attestation JSON schema + validator (`docs/attestation-schema.yaml`,
      `tools/audit/attestation.py`; enforced by `tools/audit/sprint0_audit.py`)
- [ ] Automatic attestation emission on task completion (planned)

---

## 2) Audit Cutover

### 2.1 What "cutover" means

Define a cutover at a specific:

- **commit SHA**, or
- **timestamp** (start of day).

From cutover forward, no task is considered **Operational Completed** unless it
satisfies the post-cutover audit contract (Section 2.3).

Tasks already marked completed before cutover are not rewritten immediately;
they are treated as **Legacy Completed** until verified (Section 2.4).

### 2.2 Why cutover is required

Without a cutover, you either:

- re-audit all historical work before moving forward (stalls delivery), or
- keep accepting weak completion signals (compounds risk).

Cutover gives you immediate control over future quality while allowing bounded
retroactive cleanup.

### 2.3 Post-cutover "Operational Completed" contract

A task can be accepted as **Operational Completed** only if:

1. Tier 1 audit gates pass (for the commit that includes the change), and
2. Evidence Pack exists (minimum: Spec + Plan + validation proof + code refs),
   and
3. Any waivers are recorded in the Debt Ledger with **owner + severity +
   expiry + remediation**.

If any condition is missing, the task is **In Review** (even if status says
"Completed").

### 2.4 Pre-cutover "Legacy Completed" triage

Legacy Completed tasks are triaged into:

- **Verified**: meets the new contract (or has equivalent evidence).
- **In Review**: missing evidence or conflicts with audit results.
- **Debt Accepted**: waived with expiry and remediation plan.

This keeps historical work visible without blocking Sprint 0 momentum.

### 2.5 Cutover configuration

Create a single, versioned config file: `audit-cutover.yml`

- `cutover_sha: <sha>` or `cutover_time: <iso8601>`
- `policy_version: v1`
- `notes: ...`

---

## 3) "All Tools" audit system architecture

### 3.1 Audit Matrix (canonical definition of tools)

`audit-matrix.yml` is the single source of truth for:

- tier (1/2/3),
- command (exact),
- scope (workspace/repo/git),
- thresholds,
- expected outputs,
- owner/maintainer,
- enabled/required (rollout control).

This prevents:

- tool drift,
- "we forgot to run X",
- inconsistent invocation between local and CI.

### 3.2 Audit Run Bundle (run-id evidence directory)

Every audit run produces: `artifacts/reports/system-audit/<RUN_ID>/`

Minimum required files per tool:

- `<tool>.command.txt`
- `<tool>.log`
- `<tool>.exit`

Run-level summaries:

- `summary.json` (normalized outcomes: pass/fail/warn/skipped + counts)
- `summary.md` (human readable)

Metadata includes:

- commit SHA
- tool versions snapshot (best-effort): `tool-versions.json`
- timestamps (start/end)
- runner identity (CI vs local)

### 3.3 Completed set + Sprint 0 reporting

Generate deterministic "what is actually done" snapshots:

- `artifacts/reports/status-snapshot.json`
- `artifacts/reports/completed-task-ids.txt`

Then generate Sprint 0 audit views:

- `artifacts/reports/sprint0-audit.md`
- `artifacts/reports/review-queue.json` + `artifacts/reports/review-queue.md`

### 3.4 Evidence Pack + Attestation

Define a per-task attestation file: `artifacts/attestations/<TASK>.json`

Recommended fields:

- task_id, run_id, started_at, finished_at
- gates_ran[], tests_ran[]
- audit_result (APPROVED/REJECTED/SKIPPED)
- commit_sha
- evidence paths (spec/plan/log links)

Rule: post-cutover tasks cannot be accepted without an attestation.

### 3.5 Review Queue (scales human review)

Humans do not review 200+ tasks manually. The Review Queue is exception-driven:

- Tier A tasks always (unblockers, infra/security/auth/CI/tooling/architecture).
- Any Tier 2 findings relevant to changed areas.
- Missing evidence/attestation.
- Any waivers.

### 3.6 Debt Ledger (exceptions cannot hide)

Canonical ledger: `docs/debt-ledger.yaml`

Reviewer-facing rendered views (generated):

- `artifacts/debt-ledger.jsonl`
- `artifacts/debt-ledger.md`

Rule: Tier A cannot be accepted with debt unless expiry is present.

---

## 4) Your agreed toolchain as policy

This section encodes tool selection into tiers and enforcement expectations. The
canonical implementation lives in `audit-matrix.yml`.

**Important:** The lists below describe the _policy intent_. The actual
enabled/required state is in `audit-matrix.yml` (many security tools are defined
but disabled until standardized installs/CI secrets are in place).

### Tier 1: Must Have (CI Gate Blockers) - audit fails if any fail

- turbo typecheck
- turbo build
- turbo test --coverage (Vitest + coverage threshold 90%)
- eslint --max-warnings=0
- prettier --check
- sonarqube-scanner (Quality Gate A; debt ratio < 3%)
- commitlint
- gitleaks
- pnpm audit --audit-level=high
- snyk test --severity-threshold=high
- trivy image --severity HIGH,CRITICAL --exit-code 1
- semgrep --config=p/security-audit --error
- dependency-cruiser --validate

### Tier 2: Should Have (CI Warnings) - do not block; feed Review Queue

- knip, ts-prune, depcheck, cspell, markdownlint
- codeql-analysis, bearer scan, osv-scanner
- stryker report, madge --circular

### Tier 3: Nice to Have (Scheduled/Manual)

- lighthouse-ci, k6, pnpm outdated, license-checker, grype
- owasp-zap, clinic.js, syft, cosign
- monthly: size-limit, langfuse audit, garak

### Metrics and thresholds (enforce progressively, but record immediately)

- Coverage >= 90% (Vitest + v8)
- SonarQube Quality Gate = A; Technical Debt Ratio < 3%
- Security: 0 critical/high vulns (Snyk + Trivy + pnpm audit policy)
- Mutation score > 80% (start as Tier 2 reporting; promote later)
- Lighthouse > 90 (scheduled)
- SBOM coverage 100% (Syft; scheduled then enforce for releases)

---

## 5) Rollout plan (do not stall Sprint 0)

### Phase 0 (immediate)

- Create `audit-cutover.yml` and declare the cutover.
- Add Tier 1 audit runner capability (local + CI) and produce run-id bundles.

### Phase 1 (this week)

- Enforce Tier 1 as PR blockers.
- Run Tier 2 on PRs and populate Review Queue.

### Phase 2 (next)

- Add Evidence Pack verifier + attestation requirement post-cutover.
- Add Debt Ledger enforcement for waivers.

### Phase 3 (ongoing)

- Schedule Tier 3 audits.
- Promote repeated Tier 2 issues to Tier 1 when noise is controlled.

---

## 6) Codex CLI implementation prompt

Paste the following into Codex CLI to extend/operate the system.

### PROMPT START (Codex CLI)

You are Codex CLI acting as Staff Engineer / Delivery Lead. Implement or extend
the Sprint 0 audit and quality gate system for IntelliFlow CRM:

Goals:

- Keep `audit-cutover.yml` and `audit-matrix.yml` as the canonical policy
  sources.
- Ensure `tools/audit/run_audit.py` produces deterministic run bundles under
  `artifacts/reports/system-audit/<RUN_ID>/`.
- Ensure `tools/audit/status_snapshot.py` and `tools/audit/sprint0_audit.py`
  generate deterministic Sprint 0 governance views under `artifacts/reports/`.
- Ensure post-cutover "Completed" requires (a) evidence pack and (b)
  `artifacts/attestations/<TASK>.json`.
- Ensure waivers are reflected in `docs/debt-ledger.yaml` and rendered into
  `artifacts/debt-ledger.*`.

Constraints:

- Do not renumber Task IDs or break existing Sprint_plan.csv columns.
- Prefer Python for CSV/JSON processing; shell only for orchestration.
- No secrets committed to repo; read tokens from env.
- Outputs must be deterministic (sorted lists, stable formatting).
- Add/maintain tests under `tools/audit/tests/` for core rules (matrix parsing,
  snapshot extraction, review queue rules).
- Keep implementation incremental; do not stall Sprint 0.

Next work items (optional):

1. Add a formal attestation JSON schema and validator (reject malformed
   attestations).
2. Add a task-to-audit-run mapping (each attestation references its own run-id).
3. Enable additional tools in `audit-matrix.yml` once installation is
   standardized in CI.
4. Wire the orchestrator to emit attestations on successful task completion.

### PROMPT END (Codex CLI)

---

## 7) Operator-facing artifacts (what reviewers will use)

After implementation, a reviewer should only need:

- `artifacts/reports/system-audit/<RUN_ID>/summary.md`
- `artifacts/reports/sprint0-audit.md`
- `artifacts/reports/review-queue.md`
- `artifacts/debt-ledger.md`

Everything else is linked from those documents.
