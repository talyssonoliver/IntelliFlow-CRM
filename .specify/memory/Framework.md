# IntelliFlow-CRM: STOA Framework — Governance Reference

**Status:** Active
**Version:** v5.0 (binary-gate policy)
**Last updated:** 2026-04-09
**Replaces:** `artifacts/sprint0/codex-run/Framework.md` v4.3 FINAL (deleted in commit `ea020464`, 2026-01-29)

---

## 0) How this document is used

This file is the **governance reference** for the IntelliFlow-CRM task factory. It is:

1. A **required prerequisite** (`FILE:.specify/memory/Framework.md`) for every task in `Sprint_plan.csv` — ~333 rows declare it in their `Pre-requisites` column.
2. The **specification source** for code under `tools/scripts/lib/stoa/*`, which cites section numbers from this document (`gate-selection.ts §5.1.2`, `stoa-assignment.ts §3`, `evidence.ts §8`, etc.).
3. Ingested by the **context pack builder** (`tools/scripts/lib/context-pack-builder.ts`) as an excerpt for every task run.

**Day-to-day execution uses skills, not this document.** The operational framework is the triad of Claude Code skills:

| Skill | Phase | Purpose |
|---|---|---|
| [`/spec-session`](../../.claude/skills/spec-session/SKILL.md) | 1 — Specification | Multi-round parallel sub-agent specification with PRD/ADR governance |
| [`/plan-session`](../../.claude/skills/plan-session/SKILL.md) | 2 — TDD Plan | Decomposes acceptance criteria into RED-GREEN-REFACTOR steps |
| [`/exec`](../../.claude/skills/exec/SKILL.md) | 3 — Execute + validate | TDD implementation, gates, attestation, metrics |

**This document defines the contracts those skills enforce.** If you need to know *how* to run a phase, read the skill. If you need to know *why* a rule exists or *what* invariant it enforces, read this file.

---

## 1) Non-Negotiables

1. **Gatekeeper is final** — a task cannot ship if deterministic gates fail, regardless of any verdict above them.
2. **Evidence-first** — every verdict must reference artifacts, gate transcripts, and SHA256 hashes.
3. **Determinism** — STOA ownership, supporting sign-offs, and gate profiles must be computable from task metadata alone.
4. **Separation of concerns** — runtime outputs never live inside source documentation directories (`docs/**`, `apps/**/docs/**`).
5. **Single source of truth** — `Sprint_plan.csv` at its canonical location is authoritative; all other files derive from it.
6. **Binary gates** — every gate is `PASS` / `FAIL` / `NEEDS_HUMAN`. There is no `WARN`. No `SKIP`. No partial credit.

---

## 2) Canonical File Locations

### 2.1 Source-of-truth files (Git-tracked)

| File | Canonical Path | Purpose |
|---|---|---|
| Sprint Plan CSV | `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv` | Single source of truth for all tasks |
| Sprint Plan JSON | `apps/project-tracker/docs/metrics/_global/Sprint_plan.json` | Derived from CSV |
| Task Registry | `apps/project-tracker/docs/metrics/_global/task-registry.json` | Central status tracking |
| Task Status Files | `apps/project-tracker/docs/metrics/sprint-{N}/phase-*/*.json` | Per-task execution details |
| Phase Summaries | `apps/project-tracker/docs/metrics/sprint-{N}/phase-*/_phase-summary.json` | Aggregated phase metrics |
| Sprint Summary | `apps/project-tracker/docs/metrics/sprint-{N}/_summary.json` | Sprint-level aggregation |
| JSON Schemas | `apps/project-tracker/docs/metrics/schemas/*.schema.json` | Validation schemas |
| Audit Matrix | `audit-matrix.yml` (repo root) | Canonical tool definitions |
| **This document** | `.specify/memory/Framework.md` | Governance reference |

### 2.2 Per-task evidence (sprint-scoped)

```
.specify/sprints/sprint-{N}/attestations/{TASK_ID}/
├── context_pack.md
├── context_pack.manifest.json
├── context_ack.json
├── attestation.json
└── task-status.json
```

**Path contract:** attestation files live under `attestations/{TASK_ID}/`, NOT under `execution/{run_id}/`. The integrity checker only scans `attestations/`.

