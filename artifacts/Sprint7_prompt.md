# Sprint 7 Sub-Agent Orchestration Prompt for Claude Code

## Mission Brief

You are orchestrating Sprint 7 of the **IntelliFlow CRM** project.

**Execution Model**: Use `claude --dangerously-skip-permissions` for autonomous sub-agent spawning with the `Task` tool for parallel orchestration.

---

## Sprint 7 Mission

**Project**: IntelliFlow CRM
**Sprint**: 7
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
| **Total Tasks** | 14 |
| **Completed** | 2 |
| **Pending** | 12 |
| **Phases** | 3 |
| **Parallel Tasks** | 10 |
| **Theme** | MVP Week 1 |
| **Key Focus Areas** | MVP Week 1, Documentation, Security, Core CRM |

---

## Sprint Dependency Graph

```
EXECUTION PHASES
============================================================

Phase 0: Initialisation
----------------------------------------
  [PARALLEL EXECUTION]
  Stream A:
    ○ IFC-014
    ○ IFC-015
  Stream B:
    ○ IFC-054
  Stream C:
    ○ IFC-082
  Stream D:
    ○ IFC-092
  Stream E:
    ○ IFC-093
  Stream F:
    ○ IFC-114
  Stream G:
    ○ IFC-122
  Stream H:
    ○ IFC-133
  Stream I:
    ○ IFC-134
  ↓ (all complete before next phase)

Phase 1: MVP Week 1 (1 tasks)
----------------------------------------
  ○ IFC-016 → PHASE-002: Real-time Subscriptions...
  ↓

Phase 2: MVP Week 1 (1 tasks)
----------------------------------------
  ○ IFC-018 → PHASE-002: Vitest Testing Suite...
  ↓

============================================================
```

### Parallel Streams

| Stream | Tasks | Dependencies |
|--------|-------|--------------|
| P0-A | IFC-014, IFC-015 | IFC-013 |
| P0-B | IFC-054 | None |
| P0-C | IFC-082 | IFC-080 |
| P0-D | IFC-092 | IFC-091 |
| P0-E | IFC-093 | IFC-002, IFC-004 |
| P0-F | IFC-114 | IFC-003, IFC-072 |
| P0-G | IFC-122 | IFC-106, IFC-107 |
| P0-H | IFC-133 | IFC-132 |
| P0-I | IFC-134 | ENV-003-AI, ENV-005-AI |
| P1-A | IFC-016 | IFC-014 |
| P2-A | IFC-018 | IFC-014, IFC-015, IFC-016 |

---

## Complete Task List

### Completed Tasks (2)

| Task ID | Section | Description | Status |
|---------|---------|-------------|--------|
| **IFC-079** | Documentation | PHASE-041: Docusaurus Setup | ✅ Completed |
| **IFC-080** | Documentation | PHASE-041: LLM-Friendly Documentation Templates | ✅ Completed |

### Pending Tasks (12)

| Task ID | Section | Description | Owner | Dependencies | KPIs |
|---------|---------|-------------|-------|--------------|------|
| **IFC-014** | MVP Week 1 | PHASE-002: Next.js 16.0.10 App Router UI | Frontend Dev + UX (STOA-Domain) | IFC-013 | Core Web Vitals green, accessibility 100% |
| **IFC-015** | MVP Week 1 | PHASE-002: BullMQ Job Queue Setup | Backend Dev + DevOps (STOA-Automation) | IFC-013 | Jobs processing reliably, dashboard active |
| **IFC-016** | MVP Week 1 | PHASE-002: Real-time Subscriptions | Frontend Dev + Backend Dev (STOA-Domain) | IFC-014 | <100ms latency, connection stable |
| **IFC-018** | MVP Week 1 | PHASE-002: Vitest Testing Suite | QA + Whole Team (STOA-Quality) | IFC-014,IFC-015,IFC-016 | All critical paths tested, CI green |
| **IFC-054** | Risk Mgmt | Technical Complexity Monitoring | CTO + Tech Lead (STOA-Foundation) | None | Tech debt <10%, complexity manageable |
| **IFC-082** | Documentation | Domain Knowledge Base | Tech Lead + Team (STOA-Foundation) | IFC-080 | Knowledge graph complete, searchable |
| **IFC-092** | Core CRM | Deal Forecasting & Reporting | Data Eng + Backend Dev (STOA-Domain) | IFC-091 | Forecast accuracy ≥85% |
| **IFC-093** | Core CRM | Tickets Module - SLA Tracking | Backend Dev + Frontend Dev (STOA-Domain) | IFC-002,IFC-004 | Tickets visible, SLA breach alerts in <1m |
| **IFC-114** | Security | Implement API rate limiting and DDoS protection | Backend Dev + DevOps (STOA-Automation) | IFC-003,IFC-072 | No request saturates system, response stable under load |
| **IFC-122** | Resilience | Implement circuit breaker and retry policies for external service calls | Backend Dev (STOA-Domain) | IFC-106,IFC-107 | Error rate reduced by 50%; no cascading failures |
| **IFC-133** | Security | Supply chain security: artifact signing + provenance for build outputs (images + releases) | Backend Dev (STOA-Domain) | IFC-132 | 100% prod-bound artifacts signed; verification enforced in deployment pipeline |
| **IFC-134** | Security | Container/image scanning in CI and registry with fail-on-critical policy | Security Engineer (STOA-Security) | ENV-003-AI,ENV-005-AI | 0 critical vulns in prod images; scan coverage 100% for deployable images |

