# Sprint 11 Sub-Agent Orchestration Prompt for Claude Code

## Mission Brief

You are orchestrating Sprint 11 of the **IntelliFlow CRM** project.

**Execution Model**: Use `claude --dangerously-skip-permissions` for autonomous sub-agent spawning with the `Task` tool for parallel orchestration.

**Target Application**: All implementation work targets the **web app** (`apps/web/` at `http://localhost:3000`), not the project-tracker.

---

## Sprint 11 Mission

**Project**: IntelliFlow CRM
**Sprint**: 11
**Theme**: Public Pages

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
| **Total Tasks** | 15 |
| **Completed** | 8 |
| **Pending** | 7 |
| **Phases** | 1 |
| **Parallel Tasks** | 7 |
| **Theme** | Public Pages |
| **Key Focus Areas** | Public Pages, Compliance, AI Foundation, Security |
| **Web App** | http://localhost:3000 |

---

## Sprint Dependency Graph

```
EXECUTION PHASES
============================================================

Phase 0: Initialisation
----------------------------------------
  [PARALLEL EXECUTION]
  Stream A:
    ○ PG-002
    ○ PG-003
    ○ PG-005
    ○ PG-007
    ○ PG-008
  Stream B:
    ○ IFC-125
  Stream C:
    ○ IFC-158
  ↓ (all complete before next phase)

============================================================
```

### Parallel Streams

| Stream | Tasks | Dependencies |
|--------|-------|--------------|
| P0-A | PG-002, PG-003, PG-005, PG-007, PG-008 | BRAND-001, GTM-002, PG-001 |
| P0-B | IFC-125 | IFC-005, IFC-008 |
| P0-C | IFC-158 | IFC-137, IFC-138, IFC-157 |

---

## Complete Task List

### Completed Tasks (8)

| Task ID | Section | Description | Status |
|---------|---------|-------------|--------|
| **IFC-058** | Compliance | GDPR baseline controls: Supabase RLS policies, data minimisation, retention hooks | ✅ Completed |
| **PG-001** | Public Pages | Home Page | ✅ Completed |
| **PG-004** | Public Pages | About Page | ✅ Completed |
| **PG-006** | Public Pages | Partners Page | ✅ Completed |
| **IFC-140** | Compliance | Implement data governance workflows: DSAR requests; retention & legal hold policies; tenant-specific encryption key management; data residency compliance | ✅ Completed |
| **IFC-143** | Security | Perform threat modeling and abuse-case analysis for multi-tenancy and agent tool-calling; design mitigations; schedule penetration test; implement cookie consent mechanism | ✅ Completed |
| **IFC-152** | Case Docs | Case document model: storage metadata, versioning, ACL mapping (tenant + case + role), and audit hooks | ✅ Completed |
| **IFC-157** | Notifications | Notification service MVP: unified delivery (in-app + email) with preference model (backend), templates, and audit logging | ✅ Completed |

### Pending Tasks (7)

| Task ID | Section | Description | Owner | Dependencies | KPIs |
|---------|---------|-------------|-------|--------------|------|
| **PG-002** | Public Pages | Features Page | Growth FE (STOA-Foundation) | PG-001,GTM-002,BRAND-001 | Page live, features showcased, CTA working |
| **PG-003** | Public Pages | Pricing Page | Growth FE (STOA-Foundation) | PG-001,GTM-002,BRAND-001 | Pricing clear, calculator working, Stripe ready |
| **PG-005** | Public Pages | Contact Page | Growth FE (STOA-Foundation) | PG-001,GTM-002,BRAND-001 | Form submitting, validation working, emails sent |
| **PG-007** | Public Pages | Press Page | Growth FE (STOA-Foundation) | PG-001,GTM-002,BRAND-001 | Press releases live, media kit downloadable |
| **PG-008** | Public Pages | Security Page | Growth FE (STOA-Foundation) | PG-001,GTM-002,BRAND-001 | Security explained, badges displayed, trust built |
| **IFC-125** | AI Foundation | Implement guardrails for prompt injection, data leakage, and monitor AI bias | AI Specialist + Security (STOA-Security) | IFC-005,IFC-008 | Zero prompt injection incidents; bias score below threshold |
| **IFC-158** | Scheduling | Scheduling communications: ICS invites, reschedule/cancel flows, reminders; integrated with notification service and calendar sync | Backend Dev + Calendar Specialist (STOA-Domain) | IFC-138,IFC-157,IFC-137 | Invite delivery >=95%; reminder delivery >=99%; zero duplicate invites on retries |

