# Sprint 13 Sub-Agent Orchestration Prompt for Claude Code

## Mission Brief

You are orchestrating Sprint 13 of the **IntelliFlow CRM** project.

**Execution Model**: Use `claude --dangerously-skip-permissions` for autonomous sub-agent spawning with the `Task` tool for parallel orchestration.

**Target Application**: All implementation work targets the **web app** (`apps/web/` at `http://localhost:3000`), not the project-tracker.

---

## Sprint 13 Mission

**Project**: IntelliFlow CRM
**Sprint**: 13
**Theme**: Auth Pages

### Key Objectives

- Code: Deliver high-quality, tested code for the web app
- Integration: Seamlessly integrate new features into existing architecture
- Security: Ensure robust security and compliance
- Performance: Optimize for speed and responsiveness
- Availability: Ensure high availability and reliability
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
| **Total Tasks** | 16 |
| **Completed** | 11 |
| **Pending** | 5 |
| **Phases** | 1 |
| **Parallel Tasks** | 5 |
| **Theme** | Auth Pages |
| **Key Focus Areas** | Auth Pages, Intelligence, AI Assistant, UI/Domain |
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
    ○ PG-017
    ○ PG-023
  Stream B:
    ○ PG-019
    ○ PG-024
  Stream C:
    ○ PG-022
  ↓ (all complete before next phase)

