# Sprint 6 Sub-Agent Orchestration Prompt for Claude Code

## Mission Brief

You are orchestrating Sprint 6 of the **IntelliFlow CRM** project.

**Execution Model**: Use `claude --dangerously-skip-permissions` for autonomous sub-agent spawning with the `Task` tool for parallel orchestration.

---

## Sprint 6 Mission

**Project**: IntelliFlow CRM
**Sprint**: 6
**Theme**: MVP Week 1

### Key Objectives
- Complete all achievable tasks for this sprint
- Spawn parallel sub-agents where possible for efficiency
- Validate all deliverables meet KPIs before marking complete
- Escalate blockers and human-intervention tasks promptly

---

## Sprint Overview

| Metric | Value |
|--------|-------|
| **Total Tasks** | 10 |
| **Completed** | 1 |
| **Pending** | 9 |
| **Phases** | 3 |
| **Parallel Tasks** | 8 |
| **Theme** | MVP Week 1 |
| **Key Focus Areas** | MVP Week 1, Core CRM, AI Assistant, Decision Gate |

---

## Design System References

All UI tasks must reference these design system documents:

| Document | Path | Purpose |
|----------|------|---------|
| **Flow Index** | `apps/project-tracker/docs/metrics/_global/flows/flow-index.md` | Master catalog of all 38 user flows |
| **UI Flow Mapping** | `docs/design/ui-flow-mapping.md` | Route → Flow → Component cross-reference |
| **Sitemap** | `docs/design/sitemap.md` | Application routes with flow links |
| **Style Guide** | `docs/company/brand/style-guide.md` | Component patterns and code examples |
| **Visual Identity** | `docs/company/brand/visual-identity.md` | Design tokens (colors, typography) |
| **Accessibility** | `docs/company/brand/accessibility-patterns.md` | ARIA patterns and keyboard navigation |
| **Do's and Don'ts** | `docs/company/brand/dos-and-donts.md` | Best practices and anti-patterns |

### Key Flow References for Sprint 6

| Task | Implements Flows | Category |
|------|------------------|----------|
| IFC-090 (Contact 360) | FLOW-016, FLOW-020 | Comunicação |
| IFC-091 (Deals Pipeline) | FLOW-007, FLOW-008, FLOW-009 | Comercial Core |

---

## Current Implementation State

**Reference**: `docs/design/page-registry.md` → Implementation Status section

### Existing Pages

| Route | Status | API | Navigation | Key Components |
|-------|--------|-----|------------|----------------|
| /dashboard | Placeholder | No | ✅ Shared layout | 4 StatCards, Recent Leads, AI Insights, Activity Overview |
| /leads | Basic | No | ⚠️ Own nav bar | Table, filters, LeadForm modal, 2 sample leads |
| /contacts | Basic | No | ⚠️ Own nav bar | Search, ContactCard grid, 2 sample contacts |
| /analytics | Placeholder | No | ⚠️ Own nav bar | 4 MetricCards, Pipeline placeholder, AI Recommendations |

### Known Issue: Navigation Inconsistency

**Problem**: The application has TWO navigation patterns:
1. **Shared Layout** (`apps/web/src/app/layout.tsx`) - Uses `Navigation` component as sidebar
2. **Inline Nav Bar** - Duplicated in `/leads`, `/contacts`, `/analytics` pages

**Impact**: Inconsistent UX, code duplication, harder maintenance

**Resolution Required**: Before implementing IFC-090 and IFC-091:
- Remove inline nav bars from existing pages
- Ensure all pages use the shared Navigation sidebar
- Verify consistent sidebar behavior across all routes

---

## Sprint Dependency Graph

