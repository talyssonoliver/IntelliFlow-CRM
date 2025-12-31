# Sprint 8 Sub-Agent Orchestration Prompt for Claude Code

## Mission Brief

You are orchestrating Sprint 8 of the **IntelliFlow CRM** project.

**Execution Model**: Use `claude --dangerously-skip-permissions` for autonomous sub-agent spawning with the `Task` tool for parallel orchestration.

---

## Sprint 8 Mission

**Project**: IntelliFlow CRM
**Sprint**: 8
**Theme**: Risk Mgmt

### Key Objectives
- Complete all achievable tasks for this sprint
- Spawn parallel sub-agents where possible for efficiency
- Validate all deliverables meet KPIs before marking complete
- Escalate blockers and human-intervention tasks promptly

---

## Sprint Overview

| Metric | Value |
|--------|-------|
| **Total Tasks** | 8 |
| **Completed** | 3 |
| **Pending** | 5 |
| **Phases** | 1 |
| **Parallel Tasks** | 5 |
| **Theme** | Risk Mgmt |
| **Key Focus Areas** | Risk Mgmt, Investment Gate, Security, Core CRM |

---

## Sprint Dependency Graph

```
EXECUTION PHASES
============================================================

Phase 0: Initialisation
----------------------------------------
  [PARALLEL EXECUTION]
  Stream A:
    ○ IFC-094
  Stream B:
    ○ IFC-095
  Stream C:
    ○ IFC-118
  Stream D:
    ○ IFC-142
  Stream E:
    ○ IFC-150
  ↓ (all complete before next phase)

============================================================
```

### Parallel Streams

| Stream | Tasks | Dependencies |
|--------|-------|--------------|
| P0-A | IFC-094 | IFC-090, IFC-106 |
| P0-B | IFC-095 | IFC-005, IFC-090 |
| P0-C | IFC-118 | IFC-010, IFC-054 |
| P0-D | IFC-142 | ENV-008-AI |
| P0-E | IFC-150 | IFC-002, IFC-098, IFC-106 |

---

## Complete Task List

### Completed Tasks (3)

| Task ID | Section | Description | Status |
|---------|---------|-------------|--------|
| **IFC-019** | Investment Gate | PHASE-001: Gate 1 Review - £500 Investment | ✅ Completed |
| **IFC-055** | Risk Mgmt | Budget Tracking with FinOps | ✅ Completed |
| **IFC-077** | Security | PHASE-035: API Rate Limiting (tRPC + Upstash) | ✅ Completed |

### Pending Tasks (5)

| Task ID | Section | Description | Owner | Dependencies | KPIs |
|---------|---------|-------------|-------|--------------|------|
| **IFC-094** | Core CRM | Documents Management - Upload & Sign | Backend Dev + Integrations Eng (STOA-Domain) | IFC-090,IFC-106 | Contracts signed electronically, preview inline |
| **IFC-095** | AI Insights | Churn Risk & Next Best Action | AI Specialist + Backend Dev (STOA-Intelligence) | IFC-005,IFC-090 | AI predictions <2s, accuracy >80% |
| **IFC-118** | Risk Mgmt | Establish and maintain a risk register with mitigation actions | PM + Tech Lead (STOA-Foundation) | IFC-010,IFC-054 | All identified risks tracked, mitigation actions completed on time |
| **IFC-142** | Operations | Define SLOs/SLIs and alerting; establish on-call and incident management process; conduct restore drills; create capacity and cost budgets for AI inference and search | SRE Lead + DevOps + Finance (STOA-Automation) | ENV-008-AI | On-call response <15 minutes; restoration time <1 hour; cost deviation <10% of budget; SLO adherence >=99% |
| **IFC-150** | Platform | Domain events infrastructure: event contracts + versioning + outbox pattern + idempotent publishing | Backend Dev + Architect (STOA-Domain) | IFC-002,IFC-106,IFC-098 | 0 lost events in tests; publish latency p95 <200ms; 100% events schema-validated |

---

## Execution Strategy

### Phase 0: Initialisation (Parallel)

Execute these streams **simultaneously** using the `Task` tool:

```bash
# Spawn parallel sub-agents
Task("A", "Core CRM") &
Task("B", "AI Insights") &
Task("C", "Risk Mgmt") &
Task("D", "Operations") &
Task("E", "Platform") &
```

### IFC-094: Documents Management - Upload & Sign

#### Context
Dependency: IFC-090,IFC-106
Owner: Backend Dev + Integrations Eng (STOA-Domain)
Execution Mode: SWARM

