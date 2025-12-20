# IntelliFlow-CRM: Specialised Task Ownership Agent (STOA) Framework v4.2

**Integrated Governance for Sprint 0 and Beyond**

**Date:** December 20, 2025
**Project:** IntelliFlow-CRM
**Scope:** Governance model for day-to-day factory execution (swarm + tracker + audit/validation)
**Status:** Final (Sprint 0-ready, all ambiguities resolved)

---

## 0) Purpose and Non-Negotiables

The STOA framework assigns **deterministic ownership** to every task and defines **who must sign off what**, using evidence produced by your existing factory pipeline (Triad phases + Gatekeeper + Auditor).

### 0.1 Design Goals

- Prevent "responsibility diffusion" across parallel agents.
- Make completion claims **evidence-backed** and reproducible.
- Preserve the authority of deterministic gates (validation/audit matrix).
- Reduce drift between **CSV plan** -> **registry** -> **task status JSON** -> **runtime artifacts**.

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

### 1.2 Runtime Artifacts (Git-ignored, ephemeral)

| Category | Canonical Path | Examples |
|----------|----------------|----------|
| Logs | `artifacts/logs/` | swarm logs, task logs |
| Reports | `artifacts/reports/` | validation reports, audit evidence |
| Metrics | `artifacts/metrics/` | runtime metrics, benchmarks |
| Coverage | `artifacts/coverage/` | test coverage reports |
| Miscellaneous | `artifacts/misc/` | locks, heartbeats, temp files |
| Swarm State | `artifacts/blockers.json` | Blocked tasks requiring resolution |
| Swarm State | `artifacts/human-intervention-required.json` | Tasks needing human review |
| Qualitative Reviews | `artifacts/qualitative-reviews/` | Review outputs from swarm |

> **Note**: Swarm state files (`blockers.json`, `human-intervention-required.json`) are generated at runtime by the orchestrator, NOT versioned, and MUST reside in `artifacts/` (not under `docs/`).

#### 1.2.1 Artifacts Directory Versioning Policy

The `artifacts/` directory has a **structural commit, contents ignored** policy:

**What IS committed:**
- Directory structure (via `.gitkeep` files in each subdirectory)
- The `.gitignore` patterns that exclude contents

**What is NOT committed:**
- All runtime-generated files (logs, reports, coverage, etc.)
- Evidence bundles (`artifacts/reports/system-audit/<RUN_ID>/`)
- Swarm state files

**Validation requirement:**
- The artifact linter MUST check for ignored/untracked files using `git ls-files -o -i --exclude-standard`
- This catches "drift files" that exist locally but are not tracked

**Exceptions (must be explicit):**
- If any artifact content needs to be committed (e.g., a baseline benchmark), it must be:
  1. Added to an allowlist in `tools/lint/artifact-paths.ts`
  2. Documented in this section
  3. Have a clear retention policy

**Current allowed committed artifacts:** None (Sprint 0 default)

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
// From validation-utils.ts checkCanonicalUniqueness()
const matches = trackedFiles.filter(f => f.endsWith('/Sprint_plan.csv') || f === 'Sprint_plan.csv');
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
  - Validation includes any audit-matrix tool ID: `gitleaks`, `semgrep-security-audit`, `snyk`, `pnpm-audit-high`, `osv-scanner`, `trivy-image`, `codeql-analysis`, `owasp-zap`

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

A veto forces FAIL (or WARN->FAIL in strict contexts), independent of Builder confidence.

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
      // CRITICAL: This must be true for gate to actually fail
      thresholdAutoUpdate: false,
    },
  },
});
```

**Verification requirement**: Before a run is considered valid, the runner MUST verify that the coverage gate actually fails when coverage drops below threshold. This can be done by:

1. Checking that Vitest config has `thresholds` defined with hard values
2. Confirming no `thresholdAutoUpdate: true` (which silently adjusts targets)
3. Optionally running a "coverage canary" test that intentionally drops coverage and confirms exit code != 0

If coverage enforcement cannot be verified, the run MUST produce a WARN (or FAIL in strict mode) with reason: "coverage_threshold_not_enforced".

#### 5.1.2 Gate Selection Algorithm (Deterministic)

The runner MUST use this exact algorithm to determine which gates to execute:

```typescript
interface GateSelectionResult {
  execute: ToolId[];      // Tools to run
  waiver_required: ToolId[];  // Required but cannot run
  skipped: ToolId[];      // Not required, not running
}