**Filename contract:** `context_ack.json` — plain filename, NO `{TASK_ID}-` prefix. The gatekeeper (`context-ack-gatekeeper.ts`) treats prefixed filenames as "wrong filename" errors.

### 2.3 Runtime artifacts (git-ignored)

| Category | Path |
|---|---|
| Swarm state | `artifacts/blockers.json`, `artifacts/human-intervention-required.json` |
| Evidence bundles | `artifacts/reports/system-audit/<RUN_ID>/` |
| Logs | `artifacts/logs/` |
| Coverage | `artifacts/coverage/` |
| Contract transcripts | `artifacts/reports/contract/<run_id>/<task_id>/` |
| Deprecation plans | `artifacts/reports/deprecation/<run_id>/` |

### 2.4 Forbidden runtime locations

```
apps/project-tracker/docs/metrics/.locks/**/*
apps/project-tracker/docs/metrics/.status/**/*
apps/project-tracker/docs/metrics/logs/**/*
apps/project-tracker/docs/metrics/backups/**/*
apps/project-tracker/docs/metrics/artifacts/**/*
apps/project-tracker/docs/metrics/**/*.lock
apps/project-tracker/docs/metrics/**/*.bak
apps/**/docs/**/*.tmp
apps/**/docs/**/*.cache
apps/**/docs/**/blockers.json
```

Enforced by `tools/lint/artifact-paths.ts`.

### 2.5 Path resolution fallback policy

| Resolved Path | Local Mode | Strict Mode (CI) |
|---|---|---|
| Canonical (`_global/Sprint_plan.csv`) | PASS | PASS |
| Root fallback (`Sprint_plan.csv`) | FAIL | FAIL |
| Neither found | FAIL | FAIL |
| Multiple tracked copies | FAIL | FAIL |

---

## 3) STOA Roles and Assignment

### 3.1 STOA Categories

| STOA | Mandate | Scope |
|---|---|---|
| **Foundation** | Infra, tooling, CI, environments | docker, CI configs, monorepo tooling, secrets plumbing, env bootstrap |
| **Domain** | Business/domain correctness, API/data model | tRPC routes, domain packages, DB schema, invariants |
| **Intelligence** | AI/ML, chains/agents, safety, evals | ai-worker, prompts, embeddings, scoring chains, LLM usage |
| **Security** | Threat model, secrets, SAST/SCA/DAST | authn/authz, secret scanning, vulns, container/IaC posture |
| **Quality** | Test strategy, coverage, regressions | unit/integration/e2e, lint, typecheck, mutation, quality metrics |
| **Automation** | Factory mechanics, orchestration, evidence | orchestrator, swarm, tracker, validation rules, artifact contracts |

A STOA is an **owner** role, not an implementer. Implementation is done by Builder agents; STOAs review and sign.

### 3.2 Lead STOA by Task ID Prefix (deterministic)

| Prefix | Lead STOA | Notes |
|---|---|---|
| `ENV-*`, `ENV-*-AI` | Foundation | environment/tooling bootstrap, CI, monorepo wiring |
| `EP-*` | Foundation | EasyPanel / internal infrastructure |
| `AUTOMATION-*` | Automation | orchestrator / swarm / tracker / audit |
| `AI-*`, `AI-SETUP-*` | Intelligence | AI foundation, runtime features |
| `EXC-SEC-*`, `SEC-*` | Security | explicit security epics/exceptions |
| `EXC-INIT-*` | Automation | sprint initialization/exception tasks |
| `IFC-*` | Domain | product/domain features (default) |
| `PG-*` | Quality | page/UI implementations — UI pages are Quality-led for a11y, Lighthouse perf, and test coverage. Domain is Supporting for data flows. |
| `DOC-*` | Automation | documentation automation, doc tooling |
| `BRAND-*` | Domain | brand/design artifacts |
| `GTM-*`, `SALES-*` | Domain | go-to-market, sales enablement |
| `PM-OPS-*`, `ENG-OPS-*` | Automation | project/engineering operations |
| `GOV-*` | Automation | governance, compliance, policy |
| `ANALYTICS-*` | Intelligence | analytics, metrics, data products |

**Override mechanism:** `plan-overrides.yaml` may declare a Lead STOA override for a Task ID; overrides must include justification and expiry.

### 3.3 Supporting STOA Derivation