#### Pre-requisites
- FILE:artifacts/sprint0/codex-run/Framework.md
- FILE:audit-matrix.yml
- ENV:Integration with DocuSign/Adobe Sign
- ENV:version history
- ENV:inline previews
- FILE:artifacts/lighthouse/lighthouse-360-report.html
- FILE:docs/architecture/hex-boundaries.md

#### Tasks
1. Contracts signed electronically, preview inline
2. artifacts: e-signature-test.pdf, context_ack.json

#### Validation
```bash
# AUDIT:code-review
```

#### KPIs
- Contracts signed electronically, preview inline

#### Artifacts
- SPEC:.specify/specifications/IFC-094.md;PLAN:.specify/planning/IFC-094.md;EVIDENCE:artifacts/attestations/IFC-094/context_pack.md;EVIDENCE:artifacts/attestations/IFC-094/context_ack.json;ARTIFACT:artifacts/reports/e-signature-test.pdf

### IFC-095: Churn Risk & Next Best Action

#### Context
Dependency: IFC-005,IFC-090
Owner: AI Specialist + Backend Dev (STOA-Intelligence)
Execution Mode: SWARM

#### Pre-requisites
- FILE:artifacts/sprint0/codex-run/Framework.md
- FILE:audit-matrix.yml
- ENV:ML pipeline for churn risk
- ENV:recommendations in Contact 360
- FILE:apps/ai-worker/src/chains/scoring.chain.ts
- FILE:artifacts/lighthouse/lighthouse-360-report.html

#### Tasks
1. AI predictions <2s, accuracy >80%
2. artifacts: model-evaluation.ipynb, context_ack.json

#### Validation
```bash
# AUDIT:manual-review
```

#### KPIs
- AI predictions <2s, accuracy >80%

#### Artifacts
- ARTIFACT:artifacts/misc/model-evaluation.ipynb;EVIDENCE:artifacts/attestations/IFC-095/context_ack.json

### IFC-118: Establish and maintain a risk register with mitigation actions

#### Context
Dependency: IFC-010,IFC-054
Owner: PM + Tech Lead (STOA-Foundation)
Execution Mode: SWARM

#### Pre-requisites
- FILE:artifacts/sprint0/codex-run/Framework.md
- FILE:audit-matrix.yml
- POLICY:Project charter and backlog defined
- FILE:artifacts/misc/decision-gate-1.pptx
- FILE:artifacts/reports/sonarqube-debt-report.html

#### Tasks
1. Risk register created, risks scored by impact/likelihood, mitigation owners assigned
2. review scheduled per sprint
3. artifacts: risk-register.xlsx, risk-mitigation-plan.md, risk-review-agenda.md

#### Validation
```bash
# AUDIT:code-review
```

#### KPIs
- All identified risks tracked, mitigation actions completed on time

#### Artifacts
- ARTIFACT:artifacts/reports/risk-register.xlsx;ARTIFACT:docs/shared/risk-mitigation-plan.md;ARTIFACT:docs/shared/risk-review-agenda.md;EVIDENCE:artifacts/attestations/IFC-118/context_ack.json

### IFC-142: Define SLOs/SLIs and alerting; establish on-call and incident management process; conduct restore drills; create capacity and cost budgets for AI inference and search

#### Context
Dependency: ENV-008-AI
Owner: SRE Lead + DevOps + Finance (STOA-Automation)
Execution Mode: SWARM

#### Pre-requisites
- FILE:artifacts/sprint0/codex-run/Framework.md
- FILE:audit-matrix.yml
- ENV:Observability and monitoring in place
- cost tracking metrics available
- FILE:docs/shared/review-checklist.md
- FILE:docs/operations/quality-gates.md
- FILE:docs/operations/pr-checklist.md
- FILE:artifacts/misc/otel-config.yaml

#### Tasks
1. SLOs and SLIs defined for core services
2. alert rules configured
3. on-call rota established with escalation policies
4. incident runbook prepared
5. restore drill executed successfully
6. budgets defined and monitored
7. targets: >=10%, >=99%, <15 min

#### Validation
```bash
# AUDIT:code-review
```

#### KPIs
- On-call response <15 minutes
- restoration time <1 hour
- cost deviation <10% of budget
- SLO adherence >=99%

#### Artifacts
- ARTIFACT:docs/operations/slo-definitions.md;ARTIFACT:artifacts/misc/alerts-config.yaml;ARTIFACT:artifacts/misc/oncall-schedule.json;ARTIFACT:docs/operations/incident-runbook.md;ARTIFACT:docs/operations/restore-drill-report.md;ARTIFACT:artifacts/reports/cost-budget.xlsx;EVIDENCE:artifacts/attestations/IFC-142/context_ack.json