---

## Execution Strategy

### Phase 0: Initialisation (Parallel)

Execute these streams **simultaneously** using the `Task` tool:

```bash
# Spawn parallel sub-agents
Task("A", "MVP Week 1") &
Task("B", "Risk Mgmt") &
Task("C", "Documentation") &
Task("D", "Core CRM") &
Task("E", "Core CRM") &
Task("F", "Security") &
Task("G", "Resilience") &
Task("H", "Security") &
Task("I", "Security") &
```

### IFC-014: PHASE-002: Next.js 16.0.10 App Router UI

#### Context
Dependency: IFC-013
Owner: Frontend Dev + UX (STOA-Domain)
Execution Mode: SWARM

#### Pre-requisites
- FILE:docs/design/page-registry.md
- FILE:docs/design/sitemap.md
- FILE:artifacts/sprint0/codex-run/Framework.md
- FILE:audit-matrix.yml
- ENV:shadcn/ui setup
- ENV:Tailwind configured
- FILE:docs/planning/adr/ADR-001-modern-stack.md
- FILE:docs/company/brand/visual-identity.md
- FILE:docs/company/brand/style-guide.md
- FILE:docs/company/brand/dos-and-donts.md
- FILE:docs/company/brand/accessibility-patterns.md
- FILE:apps/api/src/modules/lead/lead.router.ts
- DESIGN:docs/design/mockups/lead-list.html
- DESIGN:docs/design/mockups/create-new-lead.html
- FLOW:apps/project-tracker/docs/metrics/_global/flows/FLOW-005.md
- FLOW:apps/project-tracker/docs/metrics/_global/flows/flow-index.md

#### Tasks
1. Lead management UI with RSC, optimistic updates
2. Next.js 16.0.10 App Router uses Turbopack FS caching and Cache Components
3. proxy replaces middleware where required
4. targets: >=100%
5. **UI must match design mockups exactly** (lead-list.html, create-new-lead.html)

#### Validation
```bash
# AUDIT:manual-review
```

#### KPIs
- Core Web Vitals green, accessibility 100%

#### Artifacts
- ARTIFACT:artifacts/reports/web-vitals-report.json;ARTIFACT:artifacts/misc/axe-audit-results.json;ARTIFACT:apps/project-tracker/docs/metrics/_global/flows/FLOW-002.md;ARTIFACT:apps/project-tracker/docs/metrics/_global/phase-validations/PHASE-002-validation.md;EVIDENCE:artifacts/attestations/IFC-014/context_ack.json

### IFC-015: PHASE-002: BullMQ Job Queue Setup

#### Context
Dependency: IFC-013
Owner: Backend Dev + DevOps (STOA-Automation)
Execution Mode: SWARM

#### Pre-requisites
- FILE:artifacts/sprint0/codex-run/Framework.md
- FILE:audit-matrix.yml
- ENV:Redis configured
- ENV:BullMQ installed
- FILE:apps/api/src/modules/lead/lead.router.ts