Supporting STOAs are derived mechanically from task metadata and the impact surface.

**Inputs (in priority order):**
1. Task ID prefix (Lead STOA)
2. Task Section / Description / DoD keywords
3. Dependencies (task graph from CSV)
4. File/path impact surface (from diff or declared "affected areas")
5. Validation requirements (audit-matrix tool IDs)

**Derivation rules:**
- **Security Supporting** if task touches auth, middleware/auth, tokens, secrets, RBAC, permissions, rate limiting, or public endpoints
- **Quality Supporting** if task modifies tests, coverage thresholds, CI gates, or lint/typecheck configurations
- **Foundation Supporting** if task touches `infra/**`, docker compose, deployment scripts, GitHub Actions, environment variables, or observability stack
- **Intelligence Supporting** if task touches `apps/ai-worker/**`, prompts/chains, embeddings, scoring, model providers, or eval hooks
- **Domain Supporting** if task touches `apps/api/**`, `packages/domain/**`, DB contracts, or user-facing data flows

All derived supporting STOAs must sign off unless waived with reason and expiry.

### 3.4 STOA Verdict Contract

Every STOA produces a verdict file:

**Path:** `.specify/sprints/sprint-{N}/attestations/{TASK_ID}/stoa-verdicts/{STOA}.json`
**Schema:**
```typescript
interface StoaVerdict {
  stoa: string;                    // "Foundation" | "Domain" | ...
  taskId: string;
  verdict: 'PASS' | 'FAIL' | 'NEEDS_HUMAN';
  rationale: string;
  toolIdsSelected: string[];       // From gate selection
  toolIdsExecuted: string[];       // Actually ran
  waiversProposed: string[];       // Tool IDs needing waiver
  findings: Finding[];
  timestamp: string;               // ISO 8601
}

interface Finding {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  source: string;                  // Tool ID or manual review
  message: string;
  recommendation: string;
}
```

**Note:** `Severity` on Findings is a separate concept from the binary `verdict`. Findings may be informational; verdicts are binary.

---

## 4) MATOP — Multi-Agent Task Ownership Protocol

### 4.1 Phases (mapped to skills)

| Phase | Owner | Skill | Output |
|---|---|---|---|
| 1. Specification | Architect | `/spec-session` | `spec.md` + `context_ack.json` precursor |
| 2. Plan | Architect | `/plan-session` | `plan.md` with TDD RED-GREEN-REFACTOR steps |
| 3. Execute | Builder | `/exec` | Code + tests + `attestation.json` |
| 4. Gatekeeper | Gatekeeper | `/exec` Phase 4 + `/exec-gates` | Gate transcripts + `gate-selection.json` |
| 5. Audit | Auditor | STOA sub-agents | STOA verdict files |
| 6. Sign-off | Lead STOA | `/exec` Phase 5 + `/exec-attestation` | Final `attestation.json` with verdict |

### 4.2 STOA Sign-off Sequencing

- Lead STOA produces a draft verdict after Gatekeeper results are available.
- Supporting STOAs either **Agree**, **Veto** (semantic failure → FAIL), or **Escalate** (`NEEDS_HUMAN`).
- A veto forces FAIL independent of Builder confidence.

---

## 5) Gate Profiles

**CRITICAL:** STOAs do not invent checks. They select tool IDs from `audit-matrix.yml` and enforce the documented commands and thresholds.

### 5.1 Baseline Gates (Tier 1 — Always Required, Non-Waivable)

| Tool ID | Command | Threshold |
|---|---|---|
| `turbo-typecheck` | `pnpm run typecheck` | Exit 0 |
| `turbo-build` | `pnpm run build` | Exit 0 |
| `turbo-test-coverage` | `pnpm exec turbo run test:coverage` | Statements ≥90, Branches ≥80, Functions ≥90, Lines ≥90 |
| `eslint-max-warnings-0` | `pnpm exec eslint --max-warnings=0 .` | `max_warnings: 0` |
| `prettier-check` | `pnpm run format:check` | Exit 0 |
| `commitlint` | `python tools/audit/commit_msg_lint.py --count 20` | Exit 0 |

### 5.2 Coverage Threshold Enforcement

The `turbo-test-coverage` gate enforces thresholds only if Vitest fails the process when coverage is below threshold.