============================================================
```

### Parallel Streams

| Stream | Tasks | Dependencies |
|--------|-------|--------------|
| P0-A | PG-017, PG-023 | PG-016 |
| P0-B | PG-019, PG-024 | PG-015 |
| P0-C | PG-022 | PG-021 |

---

## Complete Task List

### Completed Tasks (11)

| Task ID | Section | Description | Status |
|---------|---------|-------------|--------|
| **IFC-021** | Intelligence | PHASE-011: CrewAI Agent Framework | ✅ Completed |
| **IFC-022** | Intelligence | PHASE-011: Structured AI Output Implementation | ✅ Completed |
| **IFC-023** | Intelligence | PHASE-011: AI Explainability UI | ✅ Completed |
| **PG-015** | Auth Pages | Sign In | ✅ Completed |
| **PG-016** | Auth Pages | Sign Up | ✅ Completed |
| **PG-018** | Auth Pages | Logout | ✅ Completed |
| **PG-020** | Auth Pages | Reset Password | ✅ Completed |
| **PG-021** | Auth Pages | MFA Setup | ✅ Completed |
| **IFC-156** | AI Assistant | Case RAG tool: agent retrieval tool constrained by tenant/case permissions; citations + source trace; prompt-injection hardening for retrieved content | ✅ Completed |
| **IFC-159** | UI/Domain | Case timeline enrichment: include documents/versions, communications (email/WhatsApp), and agent actions/approvals as timeline events | ✅ Completed |
| **IFC-163** | Platform | Standardize worker runtime under apps/workers (events, ingestion, notifications) with shared job framework, metrics, and deployment packaging | ✅ Completed |

### Pending Tasks (5)

| Task ID | Section | Description | Owner | Dependencies | KPIs |
|---------|---------|-------------|-------|--------------|------|
| **PG-017** | Auth Pages | Sign Up Success | Platform FE (STOA-Foundation) | PG-016 | Success shown, onboarding initiated, tracking active |
| **PG-019** | Auth Pages | Forgot Password | Platform FE (STOA-Foundation) | PG-015 | Reset initiated, email sent, link working |
| **PG-022** | Auth Pages | MFA Verify | Platform FE (STOA-Foundation) | PG-021 | MFA verification working, codes validated |
| **PG-023** | Auth Pages | Email Verification | Platform FE (STOA-Foundation) | PG-016 | Email verification working, account activated |
| **PG-024** | Auth Pages | SSO Callback | Platform FE (STOA-Foundation) | PG-015 | SSO callback working, tokens exchanged, user logged in |

---

## Execution Strategy

### Phase 0: Initialisation (Parallel)

Execute these streams **simultaneously** using the `Task` tool:

```bash
# Spawn parallel sub-agents
Task("A", "Auth Pages") &
Task("B", "Auth Pages") &
Task("C", "Auth Pages") &
```

### PG-017: Sign Up Success

### Key Objectives
- Code: Deliver high-quality, tested code for the web app
- Integration: Seamlessly integrate new features into existing architecture
- Security: Ensure robust security and compliance
- Performance: Optimize for speed and responsiveness
- Availability: Ensure high availability and reliability
- Maintainability: Write clean, maintainable code
- Documentation: Provide clear documentation and specs

#### Context
Dependency: PG-016
Owner: Platform FE (STOA-Foundation)
Execution Mode: SWARM

#### Pre-requisites
- FILE:artifacts/sprint0/codex-run/Framework.md
- FILE:audit-matrix.yml
- ENV:Success message
- POLICY:next steps defined
- FILE:apps/web/app/(auth)/signup/page.tsx

#### Tasks
1. Response <200ms, Lighthouse ≥90, onboarding started
2. artifacts: page.tsx, onboarding-flow.tsx, tracking-pixel.ts

#### Validation
```bash
# AUDIT:manual-review
# GATE:lighthouse-gte-90
```

#### KPIs
- Success shown, onboarding initiated, tracking active

#### Artifacts
| Type | Path | Description |
|------|------|-------------|
| ARTIFACT | apps/web/app/(auth)/signup/success/page.tsx | Page |
| ARTIFACT | apps/web/components/shared/onboarding-flow.tsx | Onboarding Flow |
| ARTIFACT | apps/web/lib/shared/tracking-pixel.ts | Tracking Pixel |
| EVIDENCE | artifacts/attestations/PG-017/context_ack.json | Completion attestation |

### PG-019: Forgot Password

### Key Objectives
- Code: Deliver high-quality, tested code for the web app
- Integration: Seamlessly integrate new features into existing architecture
- Security: Ensure robust security and compliance
- Performance: Optimize for speed and responsiveness
- Availability: Ensure high availability and reliability
- Maintainability: Write clean, maintainable code
- Documentation: Provide clear documentation and specs

#### Context
Dependency: PG-015
Owner: Platform FE (STOA-Foundation)
Execution Mode: SWARM

#### Pre-requisites
- FILE:artifacts/sprint0/codex-run/Framework.md
- FILE:audit-matrix.yml
- ENV:Reset flow designed
- ENV:email template
- FILE:apps/web/app/(auth)/login/page.tsx

#### Tasks
1. Response <200ms, Lighthouse ≥90, reset email sent
2. artifacts: page.tsx, reset-email.tsx, reset-token.ts

#### Validation
```bash
# AUDIT:manual-review
# GATE:lighthouse-gte-90
```

#### KPIs
- Reset initiated, email sent, link working

#### Artifacts
| Type | Path | Description |
|------|------|-------------|
| ARTIFACT | apps/web/app/(auth)/forgot-password/page.tsx | Page |
| ARTIFACT | apps/web/components/shared/reset-email.tsx | Reset Email |
| ARTIFACT | apps/web/lib/shared/reset-token.ts | Reset Token |
| EVIDENCE | artifacts/attestations/PG-019/context_ack.json | Completion attestation |

### PG-022: MFA Verify

### Key Objectives
- Code: Deliver high-quality, tested code for the web app
- Integration: Seamlessly integrate new features into existing architecture
- Security: Ensure robust security and compliance
- Performance: Optimize for speed and responsiveness
- Availability: Ensure high availability and reliability
- Maintainability: Write clean, maintainable code
- Documentation: Provide clear documentation and specs

#### Context
Dependency: PG-021
Owner: Platform FE (STOA-Foundation)
Execution Mode: SWARM

#### Pre-requisites
- IMPLEMENTS:FLOW-001
- FILE:artifacts/sprint0/codex-run/Framework.md
- FILE:audit-matrix.yml
- ENV:Verification flow
- ENV:code validation
- FILE:apps/web/app/(auth)/mfa/setup/page.tsx

#### Tasks
1. Response <200ms, Lighthouse ≥90, verification working
2. artifacts: page.tsx, mfa-verification.tsx, code-validator.ts

#### Validation
```bash
# AUDIT:manual-review
# GATE:lighthouse-gte-90
```

#### KPIs
- MFA verification working, codes validated

#### Artifacts
| Type | Path | Description |
|------|------|-------------|
| ARTIFACT | apps/web/app/(auth)/mfa/verify/page.tsx | Page |
| ARTIFACT | apps/web/components/shared/mfa-verification.tsx | Mfa Verification |
| ARTIFACT | apps/web/lib/shared/code-validator.ts | Code Validator |
| EVIDENCE | artifacts/attestations/PG-022/context_ack.json | Completion attestation |

### PG-023: Email Verification

### Key Objectives
- Code: Deliver high-quality, tested code for the web app
- Integration: Seamlessly integrate new features into existing architecture
- Security: Ensure robust security and compliance
- Performance: Optimize for speed and responsiveness
- Availability: Ensure high availability and reliability
- Maintainability: Write clean, maintainable code
- Documentation: Provide clear documentation and specs

#### Context
Dependency: PG-016
Owner: Platform FE (STOA-Foundation)
Execution Mode: SWARM

#### Pre-requisites
- FILE:artifacts/sprint0/codex-run/Framework.md
- FILE:audit-matrix.yml
- ENV:Verification link
- ENV:token validation
- FILE:apps/web/app/(auth)/signup/page.tsx

#### Tasks
1. Response <200ms, Lighthouse ≥90, email verified
2. artifacts: page.tsx, email-verification.tsx, account-activation.ts

#### Validation
```bash
# AUDIT:manual-review
# GATE:lighthouse-gte-90
```

#### KPIs
- Email verification working, account activated

#### Artifacts
| Type | Path | Description |
|------|------|-------------|
| ARTIFACT | apps/web/app/(auth)/verify-email/[token]/page.tsx | Page |
| ARTIFACT | apps/web/components/shared/email-verification.tsx | Email Verification |
| ARTIFACT | apps/web/lib/shared/account-activation.ts | Account Activation |
| EVIDENCE | artifacts/attestations/PG-023/context_ack.json | Completion attestation |

### PG-024: SSO Callback

### Key Objectives
- Code: Deliver high-quality, tested code for the web app
- Integration: Seamlessly integrate new features into existing architecture
- Security: Ensure robust security and compliance
- Performance: Optimize for speed and responsiveness
- Availability: Ensure high availability and reliability
- Maintainability: Write clean, maintainable code
- Documentation: Provide clear documentation and specs

#### Context
Dependency: PG-015
Owner: Platform FE (STOA-Foundation)
Execution Mode: SWARM

#### Pre-requisites
- FILE:artifacts/sprint0/codex-run/Framework.md
- FILE:audit-matrix.yml
- ENV:OAuth callbacks
- ENV:token exchange
- FILE:apps/web/app/(auth)/login/page.tsx

#### Tasks
1. Response <200ms, Lighthouse ≥90, SSO complete
2. artifacts: page.tsx, oauth-callback.tsx, token-exchange.ts

#### Validation
```bash
# AUDIT:manual-review
# GATE:lighthouse-gte-90
```

#### KPIs
- SSO callback working, tokens exchanged, user logged in

#### Artifacts
| Type | Path | Description |
|------|------|-------------|
| ARTIFACT | apps/web/app/(auth)/auth/callback/page.tsx | Page |
| ARTIFACT | apps/web/components/shared/oauth-callback.tsx | Oauth Callback |
| ARTIFACT | apps/web/lib/shared/token-exchange.ts | Token Exchange |
| EVIDENCE | artifacts/attestations/PG-024/context_ack.json | Completion attestation |


---

## Success Criteria

| Category | Metric | Target |
|----------|--------|--------|
| Intelligence | Agents cooperating, tasks orchestrated | Met |
| Intelligence | 100% structured outputs, type-safe | Met |
| Intelligence | Users understand AI decisions, trust >4/5 | Met |
| Auth Pages | Login functional, SSO working, security validated | Met |
| Auth Pages | Signup working, validation active, welcome email sent | Met |
| Auth Pages | Success shown, onboarding initiated, tracking active | Met |
| Auth Pages | Logout working, session cleared, redirect functional | Met |
| Auth Pages | Reset initiated, email sent, link working | Met |
| Auth Pages | Password reset working, requirements enforced | Met |
| Auth Pages | MFA setup working, QR generated, backup codes created | Met |
| Auth Pages | MFA verification working, codes validated | Met |
| Auth Pages | Email verification working, account activated | Met |
| Auth Pages | SSO callback working, tokens exchanged, user logged in | Met |
| AI Assistant | 0 unauthorized retrievals | Met |
| AI Assistant | response time p95 <2s | Met |
| AI Assistant | hallucination rate reduced via eval suite | Met |
| UI/Domain | Timeline load <1s | Met |
| UI/Domain | user task completion improved | Met |
| UI/Domain | 0 unauthorized events visible | Met |
| Platform | Worker job success >=99% | Met |
| Platform | processing latency p95 <30s | Met |
| Platform | 100% workers emit traces/metrics/logs | Met |

---

## Agent Orchestration Instructions

### How to Execute This Sprint

This sprint should be executed using Claude Code with sub-agent orchestration. Follow these patterns:

### 0. Pre-Execution Context (CRITICAL)

**Before starting any task, gather context from previous work:**

```bash
# 1. Read completed tasks from previous sprint(s) for context
cat apps/project-tracker/docs/metrics/sprint-12/_summary.json