### IFC-150: Domain events infrastructure: event contracts + versioning + outbox pattern + idempotent publishing

#### Context
Dependency: IFC-002,IFC-106,IFC-098
Owner: Backend Dev + Architect (STOA-Domain)
Execution Mode: SWARM

#### Pre-requisites
- FILE:artifacts/sprint0/codex-run/Framework.md
- FILE:audit-matrix.yml
- POLICY:DDD model available
- repository layer established
- observability baseline
- FILE:docs/architecture/hex-boundaries.md
- FILE:docs/architecture/repo-layout.md
- FILE:docs/planning/DDD-context-map.puml
- FILE:packages/db/prisma/schema.prisma
- FILE:packages/db/prisma/schema-audit.prisma

#### Tasks
1. Event contract catalogue created (schema + versioning)
2. transactional outbox implemented
3. idempotency keys enforced
4. publisher emits metrics/traces
5. unit/integration tests
6. targets: >=100%, <200ms

#### Validation
```bash
# VALIDATE:pnpm test
# VALIDATE:pnpm test:integration
```

#### KPIs
- 0 lost events in tests
- publish latency p95 <200ms
- 100% events schema-validated

#### Artifacts
- ARTIFACT:docs/events/contracts-v1.yaml;ARTIFACT:docs/shared/ADR-###-events.md;EVIDENCE:artifacts/attestations/IFC-150/context_ack.json


---

## Success Criteria

| Category | Metric | Target |
|----------|--------|--------|
| Investment Gate | ROI projection validated, budget approved | Met |
| Risk Mgmt | Budget variance <10%, no surprise costs | Met |
| Risk Mgmt | All identified risks tracked, mitigation actions completed on time | Met |
| Security | DDoS protection active, legit traffic unaffected | Met |
| Core CRM | Contracts signed electronically, preview inline | Met |
| AI Insights | AI predictions <2s, accuracy >80% | Met |
| Operations | On-call response <15 minutes | Met |
| Operations | restoration time <1 hour | Met |
| Operations | cost deviation <10% of budget | Met |
| Operations | SLO adherence >=99% | Met |
| Platform | 0 lost events in tests | Met |
| Platform | publish latency p95 <200ms | Met |
| Platform | 100% events schema-validated | Met |

---

## Agent Orchestration Instructions

### How to Execute This Sprint

This sprint should be executed using Claude Code with sub-agent orchestration. Follow these patterns:

### 0. Pre-Execution Context (CRITICAL)

**Before starting any task, gather context from previous work:**

```bash
# 1. Read completed tasks from previous sprint(s) for context
cat apps/project-tracker/docs/metrics/sprint-7/_summary.json

# 2. Review dependency graph to understand task relationships
cat apps/project-tracker/docs/metrics/_global/dependency-graph.json

# 3. Check current sprint status
cat apps/project-tracker/docs/metrics/_global/Sprint_plan.csv | grep "Sprint 8"

# 4. Review any existing specs/plans from dependencies
ls -la artifacts/specs/
ls -la artifacts/plans/
```

**Key Files to Read for Context:**
- `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv` - Full task registry
- `apps/project-tracker/docs/metrics/sprint-*/` - Previous sprint evidence
- `artifacts/attestations/<TASK_ID>/` - Task attestations (schema: `attestation.schema.json`)
- `docs/architecture/` - Architecture decisions and patterns

**Attestation Structure** (`artifacts/attestations/<TASK_ID>/`):
- `attestation.json` - Completion evidence with verdict, KPIs, validations
- `context_pack.md` - Prerequisites (files read before starting)
- `context_pack.manifest.json` - SHA256 hashes of prerequisite files
- `plan.md` / `spec.md` - Task planning documents (if applicable)

### 1. Task Lifecycle Workflow

**IMPORTANT**: Every task must follow this lifecycle:

```
Backlog → Planned → In Progress → Done
```

**For each task, execute these steps in order:**

#### Step 1: Plan the Task (Backlog → Planned)
```bash
# Create task specification
mkdir -p artifacts/specs/<TASK_ID>
# Write spec file with:
# - Objective and scope
# - Technical approach
# - Files to create/modify
# - Test strategy
# - Acceptance criteria

# Update CSV status to "Planned"
# The system will auto-update via MATOP/SWARM, or manually:
curl -X POST http://localhost:3002/api/tasks/<TASK_ID>/plan \
  -H "Content-Type: application/json" \
  -d '{"status": "Planned", "specPath": "artifacts/specs/<TASK_ID>/spec.md"}'
```