```
EXECUTION PHASES
============================================================

Phase 0: Initialisation
----------------------------------------
  [PARALLEL EXECUTION]
  Stream A:
    ○ IFC-012
  Stream B:
    ○ IFC-090
  Stream C:
    ○ IFC-091
  Stream D:
    ○ IFC-129
  Stream E:
    ○ IFC-132
  Stream F:
    ○ IFC-139
  ↓ (all complete before next phase)

Phase 1: MVP Week 1 (2 tasks)
----------------------------------------
  [PARALLEL EXECUTION]
  Stream A:
    ○ IFC-013
  Stream B:
    ○ IFC-149
  ↓ (all complete before next phase)

Phase 2: MVP Week 1 (1 tasks)
----------------------------------------
  ○ IFC-017 → PHASE-002: Prisma + Supabase Data Layer...
  ↓

============================================================
```

### Parallel Streams

| Stream | Tasks | Dependencies |
|--------|-------|--------------|
| P0-A | IFC-012 | IFC-010 |
| P0-B | IFC-090 | IFC-089 |
| P0-C | IFC-091 | IFC-002, IFC-004 |
| P0-D | IFC-129 | IFC-110 |
| P0-E | IFC-132 | ENV-005-AI |
| P0-F | IFC-139 | IFC-003, IFC-128, IFC-136, IFC-137 |
| P1-A | IFC-013 | IFC-012 |
| P1-B | IFC-149 | IFC-139, IFC-147 |
| P2-A | IFC-017 | IFC-012, IFC-013 |

---

## Complete Task List

### Completed Tasks (1)

| Task ID | Section | Description | Status |
|---------|---------|-------------|--------|
| **IFC-010** | Decision Gate | PHASE-001: Phase 1 Go/No-Go Decision | ✅ Completed |

### Pending Tasks (9)

| Task ID | Section | Description | Owner | Dependencies | KPIs |
|---------|---------|-------------|-------|--------------|------|
| **IFC-012** | MVP Week 1 | PHASE-002: Turborepo Monorepo Setup | Tech Lead + Backend Dev (STOA-Domain) | IFC-010 | Build caching working, <3min builds |
| **IFC-013** | MVP Week 1 | PHASE-002: tRPC Router Implementation | Backend Dev + Tech Lead (STOA-Domain) | IFC-012 | 100% type coverage, API response <50ms |
| **IFC-017** | MVP Week 1 | PHASE-002: Prisma + Supabase Data Layer | Backend Dev + DA (STOA-Domain) | IFC-012,IFC-013 | Zero data loss, queries <20ms |
| **IFC-090** | Core CRM | Contact 360 Page - Full Detail View | Frontend Dev + UX Designer (STOA-Domain) | IFC-089 | 360 page functional with >90 Lighthouse score |
| **IFC-091** | Core CRM | Deals Pipeline - Kanban Board | Frontend Dev + Backend Dev (STOA-Domain) | IFC-002,IFC-004 | Kanban board working, stage changes persist <300ms |
| **IFC-129** | Testing | Write UI and contract tests for core pages and tRPC endpoints | QA + Frontend Dev (STOA-Quality) | IFC-110 | Coverage ≥90%, tests run <5min |
| **IFC-132** | Security | Supply chain security: dependency pinning + SBOM generation in CI (npm/pnpm + container) | Security Engineer + Backend Dev (STOA-Security) | ENV-005-AI | 100% builds produce SBOM; 0 unsigned/untracked dependency changes merged |
| **IFC-139** | AI Assistant | Expose application services as agent tools and implement human approval flows with preview and rollback for high-risk actions | AI Specialist + Backend Dev (STOA-Intelligence) | IFC-136,IFC-137,IFC-003,IFC-128 | 100% tool actions authorized; zero unauthorized writes; user approval latency <30s |
| **IFC-149** | AI Assistant | Implement action preview and rollback UI for agent-initiated changes; integrated with approval flows | Frontend Dev + AI Specialist (STOA-Intelligence) | IFC-139,IFC-147 | 100% agent actions previewed; zero unauthorized changes; approval rate and latency tracked |

---

## Execution Strategy

### Phase 0: Initialisation (Parallel)

Execute these streams **simultaneously** using the `Task` tool:

```bash
# Spawn parallel sub-agents
Task("A", "MVP Week 1") &
Task("B", "Core CRM") &
Task("C", "Core CRM") &
Task("D", "Testing") &
Task("E", "Security") &
Task("F", "AI Assistant") &
```

