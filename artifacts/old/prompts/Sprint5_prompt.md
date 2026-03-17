# Sprint 5 Sub-Agent Orchestration Prompt for Claude Code

## Mission Brief

You are orchestrating Sprint 5 of the **IntelliFlow CRM** project.

**Execution Model**: Use `claude --dangerously-skip-permissions` for autonomous sub-agent spawning with the `Task` tool for parallel orchestration.

---

## Sprint 5 Mission

**Project**: IntelliFlow CRM
**Sprint**: 5
**Theme**: Core CRM Development

### Key Objectives
- Complete all achievable tasks for this sprint
- Spawn parallel sub-agents where possible for efficiency
- Validate all deliverables meet KPIs before marking complete
- Escalate blockers and human-intervention tasks promptly

---

## Sprint Overview

| Metric | Value |
|--------|-------|
| **Total Tasks** | 7 |
| **Completed** | 0 |
| **Pending** | 7 |
| **Phases** | 2 |
| **Parallel Tasks** | 6 |
| **Theme** | Core CRM Development |
| **Key Focus Areas** | Core CRM, Security, Quality, Infrastructure |

---

## Sprint Dependency Graph

FIRST 
```
EXECUTION PHASES
============================================================

Phase 0: Initialisation
----------------------------------------
  [PARALLEL EXECUTION]
  Stream A:
    ○ IFC-089
  Stream B:
    ○ IFC-098
  Stream C:
    ○ IFC-111
    ○ IFC-112
  Stream D:
    ○ IFC-138
  Stream E:
    ○ IFC-147
  ↓ (all complete before next phase)

Phase 1: Validation (1 tasks)
----------------------------------------
  ○ IFC-130 → Release governance: staging auto-deploy,...
  ↓

============================================================
```

### Parallel Streams

| Stream | Tasks | Dependencies |
|--------|-------|--------------|
| P0-A | IFC-089 | IFC-002, IFC-004 |
| P0-B | IFC-098 | IFC-008 |
| P0-C | IFC-111, IFC-112 | ENV-005-AI |
| P0-D | IFC-138 | IFC-106, IFC-137 |
| P0-E | IFC-147 | IFC-136, IFC-137 |
| P1-A | IFC-130 | ENV-005-AI, IFC-111 |

---

## Complete Task List

### Pending Tasks (7)

| Task ID | Section | Description | Owner | Dependencies | KPIs |
|---------|---------|-------------|-------|--------------|------|
| **IFC-089** | Core CRM | FLOW-005-A, FLOW-006, FLOW-014, FLOW-010-A: Contacts Module - Create/Edit/Search | Frontend Dev + Backend Dev (STOA-Domain) | IFC-002,IFC-004 | Contacts CRUD working, search <200ms |
| **IFC-098** | Security | RBAC/ABAC & Audit Trail | Security Eng + Backend Dev (STOA-Security) | IFC-008 | 100% actions logged, RBAC functional |
| **IFC-111** | Quality | Set up SonarQube and integrate static analysis into CI/CD | DevOps + QA Lead (STOA-Quality) | ENV-005-AI | Sonar quality gate >= A, zero blocker issues |
| **IFC-112** | Infrastructure | Implement blue/green deployment and rollback strategy | DevOps (STOA-Automation) | ENV-005-AI | Deployment switch <1m, no downtime |
| **IFC-130** | Validation | Release governance: staging auto-deploy, promotion policy, quality/security gates, rollback criteria | DevOps Lead (STOA-Automation) | ENV-005-AI,IFC-111 | Staging deploy success >=95%; prod promotion time <=30 min; rollback tested in staging |
| **IFC-138** | Integration | Integrate external calendar providers (Google/Microsoft) with bidirectional sync; webhook handling; idempotency; reconciliation | Backend Dev + DevOps (STOA-Automation) | IFC-137,IFC-106 | Sync reliability >=99%; duplicate events <1%; sync latency <30s |
| **IFC-147** | UI/Domain | Develop Case timeline UI with deadline engine: display tasks; deadlines; events; implement deadline engine to compute legal deadlines and reminders; integrate with scheduling | Frontend Dev + Backend Dev (STOA-Domain) | IFC-136,IFC-137 | Timeline load time <1s; deadline accuracy >=95%; user adoption rate; test coverage >=90% |

---

## Execution Strategy

### Phase 0: Initialisation (Parallel)

Execute these streams **simultaneously** using the `Task` tool:

```bash
# Spawn parallel sub-agents
Task("A", "Core CRM") &
Task("B", "Security") &
Task("C", "Infrastructure & Observability") &
Task("D", "Integration") &
Task("E", "UI/Domain") &
```

### IFC-089: FLOW-005-A, FLOW-006, FLOW-014, FLOW-010-A: Contacts Module - Create/Edit/Search

#### Context
Dependency: IFC-002,IFC-004
Owner: Frontend Dev + Backend Dev (STOA-Domain)
Execution Mode: SWARM

#### Pre-requisites
- IMPLEMENTS:FLOW-005
- IMPLEMENTS:FLOW-006
- IMPLEMENTS:FLOW-014
- IMPLEMENTS:FLOW-010
- FILE:artifacts/sprint0/codex-run/Framework.md
- FILE:audit-matrix.yml
- ENV:DDD model extended with ContactAggregate
- ENV:UI for CRUD
- FILE:packages/db/prisma/schema.prisma
- FILE:apps/web/src/app/leads/(list)/new/page.tsx

#### Tasks
1. Contacts CRUD working, search <200ms

#### Validation
```bash
# AUDIT:manual-review
```

#### KPIs
- Contacts CRUD working, search <200ms

#### Artifacts
- ARTIFACT:apps/api/src/modules/crm/contacts.router.ts;EVIDENCE:artifacts/attestations/IFC-089/context_ack.json

### IFC-098: RBAC/ABAC & Audit Trail

#### Context
Dependency: IFC-008
Owner: Security Eng + Backend Dev (STOA-Security)
Execution Mode: SWARM

#### Pre-requisites
- FILE:artifacts/sprint0/codex-run/Framework.md
- FILE:audit-matrix.yml
- ENV:Role/attribute-based permissions
- ENV:audit logs for all actions
- FILE:docs/planning/adr/ADR-008-audit-logging.md
- FILE:docs/security/zero-trust-design.md
- FILE:docs/security/owasp-checklist.md
- FILE:artifacts/reports/compliance-report.md

#### Tasks
1. 100% actions logged, RBAC functional
2. artifacts: schema-audit.prisma, audit-coverage-test.ts, context_ack.json
3. verified by: pnpm test

#### Validation
```bash
# VALIDATE:pnpm test
```

#### KPIs
- 100% actions logged, RBAC functional

#### Artifacts
- ARTIFACT:packages/db/prisma/schema-audit.prisma;ARTIFACT:apps/api/src/security/audit-coverage-test.ts;EVIDENCE:artifacts/attestations/IFC-098/context_ack.json

### IFC-111: Set up SonarQube and integrate static analysis into CI/CD

#### Context
Dependency: ENV-005-AI
Owner: DevOps + QA Lead (STOA-Quality)
Execution Mode: SWARM

#### Pre-requisites
- FILE:artifacts/sprint0/codex-run/Framework.md
- FILE:audit-matrix.yml
- POLICY:CI/CD pipeline established
- FILE:docs/operations/quality-gates.md
- FILE:.github/workflows/ci.yml

#### Tasks
1. SonarQube server running, CI pipeline pushes analysis, quality gates defined with OWASP and Clean Code rules
2. artifacts: sonar-project.properties, ci-sonar.yml, sonar-dashboard.md
3. targets: zero errors

#### Validation
```bash
# AUDIT:manual-review
```

#### KPIs
- Sonar quality gate >= A, zero blocker issues

#### Artifacts
- ARTIFACT:artifacts/misc/sonar-project.properties;ARTIFACT:artifacts/misc/ci-sonar.yml;ARTIFACT:docs/shared/sonar-dashboard.md;EVIDENCE:artifacts/attestations/IFC-111/context_ack.json

### IFC-112: Implement blue/green deployment and rollback strategy

#### Context
Dependency: ENV-005-AI
Owner: DevOps (STOA-Automation)
Execution Mode: SWARM

#### Pre-requisites
- FILE:artifacts/sprint0/codex-run/Framework.md
- FILE:audit-matrix.yml
- ENV:Production environment configured
- FILE:docs/operations/release-rollback.md
- FILE:.github/workflows/ci.yml

#### Tasks
1. Blue/green deployment pipeline configured, automated health checks, rollback scripts ready
2. verified by: pnpm test

#### Validation
```bash
# VALIDATE:pnpm test
```

#### KPIs
- Deployment switch <1m, no downtime

#### Artifacts
- ARTIFACT:artifacts/metrics/blue-green-metrics.csv;EVIDENCE:artifacts/attestations/IFC-112/context_ack.json