**Required configuration:**
```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    coverage: {
      provider: 'istanbul',         // NOT v8 — see CLAUDE.md Coverage Architecture
      thresholds: {
        statements: 90,
        branches: 80,
        functions: 90,
        lines: 90,
      },
      thresholdAutoUpdate: false,   // CRITICAL
    },
  },
});
```

If coverage enforcement cannot be verified, the run FAILs with reason `coverage_threshold_not_enforced`.

### 5.3 Gate Selection Algorithm (Deterministic)

```typescript
interface GateSelectionResult {
  execute: string[];
  waiverRequired: string[];
  skipped: string[];
}

function selectGates(
  task: Task,
  matrix: AuditMatrix,
  derivedStoas: string[]
): GateSelectionResult {
  // Step 1: Baseline = Tier 1 tools marked as required
  const baseline = matrix.tools.filter(t => t.tier === 1 && t.required === true);

  // Step 2: STOA add-ons from derived STOAs (union by owner/stoas field)
  const stoaAddons = derivedStoas.flatMap(stoa =>
    matrix.tools.filter(t => t.owner === stoa || t.stoas?.includes(stoa)).map(t => t.id)
  );

  // Step 3: Union
  const selectedIds = new Set<string>([
    ...baseline.map(t => t.id),
    ...stoaAddons,
  ]);

  // Step 4: Classify
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
```

**Invariants:**
- Every tool in `waiverRequired` MUST have a `WaiverRecord` created
- Every tool in `execute` MUST have a gate transcript produced
- Every tool in `skipped` MUST be logged (no waiver needed)
- Union of all three lists equals the selected gates

### 5.4 STOA-Specific Gate Add-ons

Defined in `audit-matrix.yml` via `owner` or `stoas` field:

| STOA | Tool IDs |
|---|---|
| **Foundation** | `docker-compose-validate`, `validate-env` |
| **Domain** | `test-integration` |
| **Intelligence** | `ai-worker-test` |
| **Security** | `gitleaks`, `pnpm-audit-high`, `snyk`, `semgrep-security-audit`, `trivy-image`, `osv-scanner` |
| **Quality** | `stryker`, `lighthouse-ci`, `sonarqube-scanner` |
| **Automation** | `artifact-paths-lint`, `sprint-validation`, `sprint-data-validation` |

If a command is not in `audit-matrix.yml`, it is NOT a gate.

### 5.5 Waiver Governance

When a tool is `required: true` but cannot run (disabled or uninstalled), a **Waiver Record** must be created:

```typescript
interface WaiverRecord {
  toolId: string;
  reason: 'tool_not_installed' | 'env_var_missing' | 'known_false_positive'
        | 'deferred_to_sprint_N' | 'infrastructure_not_ready';
  owner: string;                 // Human approver or "pending"
  createdAt: string;             // ISO 8601
  expiresAt: string | null;      // Max 30 days unless marked permanent
  approved: boolean;             // false until human approves
  strictModeBehavior: 'FAIL';    // Binary — no WARN
}
```

**Lifecycle:**
1. Runner creates record with `approved: false`
2. Stored in `.specify/sprints/sprint-{N}/attestations/{TASK_ID}/waivers.json`
3. Human sets `approved: true`
4. Expired waivers → FAIL

Waiver state → behavior:
- `approved: true` → gate skipped, logged
- `approved: false` → FAIL
- Expired → FAIL

---

## 6) Verdicts and Status Mapping

### 6.1 Verdict Types (Binary Policy)

| Verdict | Meaning |
|---|---|
| **PASS** | Meets DoD; all required gates pass; no unresolved semantic concerns |
| **FAIL** | Does not meet DoD; gates failed; or STOA veto |
| **NEEDS_HUMAN** | Subtype of FAIL indicating human intervention required |

**WARN does not exist.** The TypeScript types `VerdictType` and `MatopVerdict` only accept `'PASS' | 'FAIL' | 'NEEDS_HUMAN'`.

### 6.2 Canonical Status Mapping

| STOA Verdict | CSV Status | Tracker Action |
|---|---|---|
| PASS | `Completed` | Close review queue items |
| FAIL | `Blocked` or `In Progress` | Append review queue item with blocking flag |
| NEEDS_HUMAN | `Needs Human` | Produce Human Packet, halt retries |