#### Step 2: Start Implementation (Planned → In Progress)
```bash
# Update status to "In Progress"
curl -X POST http://localhost:3002/api/tasks/<TASK_ID>/start \
  -H "Content-Type: application/json" \
  -d '{"status": "In Progress"}'

# Execute via SWARM or MATOP (see sections below)
```

#### Step 3: Complete & Validate (In Progress → Done)
```bash
# Run validation and audit (see Section 8)
# Update status to "Done" with evidence
curl -X POST http://localhost:3002/api/tasks/<TASK_ID>/complete \
  -H "Content-Type: application/json" \
  -d '{"status": "Done", "evidencePath": "artifacts/stoa-runs/<TASK_ID>/"}'
```

### 2. Parallel Task Spawning

For parallel phases, spawn sub-agents using the `Task` tool:

```bash
# Sprint 8 parallel execution:
Task("A", "Execute IFC-094") &
Task("B", "Execute IFC-095") &
Task("C", "Execute IFC-118") &
Task("D", "Execute IFC-142") &
Task("E", "Execute IFC-150") &
```

The `&` suffix indicates parallel execution. Wait for all to complete before proceeding to the next phase.

### 3. SWARM Execution (Implementation Tasks)

For **implementation tasks** (5 tasks marked as `swarm`):

```bash
# Run via SWARM 5-phase pipeline
./scripts/swarm/orchestrator.sh run-quick <TASK_ID>
```

**SWARM Pipeline Phases:**
1. **Architect** - Generate spec/plan via MCP → Creates `artifacts/specs/<TASK_ID>/`
2. **Enforcer** - Generate tests (TDD) → Creates test files first
3. **Builder** - Implement code → Makes tests pass
4. **Gatekeeper** - Run quality gates (typecheck, lint, test)
5. **Auditor** - Logic & security review → Creates attestation

**Before SWARM execution, the agent MUST:**
1. Read the task's pre-requisites from Sprint_plan.csv
2. Read any dependent task's evidence/output
3. Create a spec in `artifacts/specs/<TASK_ID>/spec.md`
4. Update status to "Planned" before starting

**SWARM Tasks in this Sprint:**
- `IFC-094`: Documents Management - Upload & Sign
- `IFC-095`: Churn Risk & Next Best Action
- `IFC-118`: Establish and maintain a risk register with mitigation actions
- `IFC-142`: Define SLOs/SLIs and alerting; establish on-call and incident management process; conduct restore drills; create capacity and cost budgets for AI inference and search
- `IFC-150`: Domain events infrastructure: event contracts + versioning + outbox pattern + idempotent publishing

### 4. MATOP Execution (Validation Tasks)

For **validation tasks** (0 tasks marked as `matop`):

```bash
# Run via MATOP unified orchestrator
pnpm matop <TASK_ID>
# or
npx tsx tools/stoa/matop-execute.ts <TASK_ID>
```

**MATOP STOA Gates:**
- **Foundation** - TypeCheck, Build, Test coverage, ESLint, Prettier
- **Security** - Gitleaks, pnpm audit, Snyk, Semgrep, Trivy
- **Quality** - Test coverage enforcement
- **Domain** - Dependency validation, business logic tests
- **Intelligence** - AI component tests
- **Automation** - CI/CD pipeline validation

**Before MATOP execution, the agent MUST:**
1. Verify all dependencies are completed (check attestations)
2. Read the task definition from Sprint_plan.csv
3. Update status to "In Progress" before running gates

**MATOP Tasks in this Sprint:**
- None

### 5. Manual Tasks

These tasks require human intervention (0 tasks):

- None

### 6. Status Updates

**Task Status Lifecycle:**
| Status | Meaning | Trigger |
|--------|---------|---------|
| Backlog | Not started | Initial state |
| Planned | Spec created, ready to start | After spec/plan created |
| In Progress | Currently being worked on | After starting execution |
| Done | Completed and validated | After audit passes |
| Blocked | Waiting on dependency/issue | When blocker identified |

**Automatic Updates:**
After completing each task, the system will automatically:
1. Update `Sprint_plan.csv` status to "Done"
2. Generate evidence in `artifacts/stoa-runs/` or `artifacts/swarm-runs/`
3. Create attestation in `artifacts/attestations/<TASK_ID>/attestation.json` with:
   - `$schema`: `https://intelliflow-crm.com/schemas/attestation.schema.json`
   - `schema_version`: `"1.0.0"`
   - `verdict`: `"COMPLETE"` or `"INCOMPLETE"`
   - `context_acknowledgment`: files_read with SHA256 hashes
   - `kpi_results`: target vs actual for each KPI
   - `definition_of_done_items`: criteria with met/evidence
4. Update phase summaries