### IFC-138: Integrate external calendar providers (Google/Microsoft) with bidirectional sync; webhook handling; idempotency; reconciliation

#### Context
Dependency: IFC-137,IFC-106
Owner: Backend Dev + DevOps (STOA-Automation)
Execution Mode: SWARM

#### Pre-requisites
- FILE:artifacts/sprint0/codex-run/Framework.md
- FILE:audit-matrix.yml
- ENV:OAuth credentials obtained
- appointment domain stable
- FILE:docs/shared/review-checklist.md
- FILE:docs/operations/quality-gates.md
- FILE:docs/operations/pr-checklist.md
- FILE:packages/domain/src/legal/appointments/appointment.ts
- FILE:docs/architecture/hex-boundaries.md

#### Tasks
1. Google and Microsoft calendar integrations implemented
2. event sync both directions with idempotency keys
3. reconcilers handle conflicts
4. error handling and retries
5. integration tests
6. artifacts: client.ts, client.ts, webhooks-config.yaml
7. targets: >=99%, >=1%, <30s

#### Validation
```bash
# AUDIT:manual-review
# VALIDATE:pnpm test
```

#### KPIs
- Sync reliability >=99%
- duplicate events <1%
- sync latency <30s

#### Artifacts
- ARTIFACT:packages/adapters/src/calendar/google/client.ts;ARTIFACT:packages/adapters/src/calendar/microsoft/client.ts;ARTIFACT:artifacts/misc/webhooks-config.yaml;EVIDENCE:artifacts/attestations/IFC-138/context_ack.json

### IFC-147: Develop Case timeline UI with deadline engine: display tasks; deadlines; events; implement deadline engine to compute legal deadlines and reminders; integrate with scheduling

#### Context
Dependency: IFC-136,IFC-137
Owner: Frontend Dev + Backend Dev (STOA-Domain)
Execution Mode: SWARM

#### Pre-requisites
- FILE:artifacts/sprint0/codex-run/Framework.md
- FILE:audit-matrix.yml
- ENV:Case and appointment APIs
- UI design ready
- FILE:docs/planning/adr/ADR-005-workflow-engine.md
- FILE:docs/company/brand/visual-identity.md
- FILE:packages/domain/src/legal/cases/Case.ts
- FILE:packages/domain/src/legal/appointments/appointment.ts

#### Tasks
1. Case timeline page implemented
2. tasks and deadlines displayed chronologically
3. deadline engine computes due dates
4. reminders triggered
5. E2E tests
6. accessibility compliance
7. targets: >=95%, >=90%, <1s

#### Validation
```bash
# VALIDATE:pnpm test
# AUDIT:code-review
# GATE:coverage-gte-90
```

#### KPIs
- Timeline load time <1s
- deadline accuracy >=95%
- user adoption rate
- test coverage >=90%

#### Artifacts
- ARTIFACT:apps/web/app/cases/timeline.tsx;ARTIFACT:packages/domain/src/legal/deadlines/deadline-engine.ts;ARTIFACT:apps/web/lib/cases/reminders-service.ts;EVIDENCE:artifacts/attestations/IFC-147/context_ack.json


### Phase 1: Validation (1 tasks) (Sequential)

### IFC-130: Release governance: staging auto-deploy, promotion policy, quality/security gates, rollback criteria

#### Context
Dependency: ENV-005-AI,IFC-111
Owner: DevOps Lead (STOA-Automation)
Execution Mode: SWARM

#### Pre-requisites
- FILE:artifacts/sprint0/codex-run/Framework.md
- FILE:audit-matrix.yml
- POLICY:CI/CD pipeline exists
- environments defined
- FILE:docs/security/zero-trust-design.md
- FILE:docs/tdd-guidelines.md
- FILE:docs/shared/review-checklist.md
- FILE:docs/operations/quality-gates.md
- FILE:docs/operations/pr-checklist.md
- FILE:docs/operations/release-rollback.md
- FILE:docs/architecture/decision-workflow.md
- FILE:.github/workflows/ci.yml
- FILE:artifacts/misc/sonar-project.properties

#### Tasks
1. Promotion workflow documented
2. staging deploy automated
3. prod promotion requires gate pass + approval
4. rollback playbook defined
5. release checklist template in repo
6. targets: >=95%

#### Validation
```bash
# AUDIT:code-review
```

#### KPIs
- Staging deploy success >=95%
- prod promotion time <=30 min
- rollback tested in staging