#### Tasks
1. Async job processing for AI scoring, retry logic
2. artifacts: bull-board-screenshot.png, job-metrics.json, context_ack.json
3. verified by: pnpm test

#### Validation
```bash
# VALIDATE:pnpm test
```

#### KPIs
- Jobs processing reliably, dashboard active

#### Artifacts
- ARTIFACT:artifacts/misc/bull-board-screenshot.png;ARTIFACT:artifacts/metrics/job-metrics.json;ARTIFACT:apps/project-tracker/docs/metrics/_global/flows/FLOW-002.md;ARTIFACT:apps/project-tracker/docs/metrics/_global/phase-validations/PHASE-002-validation.md;EVIDENCE:artifacts/attestations/IFC-015/context_ack.json

### IFC-054: Technical Complexity Monitoring

#### Context
Dependency: None
Owner: CTO + Tech Lead (STOA-Foundation)
Execution Mode: SWARM

#### Pre-requisites
- FILE:artifacts/sprint0/codex-run/Framework.md
- FILE:audit-matrix.yml
- POLICY:Complexity metrics for tRPC/LangChain defined

#### Tasks
1. Weekly assessment of technical debt and complexity
2. artifacts: sonarqube-debt-report.html, complexity-metrics.json, refactoring-backlog.md
3. targets: >=10%

#### Validation
```bash
# AUDIT:manual-review
```

#### KPIs
- Tech debt <10%, complexity manageable

#### Artifacts
- ARTIFACT:artifacts/reports/sonarqube-debt-report.html;ARTIFACT:artifacts/metrics/complexity-metrics.json;ARTIFACT:docs/shared/refactoring-backlog.md;ARTIFACT:artifacts/misc/team-velocity.csv;EVIDENCE:artifacts/attestations/IFC-054/context_ack.json

### IFC-082: Domain Knowledge Base

#### Context
Dependency: IFC-080
Owner: Tech Lead + Team (STOA-Foundation)
Execution Mode: SWARM

#### Pre-requisites
- FILE:artifacts/sprint0/codex-run/Framework.md
- FILE:audit-matrix.yml
- POLICY:DDD models documented
- ENV:glossary created
- FILE:docs/architecture/hex-boundaries.md
- FILE:docs/planning/DDD-context-map.puml
- FILE:docs/glossary.md

#### Tasks
1. Bounded contexts, aggregates, workflows documented

#### Validation
```bash
# AUDIT:manual-review
```

#### KPIs
- Knowledge graph complete, searchable

#### Artifacts
- ARTIFACT:artifacts/misc/knowledge-graph.json;ARTIFACT:docs/shared/context-map.puml;EVIDENCE:artifacts/attestations/IFC-082/context_ack.json

### IFC-092: Deal Forecasting & Reporting

#### Context
Dependency: IFC-091
Owner: Data Eng + Backend Dev (STOA-Domain)
Execution Mode: SWARM

#### Pre-requisites
- FILE:artifacts/sprint0/codex-run/Framework.md
- FILE:audit-matrix.yml
- ENV:Forecast algorithms
- ENV:KPIs: win rate
- ENV:total pipeline value
- FILE:apps/api/src/modules/opportunity/opportunity.router.ts

#### Tasks
1. Forecast accuracy ≥85%
2. artifacts: forecast-algorithm-tests.ts, accuracy-backtest.csv, context_ack.json

#### Validation
```bash
# AUDIT:manual-review
```

#### KPIs
- Forecast accuracy ≥85%

#### Artifacts
- ARTIFACT:apps/api/src/shared/forecast-algorithm-tests.ts;ARTIFACT:artifacts/metrics/accuracy-backtest.csv;EVIDENCE:artifacts/attestations/IFC-092/context_ack.json

### IFC-093: Tickets Module - SLA Tracking

#### Context
Dependency: IFC-002,IFC-004
Owner: Backend Dev + Frontend Dev (STOA-Domain)
Execution Mode: SWARM

#### Pre-requisites
- IMPLEMENTS:FLOW-011
- IMPLEMENTS:FLOW-013
- FILE:artifacts/sprint0/codex-run/Framework.md
- FILE:audit-matrix.yml
- ENV:Ticket entity
- ENV:SLA badge colors
- ENV:notifications
- FILE:packages/db/prisma/schema.prisma
- FILE:apps/web/src/app/leads/(list)/new/page.tsx