function selectGates(task: Task, matrix: AuditMatrix, stoaProfiles: StoaProfile[]): GateSelectionResult {
  // Step 1: Baseline gates (always selected)
  const baseline = matrix.tools.filter(t => t.tier === 1 && t.category === 'baseline');

  // Step 2: STOA add-ons (derived from Lead + Supporting STOAs)
  const stoaAddons = stoaProfiles.flatMap(stoa => stoa.requiredToolIds);

  // Step 3: Union = selected gates for this task
  const selected = new Set([...baseline.map(t => t.id), ...stoaAddons]);

  // Step 4: Classify each selected gate
  const execute: ToolId[] = [];
  const waiver_required: ToolId[] = [];
  const skipped: ToolId[] = [];

  for (const toolId of selected) {
    const tool = matrix.getToolById(toolId);

    if (tool.enabled && canRun(tool)) {
      execute.push(toolId);
    } else if (tool.required) {
      waiver_required.push(toolId);  // Must create waiver record
    } else {
      skipped.push(toolId);  // Optional, not running
    }
  }

  return { execute, waiver_required, skipped };
}
```

**Key invariants:**
- Every tool in `waiver_required` MUST have a WaiverRecord created (see 5.4)
- Every tool in `execute` MUST have a gate transcript produced
- Every tool in `skipped` MUST be logged (but no waiver needed)
- The union of all three lists equals the selected gates

### 5.2 STOA-Specific Gate Add-ons (By Tool ID)

**Foundation STOA Add-ons:**
- Docker/compose validation: `docker compose config -q`
- Operational validation: `tools/scripts/validate-env.ts` (if exists)

**Domain STOA Add-ons:**
- Integration tests: `pnpm run test:integration`
- Schema validation: JSON schema checks via existing validators

**Intelligence STOA Add-ons:**
- AI unit tests: `pnpm --filter ai-worker test`
- Guardrail checks (prompt sanitization, output redaction tests)
- Evals hooks: latency/cost smoke benchmarks if defined

**Security STOA Add-ons (tool IDs from audit-matrix.yml):**

| Tool ID | Command | Status | Threshold |
|---------|---------|--------|-----------|
| `gitleaks` | `gitleaks detect --source . --redact` | Disabled (enable when installed) | findings_max: 0 |
| `pnpm-audit-high` | `pnpm audit --audit-level=high` | Disabled | max_high: 0, max_critical: 0 |
| `snyk` | `snyk test --severity-threshold=high` | Disabled (requires SNYK_TOKEN) | max_high: 0, max_critical: 0 |
| `semgrep-security-audit` | `semgrep --config=p/security-audit --error` | Disabled | max_findings: 0 |
| `trivy-image` | `trivy image --severity HIGH,CRITICAL --exit-code 1 intelliflow-crm:latest` | Disabled | max_high: 0, max_critical: 0 |
| `osv-scanner` | `osv-scanner -r .` | Disabled (Tier 2) | - |

> **Note**: Security tools are defined but `enabled: false` until standardized installation. When enabled, use EXACTLY the command from the matrix.

**Early-stage Trivy alternatives** (MANUAL PLAYBOOK ONLY - not part of Gatekeeper):

Before the container image build is deterministic, the following commands can be run manually for developer awareness. These are **NOT** automated gates and do **NOT** satisfy the `trivy-image` tool ID requirement:

```bash
# Filesystem scan (developer awareness only)
trivy fs . --severity HIGH,CRITICAL

