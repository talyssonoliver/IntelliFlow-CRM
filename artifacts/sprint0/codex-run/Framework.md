# IntelliFlow-CRM: Specialised Task Ownership Agent (STOA) Framework v4.3 FINAL

**Integrated Governance for Sprint 0 and Beyond**

**Date:** December 20, 2025
**Project:** IntelliFlow-CRM
**Scope:** Governance model for day-to-day factory execution (swarm + tracker + audit/validation)
**Status:** Ready to implement

---

## 0) Purpose and Non-Negotiables

The STOA framework assigns **deterministic ownership** to every task and defines **who must sign off what**, using evidence produced by your existing factory pipeline (Triad phases + Gatekeeper + Auditor).

### 0.1 Design Goals

- Prevent "responsibility diffusion" across parallel agents.
- Make completion claims **evidence-backed** and reproducible.
- Preserve the authority of deterministic gates (validation/audit matrix).
- Reduce drift between **CSV plan** → **registry** → **task status JSON** → **runtime artifacts**.

### 0.2 Non-Negotiables

1. **Gatekeeper is final**: a task cannot ship if deterministic gates fail, regardless of STOA approval.
2. **Evidence-first**: every verdict must reference artifacts, gate transcripts, and hashes.
3. **Determinism**: ownership, supporting sign-offs, and required gate profiles must be computable from the task metadata + impact surface.
4. **Separation of concerns**: runtime outputs must not contaminate source documentation locations.
5. **Single source of truth**: `Sprint_plan.csv` at its canonical location is authoritative; all other files derive from it.

---

## 1) Canonical File Locations (CRITICAL - DO NOT MOVE)

This section defines the **immutable source-of-truth paths** that MUST NOT be relocated without updating all validators, the tracker, and this framework.

### 1.1 Source-of-Truth Files (Git-tracked, committed)

| File | Canonical Path | Purpose |
|------|----------------|---------|
| Sprint Plan CSV | `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv` | Single source of truth for all tasks |
| Sprint Plan JSON | `apps/project-tracker/docs/metrics/_global/Sprint_plan.json` | Derived from CSV (auto-synced) |
| Task Registry | `apps/project-tracker/docs/metrics/_global/task-registry.json` | Central status tracking (auto-synced) |
| Task Status Files | `apps/project-tracker/docs/metrics/sprint-0/phase-*/*.json` | Per-task execution details |
| Phase Summaries | `apps/project-tracker/docs/metrics/sprint-0/phase-*/_phase-summary.json` | Aggregated phase metrics |
| Sprint Summary | `apps/project-tracker/docs/metrics/sprint-0/_summary.json` | Sprint-level aggregation |
| JSON Schemas | `apps/project-tracker/docs/metrics/schemas/*.schema.json` | Validation schemas |
| Audit Matrix | `audit-matrix.yml` (repo root) | Canonical tool definitions |

### 1.2 Artifacts Directory Policy

The `artifacts/` directory has a **hybrid policy**: some content is committed (planning artifacts), some is runtime-only (logs, swarm state).

#### 1.2.1 Committed Artifacts (Git-tracked)

| Category | Path | Purpose |
|----------|------|---------|
| Task Contexts | `artifacts/contexts/` | LLM context files for tasks (IFC-*, ENV-*) |
| Baseline Benchmarks | `artifacts/benchmarks/` | Performance baselines |
| Misc Configs | `artifacts/misc/` | Config files (commitlint, vault, otel, etc.) |
| Sprint Prompts | `artifacts/Sprint0_prompt.md` | Sprint planning prompts |

#### 1.2.2 Runtime Artifacts (Git-ignored, ephemeral)

| Category | Path | Examples |
|----------|------|----------|
| Swarm State | `artifacts/blockers.json` | Blocked tasks (runtime only) |
| Swarm State | `artifacts/human-intervention-required.json` | Tasks needing human review |
| Evidence Bundles | `artifacts/reports/system-audit/<RUN_ID>/` | Per-run evidence |
| Logs | `artifacts/logs/` | Runtime logs (NOT test logs) |
| Coverage | `artifacts/coverage/` | Test coverage reports |
| Qualitative Reviews | `artifacts/qualitative-reviews/` | Review outputs from swarm |

**Validation requirement**: The linter MUST distinguish between:
- Committed artifacts (allowlisted paths) → OK
- Runtime artifacts in correct location → OK
- Runtime artifacts in wrong location → FAIL

