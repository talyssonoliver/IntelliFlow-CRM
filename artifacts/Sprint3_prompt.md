# Sprint 3 Sub-Agent Orchestration Prompt for Claude Code

## Mission Brief

You are orchestrating Sprint 3 of the **IntelliFlow CRM** project.

**Execution Model**: Use `claude --dangerously-skip-permissions` for autonomous sub-agent spawning with the `Task` tool for parallel orchestration.

---

## Sprint 3 Mission

**Project**: IntelliFlow CRM
**Sprint**: 3
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
| **Total Tasks** | 8 |
| **Completed** | 2 |
| **Pending** | 6 |
| **Phases** | 1 |
| **Parallel Tasks** | 6 |
| **Theme** | Validation & Architecture Foundation |
| **Key Focus Areas** | Validation, Parallel Track, Infrastructure, AI Foundation |

---

## Sprint Dependency Graph

```
EXECUTION PHASES
============================================================

Phase 0: Initialisation
----------------------------------------
  [PARALLEL EXECUTION]
  Stream A:
    ○ IFC-006
  Stream B:
    ○ IFC-007
  Stream C:
    ○ IFC-011
  Stream D:
    ○ IFC-107
  Stream E:
    ○ IFC-128
  Stream F:
    ○ IFC-136
  ↓ (all complete before next phase)

============================================================
```

### Parallel Streams

| Stream | Tasks | Dependencies |
|--------|-------|--------------|
| P0-A | IFC-006 | IFC-003 |
| P0-B | IFC-007 | IFC-004, IFC-005 |
| P0-C | IFC-011 | IFC-000 |
| P0-D | IFC-107 | IFC-101, IFC-102, IFC-103, IFC-104, IFC-105 |
| P0-E | IFC-128 | ENV-017-AI |
| P0-F | IFC-136 | IFC-002, IFC-003 |

---

## Complete Task List

### Completed Tasks (2)

| Task ID | Section | Description | Status |
|---------|---------|-------------|--------|
| **IFC-104** | Validation | Opportunity Aggregate and Value Objects... | ✅ Completed |
| **IFC-105** | Validation | Task Aggregate and Value Objects... | ✅ Completed |

### Pending Tasks (6)

| Task ID | Section | Description | Owner | Dependencies | KPIs |
|---------|---------|-------------|-------|--------------|------|
| **IFC-006** | Validation | Supabase Integration Test... | Backend Dev + DevOps (STOA-Automation) | IFC-003 | Auth flow complete, vector sea |
| **IFC-007** | Validation | Performance Benchmarks - Modern Stack... | Performance Eng + DevOps (STOA-Quality) | IFC-004,IFC-005 | 1000 concurrent users, p99 <10 |
| **IFC-011** | Parallel Track | Supabase Free Tier Optimization... | DevOps + PM (STOA-Automation) | IFC-000 | All free features utilized, co |
| **IFC-107** | Infrastructure | Implement Repositories and Factories... | Backend Dev (STOA-Domain) | IFC-101,IFC-102,IFC-103,IFC-104,IFC-105 | Repositories integrated with P |
| **IFC-128** | AI Foundation | Establish AI output review and manual fa... | QA Lead + Tech Lead (STOA-Quality) | ENV-017-AI | AI suggestions accepted vs rej |
| **IFC-136** | Domain | Implement Case/Matter aggregate root wit... | Backend Dev + Domain Architect (STOA-Intelligence) | IFC-002,IFC-003 | Coverage >=90%; response time  |

---

## Execution Strategy

### Phase 0: Initialisation (Parallel)

Execute these streams **simultaneously** using the `Task` tool:

```bash
# Spawn parallel sub-agents
Task("A", "Validation") &
Task("B", "Validation") &
Task("C", "Parallel Track") &
Task("D", "Infrastructure") &
Task("E", "AI Foundation") &
Task("F", "Domain") &
```