#### Tasks
1. Tickets visible, SLA breach alerts in <1m
2. artifacts: sla-notification-test.ts, context_ack.json

#### Validation
```bash
# AUDIT:manual-review
```

#### KPIs
- Tickets visible, SLA breach alerts in <1m

#### Artifacts
- ARTIFACT:apps/web/lib/tickets/sla-notification-test.ts;EVIDENCE:artifacts/attestations/IFC-093/context_ack.json

### IFC-114: Implement API rate limiting and DDoS protection

#### Context
Dependency: IFC-003,IFC-072
Owner: Backend Dev + DevOps (STOA-Automation)
Execution Mode: SWARM

#### Pre-requisites
- FILE:artifacts/sprint0/codex-run/Framework.md
- FILE:audit-matrix.yml
- POLICY:API endpoints defined
- FILE:docs/security/zero-trust-design.md
- FILE:docs/security/owasp-checklist.md
- FILE:docs/shared/review-checklist.md
- FILE:docs/operations/pr-checklist.md
- FILE:apps/api/src/trpc.ts

#### Tasks
1. Rate limiting middleware in API, WAF configured for DDoS, tests for request bursts

#### Validation
```bash
# VALIDATE:pnpm test
```

#### KPIs
- No request saturates system, response stable under load

#### Artifacts
- ARTIFACT:artifacts/misc/api/rate-limit.ts;ARTIFACT:artifacts/misc/waf-config.json;ARTIFACT:artifacts/misc/ddos-test-report.txt;EVIDENCE:artifacts/attestations/IFC-114/context_ack.json

### IFC-122: Implement circuit breaker and retry policies for external service calls

#### Context
Dependency: IFC-106,IFC-107
Owner: Backend Dev (STOA-Domain)
Execution Mode: SWARM

#### Pre-requisites
- FILE:artifacts/sprint0/codex-run/Framework.md
- FILE:audit-matrix.yml
- POLICY:Ports and adapters established
- FILE:docs/architecture/hex-boundaries.md
- FILE:docs/operations/quality-gates.md
- FILE:docs/company/brand/visual-identity.md

#### Tasks
1. Circuit breaker library integrated
2. retries with exponential backoff
3. fallback strategies defined
4. artifacts: circuit-breaker.ts, retry-policy.ts, circuit-breaker.spec.ts
5. targets: >=50%
6. verified by: pnpm test

#### Validation
```bash
# VALIDATE:pnpm test
```

#### KPIs
- Error rate reduced by 50%
- no cascading failures

#### Artifacts
- ARTIFACT:packages/platform/src/resilience/circuit-breaker.ts;ARTIFACT:apps/api/src/shared/retry-policy.ts;ARTIFACT:tests/circuit-breaker.spec.ts;EVIDENCE:artifacts/attestations/IFC-122/context_ack.json

### IFC-133: Supply chain security: artifact signing + provenance for build outputs (images + releases)

#### Context
Dependency: IFC-132
Owner: Backend Dev (STOA-Domain)
Execution Mode: SWARM

#### Pre-requisites
- FILE:artifacts/sprint0/codex-run/Framework.md
- FILE:audit-matrix.yml
- ENV:SBOM generation in place
- registry access configured
- FILE:docs/security/zero-trust-design.md
- FILE:docs/security/owasp-checklist.md
- FILE:docs/shared/review-checklist.md
- FILE:docs/operations/pr-checklist.md
- FILE:docs/operations/release-rollback.md
- FILE:docs/company/brand/visual-identity.md
- FILE:.github/workflows/security-sbom.yml

#### Tasks
1. Artifacts signed
2. verification step added
3. provenance attached
4. docs updated
5. targets: >=100%
6. verified by: pnpm test

#### Validation
```bash
# VALIDATE:pnpm test
```

#### KPIs
- 100% prod-bound artifacts signed
- verification enforced in deployment pipeline

#### Artifacts
- ARTIFACT:docs/security/signing.md;ARTIFACT:.github/workflows/signing.yml;EVIDENCE:artifacts/attestations/IFC-133/context_ack.json

### IFC-134: Container/image scanning in CI and registry with fail-on-critical policy