### 1.3 Path Resolution Logic

Validators use the following priority (see `tools/scripts/lib/validation-utils.ts`):

1. `SPRINT_PLAN_PATH` environment variable (if set)
2. `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv` (canonical)
3. `Sprint_plan.csv` at repo root (legacy fallback)

**On startup, the runner MUST print the resolved paths** to prevent silent wrong-source reads.

#### 1.3.1 Fallback Policy (Mode-Dependent)

| Resolved Path | Local Mode | Strict Mode (CI) |
|---------------|------------|------------------|
| Canonical (`_global/Sprint_plan.csv`) | PASS | PASS |
| Root fallback (`Sprint_plan.csv`) | WARN + loud message | **FAIL** |
| Neither found | FAIL | FAIL |

**Rationale**: The root fallback exists only for migration/bootstrap. In CI/strict mode, reading from a non-canonical location is a governance violation that must block the run.

#### 1.3.2 Uniqueness Enforcement

The validation MUST verify that exactly one `Sprint_plan.csv` is tracked in git:

```typescript
const matches = trackedFiles.filter(f =>
  f.endsWith('/Sprint_plan.csv') || f === 'Sprint_plan.csv'
);
if (matches.length !== 1) {
  return { severity: 'FAIL', message: `Found ${matches.length} tracked copies (expected exactly 1)` };
}
```

If multiple copies exist, the run MUST FAIL regardless of mode.

---

## 2) STOA Roles and Responsibilities

STOAs are specialised "ownership agents" (human or AI) responsible for reviewing and signing off work in a domain, based on evidence.

### 2.1 STOA Categories

| STOA | Primary Mandate | Typical Scope |
|------|-----------------|---------------|
| **Foundation STOA** | Infra, tooling, CI, environments, deployment primitives | docker, CI configs, monorepo tooling, secrets plumbing, environment bootstrap |
| **Domain STOA** | Business/domain correctness, API/data-model behaviour | tRPC routes, domain packages, DB schema usage, core invariants |
| **Intelligence STOA** | AI/ML logic, chains/agents, safety/guardrails, evals | ai-worker, prompts, embeddings, scoring chains, model usage, eval hooks |
| **Security STOA** | Threat model, secret hygiene, SAST/SCA/DAST posture | authn/authz, secret scanning, dependency vulns, container/IaC posture |
| **Quality STOA** | Test strategy, coverage, regressions, release confidence | unit/integration/e2e, lint/typecheck, mutation testing, quality metrics |
| **Automation STOA** | Factory mechanics, orchestration, audit cutover and evidence | orchestrator/swarm/tracker integration, validation rules, artifact contracts |

> Note: A STOA is an "owner" role, not necessarily the implementer. Implementation is done by Builder agents; STOAs review and sign.

### 2.2 STOA Verdict Contract

Each STOA MUST produce a verdict file in the evidence bundle:

**Path**: `artifacts/reports/system-audit/<RUN_ID>/stoa-verdicts/<STOA>.json`

**Schema**:
```typescript
interface StoaVerdict {
  stoa: string;                    // e.g., "Security", "Quality"
  taskId: string;
  verdict: 'PASS' | 'WARN' | 'FAIL' | 'NEEDS_HUMAN';
  rationale: string;
  toolIdsSelected: string[];       // From gate selection
  toolIdsExecuted: string[];       // Actually ran
  waiversProposed: string[];       // Tool IDs needing waiver
  findings: Finding[];             // Issues discovered
  timestamp: string;               // ISO 8601
}

interface Finding {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  source: string;                  // Tool ID or manual review
  message: string;
  recommendation: string;
}
```

**DoD for STOA sub-agent**:
1. Verdict file emitted with all required fields
2. All referenced evidence exists (hashes match)
3. Gaps transformed into: review-queue entry, debt ledger entry, or Needs Human packet

---

## 3) Deterministic STOA Assignment

### 3.1 Lead STOA Assignment (by Task ID Prefix)

Lead STOA is determined by Task ID prefix. This removes reliance on an `Assigned_To` field and prevents ambiguous ownership.