### IFC-012: PHASE-002: Turborepo Monorepo Setup

#### Context
Dependency: IFC-010
Owner: Tech Lead + Backend Dev (STOA-Domain)
Execution Mode: SWARM

#### Pre-requisites
- FILE:artifacts/sprint0/codex-run/Framework.md
- FILE:tools/audit/audit-matrix.yml
- ENV:Node.js 20
- ENV:pnpm installed
- FILE:docs/planning/adr/ADR-001-modern-stack.md
- FILE:docs/architecture/repo-layout.md
- FILE:artifacts/misc/decision-gate-1.md

#### Tasks
1. Monorepo with apps/, packages/, shared configs
2. targets: <3min
3. verified by: pnpm build

#### Validation
```bash
# VALIDATE:pnpm build
```

#### KPIs
- Build caching working, <3min builds

#### Artifacts
- ARTIFACT:artifacts/misc/turbo.json;ARTIFACT:.github/workflows/ci.yml;ARTIFACT:artifacts/misc/pnpm-workspace.yaml;EVIDENCE:artifacts/attestations/IFC-012/context_ack.json

### IFC-090: Contact 360 Page - Full Detail View

#### Context
Dependency: IFC-089
Owner: Frontend Dev + UX Designer (STOA-Domain)
Execution Mode: SWARM

#### ⚠️ CRITICAL: Navigation Fix Required
Before implementing this task, you **MUST** resolve the navigation inconsistency:
- **Current State**: `/contacts` page has its own inline nav bar (duplicate navigation code)
- **Required State**: `/contacts` must use shared layout Navigation sidebar like `/dashboard`
- **Action**: Remove inline nav from `apps/web/src/app/contacts/page.tsx`
- **Reference**: See `docs/design/page-registry.md` → Known Issues → Navigation Inconsistency

#### Pre-requisites
- FILE:docs/design/page-registry.md (check Implementation Status section)
- DESIGN:docs/design/mockups/contact-360-view.png
- FILE:docs/company/brand/visual-identity.md
- FILE:docs/company/brand/style-guide.md
- FILE:docs/company/brand/dos-and-donts.md
- FILE:docs/company/brand/accessibility-patterns.md
- FILE:apps/project-tracker/docs/metrics/_global/flows/flow-index.md
- FILE:docs/design/ui-flow-mapping.md
- IMPLEMENTS:FLOW-016 (Envio de Email com Tracking)
- IMPLEMENTS:FLOW-020 (Feed de Atividade Unificado)
- FILE:artifacts/sprint0/codex-run/Framework.md
- FILE:tools/audit/audit-matrix.yml
- ENV:Header with contact photo+name+company+metrics
- ENV:tabs (Overview,Activity Timeline,Deals,Tickets,Documents,AI Insights)
- ENV:Right sidebar with Tasks+AI Insights+Notes
- FILE:apps/api/src/modules/crm/contacts.router.ts
- FIX:Remove inline nav bar from /contacts page (use shared layout)

#### Tasks
1. 360 page functional with >90 Lighthouse score matching design mockup
2. artifacts: lighthouse-360-report.html, context_ack.json
3. gates: lighthouse-gte-90

#### Validation
```bash
# GATE:lighthouse-gte-90
```

#### KPIs
- 360 page functional with >90 Lighthouse score

#### Artifacts
- ARTIFACT:artifacts/lighthouse/lighthouse-360-report.html;EVIDENCE:artifacts/attestations/IFC-090/context_ack.json

### IFC-091: Deals Pipeline - Kanban Board

#### Context
Dependency: IFC-002,IFC-004
Owner: Frontend Dev + Backend Dev (STOA-Domain)
Execution Mode: SWARM

#### ⚠️ CRITICAL: Navigation Consistency Required
This is a NEW page. Ensure it follows the shared layout pattern:
- **Required**: Use shared layout Navigation sidebar like `/dashboard`
- **DO NOT**: Create inline nav bar (see anti-pattern in `/leads`, `/contacts`, `/analytics`)
- **Reference**: See `docs/design/page-registry.md` → Known Issues → Navigation Inconsistency