# IaC config scan (developer awareness only)
trivy config . --severity HIGH,CRITICAL
```

To make these part of the Gatekeeper, add them to `audit-matrix.yml` as distinct tool IDs:
- `trivy-fs` (Tier 2, non-blocking during Sprint 0)
- `trivy-config` (Tier 2, non-blocking during Sprint 0)

**Quality STOA Add-ons:**

| Tool ID | Command | Status | Threshold |
|---------|---------|--------|-----------|
| `stryker` | `pnpm exec stryker run` | Disabled (Tier 2) | mutation_score_min: 80 |
| `lighthouse-ci` | `pnpm exec lighthouse-ci autorun` | Disabled (Tier 3) | performance_min: 90 |
| `sonarqube-scanner` | `node scripts/sonarqube-helper.js analyze` | Enabled (not required) | quality_gate: A |

**Automation STOA Add-ons:**
- Artifact path linting: `pnpm tsx tools/lint/artifact-paths.ts`
- Sprint validation: `pnpm run validate:sprint0`
- Data sync validation: `pnpm run validate:sprint-data`

### 5.3 Strict Mode Policy

- **Local default**: WARN does not fail the run.
- **CI/Release strict**: WARN is treated as FAIL unless explicitly waived.

Strict mode triggers:
- `VALIDATION_STRICT=1` environment variable
- `--strict` CLI flag on validators

This is already implemented in `tools/scripts/lib/validation-utils.ts`:
```typescript
export function isStrictMode(): boolean {
  const args = process.argv.slice(2);
  const hasFlag = args.includes('--strict') || args.includes('-s');
  const hasEnv = process.env.VALIDATION_STRICT === '1' || process.env.VALIDATION_STRICT === 'true';
  return hasFlag || hasEnv;
}
```

### 5.4 Waiver Governance for Required-but-Disabled Tools

When a tool is marked `required: true` in `audit-matrix.yml` but cannot run (because `enabled: false` or the tool is not installed), the framework MUST NOT silently skip the gate. Instead, a **Waiver Record** must be created.

#### 5.4.1 Waiver Record Structure

```typescript
interface WaiverRecord {
  toolId: string;                    // e.g., "gitleaks"
  reason: WaiverReason;              // enum of allowed reasons
  owner: string;                     // human who approved (or "pending")
  createdAt: string;                 // ISO 8601 timestamp
  expiresAt: string | null;          // ISO 8601 or null for permanent
  approved: boolean;                 // false until human approves
  strictModeBehavior: 'WARN' | 'FAIL';  // what happens in strict mode
}

type WaiverReason =
  | 'tool_not_installed'             // tool binary not found
  | 'env_var_missing'                // e.g., SNYK_TOKEN not set
  | 'known_false_positive'           // documented FP in this codebase
  | 'deferred_to_sprint_N'           // explicit deferral with target
  | 'infrastructure_not_ready';      // e.g., image not built for trivy