#### Context
Dependency: ENV-003-AI,ENV-005-AI
Owner: Security Engineer (STOA-Security)
Execution Mode: SWARM

#### Pre-requisites
- FILE:artifacts/sprint0/codex-run/Framework.md
- FILE:audit-matrix.yml
- ENV:Container build pipeline exists
- FILE:docs/security/zero-trust-design.md
- FILE:docs/security/owasp-checklist.md
- FILE:docs/operations/quality-gates.md
- FILE:docker-compose.yml
- FILE:.github/workflows/ci.yml

#### Tasks
1. Image scan runs on every build
2. policy blocks critical vulns
3. exceptions process documented
4. targets: >=100%

#### Validation
```bash
# AUDIT:manual-review
```

#### KPIs
- 0 critical vulns in prod images
- scan coverage 100% for deployable images

#### Artifacts
- ARTIFACT:docs/security/image-scanning.md;ARTIFACT:.github/workflows/image-scan.yml;EVIDENCE:artifacts/attestations/IFC-134/context_ack.json


### Phase 1: MVP Week 1 (1 tasks) (Sequential)

### IFC-016: PHASE-002: Real-time Subscriptions

#### Context
Dependency: IFC-014
Owner: Frontend Dev + Backend Dev (STOA-Domain)
Execution Mode: SWARM

#### Pre-requisites
- FILE:artifacts/sprint0/codex-run/Framework.md
- FILE:audit-matrix.yml
- ENV:tRPC subscriptions
- ENV:Supabase realtime
- FILE:artifacts/reports/web-vitals-report.json

#### Tasks
1. Live updates for lead scores and activities
2. artifacts: use-subscription.ts, websocket-test-results.json, context_ack.json
3. targets: <100ms
4. verified by: pnpm test
5. gates: latency-check

#### Validation
```bash
# VALIDATE:pnpm test
# GATE:latency-check
```

#### KPIs
- <100ms latency, connection stable

#### Artifacts
- ARTIFACT:apps/web/hooks/use-subscription.ts;ARTIFACT:artifacts/misc/websocket-test-results.json;EVIDENCE:artifacts/attestations/IFC-016/context_ack.json


### Phase 2: MVP Week 1 (1 tasks) (Sequential)

### IFC-018: PHASE-002: Vitest Testing Suite

#### Context
Dependency: IFC-014,IFC-015,IFC-016
Owner: QA + Whole Team (STOA-Quality)
Execution Mode: SWARM

#### Pre-requisites
- FILE:artifacts/sprint0/codex-run/Framework.md
- FILE:audit-matrix.yml
- ENV:Vitest configured
- ENV:coverage tools ready
- FILE:docs/tdd-guidelines.md
- FILE:docs/company/brand/visual-identity.md
- FILE:artifacts/reports/web-vitals-report.json
- FILE:artifacts/misc/bull-board-screenshot.png
- FILE:apps/web/hooks/use-subscription.ts

#### Tasks
1. Unit + integration tests, >80% coverage
2. artifacts: vitest.config.ts, coverage-summary.json, test-report.html
3. gates: coverage-gte-80, coverage-gte-90

#### Validation
```bash
# VALIDATE:pnpm test
# GATE:coverage-gte-80
# GATE:coverage-gte-90
```

#### KPIs
- All critical paths tested, CI green

#### Artifacts
- ARTIFACT:apps/api/src/shared/vitest.config.ts;ARTIFACT:artifacts/misc/coverage/coverage-summary.json;ARTIFACT:artifacts/reports/test-report.html;ARTIFACT:artifacts/misc/ci-test-results.xml;ARTIFACT:apps/project-tracker/docs/metrics/_global/flows/FLOW-002.md;ARTIFACT:apps/project-tracker/docs/metrics/_global/phase-validations/PHASE-002-validation.md;EVIDENCE:artifacts/attestations/IFC-018/context_ack.json


---

## Success Criteria