---

## Execution Strategy

### Phase 0: Initialisation (Parallel)

Execute these streams **simultaneously** using the `Task` tool:

```bash
# Spawn parallel sub-agents
Task("A", "Public Pages") &
Task("B", "AI Foundation") &
Task("C", "Scheduling") &
```

### PG-002: Features Page

### Key Objectives

- Code: Deliver high-quality, tested code for the web app
- Integration: Seamlessly integrate new features into existing architecture
- Security: Ensure robust security and compliance
- Performance: Optimize for speed and responsiveness
- Aviability: Ensure high availability and reliability
- Maintainability: Write clean, maintainable code
- Documentation: Provide clear documentation and specs

#### Context
Dependency: PG-001,GTM-002,BRAND-001
Owner: Growth FE (STOA-Foundation)
Execution Mode: SWARM

#### Pre-requisites
- FILE:docs/design/page-registry.md
- FILE:artifacts/sprint0/codex-run/Framework.md
- FILE:audit-matrix.yml
- POLICY:Feature list defined
- ENV:benefits clear
- FILE:apps/web/app/(public)/page.tsx
- FILE:docs/company/messaging/positioning.md
- FILE:docs/company/brand/visual-identity.md
- FILE:docs/company/brand/style-guide.md
- FILE:docs/company/brand/dos-and-donts.md
- FILE:docs/company/brand/accessibility-patterns.md

#### Tasks
1. Response <200ms, Lighthouse ≥90, conversion optimized
2. artifacts: page.tsx, features-content.json, conversion-tracking.js
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
# AUDIT:manual-review
# GATE:lighthouse-gte-90
```

#### KPIs
- Page live, features showcased, CTA working

#### Artifacts
| Type | Path | Description |
|------|------|-------------|
| ARTIFACT | apps/web/app/(public)/features/page.tsx | Page |
| ARTIFACT | artifacts/misc/features-content.json | Features Content |
| ARTIFACT | artifacts/misc/conversion-tracking.js | Conversion Tracking |
| EVIDENCE | artifacts/attestations/PG-002/context_ack.json | Completion attestation |

### PG-003: Pricing Page

### Key Objectives

- Code: Deliver high-quality, tested code for the web app
- Integration: Seamlessly integrate new features into existing architecture
- Security: Ensure robust security and compliance
- Performance: Optimize for speed and responsiveness
- Aviability: Ensure high availability and reliability
- Maintainability: Write clean, maintainable code
- Documentation: Provide clear documentation and specs

#### Context
Dependency: PG-001,GTM-002,BRAND-001
Owner: Growth FE (STOA-Foundation)
Execution Mode: SWARM

#### Pre-requisites
- FILE:docs/design/page-registry.md
- FILE:artifacts/sprint0/codex-run/Framework.md
- FILE:audit-matrix.yml
- POLICY:Pricing tiers defined
- ENV:calculator ready
- FILE:docs/shared/review-checklist.md
- FILE:docs/operations/quality-gates.md
- FILE:docs/operations/pr-checklist.md
- FILE:apps/web/app/(public)/page.tsx
- FILE:docs/company/messaging/positioning.md
- FILE:docs/company/brand/visual-identity.md
- FILE:docs/company/brand/style-guide.md
- FILE:docs/company/brand/dos-and-donts.md
- FILE:docs/company/brand/accessibility-patterns.md

#### Tasks
1. Response <200ms, Lighthouse ≥90, calculator functional
2. artifacts: page.tsx, pricing-calculator.tsx, stripe-integration.ts
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
# AUDIT:manual-review
# GATE:lighthouse-gte-90
```

#### KPIs
- Pricing clear, calculator working, Stripe ready