# 2. Review dependency graph to understand task relationships
cat apps/project-tracker/docs/metrics/_global/dependency-graph.json

# 3. Check current sprint status
cat apps/project-tracker/docs/metrics/_global/Sprint_plan.csv | grep "Sprint 13"

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
# Sprint 13 parallel execution:
Task("A", "Execute PG-017, PG-023") &
Task("B", "Execute PG-019, PG-024") &
Task("C", "Execute PG-022") &
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
- `PG-017`: Sign Up Success
- `PG-019`: Forgot Password
- `PG-022`: MFA Verify
- `PG-023`: Email Verification
- `PG-024`: SSO Callback

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
pnpm audit:sprint 13

# Generate attestation report
npx tsx tools/scripts/attest-sprint.ts 13

# Verify all tasks pass
cat artifacts/reports/attestation/sprint-13-latest.json
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
| 0 | parallel | PG-017, PG-019, PG-022, PG-023, PG-024 |

---

## Definition of Done

### Key Objectives

- Code: Deliver high-quality, tested code for the web app
- Integration: Seamlessly integrate new features into existing architecture
- Security: Ensure robust security and compliance
- Performance: Optimize for speed and responsiveness
- Availability: Ensure high availability and reliability
- Maintainability: Write clean, maintainable code
- Documentation: Provide clear documentation and specs

A task is considered **DONE** when:

1. ✅ All validation commands pass (exit code 0)
2. ✅ All artifacts listed are created and accessible
3. ✅ All KPIs meet or exceed target values
4. ✅ No blocking issues or errors remain
5. ✅ Status updated to "Done" in Sprint_plan.csv
6. ✅ Attestation created in `artifacts/attestations/<TASK_ID>/`
7. ✅ Code merged to main branch (if applicable)

### Sprint 13 Completion Gate

The sprint is complete when:
- All achievable tasks marked as Done
- Deferred tasks documented with target sprint
- Blockers escalated with clear resolution path
- Phase summaries updated with final metrics
- Sprint summary reflects accurate totals
- All attestations generated with COMPLETE verdict