#### Pre-requisites
- FILE:docs/design/page-registry.md (check Implementation Status section)
- DESIGN:docs/design/mockups/dashboard-overview.png
- FILE:docs/company/brand/visual-identity.md
- FILE:docs/company/brand/style-guide.md
- FILE:docs/company/brand/dos-and-donts.md
- FILE:docs/company/brand/accessibility-patterns.md
- FILE:apps/project-tracker/docs/metrics/_global/flows/flow-index.md
- FILE:docs/design/ui-flow-mapping.md
- IMPLEMENTS:FLOW-007 (Gestão de Pipeline Kanban)
- IMPLEMENTS:FLOW-008 (Criação e Atualização de Deal)
- IMPLEMENTS:FLOW-009 (Fechamento de Deal Won/Lost)
- FILE:artifacts/sprint0/codex-run/Framework.md
- FILE:tools/audit/audit-matrix.yml
- ENV:Pipeline stages (Qualification,Needs Analysis,Proposal,Negotiation,Closed)
- ENV:Drag-and-drop Kanban
- ENV:Deals by Stage pie chart
- ENV:Revenue bar chart
- FILE:docs/operations/quality-gates.md
- FILE:packages/db/prisma/schema.prisma
- PATTERN:Use shared layout Navigation (NO inline nav bar)

#### Tasks
1. Kanban board working matching design mockup, stage changes persist <300ms
2. artifacts: deals.router.ts, drag-drop-test.e2e.ts, context_ack.json

#### Validation
```bash
# AUDIT:manual-review
```

#### KPIs
- Kanban board working, stage changes persist <300ms

#### Artifacts
- ARTIFACT:apps/api/src/modules/crm/deals.router.ts;ARTIFACT:apps/web/lib/deals/drag-drop-test.e2e.ts;EVIDENCE:artifacts/attestations/IFC-091/context_ack.json

### IFC-129: Write UI and contract tests for core pages and tRPC endpoints

#### Context
Dependency: IFC-110
Owner: QA + Frontend Dev (STOA-Quality)
Execution Mode: SWARM

#### Pre-requisites
- FILE:artifacts/sprint0/codex-run/Framework.md
- FILE:tools/audit/audit-matrix.yml
- ENV:Core pages built
- FILE:docs/planning/adr/ADR-001-modern-stack.md
- FILE:docs/tdd-guidelines.md
- FILE:docs/shared/review-checklist.md
- FILE:docs/company/brand/visual-identity.md

#### Tasks
1. Playwright/Cypress tests cover navigation, forms, interactive components
2. contract tests validate tRPC endpoints
3. artifacts: ui-coverage.html, context_ack.json
4. targets: >=90%, <5min
5. gates: coverage-gte-90

#### Validation
```bash
# VALIDATE:pnpm test
# GATE:coverage-gte-90
```

#### KPIs
- Coverage ≥90%, tests run <5min

#### Artifacts
- ARTIFACT:artifacts/misc/coverage-reports/ui-coverage.html;EVIDENCE:artifacts/attestations/IFC-129/context_ack.json

### IFC-132: Supply chain security: dependency pinning + SBOM generation in CI (npm/pnpm + container)

#### Context
Dependency: ENV-005-AI
Owner: Security Engineer + Backend Dev (STOA-Security)
Execution Mode: SWARM

#### Pre-requisites
- FILE:artifacts/sprint0/codex-run/Framework.md
- FILE:tools/audit/audit-matrix.yml
- POLICY:CI pipeline available
- container build defined
- FILE:docs/security/zero-trust-design.md
- FILE:docs/security/owasp-checklist.md
- FILE:docs/operations/quality-gates.md
- FILE:.github/workflows/ci.yml

#### Tasks
1. Dependencies pinned/locked
2. SBOM generated per build
3. SBOM stored as artifact
4. baseline policy documented
5. targets: >=100%

#### Validation
```bash
# AUDIT:code-review
```

#### KPIs
- 100% builds produce SBOM
- 0 unsigned/untracked dependency changes merged

