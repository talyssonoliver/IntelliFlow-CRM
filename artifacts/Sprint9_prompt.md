# Sprint 9 Sub-Agent Orchestration Prompt for Claude Code

## Mission Brief

You are orchestrating Sprint 9 of the **IntelliFlow CRM** project.

**Execution Model**: Use `claude --dangerously-skip-permissions` for autonomous sub-agent spawning with the `Task` tool for parallel orchestration.

---

## Sprint 9 Mission

**Project**: IntelliFlow CRM
**Sprint**: 9
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
| **Completed** | 0 |
| **Pending** | 8 |
| **Phases** | 1 |
| **Parallel Tasks** | 8 |
| **Theme** | Risk Mgmt |
| **Key Focus Areas** | Risk Mgmt, Reports, Ops & Observability, Observability |

---

## Sprint Dependency Graph

```
EXECUTION PHASES
============================================================

Phase 0: Initialisation
----------------------------------------
  [PARALLEL EXECUTION]
  Stream A:
    ○ IFC-056
  Stream B:
    ○ IFC-057
  Stream C:
    ○ IFC-096
  Stream D:
    ○ IFC-097
  Stream E:
    ○ IFC-116
  Stream F:
    ○ IFC-124
  Stream G:
    ○ IFC-145
  Stream H:
    ○ IFC-151
  ↓ (all complete before next phase)

============================================================
```

### Parallel Streams

| Stream | Tasks | Dependencies |
|--------|-------|--------------|
| P0-A | IFC-056 | IFC-009 |
| P0-B | IFC-057 | IFC-011 |
| P0-C | IFC-096 | IFC-091, IFC-092 |
| P0-D | IFC-097 | IFC-007 |
| P0-E | IFC-116 | IFC-074 |
| P0-F | IFC-124 | IFC-098 |
| P0-G | IFC-145 | IFC-002, IFC-136 |
| P0-H | IFC-151 | ENV-008-AI, IFC-150 |

---

## Complete Task List

### Pending Tasks (8)

| Task ID | Section | Description | Owner | Dependencies | KPIs |
|---------|---------|-------------|-------|--------------|------|
| **IFC-056** | Risk Mgmt | Team Upskilling Program | HR + Tech Lead (STOA-Foundation) | IFC-009 | Team velocity increasing, confidence >4/5 |
| **IFC-057** | Risk Mgmt | Vendor Lock-in Mitigation | PM + Tech Lead (STOA-Foundation) | IFC-011 | Migration tested, <1 week effort |
| **IFC-096** | Reports | Custom Reports & Dashboards | Frontend Dev + Data Eng (STOA-Domain) | IFC-091,IFC-092 | Custom dashboards created, export functional |
| **IFC-097** | Ops & Observability | Distributed Tracing & Logging | DevOps + SRE (STOA-Automation) | IFC-007 | 99% of requests traced, dashboards available |
| **IFC-116** | Observability | Instrument application with OpenTelemetry, unify logs, metrics and traces | DevOps + SRE (STOA-Automation) | IFC-074 | MTTD <2min; 100% services instrumented |
| **IFC-124** | Compliance | Encrypt and aggregate audit logs; automate compliance reporting | Security Eng + Compliance (STOA-Security) | IFC-098 | Audit retention meets regulatory needs; report generation automated |
| **IFC-145** | Migration | Plan and execute legacy system migration: discover and map data; assess data quality; design migration scripts; run rehearsals and reconciliation reporting; finalize cutover with rollback plan | Data Engineer + DBA + PM (STOA-Foundation) | IFC-002,IFC-136 | Data completeness >=99%; no critical data loss; migration downtime <4 hours; reconciliation accuracy verified |
| **IFC-151** | Platform | Event consumers framework: retries + DLQ + backoff + observability; standard webhook/idempotency utilities | Backend Dev + SRE (STOA-Domain) | IFC-150,ENV-008-AI | DLQ drain success >95%; retry success >90%; MTTR for consumer incidents <30 min |

---

## Execution Strategy

### Phase 0: Initialisation (Parallel)

Execute these streams **simultaneously** using the `Task` tool:

```bash
# Spawn parallel sub-agents
Task("A", "Risk Mgmt") &
Task("B", "Risk Mgmt") &
Task("C", "Reports") &
Task("D", "Ops & Observability") &
Task("E", "Observability") &
Task("F", "Compliance") &
Task("G", "Migration") &
Task("H", "Platform") &
```

### IFC-056: Team Upskilling Program

#### Context
Dependency: IFC-009
Owner: HR + Tech Lead (STOA-Foundation)
Execution Mode: SWARM

