# Sprint 1 Sub-Agent Orchestration Prompt for Claude Code

## Mission Brief

You are orchestrating Sprint 1 of the **IntelliFlow CRM** project. This sprint focuses on **Validation** - proving the modern stack feasibility, establishing domain models, and setting up architectural foundations.

**Execution Model**: Use `claude --dangerously-skip-permissions` for autonomous sub-agent spawning with the `Task` tool for parallel orchestration.

---

## Sprint 1 Overview

| Metric | Value |
|--------|-------|
| **Total Tasks** | 14 (original) |
| **Completed** | 1 (IFC-001) |
| **Achievable This Sprint** | 11 |
| **Deferred** | 2 (IFC-077 → Sprint 7, IFC-119 → Sprint 2) |
| **Partial Delivery** | 1 (IFC-072 - depends on IFC-008 Sprint 2) |
| **Theme** | Validation & Architecture Foundation |
| **Key Focus Areas** | DDD, tRPC, Security, Observability, Governance |

---

## Sprint 1 Dependency Graph

```
                 SPRINT 0 COMPLETED
                 (EXC-INIT-001, ENV-*, AI-SETUP-*, etc.)
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
   IFC-001 ✓         IFC-002          BRAND-001 ✓
   (Completed)            │            (Completed)
        │                 │                 │
        │           ┌─────┼─────┐     ┌─────┴─────┐
        │           │     │     │     │           │
        │      IFC-003  IFC-106 │   BRAND-002   GTM-002 ✓
        │           │     │     │              (Completed)
   ┌────┴────┐     │     │     │                 │
   │         │     │     │     │           SALES-001
IFC-072*  IFC-075  │     │  IFC-135
   │              │     │     │
IFC-073      ┌────┘     │     │
             │          │     │
         IFC-074        │     │
                        │     │
                    GOV-001 ←─┘
                        ↑
                  ENG-OPS-001 ✓
                   (Completed)

DEFERRED TO LATER SPRINTS:
├── IFC-077 ──→ Sprint 7 (needs IFC-013)
└── IFC-119 ──→ Sprint 2 (needs IFC-118)

⚠️ CIRCULAR DEPENDENCY (see resolution below):
   IFC-106 ←→ IFC-131

* IFC-072 = partial delivery (IFC-008 is Sprint 2)
```

### Circular Dependency Resolution: IFC-106 ↔ IFC-131

**Problem Identified:**
- IFC-106 (Sprint 1) depends on IFC-131
- IFC-131 (Sprint 4) depends on IFC-106

**Resolution:**
- **Sprint 1**: IFC-106 creates the skeleton structure (ports, adapters, usecases directories)
- **Sprint 4**: IFC-131 adds CI enforcement and architecture tests
- Remove IFC-131 from IFC-106's dependencies for Sprint 1 execution

---

## Complete Task List

### Completed Tasks (1)

| Task ID | Section | Description | Status |
|---------|---------|-------------|--------|
| **IFC-001** | Validation | Technical Architecture Spike - Modern Stack | ✅ Completed |

---

### Pending Tasks (11 Achievable + 2 Deferred)

#### CRITICAL PATH - Core Architecture

| Task ID | Section | Description | Owner | Dependencies | KPIs |
|---------|---------|-------------|-------|--------------|------|
| **IFC-002** | Validation | Domain Model Design (DDD) | Tech Lead + DA | Sprint 0 ✓ | Schema supports all contexts, type-safe models |
| **IFC-003** | Validation | tRPC API Foundation | DevOps + Backend Dev | IFC-002 | End-to-end type safety, <50ms response |
| **IFC-106** | Architecture | Define Hexagonal module boundaries + create canonical packages | Tech Lead + Backend Dev | IFC-002 ✓ | No domain code depends on infrastructure, skeleton structure created |

> **Note on IFC-106**: Original dependency on IFC-131 removed due to circular dependency. CI enforcement will be added in Sprint 4 (IFC-131).

#### SECURITY & COMPLIANCE

