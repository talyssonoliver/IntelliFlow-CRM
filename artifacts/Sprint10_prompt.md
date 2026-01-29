# Sprint 10 Sub-Agent Orchestration Prompt for Claude Code

## Mission Brief

You are orchestrating Sprint 10 of the **IntelliFlow CRM** project.

**Execution Model**: Use `claude --dangerously-skip-permissions` for autonomous sub-agent spawning with the `Task` tool for parallel orchestration.

**Target Application**: All implementation work targets the **web app** (`apps/web/` at `http://localhost:3000`), not the project-tracker.

---

## Sprint 10 Mission

**Project**: IntelliFlow CRM
**Sprint**: 10
**Theme**: Security & Compliance

### Key Objectives
- Code: Deliver high-quality, tested code for the web app
- Integration: Seamlessly integrate new features into existing architecture
- Security: Ensure robust security and compliance
- Performance: Optimize for speed and responsiveness
- Aviability: Ensure high availability and reliability
- Maintainability: Write clean, maintainable code
- Documentation: Provide clear documentation and specs

### Execution Guidelines
- Complete all achievable tasks for this sprint
- Spawn parallel sub-agents where possible for efficiency
- Validate all deliverables meet KPIs before marking complete
- Escalate blockers and human-intervention tasks promptly
- All implementation targets `apps/web/` and `apps/api/`

---

## Sprint Overview

| Metric | Value |
|--------|-------|
| **Total Tasks** | 9 |
| **Completed** | 8 |
| **Pending** | 1 |
| **Phases** | 1 |
| **Parallel Tasks** | 0 |
| **Theme** | Security & Compliance |
| **Key Focus Areas** | Security, Quality, Integrations, Governance |
| **Web App** | http://localhost:3000 |

---

## Sprint Dependency Graph

```
EXECUTION PHASES
============================================================

Phase 0: Initialisation
----------------------------------------
  ○ IFC-141 → Evaluate n8n; custom engine; and Tempora...
  ↓

============================================================
```

### Parallel Streams

| Stream | Tasks | Dependencies |
|--------|-------|--------------|
| P0-A | IFC-141 | IFC-135, IFC-136, IFC-137, IFC-150, IFC-151 |

---

## Complete Task List

### Completed Tasks (8)

| Task ID | Section | Description | Status |
|---------|---------|-------------|--------|
| **IFC-076** | Quality | Component Library (shadcn/ui) | ✅ Completed |
| **IFC-099** | Integrations | ERP/Payment/Email Connectors | ✅ Completed |
| **IFC-100** | Governance | ADR Registry & Compliance Reporting | ✅ Completed |
| **IFC-113** | Security | Implement secrets management and encryption at rest and in transit | ✅ Completed |
| **IFC-117** | AI Insights | Monitor AI models for drift, latency, hallucination and ROI | ✅ Completed |
| **IFC-121** | Security | Schedule periodic secret rotation and dependency vulnerability updates | ✅ Completed |
| **IFC-127** | Security | Implement tenant isolation at database and application layers | ✅ Completed |
| **IFC-144** | Integration | Design and implement inbound/outbound email flows: SPF/DKIM/DMARC; inbound parsing; attachments; implement general webhook handling with idempotency and retries; publish public API specification (OpenAPI) with versioning; baseline inbound email feature delivered | ✅ Completed |

### Pending Tasks (1)

| Task ID | Section | Description | Owner | Dependencies | KPIs |
|---------|---------|-------------|-------|--------------|------|
| **IFC-141** | Workflow | Evaluate n8n; custom engine; and Temporal; document decision via ADR; build event-driven minimal rules engine and integrate selected workflow engine | Tech Lead + Backend Dev + Product Manager (STOA-Domain) | IFC-136,IFC-137,IFC-135,IFC-150,IFC-151 | Decision ratified; POC demonstrates reliability; workflow execution success rate >95% |

---

## Execution Strategy

### Phase 0: Initialisation (Sequential)

### IFC-141: Evaluate n8n; custom engine; and Temporal; document decision via ADR; build event-driven minimal rules engine and integrate selected workflow engine

### Key Objectives