#### Pre-requisites
- FILE:artifacts/sprint0/codex-run/Framework.md
- FILE:audit-matrix.yml
- ENV:Training paths for modern stack created
- FILE:docs/shared/review-checklist.md
- FILE:docs/operations/pr-checklist.md
- FILE:artifacts/reports/team-skills-matrix.csv

#### Tasks
1. Continuous learning: tRPC, Next.js 16.0.10 (Turbopack FS caching, Cache Components, proxy replacing middleware), LangChain

#### Validation
```bash
# AUDIT:manual-review
```

#### KPIs
- Team velocity increasing, confidence >4/5

#### Artifacts
- ARTIFACT:artifacts/misc/skill-assessment-results.csv;ARTIFACT:artifacts/reports/training-completion.csv;ARTIFACT:artifacts/reports/confidence-survey.md;EVIDENCE:artifacts/attestations/IFC-056/context_ack.json

### IFC-057: Vendor Lock-in Mitigation

#### Context
Dependency: IFC-011
Owner: PM + Tech Lead (STOA-Foundation)
Execution Mode: SWARM

#### Pre-requisites
- FILE:artifacts/sprint0/codex-run/Framework.md
- FILE:audit-matrix.yml
- POLICY:Abstraction layers identified
- ENV:portability tested
- FILE:artifacts/reports/supabase-usage-report.json

#### Tasks
1. Can migrate from Supabase/Vercel if needed
2. artifacts: vendor-abstraction-layers.md, migration-test-plan.yaml, portability-test.log

#### Validation
```bash
# AUDIT:manual-review you should manual audit
```

#### KPIs
- Migration tested, <1 week effort

#### Artifacts
- ARTIFACT:docs/shared/vendor-abstraction-layers.md;ARTIFACT:artifacts/misc/migration-test-plan.yaml;ARTIFACT:artifacts/logs/portability-test.log;ARTIFACT:artifacts/reports/alternatives.csv;EVIDENCE:artifacts/attestations/IFC-057/context_ack.json

### IFC-096: Custom Reports & Dashboards

#### Context
Dependency: IFC-091,IFC-092
Owner: Frontend Dev + Data Eng (STOA-Domain)
Execution Mode: SWARM

#### Pre-requisites
- FILE:docs/design/page-registry.md
- FILE:docs/company/brand/visual-identity.md
- FILE:docs/company/brand/style-guide.md
- FILE:docs/company/brand/dos-and-donts.md
- FILE:docs/company/brand/accessibility-patterns.md
- FILE:artifacts/sprint0/codex-run/Framework.md
- FILE:audit-matrix.yml
- ENV:Drag-and-drop widget builder
- ENV:export CSV/PDF
- FILE:docs/architecture/hex-boundaries.md
- FILE:apps/api/src/modules/opportunity/opportunity.router.ts
- FILE:apps/api/src/shared/forecast-algorithm-tests.ts

#### Tasks
1. Custom dashboards created, export functional
2. artifacts: context_ack.json
3. verified by: pnpm build

#### Validation
```bash
# VALIDATE:pnpm build
```

#### KPIs
- Custom dashboards created, export functional

#### Artifacts
- EVIDENCE:artifacts/attestations/IFC-096/context_ack.json

### IFC-097: Distributed Tracing & Logging

#### Context
Dependency: IFC-007
Owner: DevOps + SRE (STOA-Automation)
Execution Mode: SWARM

#### Pre-requisites
- FILE:artifacts/sprint0/codex-run/Framework.md
- FILE:audit-matrix.yml
- ENV:OpenTelemetry
- ENV:Prometheus metrics
- ENV:Loki logs
- ENV:Grafana dashboards
- FILE:docs/planning/adr/ADR-008-audit-logging.md
- FILE:docs/operations/quality-gates.md
- FILE:artifacts/misc/k6/scripts/load-test.js

#### Tasks
1. 99% of requests traced, dashboards available
2. artifacts: trace-coverage-report.json, dashboard-catalog.md, context_ack.json
3. gates: coverage-gte-90

#### Validation
```bash
# GATE:coverage-gte-90
```

#### KPIs
- 99% of requests traced, dashboards available

#### Artifacts
- ARTIFACT:artifacts/coverage/trace-coverage-report.json;ARTIFACT:docs/shared/dashboard-catalog.md;EVIDENCE:artifacts/attestations/IFC-097/context_ack.json

### IFC-116: Instrument application with OpenTelemetry, unify logs, metrics and traces

#### Context
Dependency: IFC-074
Owner: DevOps + SRE (STOA-Automation)
Execution Mode: SWARM