### 6.3 Attestation Field Contract (CRITICAL)

`attestation.json` uses field name `"verdict"` — **NOT** `"status"`. The CSV column is "Status" but the attestation schema field is `"verdict"`. This mismatch has caused 14+ prior integrity failures (PG-161 lesson, 2026-03-11).

```json
{
  "verdict": "COMPLETE",           // NOT "status": "Completed"
  "validation_results": [
    { "name": "typecheck", "command": "...", "exit_code": 0, "passed": true, "timestamp": "..." },
    { "name": "tests",    "command": "...", "exit_code": 0, "passed": true, "timestamp": "..." },
    { "name": "lint",     "command": "...", "exit_code": 0, "passed": true, "timestamp": "..." },
    { "name": "build",    "command": "...", "exit_code": 0, "passed": true, "timestamp": "..." }
  ],
  "artifact_hashes": { "...": "sha256:..." },
  "dependencies_verified": ["..."],
  "gate_results": { "...": "PASS" },
  "kpi_results": { "...": { "actual": "...", "target": "..." } },
  "notes": "...",
  "evidence_summary": "..."
}
```

`validation_results` MUST have exactly **4 entries** (TypeScript, Tests, Lint, **Build**). Skipping Build is not valid — "Next.js compiles on demand" is NOT an acceptable reason.

---

## 7) Escalation and Unlock Protocol

### 7.1 Escalation Triggers (→ `NEEDS_HUMAN`)

- Gatekeeper fails repeatedly (retry loop exhausted)
- Evidence conflicts (e.g., CSV says Planned but status JSON says Completed)
- Security-sensitive uncertainty (authn/authz, secret exposure, data loss risk)
- Tooling misconfigured and cannot produce reliable results

### 7.2 Human Packet Contents

A Human Packet must include:
- Failing command(s) and exit codes
- Last 200 lines of relevant logs (or path to log file)
- Minimal reproduction steps
- Suspected root cause
- Safe rollback suggestion (if applicable)
- Recommended next attempt (prompt/spec tweak)

### 7.3 Unlock Contract

Unlock creates a new `RUN_ID`, links previous run artifacts, and carries forward waivers and open review items. It does NOT wipe evidence.

---

## 8) Evidence Integrity

### 8.1 Hash-Backed Integrity

For every run:
- Generate SHA256 for the run summary (JSON), validation transcripts, and key produced artifacts
- Store in `artifacts/reports/system-audit/<RUN_ID>/evidence-hashes.txt`
- Include hashes in the run summary JSON

### 8.2 Evidence Bundle Structure

```
artifacts/reports/system-audit/<RUN_ID>/
├── summary.json
├── summary.md
├── evidence-hashes.txt
├── gate-selection.json
├── waivers.json
├── csv-patch-proposal.json
├── stoa-verdicts/
│   ├── Foundation.json
│   ├── Domain.json
│   ├── Security.json
│   └── ...
├── gates/
│   ├── turbo-typecheck.log
│   ├── turbo-build.log
│   └── ...
└── task-updates/
    └── <TASK_ID>.json
```

---

## 9) Cross-Platform Execution

All gate execution MUST use Node.js `spawn`, not shell pipelines. This ensures Windows PowerShell compatibility. Paths must be normalized to forward slashes.

```typescript
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';

async function runGate(toolId: string, command: string, logPath: string, repoRoot: string) {
  const logStream = createWriteStream(logPath);
  return new Promise((resolve) => {
    const proc = spawn(command, { shell: true, cwd: repoRoot });
    proc.stdout?.pipe(logStream);
    proc.stderr?.pipe(logStream);
    proc.on('close', (code) => {
      logStream.end();
      resolve({ toolId, exitCode: code ?? 1, logPath, passed: code === 0 });
    });
  });
}
```

---

## 10) Human vs Agent Responsibilities

### 10.1 Human (non-delegable)

- Approve/adjust the CSV plan
- Approve waivers
- Manage secrets and credentials
- Resolve `NEEDS_HUMAN` escalations
- Decide merge/release when uncertain

### 10.2 Agent (delegable)

- Produce specs/tests/implementation
- Run deterministic gates, capture transcripts
- Generate evidence bundles and hashes
- Create review-queue entries and debt ledger entries
- Propose waivers with rationale
- Propose CSV patches (human applies)