| Task ID Prefix | Lead STOA | Notes |
|----------------|-----------|-------|
| `ENV-*` | Foundation | environment/tooling bootstrap; CI; monorepo wiring |
| `EP-*` | Foundation | EasyPanel/internal tools infrastructure |
| `IFC-*` | Domain | default for product/domain features |
| `EXC-SEC-*`, `SEC-*` | Security | explicit security epics/exceptions |
| `AI-*`, `AI-SETUP-*` | Intelligence | AI foundation + AI runtime features |
| `AUTOMATION-*` | Automation | orchestrator/swarm/tracker/audit machinery |

**Explicit Override Mechanism**

If `plan-overrides.yaml` declares a Lead STOA override for a Task ID, it supersedes the prefix mapping. Overrides must include a justification and expiry (or "permanent") to prevent silent drift.

### 3.2 Supporting STOA Derivation (Deterministic Rules)

Supporting STOAs are derived **mechanically** from task metadata and the impact surface.

**Inputs (in priority order):**
1. Task ID prefix (Lead STOA)
2. Task "Section" / "Description" / "DoD" text keywords
3. Dependencies (task graph from CSV)
4. File/path impact surface (from diff or declared "affected areas")
5. Validation requirements (audit-matrix tool IDs required for the task)

**Derivation Rules:**

- **Security STOA becomes Supporting** if:
  - Task touches `auth`, `middleware/auth`, tokens, secrets, RBAC, permissions, rate limiting, or public endpoints
  - Validation includes any security tool ID from audit-matrix

- **Quality STOA becomes Supporting** if:
  - Task modifies tests, coverage thresholds, CI gates, lint/typecheck configurations
  - Task has DoD keywords: `coverage`, `e2e`, `integration`, `mutation`, `quality gate`

- **Foundation STOA becomes Supporting** if:
  - Task touches `infra/**`, docker compose, deployment scripts, GitHub Actions, environment variables, observability stack

- **Intelligence STOA becomes Supporting** if:
  - Task touches `apps/ai-worker/**`, prompts/chains, embeddings/scoring, model providers, eval hooks

- **Domain STOA becomes Supporting** if:
  - Task touches `apps/api/**`, `packages/domain/**`, DB contracts, or user-facing data flows

**Rule Conflict Handling:**
- All derived supporting STOAs must sign off unless explicitly waived.
- Waivers must be recorded in the run summary with reason and expiry.

---

## 4) MATOP: Multi-Agent Task Ownership Protocol

MATOP is the internal collaboration contract used inside a single task run.

### 4.1 Phases (Aligned with Triad + Gatekeeper + Auditor)

1. **Architect** (spec + plan)
2. **Enforcer** (tests + acceptance criteria codification where applicable)
3. **Builder** (implementation)
4. **Gatekeeper** (deterministic checks; audit-matrix + task validations)
5. **Auditor** (logic/security audit vs constitution/policies)
6. **STOA Sign-off** (Lead + Supporting STOAs review evidence and decide PASS/WARN/FAIL)

### 4.2 STOA Sign-off Sequencing

- Lead STOA produces a draft verdict after Gatekeeper results are available.
- Supporting STOAs either:
  - **Agree**, or
  - **Veto** (semantic failure), or
  - **Escalate** ("Needs Human" if ambiguity/high-risk).

A veto forces FAIL (or WARN→FAIL in strict contexts), independent of Builder confidence.

---

## 5) Gate Profiles (Bound to audit-matrix.yml)

**CRITICAL**: STOAs do not invent checks. They **select tool IDs from `audit-matrix.yml`** and enforce the documented commands and thresholds.

### 5.1 Baseline Gates (Always Required - Tier 1)

These tool IDs from `audit-matrix.yml` are mandatory for all tasks:

| Tool ID | Command (from matrix) | Threshold |
|---------|----------------------|-----------|
| `turbo-typecheck` | `pnpm run typecheck` | Exit 0 |
| `turbo-build` | `pnpm run build` | Exit 0 |
| `turbo-test-coverage` | `pnpm exec turbo run test:coverage` | coverage_min: 90 |
| `eslint-max-warnings-0` | `pnpm exec eslint --max-warnings=0 .` | max_warnings: 0 |
| `prettier-check` | `pnpm run format:check` | Exit 0 |
| `commitlint` | `python tools/audit/commit_msg_lint.py --count 20` | Exit 0 |

#### 5.1.1 Coverage Threshold Enforcement (CRITICAL)

The `turbo-test-coverage` gate only enforces coverage thresholds if the underlying test configuration **fails the process** when coverage is below threshold.