```markdown
## IFC-006: Supabase Integration Test

### Context
Dependency: IFC-003
Owner: Backend Dev + DevOps (STOA-Automation)
Execution Mode: SWARM

### Pre-requisites
- FILE:artifacts/sprint0/codex-run/Framework.md
- FILE:audit-matrix.yml
- ENV:Supabase project created
- ENV:auth configured
- FILE:docs/planning/adr/ADR-001-modern-stack.md
- FILE:docs/tdd-guidelines.md
- FILE:docs/shared/review-checklist.md
- FILE:apps/api/src/trpc.ts

### Tasks
1. Auth working, real-time subscriptions, pgvector enabled
2. artifacts: supabase.ts, auth-flow-test.e2e.ts, vector-search-demo.ts
3. verified by: pnpm test

### Validation
```bash
# VALIDATE:pnpm test
```

### KPIs
- Auth flow complete, vector search working

### Artifacts
- SPEC:.specify/specifications/IFC-006.md;PLAN:.specify/planning/IFC-006.md;ARTIFACT:apps/api/src/lib/supabase.ts;ARTIFACT:apps/api/src/shared/auth-flow-test.e2e.ts;ARTIFACT:apps/api/src/shared/vector-search-demo.ts;EVIDENCE:artifacts/attestations/IFC-006/context_ack.json
```

```markdown
## IFC-007: Performance Benchmarks - Modern Stack

### Context
Dependency: IFC-004,IFC-005
Owner: Performance Eng + DevOps (STOA-Quality)
Execution Mode: SWARM

### Pre-requisites
- FILE:artifacts/sprint0/codex-run/Framework.md
- FILE:audit-matrix.yml
- ENV:k6/Vitest setup
- POLICY:metrics defined
- FILE:docs/planning/adr/ADR-001-modern-stack.md
- FILE:docs/tdd-guidelines.md
- FILE:docs/shared/review-checklist.md
- FILE:apps/web/src/app/leads/(list)/new/page.tsx
- FILE:apps/ai-worker/src/chains/scoring.chain.ts

### Tasks
1. Baseline with tRPC, Vercel Edge, Railway documented
2. targets: <100ms
3. verified by: pnpm test
4. gates: p99-latency-check

### Validation
```bash
# VALIDATE:pnpm test
# GATE:p99-latency-check
```

### KPIs
- 1000 concurrent users, p99 <100ms

### Artifacts
- ARTIFACT:artifacts/misc/k6/scripts/load-test.js;ARTIFACT:artifacts/benchmarks/performance-report.html;ARTIFACT:artifacts/misc/grafana-dashboard.json;ARTIFACT:artifacts/metrics/baseline-metrics.csv;EVIDENCE:artifacts/attestations/IFC-007/context_ack.json
```

```markdown
## IFC-011: Supabase Free Tier Optimization

### Context
Dependency: IFC-000
Owner: DevOps + PM (STOA-Automation)
Execution Mode: SWARM

### Pre-requisites
- FILE:artifacts/sprint0/codex-run/Framework.md
- FILE:audit-matrix.yml
- ENV:Supabase account
- ENV:usage limits understood
- FILE:docs/planning/adr/ADR-001-modern-stack.md
- FILE:artifacts/reports/business-case.md

### Tasks
1. Free tier maximized, upgrade path documented

### Validation
```bash
# AUDIT:manual-review
```

### KPIs
- All free features utilized, costs projected

### Artifacts
- ARTIFACT:artifacts/reports/supabase-usage-report.json;ARTIFACT:artifacts/reports/cost-projection.xlsx;ARTIFACT:docs/shared/optimization-guide.md;ARTIFACT:artifacts/misc/upgrade-triggers.yaml;EVIDENCE:artifacts/attestations/IFC-011/context_ack.json
```

```markdown
## IFC-107: Implement Repositories and Factories

### Context
Dependency: IFC-101,IFC-102,IFC-103,IFC-104,IFC-105
Owner: Backend Dev (STOA-Domain)
Execution Mode: SWARM

### Pre-requisites
- FILE:artifacts/sprint0/codex-run/Framework.md
- FILE:audit-matrix.yml
- ENV:Domain models implemented
- FILE:packages/adapters/src/repositories/PrismaLeadRepository.ts
- FILE:packages/adapters/src/repositories/PrismaContactRepository.ts
- FILE:packages/adapters/src/repositories/PrismaAccountRepository.ts
- FILE:packages/adapters/src/repositories/PrismaOpportunityRepository.ts
- FILE:packages/adapters/src/repositories/PrismaTaskRepository.ts

### Tasks
1. Repository implementations for all aggregates with Prisma, factories for entity creation
2. artifacts: context_ack.json
3. targets: >=90%
4. verified by: pnpm test, pnpm test:unit

### Validation
```bash
# VALIDATE:pnpm test
# VALIDATE:pnpm test:unit
# GATE:coverage-gte-90
```

### KPIs
- Repositories integrated with Prisma, tests coverage >90%

### Artifacts
- EVIDENCE:artifacts/attestations/IFC-107/context_ack.json
```

