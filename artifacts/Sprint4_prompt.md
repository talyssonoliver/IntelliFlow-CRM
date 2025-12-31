# Sprint 4 Sub-Agent Orchestration Prompt for Claude Code

## Mission Brief

You are orchestrating Sprint 4 of the **IntelliFlow CRM** project.

**Execution Model**: Use `claude --dangerously-skip-permissions` for autonomous sub-agent spawning with the `Task` tool for parallel orchestration.

---

## Sprint 4 Mission

**Project**: IntelliFlow CRM
**Sprint**: 4
**Theme**: Validation & Architecture Foundation

### Key Objectives
- Complete all achievable tasks for this sprint
- Spawn parallel sub-agents where possible for efficiency
- Validate all deliverables meet KPIs before marking complete
- Escalate blockers and human-intervention tasks promptly

---

## Sprint Overview

| Metric | Value |
|--------|-------|
| **Total Tasks** | 5 |
| **Completed** | 0 |
| **Pending** | 5 |
| **Phases** | 1 |
| **Parallel Tasks** | 5 |
| **Theme** | Validation & Architecture Foundation |
| **Key Focus Areas** | Validation, Testing, Foundation Setup, Scheduling |

---

## Sprint Dependency Graph

```
EXECUTION PHASES
============================================================

Phase 0: Initialisation
----------------------------------------
  [PARALLEL EXECUTION]
  Stream A:
    ○ IFC-009
  Stream B:
    ○ IFC-108
  Stream C:
    ○ IFC-110
  Stream D:
    ○ IFC-131
  Stream E:
    ○ IFC-137
  ↓ (all complete before next phase)

============================================================
```

### Parallel Streams

| Stream | Tasks | Dependencies |
|--------|-------|--------------|
| P0-A | IFC-009 | IFC-001, IFC-005 |
| P0-B | IFC-108 | IFC-107 |
| P0-C | IFC-110 | IFC-101, IFC-102, IFC-103, IFC-104, IFC-105 |
| P0-D | IFC-131 | IFC-106 |
| P0-E | IFC-137 | IFC-003, IFC-136 |

---

## Complete Task List

### Pending Tasks (5)

| Task ID | Section | Description | Owner | Dependencies | KPIs |
|---------|---------|-------------|-------|--------------|------|
| **IFC-009** | Validation | PHASE-002: Team Capability Assessment - Modern Stack (Next.js 16.0.10 App Router, Turbopack FS caching, Cache Components, proxy replacing middleware) | PM + Tech Lead (STOA-Foundation) | IFC-001,IFC-005 | 80% team confident with new stack |
| **IFC-108** | Validation | Implement Domain Services & Business Logic | Backend Dev (STOA-Domain) | IFC-107 | All business rules enforced, 90% test coverage |
| **IFC-110** | Testing | Write Unit & Integration Tests for Domain Entities | QA + Backend Dev (STOA-Quality) | IFC-101,IFC-102,IFC-103,IFC-104,IFC-105 | Coverage ≥90%, tests passing in CI |
| **IFC-131** | Foundation Setup | Architecture boundary enforcement: domain/infrastructure dependency rules + architecture tests in CI | Tech Lead (STOA-Foundation) | IFC-106 | 0 boundary violations on main; CI blocks non-compliant changes |
| **IFC-137** | Scheduling | Develop Appointment aggregate with conflict detection; buffers; recurrence; linkage to cases and calendars | Backend Dev + Calendar Specialist (STOA-Domain) | IFC-136,IFC-003 | Conflict detection accuracy >95%; scheduling latency <=100ms; test coverage >=90% |

---

## Execution Strategy

### Phase 0: Initialisation (Parallel)

Execute these streams **simultaneously** using the `Task` tool:

```bash
# Spawn parallel sub-agents
Task("A", "Validation") &
Task("B", "Validation") &
Task("C", "Testing") &
Task("D", "Foundation Setup") &
Task("E", "Scheduling") &
```

### IFC-009: PHASE-002: Team Capability Assessment - Modern Stack (Next.js 16.0.10 App Router, Turbopack FS caching, Cache Components, proxy replacing middleware)

#### Context
Dependency: IFC-001,IFC-005
Owner: PM + Tech Lead (STOA-Foundation)
Execution Mode: SWARM

#### Pre-requisites
- FILE:artifacts/sprint0/codex-run/Framework.md
- FILE:audit-matrix.yml
- ENV:Skills matrix for tRPC/Next.js/LangChain
- FILE:docs/planning/adr/ADR-001-modern-stack.md
- FILE:docs/tdd-guidelines.md
- FILE:docs/shared/review-checklist.md
- FILE:docs/operations/quality-gates.md
- FILE:docs/operations/pr-checklist.md
- FILE:apps/ai-worker/src/chains/scoring.chain.ts

#### Tasks
1. Team readiness evaluated, training plan created
2. artifacts: team-skills-matrix.xlsx, training-plan.md, competency-test-results.csv
3. targets: >=80%