#### Artifacts
- ARTIFACT:.github/workflows/security-sbom.yml;ARTIFACT:docs/security/supply-chain.md;EVIDENCE:artifacts/attestations/IFC-132/context_ack.json

### IFC-139: Expose application services as agent tools and implement human approval flows with preview and rollback for high-risk actions

#### Context
Dependency: IFC-136,IFC-137,IFC-003,IFC-128
Owner: AI Specialist + Backend Dev (STOA-Intelligence)
Execution Mode: SWARM

#### Pre-requisites
- FILE:artifacts/sprint0/codex-run/Framework.md
- FILE:tools/audit/audit-matrix.yml
- ENV:Agent infrastructure ready
- tRPC endpoints stable
- FILE:docs/planning/adr/ADR-006-agent-tools.md
- FILE:docs/architecture/hex-boundaries.md
- FILE:docs/shared/review-checklist.md
- FILE:docs/operations/pr-checklist.md
- FILE:docs/operations/release-rollback.md
- FILE:packages/domain/src/legal/cases/Case.ts
- FILE:packages/domain/src/lega/appointments/Appointment.ts
- FILE:apps/api/src/trpc.ts
- FILE:docs/shared/ai-review-checklist.md

#### Tasks
1. Agent tools for search
2. create
3. update case and appointments and draft messages
4. approval UI with diff preview
5. rollback mechanism
6. authorization checks
7. logging
8. tests
9. artifacts: agent-actions.log, context_ack.json
10. targets: >=100%, <30s, zero errors

#### Validation
```bash
# VALIDATE:pnpm test
# AUDIT:manual-review
# AUDIT:code-review
```

#### KPIs
- 100% tool actions authorized
- zero unauthorized writes
- user approval latency <30s

#### Artifacts
- ARTIFACT:artifacts/misc/logs/agent-actions.log;EVIDENCE:artifacts/attestations/IFC-139/context_ack.json


### Phase 1: MVP Week 1 (2 tasks) (Parallel)

Execute these streams **simultaneously** using the `Task` tool:

```bash
# Spawn parallel sub-agents
Task("A", "MVP Week 1") &
Task("B", "AI Assistant") &
```

### IFC-013: PHASE-002: tRPC Router Implementation

#### Context
Dependency: IFC-012
Owner: Backend Dev + Tech Lead (STOA-Domain)
Execution Mode: SWARM

#### Pre-requisites
- FILE:artifacts/sprint0/codex-run/Framework.md
- FILE:tools/audit/audit-matrix.yml
- ENV:Turborepo ready
- ENV:TypeScript configured
- FILE:docs/planning/adr/ADR-001-modern-stack.md
- FILE:docs/operations/engineering-playbook.md
- FILE:artifacts/misc/turbo.json

#### Tasks
1. Lead CRUD with tRPC, Zod validation, type-safe client
2. artifacts: leads.router.ts, index.html, context_ack.json
3. targets: >=100%, <50ms

#### Validation
```bash
# AUDIT:manual-review
```

#### KPIs
- 100% type coverage, API response <50ms

#### Artifacts
- ARTIFACT:apps/api/src/modules/crm/leads.router.ts;ARTIFACT:artifacts/misc/coverage/lcov-report/index.html;ARTIFACT:apps/project-tracker/docs/metrics/_global/phase-validations/PHASE-002-validation.md;EVIDENCE:artifacts/attestations/IFC-013/context_ack.json

**Note**: FLOW-002 is "Gestão de Usuários e Permissões" (User Management), not related to tRPC implementation.

### IFC-149: Implement action preview and rollback UI for agent-initiated changes; integrated with approval flows

#### Context
Dependency: IFC-139,IFC-147
Owner: Frontend Dev + AI Specialist (STOA-Intelligence)
Execution Mode: SWARM