---

## 11) CSV Modification Governance

The CSV is **source of truth** under **human governance**. Agents MUST NOT directly modify it.

### 11.1 Agent workflow (proposal-based)

1. Agent produces a **CSV Patch Proposal** as a structured diff
2. Stored in `artifacts/reports/system-audit/<RUN_ID>/csv-patch-proposal.json`
3. Human reviews and applies the patch (or rejects)
4. Applied patches logged in `artifacts/reports/csv-patch-history.jsonl`

### 11.2 Proposal schema

```typescript
interface CsvPatchProposal {
  runId: string;
  taskId: string;
  proposedAt: string;              // ISO 8601
  proposedBy: string;              // Agent identifier
  changes: CsvRowChange[];
  rationale: string;
  evidenceRefs: string[];
}

interface CsvRowChange {
  taskId: string;
  field: string;                   // e.g., "Status"
  oldValue: string;
  newValue: string;
}
```

### 11.3 Forbidden

- Direct edits to `Sprint_plan.csv` via file write
- Silent status changes without evidence
- Batch updates without individual patch records

---

## 12) Task Definition of Done

A task is eligible for completion only when:

1. **Deterministic gates executed** per the task's gate profile (baseline + STOA add-ons from `audit-matrix.yml`)
2. **Gate selection logged** in `gate-selection.json`
3. **Artifacts present:**
   - Gate transcripts in `artifacts/reports/system-audit/<RUN_ID>/gates/`
   - STOA verdict files in `stoa-verdicts/`
   - Updated task status JSON with history
4. **Evidence hashes recorded** in `evidence-hashes.txt` and summary JSON
5. **Lead STOA verdict** recorded (PASS/FAIL/NEEDS_HUMAN) with rationale
6. **All Supporting STOAs** sign off or waiver recorded with expiry
7. **Plan checkboxes 100% checked** (IFC-183 lesson: incrementally during Phase 2, NOT in bulk at the end)
8. **`attestation.json` uses `verdict`, not `status`** (PG-161 lesson)
9. **`validation_results` has all 4 entries** — TypeScript, Tests, Lint, Build
10. If NEEDS_HUMAN: Human Packet exists and retries halt

---

## 13) 11 Gates (Current Binary Policy)

Tracked in `tools/scripts/sprint-validation.ts` and `.claude/skills/exec-gates/`:

| # | Gate | Enforcement |
|---|---|---|
| 1 | Plan Checkboxes | 100% PASS / <100% BLOCK |
| 2 | Artifact Verification | All plan deliverables exist |
| 2b | Import Reachability | Runtime code is actually wired |
| 2d | Shared Component Reuse | No functional duplicates of shared components |
| 3c | Dead Code Check | No unreferenced code added |
| — | CSV Reconcile | CSV status matches task JSON |
| — | Build | Exit 0 on `pnpm run build` |
| — | STOA Pass | All required STOAs PASS |
| 5 | Container Registration | Services actually wired in `container.ts` + `context.ts` |
| 6 | Mock Coverage Audit | No silent mock fallbacks masking broken services |
| — | Coverage Measurement | Actual V8 percentages, not "N tests passing" |

Runtime validation gates (added post-IFC-086):
- **Dependency Deep Verification** (plan / spec-session)
- **Container Registration** (exec Phase 2.5 / exec-gates Gate 5)
- **Smoke Test** (exec Phase 4.3)
- **Attestation Forensics** (compliance-check §6)
- **Mock Coverage Audit** (compliance-check §7 / exec-gates Gate 6)

---

## Appendix A — Deterministic Keyword Triggers

**Security triggers (DoD/description keywords):**
```
auth, jwt, token, session, rbac, permissions, secret, vault, rate-limit, csrf, xss, injection
```

**Intelligence triggers:**
```
prompt, agent, chain, embedding, vector, scoring, llm, ollama, openai, langchain, crewai
```

**Quality triggers:**
```
coverage, e2e, playwright, vitest, mutation, stryker, quality gate, sonarqube
```

**Foundation triggers:**
```
docker, compose, ci, workflow, env, tooling, monorepo, turbo, pnpm, deployment
```

---

## Appendix B — Audit Matrix Tool ID Reference

Defined in `audit-matrix.yml`.