- Code: Deliver high-quality, tested code for the web app
- Integration: Seamlessly integrate new features into existing architecture
- Security: Ensure robust security and compliance
- Performance: Optimize for speed and responsiveness
- Aviability: Ensure high availability and reliability
- Maintainability: Write clean, maintainable code
- Documentation: Provide clear documentation and specs

#### Context
Dependency: IFC-136,IFC-137,IFC-135,IFC-150,IFC-151
Owner: Tech Lead + Backend Dev + Product Manager (STOA-Domain)
Execution Mode: SWARM

#### Pre-requisites
- FILE:artifacts/sprint0/codex-run/Framework.md
- FILE:audit-matrix.yml
- ENV:Domain events instrumentation ready
- FILE:docs/planning/adr/ADR-005-workflow-engine.md
- FILE:docs/operations/quality-gates.md
- FILE:docs/architecture/adr/000-template.md
- FILE:docs/architecture/decision-workflow.md
- FILE:docs/company/brand/visual-identity.md
- FILE:packages/domain/src/legal/cases/Case.ts
- FILE:packages/domain/src/legal/appointments/Appointment.ts
- FILE:docs/planning/adr/ADR-004-multi-tenancy.md
- FILE:docs/events/contracts-v1.yaml
- FILE:docs/operations/runbooks/dlq-triage.md

#### Tasks
1. Comparative analysis of workflow options
2. ADR published
3. POC implemented
4. events published for case status changes
5. selected engine integrated to process simple workflows
6. training delivered
7. artifacts: adr-workflow-decision.md, events-spec.yaml, context_ack.json
8. targets: >=95%
9. verified by: pnpm test
### Key Objectives

- Code: Deliver high-quality, tested code for the web app
- Integration: Seamlessly integrate new features into existing architecture
- Security: Ensure robust security and compliance
- Performance: Optimize for speed and responsiveness
- Aviability: Ensure high availability and reliability
- Maintainability: Write clean, maintainable code
- Documentation: Provide clear documentation and specs


#### Validation
```bash
# VALIDATE:pnpm test
# AUDIT:code-review
```

#### KPIs
- Decision ratified
- POC demonstrates reliability
- workflow execution success rate >95%

#### Artifacts
| Type | Path | Description |
|------|------|-------------|
| SPEC | .specify/specifications/IFC-141.md | Documentation |
| PLAN | .specify/planning/IFC-141.md | Documentation |
| EVIDENCE | artifacts/attestations/IFC-141/context_pack.md | Completion attestation |
| EVIDENCE | artifacts/attestations/IFC-141/context_ack.json | Completion attestation |
| ARTIFACT | docs/adr/adr-workflow-decision.md | Documentation |
| ARTIFACT | artifacts/misc/events-spec.yaml | Configuration file |


---

## Success Criteria

| Category | Metric | Target |
|----------|--------|--------|
| Quality | 20+ components, 100% accessible | Met |
| Integrations | ERP sync functional, payments processed, emails sent | Met |
| Governance | ADR repo active, compliance docs ready | Met |
| Security | No secrets in repo, 100% encrypted endpoints | Met |
| Security | No outdated secrets | Met |
| Security | CVE remediation within SLA | Met |
| Security | No cross‑tenant data access | Met |
| Security | isolation tests pass | Met |
| AI Insights | Drift detected within 1 day, hallucination rate <5%, ROI tracked | Met |
| Workflow | Decision ratified | Met |
| Workflow | POC demonstrates reliability | Met |
| Workflow | workflow execution success rate >95% | Met |
| Integration | Outbound deliverability >=95% | Met |
| Integration | inbound parse accuracy >=99% | Met |
| Integration | API spec coverage 100% | Met |
| Integration | zero duplicate webhook processing | Met |

---

## Agent Orchestration Instructions

### How to Execute This Sprint

This sprint should be executed using Claude Code with sub-agent orchestration. Follow these patterns:

### 0. Pre-Execution Context (CRITICAL)

**Before starting any task, gather context from previous work:**

