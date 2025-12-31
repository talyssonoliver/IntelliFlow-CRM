# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## Project Overview

**IntelliFlow CRM** is an AI-powered CRM system built with a modern stack
optimized for AI-first development. The project emphasizes automation, type
safety, and AI-assisted workflows throughout the development lifecycle.

**Project Status**: Currently in Sprint 6 (MVP implementation phase). IFC-010
(Phase 1 Go/No-Go Decision) passed on 2025-12-27 with unanimous GO decision.
The codebase will be built incrementally following the comprehensive sprint plan
in `Sprint_plan.csv` (316 tasks across 34 sprints).

### Sprint Plan Structure

All project tasks are tracked in `Sprint_plan.csv` with the following structure:

- **Task ID Conventions**:
  - `EXC-*`: Exception/special tasks (e.g., `EXC-INIT-001`, `EXC-SEC-001`)
  - `AI-SETUP-*`: AI tooling configuration (e.g., `AI-SETUP-001` Claude Code
    setup)
  - `ENV-*-AI`: Environment setup with AI automation (e.g., `ENV-001-AI`
    Monorepo)
  - `AUTOMATION-*`: AI agent coordination and automation tasks
  - `IFC-*`: IntelliFlow Core features (e.g., `IFC-001` Architecture Spike)
  - `PG-*`: Page/UI implementations (e.g., `PG-001` Home Page)