**Tier 1 (Blockers):**
- `turbo-typecheck`, `turbo-build`, `turbo-test-coverage`
- `eslint-max-warnings-0`, `prettier-check`, `commitlint`
- `sonarqube-scanner`, `sonarqube-quality-gate`
- `gitleaks`, `pnpm-audit-high`, `snyk`, `trivy-image`, `semgrep-security-audit`, `dependency-cruiser-validate`

**Tier 2 (Warnings in legacy mode, FAIL in binary mode):**
- `knip`, `ts-prune`, `depcheck`, `cspell`, `markdownlint`
- `codeql-analysis`, `bearer`, `osv-scanner`, `stryker`, `madge-circular`

**Tier 3 (Scheduled/Manual):**
- `lighthouse-ci`, `k6`, `pnpm-outdated`, `license-checker`
- `grype`, `owasp-zap`, `clinic-js`, `syft`, `cosign`, `size-limit`
- `langfuse-audit`, `garak`

---

## Appendix C — Existing Validation Infrastructure

| Script | Purpose |
|---|---|
| `tools/scripts/sprint-validation.ts` | Sprint readiness validation + Gates 1-10 |
| `tools/scripts/lib/validation-utils.ts` | Shared validation utilities (strict mode, severity) |
| `tools/scripts/validate-sprint-data.ts` | Sprint data consistency checks |
| `tools/scripts/lib/contract-parser.ts` | FILE/DIR/ENV/POLICY/EVIDENCE/VALIDATE/AUDIT/GATE tag parsing |
| `tools/scripts/lib/context-pack-builder.ts` | Context pack generation |
| `tools/scripts/lib/context-ack-gatekeeper.ts` | Context ack validation |
| `tools/scripts/lib/column-deprecation.ts` | Column deprecation plan |
| `tools/scripts/lib/stoa/*` | STOA assignment, gate selection, evidence, verdict, waiver, orchestrator |
| `tools/lint/artifact-paths.ts` | Artifact placement linting |
| `apps/project-tracker/lib/paths.ts` | Centralized path configuration |
| `apps/project-tracker/lib/data-sync.ts` | CSV→JSON synchronization |

---

## Appendix D — CSV Contract Tag Grammar

### D.1 Contract columns

| Column | Purpose | Tag Types |
|---|---|---|
| `Pre-requisites` | Required context | `FILE:`, `DIR:`, `ENV:`, `POLICY:`, `GLOB:`, `IMPLEMENTS:` |
| `Artifacts To Track` | Required evidence | `ARTIFACT:`, `EVIDENCE:` |
| `Validation Method` | Required gates | `VALIDATE:`, `AUDIT:`, `GATE:` |

### D.2 Tag syntax

- Tags separated by semicolons (`;`)
- Whitespace trimmed
- Tag types case-sensitive (uppercase only)
- Values cannot be empty

**Valid examples:**
```
FILE:packages/db/prisma/schema.prisma;ENV:SUPABASE_URL;POLICY:zero-trust
EVIDENCE:context_ack;EVIDENCE:test_output;EVIDENCE:benchmark_results
VALIDATE:pnpm test:integration;GATE:supabase-healthcheck;AUDIT:db-schema-drift
```

### D.3 Tag definitions

**Pre-requisites:**

| Tag | Description | Example |
|---|---|---|
| `FILE:` | Exact file path, validated by existence check | `FILE:packages/db/prisma/schema.prisma` |
| `DIR:` | Directory that must exist | `DIR:tests/integration` |
| `ENV:` | Environment variable that must be set | `ENV:SUPABASE_URL` |
| `POLICY:` | Policy document that must be acknowledged | `POLICY:zero-trust-db-access` |
| `GLOB:` | Wildcard pattern, validated by deterministic expansion + hashing | `GLOB:apps/api/src/modules/**/router.ts` |
| `IMPLEMENTS:` | Reference to spec/plan flow | `IMPLEMENTS:spec.md#section-3` |

**Artifacts To Track:**

| Tag | Description | Example |
|---|---|---|
| `ARTIFACT:` | File path the task produces | `ARTIFACT:apps/api/src/modules/lead/router.ts` |
| `EVIDENCE:` | Governance evidence (context_ack, context_pack, test_output, etc.) | `EVIDENCE:context_ack` |