```bash
### Key Objectives
');
- Code: Deliver high-quality, tested code for the web app
- Integration: Seamlessly integrate new features into existing architecture
- Security: Ensure robust security and compliance
- Performance: Optimize for speed and responsiveness
- Aviability: Ensure high availability and reliability
- Maintainability: Write clean, maintainable code
- Documentation: Provide clear documentation and specs

# 1. Read completed tasks from previous sprint(s) for context
cat apps/project-tracker/docs/metrics/sprint-9/_summary.json

# 2. Review dependency graph to understand task relationships
cat apps/project-tracker/docs/metrics/_global/dependency-graph.json

# 3. Check current sprint status
cat apps/project-tracker/docs/metrics/_global/Sprint_plan.csv | grep "Sprint 10"

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

# Update Sprint_plan.csv status to "Planned"
# Edit the CSV directly or use sync tools
```

#### Step 2: Start Implementation (Planned → In Progress)
```bash
# Update status to "In Progress" in Sprint_plan.csv
# Execute via SWARM or MATOP (see sections below)
```

#### Step 3: Complete & Validate (In Progress → Done)
```bash
# Run validation and audit (see Section 8)
# Update status to "Done" in Sprint_plan.csv with evidence
# Create attestation in artifacts/attestations/<TASK_ID>/
```

### 2. Parallel Task Spawning

For parallel phases, spawn sub-agents using the `Task` tool:

```bash
# Sprint 10 parallel execution:
Task("STREAM-A", "Execute IFC-141") &
```

The `&` suffix indicates parallel execution. Wait for all to complete before proceeding to the next phase.

### 3. SWARM Execution (Implementation Tasks)

For **implementation tasks** (1 tasks marked as `swarm`):

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
- `IFC-141`: Evaluate n8n; custom engine; and Temporal; document decision via ADR; build event-driven minimal rules engine and integrate selected workflow engine

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
# Update Sprint_plan.csv directly
# Then sync metrics
pnpm --filter project-tracker sync-metrics
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
pnpm audit:sprint 10

# Generate attestation report
npx tsx tools/scripts/attest-sprint.ts 10

# Verify all tasks pass
cat artifacts/reports/attestation/sprint-10-latest.json
```

### 9. Web App Development Workflow

**Use the Web App (http://localhost:3000) for development and testing:**

| Area | Path | Description |
|------|------|-------------|
| **Dashboard** | `/dashboard` | Main CRM dashboard |
| **Leads** | `/leads` | Lead management |
| **Contacts** | `/contacts` | Contact management |
| **Deals** | `/deals` | Deal pipeline |
| **Tickets** | `/tickets` | Support tickets |
| **Cases** | `/cases/timeline` | Case timeline |
| **Analytics** | `/analytics` | Analytics dashboard |
| **Agent Approvals** | `/agent-approvals/preview` | AI agent approval workflow |

**Development Commands:**
```bash
# Start the web app
pnpm --filter web dev

# Start the API
pnpm --filter api dev

# Start all apps
pnpm dev

# Run web app tests
pnpm --filter web test

# Build the web app
pnpm --filter web build

# Type check
pnpm --filter web typecheck
```

**API Development (tRPC):**
```bash
# API is served at http://localhost:3001/trpc
# tRPC client types are auto-generated

# Run API tests
pnpm --filter api test

# Type check API
pnpm --filter api typecheck
```

### 10. Execution Order Summary

| Phase | Type | Tasks |
|-------|------|-------|
| 0 | sequential | IFC-141 |

---

## Definition of Done

A task is considered **DONE** when:
  ### Key Objectives
  - Code: Deliver high-quality, tested code for the web app
  - Integration: Seamlessly integrate new features into existing architecture
  - Security: Ensure robust security and compliance
  - Performance: Optimize for speed and responsiveness
  - Aviability: Ensure high availability and reliability
  - Maintainability: Write clean, maintainable code
  - Documentation: Provide clear documentation and specs

1. ✅ All validation commands pass (exit code 0)
2. ✅ All artifacts listed are created and accessible
3. ✅ All KPIs meet or exceed target values
4. ✅ No blocking issues or errors remain
5. ✅ Status updated to "Done" in Sprint_plan.csv
6. ✅ Attestation created in `artifacts/attestations/<TASK_ID>/`
7. ✅ Code merged to main branch (if applicable)

### Sprint 10 Completion Gate

The sprint is complete when:
- All achievable tasks marked as Done
- Deferred tasks documented with target sprint
- Blockers escalated with clear resolution path
- Phase summaries updated with final metrics
- Sprint summary reflects accurate totals
- All attestations generated with COMPLETE verdict