**Required configuration** (must be verified):

```typescript
// vitest.config.ts (or equivalent)
export default defineConfig({
  test: {
    coverage: {
      thresholds: {
        statements: 90,
        branches: 90,
        functions: 90,
        lines: 90,
      },
      thresholdAutoUpdate: false,  // CRITICAL: must be false
    },
  },
});
```

If coverage enforcement cannot be verified, the run MUST produce a WARN (or FAIL in strict mode) with reason: "coverage_threshold_not_enforced".

#### 5.1.2 Gate Selection Algorithm (Deterministic)

The runner MUST use this algorithm to determine which gates to execute:

```typescript
interface GateSelectionResult {
  execute: string[];         // Tool IDs to run
  waiverRequired: string[];  // Required but cannot run
  skipped: string[];         // Optional, not running
}

function selectGates(
  task: Task,
  matrix: AuditMatrix,
  derivedStoas: string[]
): GateSelectionResult {
  // Step 1: Baseline = Tier 1 tools marked as required
  const baseline = matrix.tools.filter(t => t.tier === 1 && t.required === true);

  // Step 2: STOA add-ons from derived STOAs
  const stoaAddons = derivedStoas.flatMap(stoa =>
    getStoaRequiredToolIds(stoa, matrix)
  );

  // Step 3: Union of baseline + STOA add-ons
  const selectedIds = new Set<string>();
  baseline.forEach(t => selectedIds.add(t.id));
  stoaAddons.forEach(id => selectedIds.add(id));

  // Step 4: Classify each selected gate
  const execute: string[] = [];
  const waiverRequired: string[] = [];
  const skipped: string[] = [];

  for (const toolId of selectedIds) {
    const tool = matrix.getToolById(toolId);

    if (tool.enabled && canRun(tool)) {
      execute.push(toolId);
    } else if (tool.required) {
      waiverRequired.push(toolId);
    } else {
      skipped.push(toolId);
    }
  }

  return { execute, waiverRequired, skipped };
}

function getStoaRequiredToolIds(stoa: string, matrix: AuditMatrix): string[] {
  // Map STOA to tool IDs based on audit-matrix owner field
  return matrix.tools
    .filter(t => t.owner === stoa || t.stoas?.includes(stoa))
    .map(t => t.id);
}
```

**Key invariants:**
- Every tool in `waiverRequired` MUST have a WaiverRecord created (see 5.4)
- Every tool in `execute` MUST have a gate transcript produced
- Every tool in `skipped` MUST be logged (but no waiver needed)
- The union of all three lists equals the selected gates

### 5.2 STOA-Specific Gate Add-ons

Gate add-ons are defined in `audit-matrix.yml` with an `owner` or `stoas` field mapping them to STOAs.

**Foundation STOA (owner: "Foundation" in audit-matrix):**
- `docker-compose-validate` (if defined)
- `validate-env` (if defined)

**Domain STOA (owner: "Domain"):**
- `test-integration` (if defined)

**Intelligence STOA (owner: "Intelligence"):**
- `ai-worker-test` (if defined)

**Security STOA (owner: "Security"):**
- `gitleaks`, `pnpm-audit-high`, `snyk`, `semgrep-security-audit`, `trivy-image`, `osv-scanner`

**Quality STOA (owner: "Quality"):**
- `stryker`, `lighthouse-ci`, `sonarqube-scanner`

**Automation STOA (owner: "Automation"):**
- `artifact-paths-lint`, `sprint-validation`, `sprint-data-validation`

> **Note**: If a command is not in `audit-matrix.yml`, it is NOT a gate. It may be run as a "recommended check" (manual playbook) but does not affect Gatekeeper verdict.

### 5.3 Recommended Checks (Manual Playbook - NOT Gates)

The following commands are useful but NOT part of the Gatekeeper. They do not block task completion:

```bash
# Developer awareness only - not automated gates
docker compose config -q              # Docker syntax check
trivy fs . --severity HIGH,CRITICAL   # Early filesystem scan
trivy config . --severity HIGH,CRITICAL  # IaC scan
```

To promote these to gates, add them to `audit-matrix.yml` with appropriate tool IDs.

### 5.4 Strict Mode Policy

- **Local default**: WARN does not fail the run.
- **CI/Release strict**: WARN is treated as FAIL unless explicitly waived.