- **Key CSV Columns**:
  - `Section`: Feature area (AI Foundation, Validation, Core CRM, etc.)
  - `Dependencies`: Task IDs that must complete first
  - `Pre-requisites`: Files, policies, and environment requirements (see prefixes below)
  - `Definition of Done`: Specific completion criteria
  - `KPIs`: Measurable success metrics (e.g., "Coverage >90%", "Response
    <200ms")
  - `Target Sprint`: Sprint number (0-33) or "Continuous"
  - `Artifacts To Track`: Specific files/directories to be created
  - `Validation Method`: How to verify task completion

- **Pre-requisite Prefixes** (in `Pre-requisites` column):
  - `FILE:path/to/file` - Required file must exist
  - `ENV:description` - Environment/configuration requirement
  - `POLICY:description` - Policy or process requirement
  - `IMPLEMENTS:FLOW-XXX` - Implements a specific flow
  - `DESIGN:path/to/mockup.png` - **UI Design mockup to match** (CRITICAL for UI tasks)

**IMPORTANT - UI Tasks**: All UI/page tasks (IFC-090, IFC-091, PG-*) **MUST**
reference design mockups via `DESIGN:` prefix. Implementation must match the
design. See `docs/design/README.md` for mockup locations and component checklists.

**Important**: When implementing any task from the sprint plan, always reference
the CSV for the exact artifacts expected, KPIs to meet, and validation methods
required.

### Reading the Sprint Plan (Claude Code)

**CRITICAL**: The main `Sprint_plan.csv` file exceeds Claude Code's 25000 token
read limit. To read sprint plan data, use the **split files** instead:

```
apps/project-tracker/docs/metrics/_global/
├── Sprint_plan.csv      # Source of truth (DO NOT read directly - too large)
├── Sprint_plan_A.csv    # Rows 1-90 (read this for early tasks)
├── Sprint_plan_B.csv    # Rows 91-180
├── Sprint_plan_C.csv    # Rows 181-270
└── Sprint_plan_D.csv    # Rows 271-316 (read this for later tasks)
```

**Rules**:

- **To READ**: Use `Sprint_plan_A.csv`, `B`, `C`, or `D` based on the task range
- **To EDIT**: Only edit `Sprint_plan.csv` (source of truth)
- **Not committed**: Split files are gitignored (local only, derived data)
- **Auto-regeneration**: Split files are auto-regenerated:
  - On git commit (pre-commit hook detects CSV changes)
  - On data-sync (UI sync button or API call)
  - Manually: `npx tsx tools/scripts/split-sprint-plan.ts`
  - On fresh clone: Run the script once to generate local splits

**Finding a task by ID**:

- Sprint 0 tasks: Usually in `Sprint_plan_A.csv` or `Sprint_plan_B.csv`
- Sprint 1-15 tasks: Check `Sprint_plan_B.csv` and `Sprint_plan_C.csv`
- Sprint 16+ tasks: Check `Sprint_plan_C.csv` and `Sprint_plan_D.csv`

  | View       | Purpose in Prompt                              | When to Use                                             |
  | ---------- | ---------------------------------------------- | ------------------------------------------------------- |
  | Dashboard  | Sprint overview, task counts, progress bars    | Start of sprint, quick status checks                    |
  | Kanban     | Visual task board by status                    | Track task flow: Backlog → Planned → In Progress → Done |
  | Analytics  | Charts, trends, velocity metrics               | Mid-sprint reviews, identify bottlenecks                |
  | Metrics    | KPI tracking, phase summaries, evidence        | Verify KPIs met, check attestations                     |
  | Execution  | Sprint orchestration, parallel spawning        | Execute sprints, monitor sub-agents                     |
  | Governance | Policy compliance, STOA gate results           | Verify governance requirements met                      |
  | Contracts  | Task agreements, SLAs, commitments             | Review task contracts before completion                 |
  | Audit      | Full audit runs, security scans, quality gates | Final validation before marking Done                    |

### Core Technology Stack

- **Monorepo**: Turborepo with pnpm workspaces
- **Backend**: tRPC for type-safe APIs, Prisma ORM with PostgreSQL
- **Frontend**: Next.js 16.0.10 (App Router), shadcn/ui components, Tailwind CSS
- **Database**: Supabase (PostgreSQL with pgvector for embeddings)
- **AI/LLM**: LangChain, CrewAI agents, OpenAI API, Ollama for local development
- **Infrastructure**: Docker Compose, Railway/Vercel deployment
- **Testing**: Vitest (unit/integration), Playwright (E2E)
- **Observability**: OpenTelemetry, Sentry

### Project Structure

```
intelliFlow-CRM/
├── apps/
│   ├── web/                   # Next.js frontend application
│   ├── api/                   # tRPC API server
│   ├── ai-worker/             # AI processing worker (LangChain/CrewAI)
│   └── project-tracker/       # Sprint tracker & metrics dashboard (Next.js)
│       └── docs/
│           └── metrics/       # **CRITICAL**: Metrics tracking infrastructure
│               ├── schemas/   # JSON schemas for task/phase/sprint metrics
│               ├── sprint-0/  # Sprint 0 metrics with phase breakdown
│               └── _global/   # **Sprint_plan.json & Sprint_plan.csv location**
├── packages/
│   ├── db/                    # Prisma schema and database client
│   ├── domain/                # Domain models (DDD approach)
│   ├── application/           # Application layer (use cases, ports)
│   ├── adapters/              # Infrastructure adapters (repos, external APIs)
│   ├── validators/            # Zod validation schemas
│   ├── api-client/            # Generated tRPC client
│   └── ui/                    # Shared UI components (shadcn/ui based)
├── infra/
│   ├── docker/                # Docker configurations
│   ├── supabase/              # Supabase migrations and config
│   ├── monitoring/            # Observability configs (OpenTelemetry, Grafana)
│   └── terraform/             # Infrastructure as Code
├── docs/                      # Docusaurus documentation
│   ├── planning/              # ADRs, feasibility, architecture docs
│   │   └── adr/               # Architecture Decision Records
│   ├── domain/                # Domain model documentation
│   ├── operations/            # Runbooks, incident response
│   └── security/              # Security documentation
├── artifacts/                 # Build artifacts, reports, metrics
│   ├── benchmarks/            # Performance benchmarks
│   ├── coverage/              # Test coverage reports
│   ├── logs/                  # Build and test logs
│   ├── metrics/               # Sprint metrics (JSON/CSV)
│   ├── misc/                  # Configuration files, test data
│   │   ├── access-policy.json
│   │   ├── commitlint.config.js
│   │   ├── docker-compose.yml
│   │   ├── docusaurus.config.js
│   │   ├── health-check.yaml
│   │   ├── vault-config.yaml
│   │   └── workflow-automation.yaml
│   └── reports/               # Analysis reports (PDFs, Excel)
├── tests/                     # Shared test utilities
│   ├── e2e/                   # Playwright E2E tests
│   └── integration/           # Integration tests
├── scripts/
│   └── migration/             # Migration scripts and tracking
│       └── artifact-move-map.csv  # Artifact relocation tracking
├── .claude/                   # Claude Code configuration
│   └── commands/              # Custom slash commands
├── supabase/                  # **Supabase local dev (ENV-004-AI)**
│   ├── config.toml            # Supabase configuration
│   └── .gitignore
└── Readme.md                  # Sprint decomposition and automation strategy
```

**Artifact Conventions** (from `IFC-160`):

- All artifacts follow consistent path conventions enforced by CI linter
- Performance reports: `artifacts/benchmarks/`
- Test coverage: `artifacts/coverage/`
- Configuration: `artifacts/misc/` (access-policy.json, vault-config.yaml, etc.)
- Metrics: `artifacts/metrics/` (sprint metrics, KPI tracking)
- Reports: `artifacts/reports/`
- Swarm state: `artifacts/blockers.json`,
  `artifacts/human-intervention-required.json`

**Runtime State Files** (used by swarm orchestrator):

The swarm orchestrator (`scripts/swarm/orchestrator.sh`) uses these JSON files
to track task execution state:

- `artifacts/blockers.json` - Tracks blocked tasks requiring resolution
- `artifacts/human-intervention-required.json` - Tracks tasks needing human
  review
- `artifacts/qualitative-reviews/` - Stores qualitative review outputs

These files are:

- **Generated at runtime** by the orchestrator
- **Not versioned** (listed in `.gitignore`)
- **Read/written** during swarm task execution
- **Located in `artifacts/`** (NOT under `docs/`)

**⚠️ CRITICAL FILE LOCATIONS** (Do NOT move without updating references):

- **Sprint_plan.json**:
  `apps/project-tracker/docs/metrics/_global/Sprint_plan.json`
- **Sprint_plan.csv**:
  `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv`
- **Metrics Infrastructure**: `apps/project-tracker/docs/metrics/`
  - Task status files: `sprint-0/phase-*/TASK-ID.json`
  - Phase summaries: `sprint-0/phase-*/_phase-summary.json`
  - Sprint summary: `sprint-0/_summary.json`
  - JSON schemas: `schemas/*.schema.json`

## Development Commands

### Environment Setup

```bash
# Install dependencies (uses pnpm)
pnpm install

# Setup local environment
pnpm run setup:local

# Start Docker services (Postgres, Redis, etc.)
docker-compose up -d

# Initialize database
pnpm run db:migrate
pnpm run db:seed
```

### Development

```bash
# Start all applications in development mode
pnpm run dev

# Start specific workspace
pnpm --filter web dev
pnpm --filter api dev
pnpm --filter ai-worker dev

# Build all packages
pnpm run build

# Type checking across monorepo
pnpm run typecheck
```

### Testing

```bash
# Run all tests
pnpm run test

# Unit tests with coverage
pnpm run test:unit -- --coverage

# Integration tests
pnpm run test:integration

# E2E tests
pnpm run test:e2e

# Watch mode for TDD
pnpm run test:watch

# Run tests for specific package
pnpm --filter @intelliflow/domain test
```

### Database

```bash
# Create new migration
pnpm run db:migrate:create

# Apply migrations
pnpm run db:migrate

# Reset database (destructive)
pnpm run db:reset

# Open Prisma Studio
pnpm run db:studio

# Generate Prisma client
pnpm run db:generate
```

### Linting & Formatting

```bash
# Lint all code
pnpm run lint

# Fix linting issues
pnpm run lint:fix

# Format code with Prettier
pnpm run format

# Type check
pnpm run typecheck
```

### AI Development

```bash
# Start Ollama for local AI development
ollama serve

# Pull required models
ollama pull llama2
ollama pull mistral

# Test AI chains
pnpm --filter ai-worker test:chains

# Benchmark AI performance
pnpm run ai:benchmark
```

## Architecture Principles

### Domain-Driven Design (DDD)

The codebase follows DDD with hexagonal architecture:

1. **Domain Layer** (`packages/domain/`): Pure business logic, entities, value
   objects, and domain events. No external dependencies.

2. **Application Layer** (`packages/application/`): Use cases and application
   services that orchestrate domain logic.

3. **Adapters Layer** (`packages/adapters/`): Infrastructure implementations
   (repositories, external APIs, etc.).

4. **Bounded Contexts**: The system is divided into contexts (CRM, Intelligence,
   Platform) with explicit boundaries defined in
   `docs/planning/DDD-context-map.puml`.

**Key Rules**:

- Domain code NEVER depends on infrastructure
- All cross-context communication goes through well-defined interfaces
- Use repository pattern for data access
- Domain events for inter-context communication

### Type Safety

End-to-end type safety is enforced across the stack:

- **API Contracts**: tRPC provides compile-time type safety from backend to
  frontend
- **Database**: Prisma generates TypeScript types from schema
- **Validation**: Zod schemas validate runtime data and generate types
- **AI Outputs**: All LLM outputs must conform to predefined Zod schemas

When adding new features:

1. Define Zod schema first
2. Create Prisma models if needed
3. Build tRPC router with typed procedures
4. Frontend automatically gets typed client

### AI Integration Patterns

The project uses multiple AI integration patterns:

1. **Scoring Pipeline** (`apps/ai-worker/src/chains/scoring.chain.ts`): Uses
   LangChain for lead scoring with structured outputs.

2. **Agent Framework** (`apps/ai-worker/src/agents/`): CrewAI agents collaborate
   on tasks (lead qualification, email generation, follow-ups).

3. **Human-in-the-Loop**: All AI outputs include confidence scores and allow
   human override/feedback.

4. **Cost Optimization**:
   - Ollama for development/testing
   - OpenAI for production
   - Caching and rate limiting to control costs

### Event-Driven Architecture

Domain events (`packages/domain/src/events/`) enable loose coupling:

- **Transactional Outbox Pattern**: Events are stored atomically with state
  changes
- **Idempotency**: All event handlers use idempotency keys
- **Dead Letter Queue**: Failed events go to DLQ for manual triage
- **Event Catalog**: All events documented in `docs/events/catalog/`

## Development Workflow

### Creating a New Feature

1. **Check Sprint Plan**: Locate the task in `Sprint_plan.csv` and review:
   - Dependencies (prerequisite task IDs)
   - Pre-requisites (environment requirements)
   - Definition of Done (specific criteria)
   - KPIs (measurable targets)
   - Artifacts To Track (expected files/directories)
   - Validation Method (how to verify completion)

2. **Define ADR** (Architecture Decision Record) in `docs/planning/adr/` if
   architectural change

3. **Update Domain Model**: Add entities/value objects to `packages/domain/`
   - Follow hexagonal architecture (domain → application → adapters)
   - Ensure domain code has NO infrastructure dependencies

4. **Create Prisma Migration**: Update schema and generate migration
   - All migrations tracked in `infra/supabase/migrations/`
   - Run `pnpm run db:migrate:create` to scaffold

5. **Build tRPC Router**: Create typed endpoints in `apps/api/src/modules/`
   - Follow tRPC naming conventions
   - Ensure end-to-end type safety

6. **Implement UI**: Build Next.js pages/components in `apps/web/`
   - Use shadcn/ui components from `packages/ui/`
   - Target: Lighthouse score >90, response <200ms

7. **Write Tests**: Achieve >90% coverage (enforced in CI)
   - Domain layer: >95% required
   - Application layer: >90% required
   - Overall: >90% (CI will fail below this)

8. **Generate Artifacts**: Create all artifacts specified in the sprint plan
   task
   - Benchmarks → `artifacts/benchmarks/`
   - Coverage reports → `artifacts/coverage/`
   - Metrics → `artifacts/metrics/`
   - Documentation → `docs/`

9. **Validate Completion**: Verify all KPIs from sprint plan are met
   - Performance targets (response times, latency)
   - Quality metrics (test coverage, Lighthouse scores)
   - Functional requirements (features working)

### Testing Strategy

- **Unit Tests**: Test domain logic in isolation (Vitest)
- **Integration Tests**: Test API endpoints with test database
- **E2E Tests**: Test critical user flows (Playwright)
- **Contract Tests**: Verify tRPC type contracts
- **AI Tests**: Test AI chains with deterministic outputs

Coverage requirements:

- Domain layer: >95%
- Application layer: >90%
- API routes: >85%
- Overall: >90% (enforced by CI)

### Git Workflow

- **Conventional Commits**: Enforced via commitlint
- **Branch Naming**: `feat/`, `fix/`, `docs/`, `refactor/`, `test/`
- **PR Requirements**:
  - All tests passing
  - Coverage thresholds met
  - No linting errors
  - Architecture tests passing (no boundary violations)

### Type Definition Strategy

**Enum Types - Single Source of Truth Pattern**

All enum types follow the DRY (Don't Repeat Yourself) principle with domain constants as the canonical source:

1. **Domain Layer** (packages/domain/) - Defines const arrays:
   ```typescript
   // packages/domain/src/crm/lead/Lead.ts
   export const LEAD_STATUSES = ['NEW', 'CONTACTED', 'QUALIFIED', ...] as const;
   export const LEAD_SOURCES = ['WEBSITE', 'REFERRAL', ...] as const;

   export type LeadStatus = (typeof LEAD_STATUSES)[number];
   export type LeadSource = (typeof LEAD_SOURCES)[number];
   ```

2. **Validator Layer** (packages/validators/) - Derives Zod schemas:
   ```typescript
   // packages/validators/src/lead.ts
   import { LEAD_STATUSES, LEAD_SOURCES } from '@intelliflow/domain';

   export const leadStatusSchema = z.enum(LEAD_STATUSES);
   export const leadSourceSchema = z.enum(LEAD_SOURCES);
   ```

3. **Application Layer** - Uses schemas from validators:
   ```typescript
   // apps/api/src/agent/types.ts
   import { leadStatusSchema, leadSourceSchema } from '@intelliflow/validators';

   export const LeadSearchInputSchema = z.object({
     status: z.array(leadStatusSchema).optional(),
     source: z.array(leadSourceSchema).optional(),
   });
   ```

**Benefits**:
- Adding new enum values requires editing only ONE location (domain layer)
- Type safety maintained throughout the stack
- Architecture tests enforce consistency (`packages/validators/__tests__/enum-consistency.test.ts`)

**Entities with DRY enum pattern**:
- ✅ Lead (LeadStatus, LeadSource)
- ✅ Opportunity (OpportunityStage)
- ✅ Task (TaskStatus, TaskPriority)
- ✅ Case (CaseStatus, CasePriority, CaseTaskStatus)
- ✅ Appointment (AppointmentStatus, AppointmentType)
- ✅ Ticket (TicketStatus, TicketPriority, SLAStatus)

### Architecture Enforcement

Architecture boundaries are enforced via tests (`packages/architecture-tests/` and `packages/validators/__tests__/`):

```typescript
// Example: Domain cannot depend on infrastructure
test('domain has no infrastructure dependencies', () => {
  expectNoDependencies(['packages/domain'], ['packages/adapters', 'apps/*']);
});
```

Breaking these tests will fail CI.

## AI-Assisted Development

This project is optimized for AI-assisted development:

### Claude Code Workflows

Custom commands available in `.claude/commands/`:

- `/create-aggregate`: Scaffold new DDD aggregate with tests
- `/create-router`: Generate tRPC router for entity
- `/create-migration`: Create Prisma migration with validation
- `/review-ai-output`: Review AI-generated code for quality

### GitHub Copilot

`.github/copilot-instructions.md` provides context for:

- Project structure and patterns
- Type safety requirements
- Testing standards
- DDD principles

### AI Code Generation Best Practices

When using AI to generate code:

1. **Always validate types**: Ensure generated code passes TypeScript strict
   mode
2. **Check tests**: AI-generated code must include tests with >90% coverage
3. **Review security**: Never accept AI-generated code without security review
4. **Verify domain logic**: Ensure business rules are correctly implemented
5. **Update documentation**: AI cannot update architecture docs - do this
   manually

## Key Design Patterns

### Repository Pattern

```typescript
// Domain defines interface
interface LeadRepository {
  save(lead: Lead): Promise<void>;
  findById(id: LeadId): Promise<Lead | null>;
}

// Infrastructure implements
class PrismaLeadRepository implements LeadRepository {
  // Implementation using Prisma
}
```

### Value Objects

```typescript
// Encapsulate business rules
class LeadScore extends ValueObject {
  private constructor(private value: number) {
    if (value < 0 || value > 100) {
      throw new InvalidLeadScoreError(value);
    }
  }

  static create(value: number): LeadScore {
    return new LeadScore(value);
  }
}
```

### Domain Events

```typescript
class LeadScoredEvent extends DomainEvent {
  constructor(
    public leadId: LeadId,
    public score: LeadScore,
    public scoredAt: Date
  ) {
    super();
  }
}
```

## Performance Targets

- **API Response Time**: p95 < 100ms, p99 < 200ms
- **Frontend Load Time**: First Contentful Paint < 1s
- **AI Scoring**: < 2s per lead
- **Database Queries**: < 20ms for simple queries
- **Build Time**: < 3 minutes for full monorepo
- **Test Suite**: < 15 minutes in CI

## Security Considerations

- **Secrets Management**: Use environment variables, never commit secrets
- **RLS (Row Level Security)**: Enabled in Supabase for all tables
- **Input Validation**: All inputs validated with Zod before processing
- **OWASP Top 10**: Regularly scanned with ZAP
- **AI Security**: All AI outputs sanitized before rendering
- **Rate Limiting**: Upstash Redis for API rate limiting

## Monitoring & Observability

- **Traces**: OpenTelemetry traces all requests
- **Metrics**: Custom metrics via Prometheus
- **Logs**: Structured logging with correlation IDs
- **Dashboards**: Grafana dashboards for key metrics
- **Alerts**: PagerDuty integration for incidents

Key metrics tracked:

- DORA metrics (deployment frequency, lead time, MTTR, change failure rate)
- AI performance (latency, cost, accuracy)
- User engagement (DAU, retention, feature usage)

## Common Gotchas

1. **Prisma Client Generation**: Always run `pnpm run db:generate` after schema
   changes

2. **tRPC Context**: Context is recreated per request, don't store mutable state

3. **Next.js Caching**: Be careful with fetch caching in Server Components

4. **Zod Transforms**: Use `.transform()` carefully, can break type inference

5. **Domain Events**: Always publish events AFTER transaction commits

6. **AI Timeouts**: LLM calls can be slow, always set appropriate timeouts
   - Target from sprint plan: AI scoring <2s, predictions <2s

7. **Monorepo Imports**: Use workspace protocol in package.json:
   `"@intelliflow/domain": "workspace:*"`

8. **Sprint Plan KPIs**: All tasks have specific KPIs in `Sprint_plan.csv`
   - Example: `IFC-001` requires "latency <50ms", "type-safety validated"
   - Example: `ENV-001-AI` requires "Setup <10 minutes", "zero manual steps"
   - CI/CD should validate these where possible

9. **Artifact Paths**: Follow conventions from `IFC-160`
   - Paths are linted in CI
   - Wrong paths will cause CI failures
   - Use `scripts/migration/artifact-move-map.csv` to track relocations

10. **Sprint Plan Location**: **NEVER move Sprint_plan files without updating
    API routes**

- Sprint_plan.json: `apps/project-tracker/docs/metrics/_global/`
- Sprint_plan.csv: `apps/project-tracker/docs/metrics/_global/`
- Referenced by: `apps/project-tracker/app/api/sprint-plan/route.ts`
- Tracker dashboard: http://localhost:3002/

11. **Metrics Infrastructure**: Structured JSON tracking prevents fabrication

- Task files: `apps/project-tracker/docs/metrics/sprint-0/phase-*/*.json`
- Must include: SHA256 hashes, ISO timestamps, validation results
- Update Sprint_plan.csv when completing tasks (status → "Completed")
- Update corresponding JSON file with execution details
- Schemas enforce: `task-status.schema.json`, `phase-summary.schema.json`,
  `sprint-summary.schema.json`

12. **Hexagonal Architecture**: Domain layer CANNOT depend on infrastructure
    - Enforced by architecture tests in `packages/architecture-tests/`
    - Violations will fail CI

13. **Test Coverage**: Different layers have different requirements
    - Domain: >95%
    - Application: >90%
    - Overall: >90% (CI enforced)

14. **Performance Budgets**: Many tasks have strict performance requirements
    - API responses: p95 <100ms, p99 <200ms
    - Frontend: Lighthouse >90, First Contentful Paint <1s
    - Database queries: <20ms for simple queries
    - Full build: <3 minutes

## Sprint Planning Context

The project follows an aggressive AI-assisted sprint plan with **303 tasks
across 34 sprints**:

### Sprint Phases

**Sprint 0 (Foundation)** - 27 tasks total, **2 completed** (7.4%)

- AI tooling setup (Claude Code, GitHub Copilot, external AI tools)
- Automated environment creation (monorepo, Docker, CI/CD)
- Infrastructure (Supabase, Prisma, tRPC, observability)
- Security foundations (secrets management, zero trust)

**✅ Completed Tasks**:

- **ENV-004-AI**: Supabase Integration (2025-12-14, 5 min)
  - Initialized Supabase with `supabase init`
  - Created config.toml and directory structure
  - Status:
    `apps/project-tracker/docs/metrics/sprint-0/phase-3-dependencies/ENV-004-AI.json`
- **EXC-SEC-001**: HashiCorp Vault Setup (2025-12-14, 6 min)
  - Installed Vault v1.21.1 via Chocolatey
  - Dev server running on http://127.0.0.1:8200
  - Status:
    `apps/project-tracker/docs/metrics/sprint-0/phase-2-parallel/parallel-c/EXC-SEC-001.json`

**Sprint 1 (Validation)** - Architecture & security

- Technical architecture spike (`IFC-001`)
- Domain model design with DDD (`IFC-002`)
- tRPC API foundation (`IFC-003`)
- Zero trust security model (`IFC-072`)
- Hexagonal architecture boundaries (`IFC-106`)

**Sprint 2-4** - Core domain models

- Lead, Contact, Account, Opportunity, Task aggregates (`IFC-101` to `IFC-105`)
- Domain services and business logic (`IFC-108`)
- Documentation setup (Docusaurus, LLM-friendly templates)
- Testing infrastructure (TDD process, coverage enforcement)

**Sprint 5-15** - MVP & Intelligence features

- Lead capture UI, AI scoring, human-in-the-loop
- Workflow engine (LangGraph), auto-response
- Analytics dashboards, advanced AI (RAG)
- Performance optimization, load testing

**Sprint 16-28** - Production & scale

- Production hardening, multi-region setup
- Public pages, auth flows, billing portal
- Complete CRM UI (contacts, deals, tickets, documents)
- Compliance (GDPR, ISO 42001)

**Sprint 29-33** - Polish & launch

- User acceptance testing
- Internal launch, pilot customers
- Hypercare period
- Success metrics review

### Critical Decision Gates

- **IFC-010** (Sprint 4): Phase 1 Go/No-Go - Modern stack validation
- **IFC-019** (Sprint 11): Gate 1 - £500 investment review
- **IFC-027** (Sprint 15): Gate 2 - £2000 investment (AI value proof)
- **IFC-034** (Sprint 19): Gate 3 - £3000 investment (automation ROI)
- **IFC-049** (Sprint 26): Gate 4 - £5000 investment (productization)

### Task Dependencies

The sprint plan includes explicit dependency tracking:

- Tasks reference their dependencies by ID (e.g., `IFC-003` depends on
  `IFC-002`)
- Cross-sprint dependencies are tracked
- Parallel execution opportunities identified where tasks are independent

**When implementing a task**: Always check `Sprint_plan.csv` for dependencies,
pre-requisites, and completion criteria.

## Working with the Sprint Plan

### Finding a Task

```bash
# Search for a specific task
grep "IFC-106" Sprint_plan.csv

# Find all tasks in a section
grep "Core CRM" Sprint_plan.csv

# Find tasks for a specific sprint
grep ",5," Sprint_plan.csv  # Sprint 5 tasks
```

### Understanding Task Structure

Each task in `Sprint_plan.csv` has:

1. **Task ID**: Unique identifier (e.g., `IFC-106`, `ENV-001-AI`)
2. **Section**: Feature area
3. **Description**: What needs to be done
4. **Owner**: Team/role responsible
5. **Dependencies**: Task IDs that must complete first
6. **Pre-requisites**: Environment/setup requirements
7. **Definition of Done**: Specific completion criteria
8. **KPIs**: Measurable success metrics
9. **Target Sprint**: When it should be completed
10. **Artifacts To Track**: Files/directories that will be created
11. **Validation Method**: How to verify it's done

### Example Task Reference

When implementing `IFC-106` (Hexagonal module boundaries):

```csv
IFC-106,Architecture,Define Hexagonal module boundaries...
Dependencies: IFC-002,IFC-131
Pre-requisites: Domain model for all entities implemented
Definition of Done: Application layer created (ports + use-cases);
                    adapters layer created; module boundary rules
                    enforced in CI; architecture tests passing; ADR updated
KPIs: No domain code depends on infrastructure, 100% adapters tested
Artifacts: packages/application/src/ports/*,
          packages/application/src/usecases/*,
          packages/adapters/src/*,
          tests/architecture/*,
          docs/architecture/hex-boundaries.md
```

This tells you:

- Wait for `IFC-002` and `IFC-131` to complete first
- Create specific packages and tests
- Ensure domain has no infrastructure deps (verified by tests)
- Document in ADR

## Metrics & Progress Tracking

### Real-Time Metrics Dashboard

**Location**: http://localhost:3002/ (project-tracker app)

**Features**:

- **Live Sprint Progress**: Auto-refreshes every 30 seconds
- **Phase Breakdown**: Visual progress for all 5 Sprint 0 phases
- **KPI Tracking**: Automation %, manual interventions, blockers
- **Completed Tasks**: Timeline with duration metrics
- **Blocker History**: All blockers with resolution status

**API Endpoints**:

- `/api/metrics/sprint` - Sprint summary with KPIs
- `/api/metrics/phases` - All phase progress
- `/api/metrics/task/[taskId]` - Individual task details

### Task Completion Workflow

When completing a Sprint_plan task:

1. **Update Sprint_plan.csv**: Change `Status` column from "Planned" →
   "Completed"
2. **Create Task JSON**: Add `{TASK-ID}.json` in appropriate phase folder
3. **Update Phase Summary**: Modify `_phase-summary.json` aggregated metrics
4. **Update Sprint Summary**: Update `sprint-0/_summary.json` with new totals
5. **Verify Dashboard**: Check http://localhost:3002/ Metrics tab shows update

**Required Task JSON Fields**:

- `task_id`, `section`, `description`, `owner`
- `dependencies` with verification timestamp
- `status_history` with ISO 8601 timestamps
- `execution` details (duration, executor, log path)
- `artifacts.created` with SHA256 hashes
- `validations` with command, exit code, passed status
- `kpis` with target vs actual and met boolean
- `blockers` with raised_at and resolved_at

**Example**: See completed tasks

- `apps/project-tracker/docs/metrics/sprint-0/phase-3-dependencies/ENV-004-AI.json`
- `apps/project-tracker/docs/metrics/sprint-0/phase-2-parallel/parallel-c/EXC-SEC-001.json`

### Anti-Fabrication Measures

All metrics use cryptographic verification:

- **SHA256 hashes**: Prove artifact creation
- **Stdout hashes**: Verify command execution
- **ISO 8601 timestamps**: Immutable audit trail
- **Validation exit codes**: Prove test success
- **JSON schemas**: Enforce data integrity

## Data Synchronization System

### Single Source of Truth

**CRITICAL**: `Sprint_plan.csv` is the **single source of truth** for all task
data. All JSON files are **derived** from this CSV.

**Architecture**:

```
Sprint_plan.csv (SOURCE OF TRUTH)
       ↓
   [Auto-Sync Process]
       ↓
   ├── Sprint_plan.json
   ├── task-registry.json
   ├── Individual task files (*.json)
   └── Phase summaries (_phase-summary.json)
```

### Automatic Synchronization

The system **automatically syncs** all metrics files whenever:

1. **CSV is uploaded** via Upload CSV button
2. **Page refreshes** and loads CSV from server
3. **Manual sync** triggered via "Sync" button on Metrics page

**What Gets Synced**:

- `Sprint_plan.json` - Structured JSON grouped by section
- `task-registry.json` - Central registry with status tracking
- Individual task files - All `{TASK_ID}.json` files for Sprint 0
- Phase summaries - Aggregated metrics for each phase

### When to Sync

**Always sync after editing Sprint_plan.csv!**

**Methods** (in order of preference):

1. ✅ **UI Sync** - Go to Metrics page → Click green "Sync" button → Click
   "Refresh"
2. ✅ **Auto-Sync** - Click "Refresh" button on any page (auto-syncs in
   background)
3. ✅ **API Call** - `curl -X POST http://localhost:3002/api/sync-metrics`
4. ✅ **CLI Script** -
   `cd apps/project-tracker && npx tsx scripts/sync-metrics.ts`

### Important Rules

**✅ DO**:

- Always edit `Sprint_plan.csv` for task updates
- Run sync after CSV changes
- Use the UI sync button (easiest)
- Check console logs to verify sync succeeded

**❌ DON'T**:

- Edit JSON files directly (they'll be overwritten)
- Skip syncing after CSV edits (causes inconsistencies)
- Edit multiple files manually (only edit the CSV)

### Troubleshooting Inconsistent Data

If metrics don't match after editing CSV:

1. Click green "Sync" button on Metrics page
2. Check browser console for "Metrics synced:" message
3. Click "Refresh" to reload updated data
4. Verify numbers match your CSV changes

**Manual Verification**:

```powershell
$csv = Import-Csv "apps\project-tracker\docs\metrics\_global\Sprint_plan.csv"
$sprint0 = $csv | Where-Object { $_.'Target Sprint' -eq '0' }
$sprint0 | Group-Object Status | Select-Object Name, Count
```

### Implementation Files

- `apps/project-tracker/lib/data-sync.ts` - Sync utility functions
- `apps/project-tracker/app/api/sync-metrics/route.ts` - API endpoint
- `apps/project-tracker/scripts/sync-metrics.ts` - CLI script
- `apps/project-tracker/docs/DATA_SYNC.md` - Full documentation

## Resources

- **Sprint Plan**: `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv` -
  Complete task breakdown (303 tasks) - **SINGLE SOURCE OF TRUTH**
- **Sprint JSON**:
  `apps/project-tracker/docs/metrics/_global/Sprint_plan.json` - Structured task
  data (auto-generated from CSV)
- **Metrics Dashboard**: http://localhost:3002/ - Real-time sprint progress
- **Data Sync Docs**: `apps/project-tracker/docs/DATA_SYNC.md` - Synchronization
  system documentation
- **Metrics README**: `apps/project-tracker/docs/metrics/README.md` -
  Infrastructure documentation
- **README**: `README.md` - Project overview and quick start guide
- **Planning Analysis**: `PLANNING_ANALYSIS.md` - Initial sprint planning and
  decomposition (Portuguese)
- **ADRs**: Architecture decisions in `docs/planning/adr/`
- **API Docs**: Auto-generated from tRPC routers (run `pnpm run docs:api`)
- **Domain Docs**: Docusaurus site at `docs/`
- **Dependency Graph**: Task dependencies tracked in CSV `Dependencies` column