```

#### 5.4.2 Waiver Lifecycle

1. **Creation**: When a required tool cannot run, the runner creates a waiver record with `approved: false`
2. **Storage**: Waivers are stored in `artifacts/reports/system-audit/<RUN_ID>/waivers.json`
3. **Approval**: A human must approve the waiver (set `approved: true`) for the run to proceed
4. **Expiry**: Waivers MUST have an expiry date (max 30 days) unless marked permanent with justification

#### 5.4.3 Strict Mode Behavior

| Waiver State | Local Mode | Strict Mode (CI) |
|--------------|------------|------------------|
| `approved: true` | WARN | WARN (tool skipped, logged) |
| `approved: false` | WARN + halt for approval | FAIL |
| Expired waiver | WARN + halt for renewal | FAIL |

#### 5.4.4 Evidence Requirements

Every run summary MUST include:
- List of required tools that were skipped
- Corresponding waiver records (approved or pending)
- Warning if any waivers are within 7 days of expiry

This prevents "green but misleading" outcomes where security gates appear to pass but were never actually run.

---

## 6) Verdicts and Status Mapping

STOA verdicts must map to canonical tracker states to prevent ambiguity.

### 6.1 Verdict Types

| Verdict | Meaning |
|---------|---------|
| **PASS** | Meets DoD; all required gates pass; no unresolved semantic concerns |
| **WARN** | Meets DoD but with caveats (minor debt, non-blocking risk, or deferred gate with waiver) |
| **FAIL** | Does not meet DoD; gates failed; or STOA veto |
| **NEEDS HUMAN** | A subtype of FAIL indicating human intervention is required to unblock |

### 6.2 Canonical Status Mapping

| STOA Verdict | CSV Status | Tracker Action |
|--------------|------------|----------------|
| PASS | `Completed` | Close review queue items for task |
| WARN | `Completed` | Create/append Review Queue entry + optional Debt Ledger entry |
| FAIL | `Blocked` or `In Progress` | Create/append Review Queue item with "blocking" flag |
| NEEDS HUMAN | `Needs Human` | Produce Human Packet and halt retries |

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

**Optional (post-Sprint 0):**
- Add `cosign`/GPG signing for releases only (tool ID: `cosign` in Tier 3)

### 8.2 Evidence Bundle Structure

```
artifacts/reports/system-audit/<RUN_ID>/
  summary.json          # Machine-readable run summary
  summary.md            # Human-readable run summary
  evidence-hashes.txt   # SHA256 hashes of all artifacts
  gates/
    turbo-typecheck.log
    turbo-build.log
    eslint.log
    ...
  task-updates/
    <TASK_ID>.json      # Copy of updated task status
```

### 8.3 Forbidden Runtime Locations

The following paths are **unconditionally forbidden** for runtime artifacts (enforced by `tools/lint/artifact-paths.ts`):

```
# Under docs/metrics/ (metrics infrastructure) - ALWAYS FORBIDDEN
apps/project-tracker/docs/metrics/.locks/**/*
apps/project-tracker/docs/metrics/.status/**/*
apps/project-tracker/docs/metrics/logs/**/*
apps/project-tracker/docs/metrics/backups/**/*
apps/project-tracker/docs/metrics/artifacts/**/*
apps/project-tracker/docs/metrics/**/*.lock
apps/project-tracker/docs/metrics/**/*.heartbeat
apps/project-tracker/docs/metrics/**/*.input
apps/project-tracker/docs/metrics/**/*.bak