Strict mode triggers:
- `VALIDATION_STRICT=1` environment variable
- `--strict` CLI flag on validators

### 5.5 Waiver Governance for Required-but-Disabled Tools

When a tool is marked `required: true` in `audit-matrix.yml` but cannot run (because `enabled: false` or the tool is not installed), the framework MUST NOT silently skip the gate. Instead, a **Waiver Record** must be created.

#### 5.5.1 Waiver Record Structure

```typescript
interface WaiverRecord {
  toolId: string;
  reason: 'tool_not_installed' | 'env_var_missing' | 'known_false_positive' |
          'deferred_to_sprint_N' | 'infrastructure_not_ready';
  owner: string;               // Human who approved (or "pending")
  createdAt: string;           // ISO 8601
  expiresAt: string | null;    // ISO 8601 or null for permanent
  approved: boolean;           // false until human approves
  strictModeBehavior: 'WARN' | 'FAIL';
}
```

#### 5.5.2 Waiver Lifecycle

1. **Creation**: When a required tool cannot run, the runner creates a waiver record with `approved: false`
2. **Storage**: Waivers are stored in `artifacts/reports/system-audit/<RUN_ID>/waivers.json`
3. **Approval**: A human must approve the waiver (set `approved: true`) for the run to proceed
4. **Expiry**: Waivers MUST have an expiry date (max 30 days) unless marked permanent with justification

#### 5.5.3 Strict Mode Behavior

| Waiver State | Local Mode | Strict Mode (CI) |
|--------------|------------|------------------|
| `approved: true` | WARN | WARN (tool skipped, logged) |
| `approved: false` | WARN + halt for approval | FAIL |
| Expired waiver | WARN + halt for renewal | FAIL |

---

## 6) Verdicts and Status Mapping

STOA verdicts must map to canonical tracker states to prevent ambiguity.

### 6.1 Verdict Types

| Verdict | Meaning |
|---------|---------|
| **PASS** | Meets DoD; all required gates pass; no unresolved semantic concerns |
| **WARN** | Meets DoD but with caveats (minor debt, non-blocking risk, or deferred gate with waiver) |
| **FAIL** | Does not meet DoD; gates failed; or STOA veto |
| **NEEDS_HUMAN** | A subtype of FAIL indicating human intervention is required to unblock |

### 6.2 Canonical Status Mapping

| STOA Verdict | CSV Status | Tracker Action |
|--------------|------------|----------------|
| PASS | `Completed` | Close review queue items for task |
| WARN | `Completed` | Create/append Review Queue entry + optional Debt Ledger entry |
| FAIL | `Blocked` or `In Progress` | Create/append Review Queue item with "blocking" flag |
| NEEDS_HUMAN | `Needs Human` | Produce Human Packet and halt retries |

---

## 7) Escalation and Unlock Protocol ("Needs Human")

### 7.1 Escalation Triggers

Escalate to **Needs Human** if any of:
- Gatekeeper fails repeatedly (retry loop exhausted)
- Evidence conflicts (e.g., CSV says Planned but status JSON says Completed)
- Security-sensitive uncertainty (authn/authz, secret exposure, data loss risk)
- Tooling is misconfigured and cannot produce reliable results

### 7.2 Human Packet Minimum Contents

A "Human Packet" must include:
- Failing command(s) and exit codes
- Last 200 lines of relevant logs (or path to log file)
- Minimal reproduction steps
- Suspected root cause
- Safe rollback suggestion (if applicable)
- Recommended next attempt (prompt/spec tweak)

### 7.3 Unlock Command Contract

Unlock should not "wipe" evidence; it should:
- Create a new RUN_ID
- Link previous run artifacts
- Carry forward waivers and open review items

---

## 8) Evidence Integrity and Artifact Placement

### 8.1 Evidence Integrity Definition (Sprint 0-ready)

For Sprint 0, "signed" means **hash-backed integrity**, not cryptographic signing.

**Minimum Requirements:**
- Generate SHA256 for:
  - Run summary (machine-readable JSON)
  - Validation transcripts (audit-matrix output)
  - Key produced artifacts (reports, registries, task status JSON updates)
- Store in: `artifacts/reports/system-audit/<RUN_ID>/evidence-hashes.txt`
- Include those hashes in the run summary JSON

### 8.2 Evidence Bundle Structure