#### Artifacts
| Type | Path | Description |
|------|------|-------------|
| ARTIFACT | apps/web/app/(public)/pricing/page.tsx | Page |
| ARTIFACT | apps/web/components/pricing/pricing-calculator.tsx | Pricing Calculator |
| ARTIFACT | apps/web/lib/pricing/stripe-integration.ts | Stripe Integration |
| EVIDENCE | artifacts/attestations/PG-003/context_ack.json | Completion attestation |

### PG-005: Contact Page

### Key Objectives

- Code: Deliver high-quality, tested code for the web app
- Integration: Seamlessly integrate new features into existing architecture
- Security: Ensure robust security and compliance
- Performance: Optimize for speed and responsiveness
- Aviability: Ensure high availability and reliability
- Maintainability: Write clean, maintainable code
- Documentation: Provide clear documentation and specs

#### Context
Dependency: PG-001,GTM-002,BRAND-001
Owner: Growth FE (STOA-Foundation)
Execution Mode: SWARM

#### Pre-requisites
- FILE:docs/design/page-registry.md
- FILE:artifacts/sprint0/codex-run/Framework.md
- FILE:audit-matrix.yml
- ENV:Contact form designed
- ENV:validation rules
- FILE:apps/web/app/(public)/page.tsx
- FILE:docs/company/messaging/positioning.md
- FILE:docs/company/brand/visual-identity.md
- FILE:docs/company/brand/style-guide.md
- FILE:docs/company/brand/dos-and-donts.md
- FILE:docs/company/brand/accessibility-patterns.md

#### Tasks
1. Response <200ms, Lighthouse ≥90, form working
2. artifacts: page.tsx, contact-form.tsx, email-handler.ts
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
# AUDIT:manual-review
# GATE:lighthouse-gte-90
```

#### KPIs
- Form submitting, validation working, emails sent

#### Artifacts
| Type | Path | Description |
|------|------|-------------|
| ARTIFACT | apps/web/app/(public)/contact/page.tsx | Page |
| ARTIFACT | apps/web/components/shared/contact-form.tsx | Contact Form |
| ARTIFACT | apps/web/lib/shared/email-handler.ts | Email Handler |
| EVIDENCE | artifacts/attestations/PG-005/context_ack.json | Completion attestation |

### PG-007: Press Page

### Key Objectives

- Code: Deliver high-quality, tested code for the web app
- Integration: Seamlessly integrate new features into existing architecture
- Security: Ensure robust security and compliance
- Performance: Optimize for speed and responsiveness
- Aviability: Ensure high availability and reliability
- Maintainability: Write clean, maintainable code
- Documentation: Provide clear documentation and specs

#### Context
Dependency: PG-001,GTM-002,BRAND-001
Owner: Growth FE (STOA-Foundation)
Execution Mode: SWARM

#### Pre-requisites
- FILE:docs/design/page-registry.md
- FILE:artifacts/sprint0/codex-run/Framework.md
- FILE:audit-matrix.yml
- ENV:Press releases
- ENV:media kit ready
- FILE:docs/shared/review-checklist.md
- FILE:docs/operations/pr-checklist.md
- FILE:apps/web/app/(public)/page.tsx
- FILE:docs/company/messaging/positioning.md
- FILE:docs/company/brand/visual-identity.md
- FILE:docs/company/brand/style-guide.md
- FILE:docs/company/brand/dos-and-donts.md
- FILE:docs/company/brand/accessibility-patterns.md

#### Tasks
1. Response <200ms, Lighthouse ≥90, downloads working
2. artifacts: page.tsx, media-kit.zip, context_ack.json
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
# AUDIT:manual-review
# GATE:lighthouse-gte-90
```

#### KPIs
- Press releases live, media kit downloadable

#### Artifacts
| Type | Path | Description |
|------|------|-------------|
| ARTIFACT | apps/web/app/(public)/press/page.tsx | Page |
| ARTIFACT | artifacts/misc/media-kit.zip | Media Kit |
| EVIDENCE | artifacts/attestations/PG-007/context_ack.json | Completion attestation |

### PG-008: Security Page

### Key Objectives

- Code: Deliver high-quality, tested code for the web app
- Integration: Seamlessly integrate new features into existing architecture
- Security: Ensure robust security and compliance
- Performance: Optimize for speed and responsiveness
- Aviability: Ensure high availability and reliability
- Maintainability: Write clean, maintainable code
- Documentation: Provide clear documentation and specs