# Generic runtime state under docs/ - ALWAYS FORBIDDEN
apps/**/docs/**/*.tmp
apps/**/docs/**/*.cache
apps/**/docs/**/blockers.json
apps/**/docs/**/human-intervention-required.json
```

### 8.4 Policy-Pending Locations (Transition State)

The following paths are in a **defined transition state** with explicit behavior until a decision is made:

#### 8.4.1 `apps/project-tracker/docs/artifacts/` (DECISION: December 31, 2025)

**Current status**: Policy pending - files here trigger WARN (local) or FAIL (strict) until resolved.

**Transition behavior:**

| Mode | Before Decision Date | After Decision Date |
|------|---------------------|---------------------|
| Local | WARN + message | FAIL (if no decision) |
| Strict/CI | FAIL | FAIL |

**Decision options:**

1. **Option A (RECOMMENDED): Declare forbidden**
   - Confirm in `.gitignore`
   - Move any existing content to `artifacts/`
   - Add to forbidden list (8.3)
   - Remove this section

2. **Option B: Declare as committed control-plane state**
   - Remove from `.gitignore`
   - Add to Canonical File Locations (Section 1.1)
   - Define JSON schema for structured files
   - Add to validation scope
   - Remove this section

**Linter message**: "docs/artifacts path policy pending - decision required by 2025-12-31"

### 8.5 Allowlist (Source Documentation)

- `apps/**/docs/**` for markdown/reference docs
- `apps/project-tracker/docs/metrics/_global/**` for canonical plan/registry (unique, committed)
- `apps/project-tracker/docs/metrics/sprint-0/**` for task status files (committed)
- `apps/project-tracker/docs/metrics/schemas/**` for JSON schemas (committed)

---

## 9) Cross-Platform Execution (Windows + Unix)

### 9.1 Design Principle

All gate execution and transcript capture MUST be handled by **Node.js/TypeScript**, not shell pipelines. This ensures Windows PowerShell compatibility.

### 9.2 Runner Implementation

Use `child_process.spawn()` or `execa` for command execution:

```typescript
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';

async function runGate(toolId: string, command: string, logPath: string): Promise<GateResult> {
  const logStream = createWriteStream(logPath);

  return new Promise((resolve) => {
    const proc = spawn(command, { shell: true, cwd: repoRoot });

    proc.stdout.pipe(logStream);
    proc.stderr.pipe(logStream);

    proc.on('close', (code) => {
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

---

## 11) Implementation Steps (Sprint 0-safe)

### 11.1 Phase 1: Preflight Checks

Before running any gates, verify:

1. **Required tools exist** - Check each enabled tool in audit-matrix.yml is installed
2. **Canonical paths resolve** - Print resolved Sprint_plan.csv path
3. **Environment variables set** - Check `requires_env` for each tool

```typescript
function preflight(matrix: AuditMatrix): PreflightResult {
  const missingTools: string[] = [];
  const missingEnv: string[] = [];

  for (const tool of matrix.tools.filter(t => t.enabled)) {
    if (!commandExists(tool.command.split(' ')[0])) {
      missingTools.push(tool.id);
    }
    for (const env of tool.requires_env ?? []) {
      if (!process.env[env]) {
        missingEnv.push(`${tool.id}:${env}`);
      }
    }
  }

  return { missingTools, missingEnv };
}
```

### 11.2 Phase 2: STOA Assignment

1. Parse task from CSV
2. Determine Lead STOA from prefix
3. Derive Supporting STOAs from keywords and impact surface
4. Record assignment in run summary

### 11.3 Phase 3: Gate Execution

1. Select tool IDs based on STOA gate profiles
2. Execute each tool using audit-matrix command EXACTLY
3. Capture stdout/stderr to `artifacts/reports/system-audit/<RUN_ID>/gates/<tool_id>.log`
4. Record exit code and pass/fail status

### 11.4 Phase 4: Evidence Generation

1. Generate SHA256 hashes for all artifacts
2. Write `evidence-hashes.txt`
3. Write `summary.json` and `summary.md`

### 11.5 Phase 5: STOA Sign-off and CSV Governance

1. Lead STOA reviews evidence and produces verdict
2. Supporting STOAs confirm or veto
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
  proposedBy: string;              // agent identifier
  changes: CsvRowChange[];
  rationale: string;               // why this change is proposed
  evidenceRefs: string[];          // paths to supporting evidence
}

interface CsvRowChange {
  taskId: string;
  field: string;                   // e.g., "Status"
  oldValue: string;
  newValue: string;
}
```

**Acceptable automation (controlled endpoints):**
- The tracker app MAY have a controlled API endpoint that:
  - Validates the patch against evidence
  - Requires authentication
  - Logs the change with audit trail
  - Triggers sync to derived files (JSON, registry)

**Forbidden:**
- Agents directly editing `Sprint_plan.csv` via file write
- Silent status changes without evidence reference
- Batch updates without individual patch records

---

## 12) STOA DoD (Definition of Done) for Every Task

A task is eligible for completion only when:

1. **Deterministic gates executed** per the task's gate profile (baseline + STOA add-ons from audit-matrix.yml)
2. **Artifacts present** and referenced:
   - Gate transcripts in `artifacts/reports/system-audit/<RUN_ID>/gates/`
   - Any generated reports
   - Updated task status JSON (with status history)
3. **Evidence hashes recorded** (`evidence-hashes.txt`) and included in summary JSON
4. **Lead STOA verdict recorded** (PASS/WARN/FAIL) with rationale
5. **All Supporting STOAs sign off** or a waiver is recorded (with expiry)
6. If WARN: review-queue entry exists with owner and due date
7. If NEEDS HUMAN: Human Packet exists and retry halts

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

## Appendix D: Acceptance Criteria for v4.2 Rollout

Before implementing this framework, verify the following checklist:

### Evidence Bundle Completeness
- [ ] Every run produces `artifacts/reports/system-audit/<RUN_ID>/` with:
  - [ ] `summary.json` with resolved canonical paths printed
  - [ ] `evidence-hashes.txt` with SHA256 for all artifacts
  - [ ] `waivers.json` for any required-but-disabled tools
  - [ ] `csv-patch-proposal.json` for any status change proposals
  - [ ] `gate-selection.json` with execute/waiver_required/skipped lists

### Path Resolution and Uniqueness
- [ ] Runner prints resolved Sprint_plan.csv path on startup
- [ ] Root fallback (`Sprint_plan.csv` at root) triggers WARN locally, FAIL in strict
- [ ] Uniqueness check confirms exactly one tracked `Sprint_plan.csv`
- [ ] Multiple copies causes FAIL regardless of mode

### Artifact Path Enforcement
- [ ] `tools/lint/artifact-paths.ts` blocks runtime outputs under:
  - [ ] `apps/project-tracker/docs/metrics/**` (forbidden subpaths)
  - [ ] `apps/project-tracker/docs/artifacts/**` triggers WARN (policy pending)
- [ ] Linter uses `git ls-files -o -i --exclude-standard` to catch drift files
- [ ] Swarm state files exist only in `artifacts/`:
  - [ ] `artifacts/blockers.json`
  - [ ] `artifacts/human-intervention-required.json`
- [ ] Artifacts directory structure committed (`.gitkeep`), contents ignored

### Coverage Gate Verification
- [ ] Vitest config has hard `thresholds` defined (90% all categories)
- [ ] `thresholdAutoUpdate` is `false` (not auto-adjusting)
- [ ] Coverage gate actually fails when below threshold (tested)

### Gate Selection Algorithm
- [ ] Gate selection uses the deterministic algorithm (5.1.2)
- [ ] Every selected gate classified as: execute, waiver_required, or skipped
- [ ] Result logged in evidence bundle

### CSV Governance
- [ ] Agents produce patch proposals, not direct edits
- [ ] Human approval flow exists for CSV changes
- [ ] Patch history logged in `csv-patch-history.jsonl`

### Waiver System
- [ ] Required-but-disabled tools produce waiver records
- [ ] Waivers have expiry dates (max 30 days)
- [ ] Unapproved waivers block in strict mode (FAIL)
- [ ] Expired waivers require renewal

### Manual Playbook Items (Not Gatekeeper)
- [ ] Trivy fs/config commands clearly marked as developer awareness only
- [ ] If needed as gates, distinct tool IDs added to audit-matrix.yml

---

## What Success Looks Like

By the end of Sprint 0, every completion claim is supported by reproducible evidence:
- Deterministic gates ran (using audit-matrix.yml tool IDs)
- Artifacts are in canonical locations (`artifacts/` for runtime, `docs/metrics/` for committed state)
- Ownership is unambiguous (STOA assignment computed from task prefix)
- WARN/FAIL outcomes create structured follow-ups (review queue, debt ledger, or Needs Human packets)
- No silent drift between CSV, registry, task JSON, and runtime artifacts
- Required-but-disabled tools are tracked via waiver system (not silently skipped)
- CSV modifications follow proposal-based governance (human approval required)
- Coverage gates are provably enforcing thresholds (not just running tests)