```
artifacts/reports/system-audit/<RUN_ID>/
  summary.json              # Machine-readable run summary
  summary.md                # Human-readable run summary
  evidence-hashes.txt       # SHA256 hashes of all artifacts
  gate-selection.json       # execute/waiverRequired/skipped lists
  waivers.json              # Waiver records (if any)
  csv-patch-proposal.json   # Status change proposals (if any)
  stoa-verdicts/
    Foundation.json
    Security.json
    Quality.json
    ...
  gates/
    turbo-typecheck.log
    turbo-build.log
    eslint.log
    ...
  task-updates/
    <TASK_ID>.json          # Copy of updated task status
```

### 8.3 Forbidden Runtime Locations

The following paths are **unconditionally forbidden** for runtime artifacts:

```
# Under docs/metrics/ - ALWAYS FORBIDDEN for runtime
apps/project-tracker/docs/metrics/.locks/**/*
apps/project-tracker/docs/metrics/.status/**/*
apps/project-tracker/docs/metrics/logs/**/*
apps/project-tracker/docs/metrics/backups/**/*
apps/project-tracker/docs/metrics/artifacts/**/*
apps/project-tracker/docs/metrics/**/*.lock
apps/project-tracker/docs/metrics/**/*.heartbeat
apps/project-tracker/docs/metrics/**/*.bak

# Under docs/artifacts/ - FORBIDDEN (runtime goes to artifacts/)
apps/project-tracker/docs/artifacts/**/*

# Generic runtime state under docs/ - ALWAYS FORBIDDEN
apps/**/docs/**/*.tmp
apps/**/docs/**/*.cache
apps/**/docs/**/blockers.json
apps/**/docs/**/human-intervention-required.json
```

### 8.4 Allowlist (Source Documentation)

- `apps/**/docs/**` for markdown/reference docs
- `apps/project-tracker/docs/metrics/_global/**` for canonical plan/registry (unique, committed)
- `apps/project-tracker/docs/metrics/sprint-0/**` for task status files (committed)
- `apps/project-tracker/docs/metrics/schemas/**` for JSON schemas (committed)

---

## 9) Cross-Platform Execution (Windows + Unix)

### 9.1 Design Principle

All gate execution and transcript capture MUST be handled by **Node.js/TypeScript**, not shell pipelines. This ensures Windows PowerShell compatibility.

### 9.2 Runner Implementation

```typescript
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';

interface GateResult {
  toolId: string;
  exitCode: number;
  logPath: string;
  passed: boolean;
}

async function runGate(
  toolId: string,
  command: string,
  logPath: string,
  repoRoot: string
): Promise<GateResult> {
  const logStream = createWriteStream(logPath);

  return new Promise((resolve) => {
    const proc = spawn(command, { shell: true, cwd: repoRoot });

    proc.stdout?.pipe(logStream);
    proc.stderr?.pipe(logStream);

    proc.on('close', (code) => {
      logStream.end();
      resolve({
        toolId,
        exitCode: code ?? 1,
        logPath,
        passed: code === 0,
      });
    });
  });
}
```

### 9.3 Path Normalization

Always normalize paths to forward slashes:

```typescript
function normalizeRepoPath(filePath: string): string {
  return filePath.replace(/\\/g, '/').trim();
}
```

---

## 10) Human vs Agent Responsibilities

### 10.1 Human Responsibilities (Non-delegable)

- Approve/adjust the CSV plan when reality changes (source-of-truth governance)
- Approve waivers (tool unavailable, token missing, known false positive)
- Manage secrets and credentials (Vault, CI secrets, API keys)
- Resolve Needs Human escalations (spec changes, environment repair, policy decisions)
- Decide merge/release when WARNs exist (risk acceptance)

### 10.2 Agent Responsibilities (Delegable)

- Produce specs/tests/implementation
- Run deterministic gates and capture transcripts
- Generate evidence bundles and hashes
- Create review-queue entries and debt ledger entries
- Propose waivers with rationale (human approves)
- Propose CSV patches (human applies)

---

## 11) Implementation Steps (Sprint 0-safe)

### 11.1 Phase 1: Preflight Checks

Before running any gates, verify:

1. **Required tools exist** - Check each enabled tool in audit-matrix.yml is installed
2. **Canonical paths resolve** - Print resolved Sprint_plan.csv path
3. **Uniqueness check** - Confirm exactly one Sprint_plan.csv is tracked
4. **Environment variables set** - Check `requires_env` for each tool