#### Artifacts
- ARTIFACT:docs/release/promotion-policy.md;ARTIFACT:.github/workflows/release.yml;ARTIFACT:docs/operations/runbooks/release-checklist.md;EVIDENCE:artifacts/attestations/IFC-130/context_ack.json


---

## Success Criteria

| Category | Metric | Target |
|----------|--------|--------|
| Core CRM | Contacts CRUD working, search <200ms | Met |
| Security | 100% actions logged, RBAC functional | Met |
| Quality | Sonar quality gate >= A, zero blocker issues | Met |
| Infrastructure | Deployment switch <1m, no downtime | Met |
| Validation | Staging deploy success >=95% | Met |
| Validation | prod promotion time <=30 min | Met |
| Validation | rollback tested in staging | Met |
| Integration | Sync reliability >=99% | Met |
| Integration | duplicate events <1% | Met |
| Integration | sync latency <30s | Met |
| UI/Domain | Timeline load time <1s | Met |
| UI/Domain | deadline accuracy >=95% | Met |
| UI/Domain | user adoption rate | Met |
| UI/Domain | test coverage >=90% | Met |

---

## Agent Orchestration Instructions

### How to Execute This Sprint

This sprint should be executed using Claude Code with sub-agent orchestration. Follow these patterns:

### 0. Pre-Execution Context (CRITICAL)

**Before starting any task, gather context from previous work:**

```bash
# 1. Read completed tasks from previous sprint(s) for context
cat apps/project-tracker/docs/metrics/sprint-4/_summary.json

# 2. Review dependency graph to understand task relationships
cat apps/project-tracker/docs/metrics/_global/dependency-graph.json

# 3. Check current sprint status
cat apps/project-tracker/docs/metrics/_global/Sprint_plan.csv | grep "Sprint 5"

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
# Sprint 5 parallel execution:
Task("A", "Execute IFC-089") &
Task("B", "Execute IFC-098") &
Task("C", "Execute IFC-111, IFC-112") &
Task("D", "Execute IFC-138") &
Task("E", "Execute IFC-147") &
```

The `&` suffix indicates parallel execution. Wait for all to complete before proceeding to the next phase.

### 3. SWARM Execution (Implementation Tasks)

For **implementation tasks** (7 tasks marked as `swarm`):

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
- `IFC-089`: FLOW-005-A, FLOW-006, FLOW-014, FLOW-010-A: Contacts Module - Create/Edit/Search
- `IFC-098`: RBAC/ABAC & Audit Trail
- `IFC-111`: Set up SonarQube and integrate static analysis into CI/CD
- `IFC-112`: Implement blue/green deployment and rollback strategy
- `IFC-138`: Integrate external calendar providers (Google/Microsoft) with bidirectional sync; webhook handling; idempotency; reconciliation
- `IFC-147`: Develop Case timeline UI with deadline engine: display tasks; deadlines; events; implement deadline engine to compute legal deadlines and reminders; integrate with scheduling
- `IFC-130`: Release governance: staging auto-deploy, promotion policy, quality/security gates, rollback criteria

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
pnpm audit:sprint 5

# Generate attestation report
npx tsx tools/scripts/attest-sprint.ts 5

# Verify all tasks pass
cat artifacts/reports/attestation/sprint-5-latest.json
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
curl http://localhost:3002/api/metrics/sprint?sprint=5

# Governance status
curl http://localhost:3002/api/governance/summary?sprint=5

# Audit results
curl http://localhost:3002/api/audit/stream

# Execution status
curl http://localhost:3002/api/sprint/status?runId=<RUN_ID>
```

### 10. Execution Order Summary

| Phase | Type | Tasks |
|-------|------|-------|
| 0 | parallel | IFC-089, IFC-098, IFC-111, IFC-112, IFC-138, IFC-147 |
| 1 | sequential | IFC-130 |

---

## Definition of Done

A task is considered **DONE** when:

1. ✅ All validation commands pass (exit code 0)
2. ✅ All artifacts listed are created and accessible
3. ✅ All KPIs meet or exceed target values
4. ✅ No blocking issues or errors remain
5. ✅ Status updated to "Done" in Sprint_plan.csv
6. ✅ Evidence bundle generated (if MATOP task)

### Sprint 5 Completion Gate

The sprint is complete when:
- All achievable tasks marked as Done
- Deferred tasks documented with target sprint
- Blockers escalated with clear resolution path
- Phase summaries updated with final metrics
- Sprint summary reflects accurate totals