| Category | Metric | Target |
|----------|--------|--------|
| MVP Week 1 | Core Web Vitals green, accessibility 100% | Met |
| MVP Week 1 | Jobs processing reliably, dashboard active | Met |
| MVP Week 1 | <100ms latency, connection stable | Met |
| MVP Week 1 | All critical paths tested, CI green | Met |
| Risk Mgmt | Tech debt <10%, complexity manageable | Met |
| Documentation | Site deployed, search working | Met |
| Documentation | 100% docs follow template, chunks optimized | Met |
| Documentation | Knowledge graph complete, searchable | Met |
| Core CRM | Forecast accuracy ≥85% | Met |
| Core CRM | Tickets visible, SLA breach alerts in <1m | Met |
| Security | No request saturates system, response stable under load | Met |
| Security | 100% prod-bound artifacts signed | Met |
| Security | verification enforced in deployment pipeline | Met |
| Security | 0 critical vulns in prod images | Met |
| Security | scan coverage 100% for deployable images | Met |
| Resilience | Error rate reduced by 50% | Met |
| Resilience | no cascading failures | Met |

---

## Agent Orchestration Instructions

### How to Execute This Sprint

This sprint should be executed using Claude Code with sub-agent orchestration. Follow these patterns:

### 0. Pre-Execution Context (CRITICAL)

**Before starting any task, gather context from previous work:**

```bash
# 1. Read completed tasks from previous sprint(s) for context
cat apps/project-tracker/docs/metrics/sprint-6/_summary.json

# 2. Review dependency graph to understand task relationships
cat apps/project-tracker/docs/metrics/_global/dependency-graph.json

# 3. Check current sprint status
cat apps/project-tracker/docs/metrics/_global/Sprint_plan.csv | grep "Sprint 7"

# 4. Review any existing specs/plans from dependencies
ls -la artifacts/specs/
ls -la artifacts/plans/
```

**Key Files to Read for Context:**
- `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv` - Full task registry
- `apps/project-tracker/docs/metrics/sprint-*/` - Previous sprint evidence
- `artifacts/attestations/<TASK_ID>/` - Task attestations (schema: `attestation.schema.json`)
- `docs/architecture/` - Architecture decisions and patterns

---

### 0.1 Design Resources (UI/UX Context)

**CRITICAL for UI tasks (IFC-014, IFC-093, IFC-092)**: Always read these files before implementing any frontend work.

#### Sitemap & Page Registry
| File | Purpose |
|------|---------|
| `docs/design/sitemap.md` | Complete application routes, URL conventions, navigation structure |
| `docs/design/page-registry.md` | Detailed page specs with KPIs, file paths, RACI, route group conventions |

#### User Flows (38 flows)
| File | Purpose |
|------|---------|
| `apps/project-tracker/docs/metrics/_global/flows/flow-index.md` | Master index linking flows to routes, components, and patterns |
| `apps/project-tracker/docs/metrics/_global/flows/FLOW-005.md` | Lead creation flow (IFC-014) |
| `apps/project-tracker/docs/metrics/_global/flows/FLOW-008.md` | Deal creation/update flow (IFC-092) |
| `apps/project-tracker/docs/metrics/_global/flows/FLOW-011.md` | Ticket creation flow (IFC-093) |
| `apps/project-tracker/docs/metrics/_global/flows/FLOW-013.md` | SLA management flow (IFC-093) |

#### Design Mockups
| Mockup | Route | Task |
|--------|-------|------|
| `docs/design/mockups/lead-list.html` | `/leads` | IFC-014 |
| `docs/design/mockups/create-new-lead.html` | `/leads/new` | IFC-014 |
| `docs/design/mockups/contact-list.html` | `/contacts` | IFC-089 |
| `docs/design/mockups/create-new-contact.html` | `/contacts/new` | IFC-089 |
| `docs/design/mockups/contact-360-view.html` | `/contacts/[id]` | IFC-090 |
| `docs/design/mockups/deals-kanban.html` | `/deals` | IFC-091 |
| `docs/design/mockups/deals-detail.html` | `/deals/[id]` | IFC-091 |
| `docs/design/mockups/deal-forecast.html` | `/deals/[id]/forecast` | IFC-092 |
| `docs/design/mockups/tickets-sla.html` | `/tickets` | IFC-093 |
| `docs/design/mockups/dashboard-overview.html` | `/dashboard` | ENV-009-AI |

#### Brand & Style Guidelines
| File | Purpose |
|------|---------|
| `docs/company/brand/visual-identity.md` | Design tokens, colors, typography |
| `docs/company/brand/style-guide.md` | Component patterns, UI conventions |
| `docs/company/brand/accessibility-patterns.md` | ARIA patterns, a11y requirements |
| `docs/company/brand/dos-and-donts.md` | Design best practices |