#### Validation
```bash
# AUDIT:manual-review
```

#### KPIs
- 80% team confident with new stack

#### Artifacts
- ARTIFACT:artifacts/reports/team-skills-matrix.xlsx;ARTIFACT:docs/planning/training-plan.md;ARTIFACT:artifacts/misc/competency-test-results.csv;ARTIFACT:artifacts/reports/confidence-survey.pdf;ARTIFACT:apps/project-tracker/docs/metrics/_global/flows/FLOW-002.md;ARTIFACT:apps/project-tracker/docs/metrics/_global/phase-validations/PHASE-002-validation.md;EVIDENCE:artifacts/attestations/IFC-009/context_ack.json

### IFC-108: Implement Domain Services & Business Logic

#### Context
Dependency: IFC-107
Owner: Backend Dev (STOA-Domain)
Execution Mode: SWARM

#### Pre-requisites
- FILE:artifacts/sprint0/codex-run/Framework.md
- FILE:audit-matrix.yml
- ENV:Domain models and repositories implemented
- FILE:docs/architecture/hex-boundaries.md
- FILE:docs/planning/DDD-context-map.puml
- FILE:docs/tdd-guidelines.md
- FILE:docs/shared/review-checklist.md

#### Tasks
1. Domain services implemented for leads, contacts, accounts, opportunities, tasks
2. artifacts: context_ack.json
3. targets: >=90%
4. verified by: pnpm test, pnpm test:integration

#### Validation
```bash
# VALIDATE:pnpm test
# VALIDATE:pnpm test:integration
```

#### KPIs
- All business rules enforced, 90% test coverage

#### Artifacts
- EVIDENCE:artifacts/attestations/IFC-108/context_ack.json

### IFC-110: Write Unit & Integration Tests for Domain Entities

#### Context
Dependency: IFC-101,IFC-102,IFC-103,IFC-104,IFC-105
Owner: QA + Backend Dev (STOA-Quality)
Execution Mode: SWARM

#### Pre-requisites
- FILE:artifacts/sprint0/codex-run/Framework.md
- FILE:audit-matrix.yml
- ENV:Domain models implemented
- FILE:docs/architecture/hex-boundaries.md
- FILE:docs/planning/DDD-context-map.puml
- FILE:docs/tdd-guidelines.md
- FILE:docs/shared/review-checklist.md
- FILE:packages/adapters/src/repositories/PrismaLeadRepository.ts
- FILE:packages/adapters/src/repositories/PrismaContactRepository.ts
- FILE:packages/adapters/src/repositories/PrismaAccountRepository.ts
- FILE:packages/adapters/src/repositories/PrismaOpportunityRepository.ts
- FILE:packages/adapters/src/repositories/PrismaTaskRepository.ts

#### Tasks
1. All domain entities have unit and integration tests covering business logic and repository operations
2. artifacts: context_ack.json
3. targets: >=90%
4. gates: coverage-gte-90

#### Validation
```bash
# VALIDATE:pnpm test
# GATE:coverage-gte-90
```

#### KPIs
- Coverage ≥90%, tests passing in CI

#### Artifacts
- EVIDENCE:artifacts/attestations/IFC-110/context_ack.json

### IFC-131: Architecture boundary enforcement: domain/infrastructure dependency rules + architecture tests in CI

#### Context
Dependency: IFC-106
Owner: Tech Lead (STOA-Foundation)
Execution Mode: SWARM

#### Pre-requisites
- FILE:artifacts/sprint0/codex-run/Framework.md
- FILE:audit-matrix.yml
- POLICY:Ports/adapters defined
- repo structure established
- FILE:docs/planning/adr/ADR-001-modern-stack.md
- FILE:docs/architecture/hex-boundaries.md
- FILE:docs/architecture/repo-layout.md
- FILE:docs/planning/DDD-context-map.puml
- FILE:docs/tdd-guidelines.md
- FILE:docs/operations/quality-gates.md
- FILE:docs/architecture/decision-workflow.md

#### Tasks
1. Module boundaries enforced
2. forbidden dependency rules added
3. architecture tests run in CI
4. documentation + ADR added

#### Validation
```bash
# AUDIT:code-review
# VALIDATE:pnpm test
```

#### KPIs
- 0 boundary violations on main
- CI blocks non-compliant changes

#### Artifacts
- ARTIFACT:docs/architecture/hex-boundaries.md;ARTIFACT:artifacts/misc/ADR-###;EVIDENCE:artifacts/attestations/IFC-131/context_ack.json

### IFC-137: Develop Appointment aggregate with conflict detection; buffers; recurrence; linkage to cases and calendars

#### Context
Dependency: IFC-136,IFC-003
Owner: Backend Dev + Calendar Specialist (STOA-Domain)
Execution Mode: SWARM