### 11.2 Phase 2: STOA Assignment

1. Parse task from CSV
2. Determine Lead STOA from prefix
3. Derive Supporting STOAs from keywords and impact surface
4. Record assignment in run summary

### 11.3 Phase 3: Gate Execution

1. Run gate selection algorithm (5.1.2)
2. Execute each tool in `execute` list using audit-matrix command EXACTLY
3. Create waiver records for tools in `waiverRequired` list
4. Log tools in `skipped` list
5. Capture stdout/stderr to `artifacts/reports/system-audit/<RUN_ID>/gates/<tool_id>.log`
6. Record exit code and pass/fail status

### 11.4 Phase 4: Evidence Generation

1. Generate SHA256 hashes for all artifacts
2. Write `evidence-hashes.txt`
3. Write `gate-selection.json`
4. Write `waivers.json` (if any)
5. Write `summary.json` and `summary.md`

### 11.5 Phase 5: STOA Sign-off and CSV Governance

1. Lead STOA reviews evidence and produces verdict file
2. Supporting STOAs confirm or veto (produce their verdict files)
3. Final status recorded to task JSON

#### 11.5.1 CSV Modification Governance (CRITICAL)

The CSV is the **source of truth** and is under **human governance**. Agents MUST NOT directly modify the CSV. Instead:

**Agent workflow (proposal-based):**
1. Agent produces a **CSV Patch Proposal** as a structured diff
2. Patch is stored in `artifacts/reports/system-audit/<RUN_ID>/csv-patch-proposal.json`
3. Human reviews and applies the patch (or rejects with reason)
4. Applied patches are logged in `artifacts/reports/csv-patch-history.jsonl`

**CSV Patch Proposal Structure:**
```typescript
interface CsvPatchProposal {
  runId: string;
  taskId: string;
  proposedAt: string;              // ISO 8601
  proposedBy: string;              // Agent identifier
  changes: CsvRowChange[];
  rationale: string;
  evidenceRefs: string[];          // Paths to supporting evidence
}

interface CsvRowChange {
  taskId: string;
  field: string;                   // e.g., "Status"
  oldValue: string;
  newValue: string;
}
```

**Forbidden:**
- Agents directly editing `Sprint_plan.csv` via file write
- Silent status changes without evidence reference
- Batch updates without individual patch records

---

## 12) STOA DoD (Definition of Done) for Every Task

A task is eligible for completion only when:

1. **Deterministic gates executed** per the task's gate profile (baseline + STOA add-ons from audit-matrix.yml)
2. **Gate selection logged** in `gate-selection.json`
3. **Artifacts present** and referenced:
   - Gate transcripts in `artifacts/reports/system-audit/<RUN_ID>/gates/`
   - STOA verdict files in `stoa-verdicts/`
   - Updated task status JSON (with status history)
4. **Evidence hashes recorded** (`evidence-hashes.txt`) and included in summary JSON
5. **Lead STOA verdict recorded** (PASS/WARN/FAIL) with rationale
6. **All Supporting STOAs sign off** or a waiver is recorded (with expiry)
7. If WARN: review-queue entry exists with owner and due date
8. If NEEDS_HUMAN: Human Packet exists and retry halts

---

## Appendix A: Deterministic Keyword Triggers

**Security Triggers (DoD/description keywords):**
```
auth, jwt, token, session, rbac, permissions, secret, vault, rate-limit, csrf, xss, injection
```

**AI Triggers:**
```
prompt, agent, chain, embedding, vector, scoring, llm, ollama, openai, langchain, crewai
```

**Quality Triggers:**
```
coverage, e2e, playwright, vitest, mutation, stryker, quality gate, sonarqube
```

---

## Appendix B: Audit Matrix Tool ID Reference

The following tool IDs are defined in `audit-matrix.yml`:

**Tier 1 (Blockers):**
- `turbo-typecheck`, `turbo-build`, `turbo-test-coverage`
- `eslint-max-warnings-0`, `prettier-check`, `commitlint`
- `sonarqube-scanner`, `sonarqube-quality-gate` (enabled, not required)
- `gitleaks`, `pnpm-audit-high`, `snyk`, `trivy-image`, `semgrep-security-audit`, `dependency-cruiser-validate` (disabled)