| Task ID | Section | Description | Owner | Dependencies | Status |
|---------|---------|-------------|-------|--------------|--------|
| **IFC-072** | Security | Zero Trust Security Model | Security Eng + CTO | IFC-001 ✓, IFC-008 (Sprint 2) | ⚠️ **PARTIAL** - RLS policies only, full completion Sprint 2 |
| **IFC-073** | Compliance | Privacy Impact Assessment | DPO + Legal | IFC-072 | Depends on partial IFC-072 |

#### OBSERVABILITY & INFRASTRUCTURE

| Task ID | Section | Description | Owner | Dependencies | KPIs |
|---------|---------|-------------|-------|--------------|------|
| **IFC-074** | Observability | Full Stack Observability | SRE Lead + DevOps | IFC-003 | MTTD <2min, root cause identifiable |
| **IFC-075** | Infrastructure | IaC with Terraform | DevOps | IFC-001 ✓ | 100% reproducible, drift detection active |

#### GOVERNANCE & DOCUMENTATION

| Task ID | Section | Description | Owner | Dependencies | KPIs |
|---------|---------|-------------|-------|--------------|------|
| **GOV-001** | Architecture Governance | Architecture Governance Pack (ADR + ARP templates, decision workflow) | Backend Dev + Architect | ENG-OPS-001 ✓ | Templates published, workflow clear |
| **IFC-135** | Architecture | Create ADR pack for multi-tenancy; workflow engine; agent tools; data governance; audit logging | Tech Lead + Architect | IFC-002, GOV-001 | 100% ADR coverage, stakeholder approval |

#### DESIGN & COMMERCIAL

| Task ID | Section | Description | Owner | Dependencies | KPIs |
|---------|---------|-------------|-------|--------------|------|
| **BRAND-002** | Design System | Design Tokens Integration Plan (Tailwind/shadcn theme mapping) | Frontend Dev + UX Designer | BRAND-001 ✓, ENV-002-AI ✓ | Token mapping ≥90%, zero ambiguous tokens |
| **SALES-001** | Commercial Assets | Commercial Narrative + Pitch Deck Outline + One-Pager | PM + Sales Team | GTM-002 ✓, BRAND-001 ✓ | Deck outline complete, aligns with ICP |

---

### Deferred Tasks (2)

| Task ID | Section | Reason for Deferral | Target Sprint |
|---------|---------|---------------------|---------------|
| **IFC-077** | Security | Depends on IFC-013 (tRPC Router Implementation) | Sprint 7 |
| **IFC-119** | Planning | Depends on IFC-118 (Risk Register - Sprint 2) | Sprint 2 |

---

## Execution Strategy

### Phase 1: Foundation (Sequential)

**Must complete first - blocks other tasks**