#### Context
Dependency: PG-001,GTM-002,BRAND-001
Owner: Growth FE (STOA-Foundation)
Execution Mode: SWARM

#### Pre-requisites
- FILE:docs/design/page-registry.md
- FILE:artifacts/sprint0/codex-run/Framework.md
- FILE:audit-matrix.yml
- POLICY:Security features documented
- ENV:badges ready
- FILE:docs/security/zero-trust-design.md
- FILE:apps/web/app/(public)/page.tsx
- FILE:docs/company/messaging/positioning.md
- FILE:docs/company/brand/visual-identity.md
- FILE:docs/company/brand/style-guide.md
- FILE:docs/company/brand/dos-and-donts.md
- FILE:docs/company/brand/accessibility-patterns.md

#### Tasks
1. Response <200ms, Lighthouse ≥90, trust signals
2. artifacts: page.tsx, security-features.json, context_ack.json
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
# AUDIT:manual-review
# GATE:lighthouse-gte-90
```

#### KPIs
- Security explained, badges displayed, trust built

#### Artifacts
| Type | Path | Description |
|------|------|-------------|
| ARTIFACT | apps/web/app/(public)/security/page.tsx | Page |
| ARTIFACT | artifacts/misc/security-features.json | Security Features |
| EVIDENCE | artifacts/attestations/PG-008/context_ack.json | Completion attestation |

### IFC-125: Implement guardrails for prompt injection, data leakage, and monitor AI bias

### Key Objectives

- Code: Deliver high-quality, tested code for the web app
- Integration: Seamlessly integrate new features into existing architecture
- Security: Ensure robust security and compliance
- Performance: Optimize for speed and responsiveness
- Aviability: Ensure high availability and reliability
- Maintainability: Write clean, maintainable code
- Documentation: Provide clear documentation and specs

#### Context
Dependency: IFC-005,IFC-008
Owner: AI Specialist + Security (STOA-Security)
Execution Mode: SWARM

#### Pre-requisites
- FILE:artifacts/sprint0/codex-run/Framework.md
- FILE:audit-matrix.yml
- ENV:AI models integrated
- FILE:docs/planning/adr/ADR-007-data-governance.md
- FILE:docs/shared/review-checklist.md
- FILE:docs/operations/pr-checklist.md
- FILE:apps/ai-worker/src/chains/scoring.chain.ts
- FILE:artifacts/reports/compliance-report.md

#### Tasks
1. Prompt sanitization, output redaction, bias detection metrics
2. incidents logged
3. artifacts: prompt-sanitizer.ts, bias-metrics.csv, ai-guardrails-report.md
4. targets: zero errors
5. verified by: pnpm test
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
```

#### KPIs
- Zero prompt injection incidents
- bias score below threshold

#### Artifacts
| Type | Path | Description |
|------|------|-------------|
| SPEC | .specify/specifications/IFC-125.md | Documentation |
| PLAN | .specify/planning/IFC-125.md | Documentation |
| EVIDENCE | artifacts/attestations/IFC-125/context_pack.md | Completion attestation |
| EVIDENCE | artifacts/attestations/IFC-125/context_ack.json | Completion attestation |
| ARTIFACT | apps/api/src/shared/prompt-sanitizer.ts | Prompt Sanitizer |
| ARTIFACT | artifacts/metrics/bias-metrics.csv | Metrics data |
| ARTIFACT | docs/shared/ai-guardrails-report.md | Documentation |

### IFC-158: Scheduling communications: ICS invites, reschedule/cancel flows, reminders; integrated with notification service and calendar sync

### Key Objectives

- Code: Deliver high-quality, tested code for the web app
- Integration: Seamlessly integrate new features into existing architecture
- Security: Ensure robust security and compliance
- Performance: Optimize for speed and responsiveness
- Aviability: Ensure high availability and reliability
- Maintainability: Write clean, maintainable code
- Documentation: Provide clear documentation and specs

#### Context
Dependency: IFC-138,IFC-157,IFC-137
Owner: Backend Dev + Calendar Specialist (STOA-Domain)
Execution Mode: SWARM