#### Pre-requisites
- FILE:artifacts/sprint0/codex-run/Framework.md
- FILE:audit-matrix.yml
- ENV:Calendar provider research
- case domain implemented
- FILE:docs/planning/DDD-context-map.puml
- FILE:packages/db/prisma/schema.prisma
- FILE:docs/operations/quality-gates.md
- FILE:packages/domain/src/legal/cases/Case.ts
- FILE:apps/api/src/trpc.ts

#### Tasks
1. Appointment aggregate, services and repositories implemented
2. conflict detection logic with unit tests
3. recurrence rules
4. APIs via tRPC
5. scheduling integrated with case management
6. targets: >=95%, >=90%

#### Validation
```bash
# VALIDATE:pnpm test
# GATE:latency-check
# GATE:coverage-gte-90
```

#### KPIs
- Conflict detection accuracy >95%
- scheduling latency <=100ms
- test coverage >=90%

#### Artifacts
- ARTIFACT:packages/domain/src/legal/appointments/appointment.ts;ARTIFACT:packages/application/src/usecases/scheduling.ts;ARTIFACT:apps/api/src/modules/legal/appointments.router.ts;EVIDENCE:artifacts/attestations/IFC-137/context_ack.json


---

## Success Criteria

| Category | Metric | Target |
|----------|--------|--------|
| Validation | 80% team confident with new stack | Met |
| Validation | All business rules enforced, 90% test coverage | Met |
| Testing | Coverage ≥90%, tests passing in CI | Met |
| Foundation Setup | 0 boundary violations on main | Met |
| Foundation Setup | CI blocks non-compliant changes | Met |
| Scheduling | Conflict detection accuracy >95% | Met |
| Scheduling | scheduling latency <=100ms | Met |
| Scheduling | test coverage >=90% | Met |

---

## Agent Orchestration Instructions

### How to Execute This Sprint

This sprint should be executed using Claude Code with sub-agent orchestration. Follow these patterns:

### 0. Pre-Execution Context (CRITICAL)

**Before starting any task, gather context from previous work:**

```bash
# 1. Read completed tasks from previous sprint(s) for context
cat apps/project-tracker/docs/metrics/sprint-3/_summary.json

# 2. Review dependency graph to understand task relationships
cat apps/project-tracker/docs/metrics/_global/dependency-graph.json

# 3. Check current sprint status
cat apps/project-tracker/docs/metrics/_global/Sprint_plan.csv | grep "Sprint 4"

# 4. Review any existing specs/plans from dependencies
ls -la artifacts/specs/
ls -la artifacts/plans/
```

**Key Files to Read for Context:**
- `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv` - Full task registry
- `apps/project-tracker/docs/metrics/sprint-*/` - Previous sprint evidence
- `artifacts/attestations/` - Completed task attestations
- `docs/architecture/` - Architecture decisions and patterns

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
# Sprint 4 parallel execution:
Task("A", "Execute IFC-009") &
Task("B", "Execute IFC-108") &
Task("C", "Execute IFC-110") &
Task("D", "Execute IFC-131") &
Task("E", "Execute IFC-137") &
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
- `IFC-009`: PHASE-002: Team Capability Assessment - Modern Stack (Next.js 16.0.10 App Router, Turbopack FS caching, Cache Components, proxy replacing middleware)
- `IFC-108`: Implement Domain Services & Business Logic
- `IFC-110`: Write Unit & Integration Tests for Domain Entities
- `IFC-131`: Architecture boundary enforcement: domain/infrastructure dependency rules + architecture tests in CI
- `IFC-137`: Develop Appointment aggregate with conflict detection; buffers; recurrence; linkage to cases and calendars

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
3. Create attestation in `artifacts/attestations/<TASK_ID>/`
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
pnpm audit:sprint 4

# Generate attestation report
npx tsx tools/scripts/attest-sprint.ts 4

# Verify all tasks pass
cat artifacts/reports/attestation/sprint-4-latest.json
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
curl http://localhost:3002/api/metrics/sprint?sprint=4

# Governance status
curl http://localhost:3002/api/governance/summary?sprint=4

# Audit results
curl http://localhost:3002/api/audit/stream

# Execution status
curl http://localhost:3002/api/sprint/status?runId=<RUN_ID>
```

### 10. Execution Order Summary

| Phase | Type | Tasks |
|-------|------|-------|
| 0 | parallel | IFC-009, IFC-108, IFC-110, IFC-131, IFC-137 |

---

## Definition of Done

A task is considered **DONE** when:

1. ✅ All validation commands pass (exit code 0)
2. ✅ All artifacts listed are created and accessible
3. ✅ All KPIs meet or exceed target values
4. ✅ No blocking issues or errors remain
5. ✅ Status updated to "Done" in Sprint_plan.csv
6. ✅ Evidence bundle generated (if MATOP task)

### Sprint 4 Completion Gate

The sprint is complete when:
- All achievable tasks marked as Done
- Deferred tasks documented with target sprint
- Blockers escalated with clear resolution path
- Phase summaries updated with final metrics
- Sprint summary reflects accurate totals