**Manual status updates:**
```bash
# Update via API
curl -X POST http://localhost:3002/api/sprint/status \
  -H "Content-Type: application/json" \
  -d '{"runId": "<RUN_ID>", "update": {"type": "task_complete", "taskId": "<TASK_ID>"}}'
```

### 7. Error Handling

If a task fails:
1. Check `artifacts/blockers.json` for blocker details
2. Check `artifacts/human-intervention-required.json` for escalations
3. Review remediation report in evidence directory
4. Fix issues and re-run the task

### 8. Final Audit & Validation (CRITICAL)

**Before marking any task as Done, run the full audit:**

```bash
# Run comprehensive audit for the task
pnpm turbo typecheck --filter=...
pnpm turbo lint --filter=...
pnpm turbo test --filter=...

# Or run the full audit matrix
npx tsx tools/stoa/run-stoa.ts --task-id <TASK_ID> --gates foundation,security,quality

# Verify all gates pass
cat artifacts/stoa-runs/<TASK_ID>/summary.json | jq '.verdict'
```

**Required Gates for Sprint Completion:**
| Gate | Command | Pass Criteria |
|------|---------|---------------|
| TypeCheck | `pnpm turbo typecheck` | Exit code 0 |
| Lint | `pnpm turbo lint` | 0 warnings |
| Test | `pnpm turbo test` | Coverage ≥90% |
| Gitleaks | `gitleaks detect` | No secrets found |
| Build | `pnpm turbo build` | Exit code 0 |

**Sprint-Level Audit:**
```bash
# Before declaring sprint complete, run full audit
pnpm audit:sprint 8

# Generate attestation report
npx tsx tools/scripts/attest-sprint.ts 8

# Verify all tasks pass
cat artifacts/reports/attestation/sprint-8-latest.json
```

### 9. Project Tracker Dashboard Workflow

**Use the Project Tracker Dashboard (http://localhost:3002) to monitor and validate progress:**

| View | Purpose | When to Use |
|------|---------|-------------|
| **Dashboard** | Sprint overview, task counts, progress bars | Start of sprint, quick status checks |
| **Kanban** | Visual task board by status | Track task flow: Backlog → Planned → In Progress → Done |
| **Analytics** | Charts, trends, velocity metrics | Mid-sprint reviews, identify bottlenecks |
| **Metrics** | KPI tracking, phase summaries, evidence | Verify KPIs met, check attestations |
| **Execution** | Sprint orchestration, parallel spawning | Execute sprints, monitor sub-agents |
| **Governance** | Policy compliance, STOA gate results | Verify governance requirements met |
| **Contracts** | Task agreements, SLAs, commitments | Review task contracts before completion |
| **Audit** | Full audit runs, security scans, quality gates | Final validation before marking Done |

**Workflow Integration:**

1. **Before Starting a Task:**
   - Check **Dashboard** for overall sprint status
   - Review **Kanban** to see task dependencies and blockers
   - Check **Governance** for any policy requirements

2. **During Task Execution:**
   - Monitor **Execution** view for sub-agent status
   - Check **Metrics** for real-time KPI tracking
   - Review **Analytics** for velocity and progress

3. **Before Completing a Task:**
   - Run **Audit** view to execute all quality gates
   - Verify **Governance** compliance passes
   - Check **Contracts** view for task acceptance criteria
   - Confirm **Metrics** show KPIs met

4. **API Endpoints for Dashboard:**
```bash
# Dashboard data
curl http://localhost:3002/api/sprint-plan

# Metrics & KPIs
curl http://localhost:3002/api/metrics/sprint?sprint=8

# Governance status
curl http://localhost:3002/api/governance/summary?sprint=8

# Audit results
curl http://localhost:3002/api/audit/stream

# Execution status
curl http://localhost:3002/api/sprint/status?runId=<RUN_ID>
```

### 10. Execution Order Summary

| Phase | Type | Tasks |
|-------|------|-------|
| 0 | parallel | IFC-094, IFC-095, IFC-118, IFC-142, IFC-150 |

---

## Definition of Done

A task is considered **DONE** when:

1. ✅ All validation commands pass (exit code 0)
2. ✅ All artifacts listed are created and accessible
3. ✅ All KPIs meet or exceed target values
4. ✅ No blocking issues or errors remain
5. ✅ Status updated to "Done" in Sprint_plan.csv
6. ✅ Evidence bundle generated (if MATOP task)

### Sprint 8 Completion Gate

The sprint is complete when:
- All achievable tasks marked as Done
- Deferred tasks documented with target sprint
- Blockers escalated with clear resolution path
- Phase summaries updated with final metrics
- Sprint summary reflects accurate totals