**Tier 2 (Warnings):**
- `knip`, `ts-prune`, `depcheck`, `cspell`, `markdownlint`
- `codeql-analysis`, `bearer`, `osv-scanner`, `stryker`, `madge-circular`

**Tier 3 (Scheduled/Manual):**
- `lighthouse-ci`, `k6`, `pnpm-outdated`, `license-checker`
- `grype`, `owasp-zap`, `clinic-js`, `syft`, `cosign`, `size-limit`
- `langfuse-audit`, `garak`

---

## Appendix C: Existing Validation Infrastructure

The framework builds on these existing scripts:

| Script | Purpose |
|--------|---------|
| `tools/scripts/sprint0-validation.ts` | Sprint 0 readiness validation |
| `tools/scripts/lib/validation-utils.ts` | Shared validation utilities |
| `tools/scripts/validate-sprint-data.ts` | Sprint data consistency checks |
| `tools/lint/artifact-paths.ts` | Artifact placement linting |
| `apps/project-tracker/lib/paths.ts` | Centralized path configuration |
| `apps/project-tracker/lib/data-sync.ts` | CSV to JSON synchronization |

---

## Appendix D: Acceptance Criteria for v4.3 FINAL Rollout

Before implementing this framework, verify the following checklist:

### Evidence Bundle Completeness
- [ ] Every run produces `artifacts/reports/system-audit/<RUN_ID>/` with:
  - [ ] `summary.json` with resolved canonical paths printed
  - [ ] `evidence-hashes.txt` with SHA256 for all artifacts
  - [ ] `gate-selection.json` with execute/waiverRequired/skipped lists
  - [ ] `waivers.json` for any required-but-disabled tools
  - [ ] `stoa-verdicts/<STOA>.json` for each signing STOA
  - [ ] `csv-patch-proposal.json` for any status change proposals

### Path Resolution and Uniqueness
- [ ] Runner prints resolved Sprint_plan.csv path on startup
- [ ] Root fallback triggers WARN locally, FAIL in strict
- [ ] Uniqueness check confirms exactly one tracked Sprint_plan.csv
- [ ] Multiple copies causes FAIL regardless of mode

### Artifact Path Enforcement
- [ ] Linter blocks runtime outputs under `apps/project-tracker/docs/**`
- [ ] Linter blocks runtime outputs under `apps/project-tracker/docs/artifacts/**`
- [ ] Swarm state files exist only in `artifacts/`:
  - [ ] `artifacts/blockers.json`
  - [ ] `artifacts/human-intervention-required.json`
- [ ] Committed artifacts in allowlist are validated

### Gate Selection and Execution
- [ ] Gate selection uses the deterministic algorithm (5.1.2)
- [ ] Only tool IDs from audit-matrix.yml are executed as gates
- [ ] Ad-hoc commands are NOT treated as gates

### Coverage Gate Verification
- [ ] Vitest config has hard `thresholds` defined (90% all categories)
- [ ] `thresholdAutoUpdate` is `false`
- [ ] Coverage gate actually fails when below threshold (tested)

### STOA Verdict Files
- [ ] Each STOA produces verdict file with required schema
- [ ] Verdicts reference executed tools and waivers

### CSV Governance
- [ ] Agents produce patch proposals, not direct edits
- [ ] Human approval flow exists for CSV changes
- [ ] Patch history logged

### Waiver System
- [ ] Required-but-disabled tools produce waiver records
- [ ] Waivers have expiry dates (max 30 days)
- [ ] Unapproved waivers block in strict mode (FAIL)

---

## What Success Looks Like

By the end of Sprint 0, every completion claim is supported by reproducible evidence:
- Deterministic gates ran (using audit-matrix.yml tool IDs ONLY)
- Gate selection algorithm is explicit and logged
- Artifacts are in canonical locations (`artifacts/` for runtime, `docs/metrics/` for committed state)
- Ownership is unambiguous (STOA assignment computed from task prefix)
- Each STOA produces a structured verdict file
- WARN/FAIL outcomes create structured follow-ups (review queue, debt ledger, or Needs Human packets)
- No silent drift between CSV, registry, task JSON, and runtime artifacts
- Required-but-disabled tools are tracked via waiver system (not silently skipped)
- CSV modifications follow proposal-based governance (human approval required)
- Coverage gates are provably enforcing thresholds (not just running tests)