```markdown
## IFC-002: Domain Model Design (DDD)

### Context
Dependency: Sprint 0 Complete (ENV-001-AI through ENV-007-AI)
Owner: Tech Lead + DA
Sprint: 1

### Pre-requisites
- Prisma installed
- Bounded contexts identified

### Tasks
1. Define bounded contexts for CRM domain:
   - Lead Management Context
   - Contact Management Context
   - Account/Organization Context
   - Opportunity/Deal Context
   - Task/Activity Context

2. Create Prisma schema in `packages/db/prisma/schema.prisma`:
   ```prisma
   // Lead aggregate
   model Lead {
     id          String   @id @default(uuid())
     firstName   String
     lastName    String
     email       String   @unique
     company     String?
     status      LeadStatus @default(NEW)
     score       Int?
     source      String?
     createdAt   DateTime @default(now())
     updatedAt   DateTime @updatedAt
     activities  Activity[]
     assignments Assignment[]
   }

   enum LeadStatus {
     NEW
     CONTACTED
     QUALIFIED
     CONVERTED
     LOST
   }
   ```

3. Create domain models in `packages/domain/src/`:
   ```
   packages/domain/src/
   ├── crm/
   │   ├── lead/
   │   │   ├── Lead.ts          # Entity
   │   │   ├── LeadId.ts        # Value Object
   │   │   ├── LeadScore.ts     # Value Object
   │   │   └── LeadStatus.ts    # Enum
   │   ├── contact/
   │   ├── account/
   │   ├── opportunity/
   │   └── task/
   ├── events/
   │   ├── LeadCreatedEvent.ts
   │   ├── LeadScoredEvent.ts
   │   └── LeadConvertedEvent.ts
   └── shared/
       ├── Entity.ts
       ├── ValueObject.ts
       └── DomainEvent.ts
   ```

4. Create Zod validators in `packages/validators/`:
   ```typescript
   // packages/validators/src/lead.schema.ts
   import { z } from 'zod';

   export const leadSchema = z.object({
     firstName: z.string().min(1).max(100),
     lastName: z.string().min(1).max(100),
     email: z.string().email(),
     company: z.string().optional(),
     source: z.string().optional(),
   });

   export type LeadInput = z.infer<typeof leadSchema>;
   ```

5. Create DDD context map in `docs/planning/DDD-context-map.puml`

### Validation
```bash
# Validate Prisma schema
pnpm --filter @intelliflow/db prisma validate

# Type check domain models
pnpm --filter @intelliflow/domain typecheck

# Run domain tests
pnpm --filter @intelliflow/domain test
```

### KPIs
- Schema supports all contexts
- Type-safe models
- All validators passing

### Artifacts
- packages/db/prisma/schema.prisma
- packages/domain/src/*
- packages/validators/*
- docs/planning/DDD-context-map.puml
```

---

### Phase 2: API Foundation (Sequential after IFC-002)

```markdown
## IFC-003: tRPC API Foundation

### Context
Dependency: IFC-002
Owner: DevOps + Backend Dev
Sprint: 1

### Pre-requisites
- Node.js 20
- TypeScript strict mode
- Domain models ready

### Tasks
1. Set up tRPC context and router in `apps/api/`:
   ```typescript
   // apps/api/src/trpc.ts
   import { initTRPC, TRPCError } from '@trpc/server';
   import { ZodError } from 'zod';
   import superjson from 'superjson';

   export const createTRPCContext = async (opts: CreateContextOptions) => {
     return {
       db: prisma,
       session: opts.session,
     };
   };

   const t = initTRPC.context<typeof createTRPCContext>().create({
     transformer: superjson,
     errorFormatter({ shape, error }) {
       return {
         ...shape,
         data: {
           ...shape.data,
           zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
         },
       };
     },
   });

   export const router = t.router;
   export const publicProcedure = t.procedure;
   export const protectedProcedure = t.procedure.use(isAuthed);
   ```

2. Create base routers in `apps/api/src/modules/`:
   ```
   apps/api/src/modules/
   ├── crm/
   │   ├── leads.router.ts
   │   ├── contacts.router.ts
   │   └── index.ts
   ├── misc/
   │   └── health.router.ts
   └── index.ts
   ```

3. Create type-safety test in `apps/api/src/shared/e2e-type-safety-test.ts`

4. Create subscription demo in `apps/api/src/shared/subscription-demo.ts`

5. Set up tRPC client in `apps/web/src/lib/trpc.ts`

### Validation
```bash
# Build API
pnpm --filter api build

# Run type checks
pnpm --filter api typecheck

# Test endpoints
pnpm --filter api test

# Benchmark response time
pnpm --filter api test:benchmark
```

### KPIs
- End-to-end type safety
- <50ms response time
- Real-time subscriptions working

### Artifacts
- apps/api/src/modules/misc/*
- apps/api/src/trpc.ts
- apps/api/src/shared/e2e-type-safety-test.ts
- apps/api/src/shared/subscription-demo.ts
```

---

### Phase 3: Parallel Streams (After IFC-002 and IFC-003)

Execute these streams **simultaneously** using the `Task` tool:

```bash
# Spawn parallel sub-agents
Task("PARALLEL-A", "Architecture & Governance") &
Task("PARALLEL-B", "Security & Compliance") &
Task("PARALLEL-C", "Infrastructure & Observability") &
Task("PARALLEL-D", "Design & Commercial")
```

---

#### PARALLEL-A: Architecture & Governance

```markdown
# PARALLEL-A Sub-Agent: Architecture & Governance

## IFC-106: Define Hexagonal Module Boundaries

### Context
Dependency: IFC-002 (IFC-131 dependency removed - circular)
Owner: Tech Lead + Backend Dev
Sprint 1 Scope: Skeleton structure only (CI enforcement in Sprint 4)

### Tasks
1. Create application layer structure:
   ```
   packages/application/
   ├── src/
   │   ├── ports/
   │   │   ├── input/
   │   │   │   ├── LeadService.ts        # Input port interface
   │   │   │   └── ContactService.ts
   │   │   └── output/
   │   │       ├── LeadRepository.ts     # Output port interface
   │   │       ├── ContactRepository.ts
   │   │       └── AIService.ts
   │   └── usecases/
   │       ├── leads/
   │       │   ├── CreateLeadUseCase.ts
   │       │   ├── ScoreLeadUseCase.ts
   │       │   └── ConvertLeadUseCase.ts
   │       └── contacts/
   │           └── CreateContactUseCase.ts
   ```

2. Create adapters layer:
   ```
   packages/adapters/
   ├── src/
   │   ├── repositories/
   │   │   ├── PrismaLeadRepository.ts   # Implements LeadRepository
   │   │   └── PrismaContactRepository.ts
   │   ├── external/
   │   │   ├── OpenAIService.ts          # Implements AIService
   │   │   └── OllamaService.ts
   │   └── web/
   │       └── tRPCLeadController.ts     # Implements LeadService
   ```

3. Create architecture tests in `tests/architecture/`:
   ```typescript
   // tests/architecture/boundaries.test.ts
   import { describe, it, expect } from 'vitest';
   import { FilePatterns } from 'dependency-cruiser';

   describe('Architecture Boundaries', () => {
     it('domain should not depend on infrastructure', async () => {
       const result = await checkDependencies({
         source: 'packages/domain/**/*.ts',
         forbidden: ['packages/adapters/**', 'apps/**', '@prisma/client'],
       });
       expect(result.violations).toHaveLength(0);
     });

     it('application should not depend on adapters', async () => {
       const result = await checkDependencies({
         source: 'packages/application/**/*.ts',
         forbidden: ['packages/adapters/**'],
       });
       expect(result.violations).toHaveLength(0);
     });
   });
   ```

4. Document in `docs/architecture/hex-boundaries.md`

### Validation
```bash
# Run architecture tests
pnpm test:architecture