```markdown
## IFC-128: Establish AI output review and manual fallback processes

### Context
Dependency: ENV-017-AI
Owner: QA Lead + Tech Lead (STOA-Quality)
Execution Mode: SWARM

### Pre-requisites
- FILE:artifacts/sprint0/codex-run/Framework.md
- FILE:audit-matrix.yml
- ENV:AI generation features integrated
- FILE:docs/shared/review-checklist.md
- FILE:docs/operations/pr-checklist.md
- FILE:artifacts/misc/test-orchestration.json

### Tasks
1. All AI-generated outputs (code, tests, docs) reviewed by humans
2. fallback processes documented and tested
3. targets: zero errors

### Validation
```bash
# AUDIT:code-review
# VALIDATE:pnpm test
```

### KPIs
- AI suggestions accepted vs rejected ratio tracked
- zero regressions from AI outputs

### Artifacts
- ARTIFACT:docs/shared/ai-review-checklist.md;ARTIFACT:docs/shared/fallback-procedure.md;EVIDENCE:artifacts/attestations/IFC-128/context_ack.json
```

```markdown
## IFC-136: Implement Case/Matter aggregate root with tasks; deadlines; 

### Context
Dependency: IFC-002,IFC-003
Owner: Backend Dev + Domain Architect (STOA-Intelligence)
Execution Mode: SWARM

### Pre-requisites
- FILE:artifacts/sprint0/codex-run/Framework.md
- FILE:audit-matrix.yml
- ENV:DDD model finalized
- tRPC API foundation ready
- FILE:docs/planning/DDD-context-map.puml
- FILE:packages/db/prisma/schema.prisma
- FILE:docs/operations/quality-gates.md
- FILE:apps/api/src/trpc.ts

### Tasks
1. Case/Matter entities created with invariants
2. repositories and services implemented
3. CRUD endpoints via tRPC
4. unit and integration tests pass
5. targets: >=90%

### Validation
```bash
# VALIDATE:pnpm test
# VALIDATE:pnpm test:integration
# AUDIT:code-review
# GATE:coverage-gte-90
```

### KPIs
- Coverage >=90%
- response time <=50ms
- correctness validated

### Artifacts
- ARTIFACT:packages/domain/src/legal/cases/case.ts;ARTIFACT:packages/domain/src/legal/cases/task.ts;ARTIFACT:packages/db/prisma/case.sql;ARTIFACT:apps/api/src/modules/legal/cases.router.ts;EVIDENCE:artifacts/attestations/IFC-136/context_ack.json
```


---

## Success Criteria

| Category | Metric | Target |
|----------|--------|--------|
| Validation | Auth flow complete, vector search working | Met |
| Validation | 1000 concurrent users, p99 <100ms | Met |
| Validation | Design approved, unit tests ≥90% coverage, repository API stable | Met |
| Parallel Track | All free features utilized, costs projected | Met |
| Infrastructure | Repositories integrated with Prisma, tests coverage >90% | Met |
| AI Foundation | AI suggestions accepted vs rejected ratio tracked | Met |
| AI Foundation | zero regressions from AI outputs | Met |
| Domain | Coverage >=90% | Met |
| Domain | response time <=50ms | Met |
| Domain | correctness validated | Met |

---

## Definition of Done

A task is considered **DONE** when:

1. ✅ All validation commands pass (exit code 0)
2. ✅ All artifacts listed are created and accessible
3. ✅ All KPIs meet or exceed target values
4. ✅ No blocking issues or errors remain
5. ✅ Status updated to "Done" in Sprint_plan.csv
6. ✅ Evidence bundle generated (if MATOP task)

### Sprint 3 Completion Gate

The sprint is complete when:
- All achievable tasks marked as Done
- Deferred tasks documented with target sprint
- Blockers escalated with clear resolution path
- Phase summaries updated with final metrics
- Sprint summary reflects accurate totals