#### Pre-requisites
- FILE:artifacts/sprint0/codex-run/Framework.md
- FILE:tools/audit/audit-matrix.yml
- ENV:Agent tools implemented
- case timeline UI built
- FILE:docs/planning/adr/ADR-006-agent-tools.md
- FILE:docs/shared/review-checklist.md
- FILE:docs/operations/pr-checklist.md
- FILE:docs/operations/release-rollback.md
- FILE:docs/company/brand/visual-identity.md
- FILE:artifacts/misc/logs/agent-actions.log
- FILE:apps/web/app/cases/timeline.tsx

#### Tasks
1. Approval page displays proposed changes with diff
2. users can approve
3. modify
4. or reject
5. rollback resets state and logs actions
6. E2E tests
7. analytics track approvals
8. artifacts: preview.tsx, rollback-service.ts, approvals-metrics.csv
9. targets: >=100%, zero errors

#### Validation
```bash
# VALIDATE:pnpm test
# AUDIT:code-review
```

#### KPIs
- 100% agent actions previewed
- zero unauthorized changes
- approval rate and latency tracked

#### Artifacts
- ARTIFACT:apps/web/app/agent-approvals/preview.tsx;ARTIFACT:apps/web/lib/agent/rollback-service.ts;ARTIFACT:artifacts/misc/analytics/approvals-metrics.csv;EVIDENCE:artifacts/attestations/IFC-149/context_ack.json


### Phase 2: MVP Week 1 (1 tasks) (Sequential)

### IFC-017: PHASE-002: Prisma + Supabase Data Layer

#### Context
Dependency: IFC-012,IFC-013
Owner: Backend Dev + DA (STOA-Domain)
Execution Mode: SWARM

#### Pre-requisites
- FILE:artifacts/sprint0/codex-run/Framework.md
- FILE:tools/audit/audit-matrix.yml
- POLICY:Prisma schema defined
- ENV:migrations ready
- FILE:docs/planning/adr/ADR-001-modern-stack.md
- FILE:docs/planning/adr/ADR-007-data-governance.md
- FILE:packages/db/prisma/schema.prisma
- FILE:docs/shared/review-checklist.md
- FILE:docs/operations/pr-checklist.md
- FILE:artifacts/misc/turbo.json
- FILE:apps/api/src/modules/crm/leads.router.ts

#### Tasks
1. Type-safe database queries, pgvector configured
2. targets: <20ms, zero errors

#### Validation
```bash
# AUDIT:manual-review
```

#### KPIs
- Zero data loss, queries <20ms

#### Artifacts
- ARTIFACT:packages/db/src/client.ts;ARTIFACT:artifacts/benchmarks/query-performance.csv;ARTIFACT:artifacts/misc/pgvector-test.sql;ARTIFACT:apps/project-tracker/docs/metrics/_global/phase-validations/PHASE-002-validation.md;EVIDENCE:artifacts/attestations/IFC-017/context_ack.json

**Note**: FLOW-002 is "Gestão de Usuários e Permissões" (User Management), not related to Prisma data layer.

---

## Success Criteria

| Category | Metric | Target |
|----------|--------|--------|
| Decision Gate | Clear decision, modern stack validated | Met |
| MVP Week 1 | Build caching working, <3min builds | Met |
| MVP Week 1 | 100% type coverage, API response <50ms | Met |
| MVP Week 1 | Zero data loss, queries <20ms | Met |
| Core CRM | 360 page functional with >90 Lighthouse score | Met |
| Core CRM | Kanban board working, stage changes persist <300ms | Met |
| Testing | Coverage ≥90%, tests run <5min | Met |
| Security | 100% builds produce SBOM | Met |
| Security | 0 unsigned/untracked dependency changes merged | Met |
| AI Assistant | 100% tool actions authorized | Met |
| AI Assistant | zero unauthorized writes | Met |
| AI Assistant | user approval latency <30s | Met |
| AI Assistant | 100% agent actions previewed | Met |
| AI Assistant | zero unauthorized changes | Met |
| AI Assistant | approval rate and latency tracked | Met |

---

## Agent Orchestration Instructions

### How to Execute This Sprint

This sprint should be executed using Claude Code with sub-agent orchestration. Follow these patterns:

### 0. Pre-Execution Context (CRITICAL)