#### Pre-requisites
- FILE:artifacts/sprint0/codex-run/Framework.md
- FILE:audit-matrix.yml
- ENV:Calendar sync stable
- notification service MVP available
- appointment aggregate ready
- FILE:docs/architecture/hex-boundaries.md
- FILE:packages/adapters/src/calendar/google/client.ts
- FILE:docs/operations/runbooks/notifications.md
- FILE:packages/domain/src/legal/appointments/Appointment.ts

#### Tasks
1. ICS generation and delivery implemented
2. reschedule/cancel semantics correct
3. reminders scheduled
4. audit trail
5. integration tests
6. artifacts: context_ack.json
7. targets: >=95%, >=99%, zero errors
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
# VALIDATE:pnpm test:e2e
```

#### KPIs
- Invite delivery >=95%
- reminder delivery >=99%
- zero duplicate invites on retries

#### Artifacts
| Type | Path | Description |
|------|------|-------------|
| EVIDENCE | artifacts/attestations/IFC-158/context_ack.json | Completion attestation |


---

## Success Criteria

| Category | Metric | Target |
|----------|--------|--------|
| Compliance | 0 compliance gaps, audit trail complete | Met |
| Compliance | DSAR turnaround <7 days | Met |
| Compliance | encryption coverage 100% | Met |
| Compliance | retention and legal hold compliance audited | Met |
| Public Pages | Page live, performance met, SEO indexed | Met |
| Public Pages | Page live, features showcased, CTA working | Met |
| Public Pages | Pricing clear, calculator working, Stripe ready | Met |
| Public Pages | Story told, team showcased, culture visible | Met |
| Public Pages | Form submitting, validation working, emails sent | Met |
| Public Pages | Partners showcased, benefits clear, CTAs working | Met |
| Public Pages | Press releases live, media kit downloadable | Met |
| Public Pages | Security explained, badges displayed, trust built | Met |
| AI Foundation | Zero prompt injection incidents | Met |
| AI Foundation | bias score below threshold | Met |
| Security | All critical threats mitigated | Met |
| Security | pen test high severity issues <5 | Met |
| Security | cookie compliance tests pass | Met |
| Case Docs | Access control test pass 100% | Met |
| Case Docs | audit log coverage 100% | Met |
| Case Docs | CRUD latency p95 <50ms | Met |
| Notifications | Delivery success >=99% | Met |
| Notifications | template rendering errors 0 in CI | Met |
| Notifications | audit coverage 100% | Met |
| Scheduling | Invite delivery >=95% | Met |
| Scheduling | reminder delivery >=99% | Met |
| Scheduling | zero duplicate invites on retries | Met |

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
cat apps/project-tracker/docs/metrics/sprint-10/_summary.json

# 2. Review dependency graph to understand task relationships
cat apps/project-tracker/docs/metrics/_global/dependency-graph.json

# 3. Check current sprint status
cat apps/project-tracker/docs/metrics/_global/Sprint_plan.csv | grep "Sprint 11"

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
# Sprint 11 parallel execution:
Task("A", "Execute PG-002, PG-003, PG-005, PG-007, PG-008") &
Task("B", "Execute IFC-125") &
Task("C", "Execute IFC-158") &
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
- `PG-002`: Features Page
- `PG-003`: Pricing Page
- `PG-005`: Contact Page
- `PG-007`: Press Page
- `PG-008`: Security Page
- `IFC-125`: Implement guardrails for prompt injection, data leakage, and monitor AI bias
- `IFC-158`: Scheduling communications: ICS invites, reschedule/cancel flows, reminders; integrated with notification service and calendar sync

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
pnpm audit:sprint 11

# Generate attestation report
npx tsx tools/scripts/attest-sprint.ts 11

# Verify all tasks pass
cat artifacts/reports/attestation/sprint-11-latest.json
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
| 0 | parallel | PG-002, PG-003, PG-005, PG-007, PG-008, IFC-125, IFC-158 |

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

### Sprint 11 Completion Gate

The sprint is complete when:
- All achievable tasks marked as Done
- Deferred tasks documented with target sprint
- Blockers escalated with clear resolution path
- Phase summaries updated with final metrics
- Sprint summary reflects accurate totals
- All attestations generated with COMPLETE verdict