# Check dependencies
pnpm dependency-cruiser --validate packages/
```

### KPIs
- No domain code depends on infrastructure
- Skeleton structure validated
- CI enforcement deferred to Sprint 4 (IFC-131)

---

## GOV-001: Architecture Governance Pack

### Context
Dependency: ENG-OPS-001
Owner: Backend Dev + Architect

### Tasks
1. Create ADR template at `docs/architecture/adr/000-template.md`:
   ```markdown
   # ADR-XXX: [Title]

   ## Status
   [Proposed | Accepted | Deprecated | Superseded by ADR-XXX]

   ## Context
   [What is the issue that we're seeing that is motivating this decision?]

   ## Decision
   [What is the change that we're proposing and/or doing?]

   ## Consequences
   [What becomes easier or more difficult to do because of this change?]

   ## Alternatives Considered
   [What other options were evaluated?]
   ```

2. Create ARP template at `docs/architecture/arp/000-template.md`

3. Create decision workflow at `docs/architecture/decision-workflow.md`

4. Create diagram conventions at `docs/architecture/diagrams/README.md`

### Validation
```bash
# Lint markdown files
pnpm markdownlint docs/architecture/**/*.md

# Spell check
pnpm cspell docs/architecture/**/*.md
```

---

## IFC-135: Create ADR Pack for Key Decisions

### Context
Dependency: IFC-002, GOV-001
Owner: Tech Lead + Architect

### Tasks
Create the following ADRs:
1. `docs/planning/adr/ADR-004-multi-tenancy.md`
2. `docs/planning/adr/ADR-005-workflow-engine.md`
3. `docs/planning/adr/ADR-006-agent-tools.md`
4. `docs/planning/adr/ADR-007-data-governance.md`
5. `docs/planning/adr/ADR-008-audit-logging.md`

### KPIs
- 100% ADR coverage
- Stakeholder approval recorded
```

---

#### PARALLEL-B: Security & Compliance

```markdown
# PARALLEL-B Sub-Agent: Security & Compliance

## IFC-072: Zero Trust Security Model

### Context
Dependency: IFC-001, IFC-008
Owner: Security Eng + CTO

### Tasks
1. Design zero trust architecture:
   ```
   docs/security/zero-trust-design.md
   ```

2. Implement Supabase RLS policies:
   ```sql
   -- infra/supabase/migrations/001_rls_policies.sql
   ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

   CREATE POLICY "Users can view own leads" ON leads
     FOR SELECT
     USING (auth.uid() = user_id OR team_id IN (
       SELECT team_id FROM team_members WHERE user_id = auth.uid()
     ));
   ```

3. Implement API authentication middleware

4. Configure mTLS for service-to-service communication

### Artifacts
- docs/security/zero-trust-design.md
- artifacts/misc/rls-implementation/*
- artifacts/misc/mtls-certificates/*
- artifacts/reports/pentest-report.pdf

### KPIs
- All endpoints secured
- Penetration test passed

---

## IFC-073: Privacy Impact Assessment

### Context
Dependency: IFC-072
Owner: DPO + Legal

### Tasks
1. Map all data flows for AI processing
2. Document data retention policies
3. Create DPIA report
4. Define risk mitigation controls

### Artifacts
- artifacts/reports/dpia-report.pdf
- artifacts/reports/risk-mitigation-controls.xlsx
- artifacts/misc/data-flow-maps/*
```

---

#### PARALLEL-C: Infrastructure & Observability

```markdown
# PARALLEL-C Sub-Agent: Infrastructure & Observability

## IFC-074: Full Stack Observability

### Context
Dependency: IFC-003
Owner: SRE Lead + DevOps

### Tasks
1. Configure OpenTelemetry SDK integration
2. Set up Sentry for error tracking
3. Create correlation IDs across services
4. Define SLOs and SLIs

### Artifacts
- artifacts/misc/otel-implementation/*
- artifacts/misc/sentry-project-config.json
- artifacts/misc/correlation-test.csv
- artifacts/misc/mttr-baseline.json

### KPIs
- MTTD <2min
- Root cause identifiable

---

## IFC-075: IaC with Terraform

### Context
Dependency: IFC-001
Owner: DevOps

### Tasks
1. Create Terraform modules:
   ```
   infra/terraform/
   ├── modules/
   │   ├── supabase/
   │   ├── vercel/
   │   └── railway/
   ├── environments/
   │   ├── dev/
   │   ├── staging/
   │   └── prod/
   └── main.tf
   ```

2. Configure drift detection
3. Document destroy/rebuild procedure

### Artifacts
- infra/terraform/*
- artifacts/misc/terraform.tfstate
- artifacts/misc/drift-detection-config.yaml
- artifacts/logs/destroy-rebuild-test.log

### KPIs
- 100% reproducible
- Drift detection active
```

---

#### PARALLEL-D: Design & Commercial

```markdown
# PARALLEL-D Sub-Agent: Design & Commercial

## BRAND-002: Design Tokens Integration Plan

### Context
Dependency: BRAND-001, ENV-002-AI
Owner: Frontend Dev + UX Designer

### Tasks
1. Map brand tokens to Tailwind variables
2. Create theme reference spec for light/dark modes
3. Document semantic color tokens
4. Define component state mappings

### Artifacts
- docs/design-system/token-mapping.md
- docs/design-system/theme-reference-spec.md
- docs/design-system/token-naming.md

### KPIs
- Token mapping ≥90% of components
- Zero ambiguous token names

---

## SALES-001: Commercial Narrative + Pitch Deck

### Context
Dependency: GTM-002, BRAND-001
Owner: PM + Sales Team

### Tasks
1. Create pitch deck outline (10-12 slides)
2. Create one-pager (problem → solution → proof → CTA)
3. Align with ICP and personas

### Artifacts
- docs/sales/pitch-deck-outline.md
- docs/sales/one-pager.md
- artifacts/misc/sales/pitch-deck-source-link.txt

### KPIs
- Deck outline complete
- One-pager complete
- Aligns with ICP/personas
```

---

## Success Criteria

| KPI | Target | Validation |
|-----|--------|------------|
| Domain models complete | All 5 contexts | Schema validates, types check |
| tRPC API response time | <50ms | Benchmark tests |
| Architecture boundaries | Skeleton created | Structure review (full CI in Sprint 4) |
| Zero trust implementation | 100% endpoints | Pentest report |
| Observability MTTD | <2min | Incident simulation |
| ADR coverage | 5 ADRs approved | Stakeholder sign-off |
| Design token mapping | ≥90% | Frontend review |

---

## Risk Mitigations

| Risk | Mitigation |
|------|------------|
| Cross-sprint dependencies | IFC-077, IFC-119 have deps on later sprints - may need to defer |
| IFC-072 depends on IFC-008 | IFC-008 is Sprint 2 - security model may be partial |
| Complex domain modeling | Use Event Storming session before implementation |
| Terraform state management | Use remote backend (S3/GCS) from start |

---

## Definition of Done

Sprint 1 is complete when:

### Full Completion (9 tasks)
1. **IFC-002** Domain Model - All bounded contexts defined, Prisma schema validated
2. **IFC-003** tRPC Foundation - API working with <50ms response
3. **IFC-106** Hexagonal boundaries - Skeleton structure created (CI enforcement deferred to Sprint 4)
4. **IFC-074** Observability - Traces correlating, MTTD measured
5. **IFC-075** Terraform - Infrastructure reproducible
6. **GOV-001** Governance - Templates published
7. **IFC-135** ADRs - All 5 ADRs approved
8. **BRAND-002** Design Tokens - Mapping document complete
9. **SALES-001** Commercial - Deck and one-pager ready

### Partial Completion (2 tasks)
10. **IFC-072** Zero Trust - ⚠️ RLS policies implemented only (full completion requires IFC-008 in Sprint 2)
11. **IFC-073** DPIA - Report complete, risks documented (based on partial IFC-072)

### Deferred (2 tasks)
- **IFC-077** → Sprint 7 (needs IFC-013)
- **IFC-119** → Sprint 2 (needs IFC-118)

---

## Cross-Sprint Dependencies Summary

| Task | Blocker | Blocker Sprint | Resolution |
|------|---------|----------------|------------|
| **IFC-077** | IFC-013 (tRPC Router) | Sprint 7 | ❌ **DEFERRED** to Sprint 7 |
| **IFC-119** | IFC-118 (Risk Register) | Sprint 2 | ❌ **DEFERRED** to Sprint 2 |
| **IFC-072** | IFC-008 (Security Assessment) | Sprint 2 | ⚠️ **PARTIAL** - RLS only, complete in Sprint 2 |
| **IFC-106** | IFC-131 (CI Enforcement) | Sprint 4 | ✅ **RESOLVED** - Circular dependency broken, skeleton now, CI later |
| **IFC-073** | IFC-072 (partial) | Sprint 1 | ⚠️ **PROCEED** - Use partial IFC-072 output |

---

*"Sprint 1: From foundation to structure - building the architecture that scales."*