#### Route Group Convention
The codebase uses Next.js route groups for layout inheritance:

```
apps/web/src/app/
├── contacts/
│   ├── (list)/                    ← Route group (sidebar pages)
│   │   ├── layout.tsx             ← Module sidebar layout
│   │   ├── page.tsx               ← /contacts (HAS sidebar)
│   │   └── new/
│   │       └── page.tsx           ← /contacts/new (HAS sidebar)
│   └── [id]/
│       └── page.tsx               ← /contacts/123 (NO sidebar, full-width)
│
├── leads/
│   ├── (list)/                    ← Route group (sidebar pages)
│   │   ├── layout.tsx             ← Module sidebar layout
│   │   ├── page.tsx               ← /leads (HAS sidebar)
│   │   └── new/
│   │       └── page.tsx           ← /leads/new (HAS sidebar)
│   └── [id]/
│       └── page.tsx               ← /leads/123 (NO sidebar, full-width)
```

**Rule**: List and create pages use `(list)/layout.tsx` with module sidebar. Detail pages `[id]/` render full-width without module sidebar.

---

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
# Sprint 7 parallel execution:
Task("A", "Execute IFC-014, IFC-015") &
Task("B", "Execute IFC-054") &
Task("C", "Execute IFC-082") &
Task("D", "Execute IFC-092") &
Task("E", "Execute IFC-093") &
Task("F", "Execute IFC-114") &
Task("G", "Execute IFC-122") &
Task("H", "Execute IFC-133") &
Task("I", "Execute IFC-134") &
```

The `&` suffix indicates parallel execution. Wait for all to complete before proceeding to the next phase.

### 3. SWARM Execution (Implementation Tasks)

For **implementation tasks** (12 tasks marked as `swarm`):

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
- `IFC-014`: PHASE-002: Next.js 16.0.10 App Router UI
- `IFC-015`: PHASE-002: BullMQ Job Queue Setup
- `IFC-054`: Technical Complexity Monitoring
- `IFC-082`: Domain Knowledge Base
- `IFC-092`: Deal Forecasting & Reporting
- `IFC-093`: Tickets Module - SLA Tracking
- `IFC-114`: Implement API rate limiting and DDoS protection
- `IFC-122`: Implement circuit breaker and retry policies for external service calls
- `IFC-133`: Supply chain security: artifact signing + provenance for build outputs (images + releases)
- `IFC-134`: Container/image scanning in CI and registry with fail-on-critical policy
- `IFC-016`: PHASE-002: Real-time Subscriptions
- `IFC-018`: PHASE-002: Vitest Testing Suite

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
pnpm audit:sprint 7

# Generate attestation report
npx tsx tools/scripts/attest-sprint.ts 7

# Verify all tasks pass
cat artifacts/reports/attestation/sprint-7-latest.json
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
curl http://localhost:3002/api/metrics/sprint?sprint=7

# Governance status
curl http://localhost:3002/api/governance/summary?sprint=7

# Audit results
curl http://localhost:3002/api/audit/stream

# Execution status
curl http://localhost:3002/api/sprint/status?runId=<RUN_ID>
```

### 10. Execution Order Summary

| Phase | Type | Tasks |
|-------|------|-------|
| 0 | parallel | IFC-014, IFC-015, IFC-054, IFC-082, IFC-092, IFC-093, IFC-114, IFC-122, IFC-133, IFC-134 |
| 1 | sequential | IFC-016 |
| 2 | sequential | IFC-018 |

---

## Definition of Done

A task is considered **DONE** when:

1. ✅ All validation commands pass (exit code 0)
2. ✅ All artifacts listed are created and accessible
3. ✅ All KPIs meet or exceed target values
4. ✅ No blocking issues or errors remain
5. ✅ Status updated to "Done" in Sprint_plan.csv
6. ✅ Evidence bundle generated (if MATOP task)

### Sprint 7 Completion Gate

The sprint is complete when:
- All achievable tasks marked as Done
- Deferred tasks documented with target sprint
- Blockers escalated with clear resolution path
- Phase summaries updated with final metrics
- Sprint summary reflects accurate totals