#### Pre-requisites
- FILE:artifacts/sprint0/codex-run/Framework.md
- FILE:audit-matrix.yml
- ENV:OpenTelemetry integrated
- ENV:Sentry configured
- FILE:docs/architecture/hex-boundaries.md
- FILE:artifacts/misc/sentry-project-config.json

#### Tasks
1. All services emit structured logs, traces and metrics
2. dashboards and alerts created
3. SLOs defined
4. targets: >=100%, <2min

#### Validation
```bash
# AUDIT:manual-review
```

#### KPIs
- MTTD <2min
- 100% services instrumented

#### Artifacts
- ARTIFACT:artifacts/misc/otel-config.yaml;ARTIFACT:docs/security/log-schema.md;ARTIFACT:artifacts/misc/dashboards.json;ARTIFACT:artifacts/misc/alert-rules.yml;EVIDENCE:artifacts/attestations/IFC-116/context_ack.json

### IFC-124: Encrypt and aggregate audit logs; automate compliance reporting

#### Context
Dependency: IFC-098
Owner: Security Eng + Compliance (STOA-Security)
Execution Mode: SWARM

#### Pre-requisites
- FILE:artifacts/sprint0/codex-run/Framework.md
- FILE:audit-matrix.yml
- ENV:Audit logging implemented
- FILE:docs/planning/adr/ADR-008-audit-logging.md
- FILE:docs/planning/DDD-context-map.puml
- FILE:packages/db/prisma/schema.prisma
- FILE:docs/operations/quality-gates.md
- FILE:packages/db/prisma/schema-audit.prisma

#### Tasks
1. Audit logs encrypted and stored centrally
2. scheduled exports for compliance frameworks
3. data minimization applied
4. artifacts: audit-encryption-module.ts, retention-policy.md, context_ack.json

#### Validation
```bash
# AUDIT:manual-review
```

#### KPIs
- Audit retention meets regulatory needs
- report generation automated

#### Artifacts
- ARTIFACT:apps/api/src/shared/audit-encryption-module.ts;ARTIFACT:docs/shared/retention-policy.md;EVIDENCE:artifacts/attestations/IFC-124/context_ack.json

### IFC-145: Plan and execute legacy system migration: discover and map data; assess data quality; design migration scripts; run rehearsals and reconciliation reporting; finalize cutover with rollback plan

#### Context
Dependency: IFC-002,IFC-136
Owner: Data Engineer + DBA + PM (STOA-Foundation)
Execution Mode: SWARM

#### Pre-requisites
- FILE:artifacts/sprint0/codex-run/Framework.md
- FILE:audit-matrix.yml
- ENV:Access to legacy data
- mapping to new domain
- FILE:docs/planning/adr/ADR-007-data-governance.md
- FILE:docs/operations/quality-gates.md
- FILE:docs/operations/release-rollback.md
- FILE:docs/design-system/token-mapping.md
- FILE:docs/company/brand/visual-identity.md
- FILE:packages/db/prisma/schema.prisma
- FILE:packages/domain/src/legal/cases/Case.ts

#### Tasks
1. Data mapping documents created
2. migration scripts developed and tested
3. rehearsal migration executed with reconciliation reports
4. cutover plan created with rollback procedure
5. final migration executed with acceptance of accuracy and completeness
6. targets: >=99%

#### Validation
```bash
# VALIDATE:pnpm test
# AUDIT:code-review
```

#### KPIs
- Data completeness >=99%
- no critical data loss
- migration downtime <4 hours
- reconciliation accuracy verified

#### Artifacts
- ARTIFACT:scripts/migration/mapping.csv;ARTIFACT:scripts/migration/rehearsal-report.md;ARTIFACT:scripts/migration/cutover-plan.md;ARTIFACT:artifacts/misc/reconciliation-results.csv;EVIDENCE:artifacts/attestations/IFC-145/context_ack.json

### IFC-151: Event consumers framework: retries + DLQ + backoff + observability; standard webhook/idempotency utilities

#### Context
Dependency: IFC-150,ENV-008-AI
Owner: Backend Dev + SRE (STOA-Domain)
Execution Mode: SWARM

#### Pre-requisites
- FILE:artifacts/sprint0/codex-run/Framework.md
- FILE:audit-matrix.yml
- ENV:Event publisher in place
- monitoring/alerts configured
- FILE:docs/events/contracts-v1.yaml
- FILE:artifacts/misc/otel-config.yaml

#### Tasks
1. Consumer SDK supports retries/backoff
2. DLQ storage/triage workflow
3. idempotent handlers
4. poison-message handling
5. metrics and alerts
6. chaos tests
7. artifacts: dlq-triage.md, context_ack.json
8. targets: >=95%, >=90%, <30 min