**Validation Method:**

| Tag | Description | Example |
|---|---|---|
| `VALIDATE:` | Validation command to run | `VALIDATE:pnpm test:integration` |
| `AUDIT:` | Audit tool ID from `audit-matrix.yml` | `AUDIT:db-schema-drift` |
| `GATE:` | Gate identifier for custom checks | `GATE:supabase-healthcheck` |

### D.4 NOELLIPSIS Rule

Contract fields containing literal `...` are invalid:
- **Local mode:** FAIL (binary policy)
- **Strict mode (CI):** FAIL

This prevents placeholder text from being accepted.

### D.5 Context Pack and Acknowledgement

When `EVIDENCE:context_ack` is specified:

1. **Context Pack Builder** creates `.specify/sprints/sprint-{N}/attestations/{TASK_ID}/context_pack.md`
   - Embeds bounded excerpts (120 lines max per file)
   - 50KB total size limit
   - Creates `context_pack.manifest.json` with SHA256 hashes

2. **Context Ack Gatekeeper** requires `context_ack.json` before code changes:
   ```typescript
   interface ContextAck {
     task_id: string;                      // Must match task being executed
     run_id: string;                       // YYYYMMDD-HHMMSS-<task_id>-<random_4_hex>
     files_read: FileReadEntry[];          // Path + SHA256 for each file
     invariants_acknowledged: string[];    // Min 5 items
     created_at: string;                   // ISO 8601
   }
   ```

3. **Gates 9 and 10:**
   - Gate 9: Contract Tag Parser — validates tag syntax, NOELLIPSIS rule
   - Gate 10: Context Ack Gate — validates `context_ack.json` for In Progress tasks

---

## Appendix E — Column Deprecation Plan

The following CSV columns are scheduled for deprecation (they can be derived):

### E.1 CleanDependencies

**Derivation:** `generateCleanDependencies(Dependencies)` — split by comma, trim, dedupe, sort alphabetically, rejoin.

### E.2 CrossQuarterDeps

**Derivation:** `computeCrossQuarterDeps(task, allTasks)` — if any dependency is in a different quarter (4 sprints per quarter), return True.

**Timeline (both columns):**
- Sprint N: Warn when CSV diverges from generated value
- Sprint N+1: FAIL in strict mode
- Sprint N+2: Remove column from CSV; registry generates value

---

## Appendix F — Migration Notes (v4.3 → v5.0)

**Deleted:** `artifacts/sprint0/codex-run/Framework.md` (v4.3 FINAL, 1001 lines) in commit `ea020464` (2026-01-29)
**New canonical path:** `.specify/memory/Framework.md` (this file)

**Policy changes from v4.3:**

1. **Binary gates**: `WARN` removed from `VerdictType`, `MatopVerdict`. Only `PASS`, `FAIL`, `NEEDS_HUMAN`. Updated in `tools/scripts/lib/stoa/types.ts` and `tools/scripts/lib/workflow/types.ts` on 2026-03-11.
2. **`primaryStoa` replaces `leadStoa`**: Cosmetic rename in TypeScript code (all STOAs block equally).
3. **Coverage branches threshold**: Corrected from 90 to 80 to match canonical project policy.
4. **Coverage provider**: Istanbul (not V8) per coverage architecture in CLAUDE.md.
5. **Attestation field contract**: `verdict` (not `status`) — PG-161 lesson.
6. **`context_ack.json` filename**: Plain only, NO `{TASK_ID}-` prefix.
7. **Evidence path contract**: `.specify/sprints/sprint-{N}/attestations/{TASK_ID}/`, NOT `execution/{run_id}/`.
8. **Extended prefix table**: `PG-*`, `DOC-*`, `BRAND-*`, `GTM-*`, `SALES-*`, `PM-OPS-*`, `ENG-OPS-*`, `GOV-*`, `ANALYTICS-*` now mapped.
9. **Operational framework is skills**: `/spec-session`, `/plan-session`, `/exec` replace the MATOP agent prompts described in v4.3.

**Unchanged:**
- Evidence bundle structure under `artifacts/reports/system-audit/<RUN_ID>/`
- Gate selection algorithm and STOA-specific add-ons
- CSV governance (proposal-based)
- Tier 1 baseline gates
- Non-negotiables from Section 1