**Before starting any task, gather context from previous work:**

```bash
# 1. Read completed tasks from previous sprint(s) for context
cat apps/project-tracker/docs/metrics/sprint-5/_summary.json

# 2. Review dependency graph to understand task relationships
cat apps/project-tracker/docs/metrics/_global/dependency-graph.json

# 3. Check current sprint status
cat apps/project-tracker/docs/metrics/_global/Sprint_plan.csv | grep "Sprint 6"

# 4. Review any existing specs/plans from dependencies
ls -la artifacts/specs/
ls -la artifacts/plans/
```

**Key Files to Read for Context:**
- `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv` - Full task registry
- `apps/project-tracker/docs/metrics/sprint-*/` - Previous sprint evidence
- `artifacts/attestations/<TASK_ID>/` - Task attestations (schema: `attestation.schema.json`)
- `docs/architecture/` - Architecture decisions and patterns
- `apps/project-tracker/docs/metrics/_global/flows/flow-index.md` - Master flow catalog (38 flows)
- `docs/design/ui-flow-mapping.md` - Route → Flow → Component mapping
- `docs/design/sitemap.md` - Application routes with flow references
- `docs/design/page-registry.md` - **Implementation Status** (actual state of existing pages)
- `docs/company/brand/style-guide.md` - Component patterns

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
# Sprint 6 parallel execution:
Task("A", "Execute IFC-012") &
Task("B", "Execute IFC-090") &
Task("C", "Execute IFC-091") &
Task("D", "Execute IFC-129") &
Task("E", "Execute IFC-132") &
Task("F", "Execute IFC-139") &
```

The `&` suffix indicates parallel execution. Wait for all to complete before proceeding to the next phase.

### 3. SWARM Execution (Implementation Tasks)

For **implementation tasks** (9 tasks marked as `swarm`):

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
- `IFC-012`: PHASE-002: Turborepo Monorepo Setup
- `IFC-090`: Contact 360 Page - Full Detail View
- `IFC-091`: Deals Pipeline - Kanban Board
- `IFC-129`: Write UI and contract tests for core pages and tRPC endpoints
- `IFC-132`: Supply chain security: dependency pinning + SBOM generation in CI (npm/pnpm + container)
- `IFC-139`: Expose application services as agent tools and implement human approval flows with preview and rollback for high-risk actions
- `IFC-013`: PHASE-002: tRPC Router Implementation
- `IFC-149`: Implement action preview and rollback UI for agent-initiated changes; integrated with approval flows
- `IFC-017`: PHASE-002: Prisma + Supabase Data Layer

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
pnpm audit:sprint 6

# Generate attestation report
npx tsx tools/scripts/attest-sprint.ts 6

# Verify all tasks pass
cat artifacts/reports/attestation/sprint-6-latest.json
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
curl http://localhost:3002/api/metrics/sprint?sprint=6

# Governance status
curl http://localhost:3002/api/governance/summary?sprint=6

# Audit results
curl http://localhost:3002/api/audit/stream

# Execution status
curl http://localhost:3002/api/sprint/status?runId=<RUN_ID>
```

### 10. Execution Order Summary

| Phase | Type | Tasks |
|-------|------|-------|
| 0 | parallel | IFC-012, IFC-090, IFC-091, IFC-129, IFC-132, IFC-139 |
| 1 | parallel | IFC-013, IFC-149 |
| 2 | sequential | IFC-017 |

---

## Definition of Done

A task is considered **DONE** when:

1. ✅ All validation commands pass (exit code 0)
2. ✅ All artifacts listed are created and accessible
3. ✅ All KPIs meet or exceed target values
4. ✅ No blocking issues or errors remain
5. ✅ Status updated to "Done" in Sprint_plan.csv
6. ✅ Evidence bundle generated (if MATOP task)

### Sprint 6 Completion Gate

The sprint is complete when:
- All achievable tasks marked as Done
- Deferred tasks documented with target sprint
- Blockers escalated with clear resolution path
- Phase summaries updated with final metrics
- Sprint summary reflects accurate totals