#### Validation
```bash
# VALIDATE:pnpm test
```

#### KPIs
- DLQ drain success >95%
- retry success >90%
- MTTR for consumer incidents <30 min

#### Artifacts
- ARTIFACT:docs/operations/runbooks/dlq-triage.md;EVIDENCE:artifacts/attestations/IFC-151/context_ack.json


---

## Success Criteria

| Category | Metric | Target |
|----------|--------|--------|
| Risk Mgmt | Team velocity increasing, confidence >4/5 | Met |
| Risk Mgmt | Migration tested, <1 week effort | Met |
| Reports | Custom dashboards created, export functional | Met |
| Ops & Observability | 99% of requests traced, dashboards available | Met |
| Observability | MTTD <2min | Met |
| Observability | 100% services instrumented | Met |
| Compliance | Audit retention meets regulatory needs | Met |
| Compliance | report generation automated | Met |
| Migration | Data completeness >=99% | Met |
| Migration | no critical data loss | Met |
| Migration | migration downtime <4 hours | Met |
| Migration | reconciliation accuracy verified | Met |
| Platform | DLQ drain success >95% | Met |
| Platform | retry success >90% | Met |
| Platform | MTTR for consumer incidents <30 min | Met |

---

## Agent Orchestration Instructions

### How to Execute This Sprint

This sprint should be executed using Claude Code with sub-agent orchestration. Follow these patterns:

### 0. Pre-Execution Context (CRITICAL)

**Before starting any task, gather context from previous work:**

```bash
# 1. Read completed tasks from previous sprint(s) for context
cat apps/project-tracker/docs/metrics/sprint-8/_summary.json

# 2. Review dependency graph to understand task relationships
cat apps/project-tracker/docs/metrics/_global/dependency-graph.json

# 3. Check current sprint status
cat apps/project-tracker/docs/metrics/_global/Sprint_plan.csv | grep "Sprint 9"

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
# Sprint 9 parallel execution:
Task("A", "Execute IFC-056") &
Task("B", "Execute IFC-057") &
Task("C", "Execute IFC-096") &
Task("D", "Execute IFC-097") &
Task("E", "Execute IFC-116") &
Task("F", "Execute IFC-124") &
Task("G", "Execute IFC-145") &
Task("H", "Execute IFC-151") &
```

The `&` suffix indicates parallel execution. Wait for all to complete before proceeding to the next phase.

### 3. SWARM Execution (Implementation Tasks)

For **implementation tasks** (8 tasks marked as `swarm`):

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
- `IFC-056`: Team Upskilling Program
- `IFC-057`: Vendor Lock-in Mitigation
- `IFC-096`: Custom Reports & Dashboards
- `IFC-097`: Distributed Tracing & Logging
- `IFC-116`: Instrument application with OpenTelemetry, unify logs, metrics and traces
- `IFC-124`: Encrypt and aggregate audit logs; automate compliance reporting
- `IFC-145`: Plan and execute legacy system migration: discover and map data; assess data quality; design migration scripts; run rehearsals and reconciliation reporting; finalize cutover with rollback plan
- `IFC-151`: Event consumers framework: retries + DLQ + backoff + observability; standard webhook/idempotency utilities

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
pnpm audit:sprint 9

# Generate attestation report
npx tsx tools/scripts/attest-sprint.ts 9

# Verify all tasks pass
cat artifacts/reports/attestation/sprint-9-latest.json
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
curl http://localhost:3002/api/metrics/sprint?sprint=9

# Governance status
curl http://localhost:3002/api/governance/summary?sprint=9

# Audit results
curl http://localhost:3002/api/audit/stream

# Execution status
curl http://localhost:3002/api/sprint/status?runId=<RUN_ID>
```

### 10. Execution Order Summary

| Phase | Type | Tasks |
|-------|------|-------|
| 0 | parallel | IFC-056, IFC-057, IFC-096, IFC-097, IFC-116, IFC-124, IFC-145, IFC-151 |

---

## Definition of Done

A task is considered **DONE** when:

1. ✅ All validation commands pass (exit code 0)
2. ✅ All artifacts listed are created and accessible
3. ✅ All KPIs meet or exceed target values
4. ✅ No blocking issues or errors remain
5. ✅ Status updated to "Done" in Sprint_plan.csv (apps/project-tracker/docs/metrics/_global/Sprint_plan.csv)
6. ✅ Evidence bundle generated (if MATOP task) (attestation.json)

### Sprint 9 Completion Gate

The sprint is complete when:
- All achievable tasks marked as Done
- Deferred tasks documented with target sprint
- Blockers escalated with clear resolution path
- Phase summaries updated with final metrics
- Sprint summary reflects accurate totals