# Architecture Guide

## Hexagonal / DDD Architecture

### Layer Order

```
Domain → Validators → Application → Database → Adapters → API → UI
```

1. **Domain Layer** (`packages/domain/`): Pure business logic, entities, value
   objects, domain events. **No external dependencies.**
2. **Application Layer** (`packages/application/`): Use cases, application
   services, ports (interfaces).
3. **Adapters Layer** (`packages/adapters/`): Infrastructure implementations
   (repositories, external APIs).
4. **Bounded Contexts**: CRM, Intelligence, Platform — boundaries in
   `docs/planning/DDD-context-map.puml`.

**Key Rules:**

- Domain code NEVER depends on infrastructure (enforced by architecture tests)
- Cross-context communication through well-defined interfaces
- Repository pattern for data access
- Domain events for inter-context communication

## Type Safety (End-to-End)

- **API**: tRPC compile-time type safety backend to frontend
- **Database**: Prisma generates TypeScript types from schema
- **Validation**: Zod schemas validate runtime data and generate types
- **AI Outputs**: All LLM outputs must conform to predefined Zod schemas

Adding new features: Define Zod schema → Create Prisma models → Build tRPC
router → Frontend gets typed client.

## DRY Enum Pattern (Single Source of Truth)

1. **Domain** (`packages/domain/`) defines const arrays:
   ```typescript
   export const LEAD_STATUSES = ['NEW', 'CONTACTED', 'QUALIFIED', ...] as const;
   export type LeadStatus = (typeof LEAD_STATUSES)[number];
   ```
2. **Validators** (`packages/validators/`) derive Zod schemas:
   ```typescript
   import { LEAD_STATUSES } from '@intelliflow/domain';
   export const leadStatusSchema = z.enum(LEAD_STATUSES);
   ```
3. **Application** uses schemas from validators.

Entities with DRY enums: Lead, Contact, Opportunity, Task, Case, Appointment,
Ticket. Consistency enforced by
`packages/validators/__tests__/enum-consistency.test.ts`.

## AI Integration Patterns

1. **Scoring Pipeline** (`apps/ai-worker/src/chains/scoring.chain.ts`):
   LangChain structured outputs
2. **Agent Framework** (`apps/ai-worker/src/agents/`): CrewAI collaborative
   agents
3. **Human-in-the-Loop**: All AI outputs include confidence scores + human
   override
4. **Cost Optimization**: Ollama (dev), OpenAI (prod), caching + rate limiting

## Event-Driven Architecture

Domain events (`packages/domain/src/events/`):

- **Transactional Outbox Pattern**: Events stored atomically with state changes
- **Idempotency**: All event handlers use idempotency keys
- **Dead Letter Queue**: Failed events go to DLQ for manual triage
- **Event Catalog**: `docs/events/catalog/`

## Design Patterns

### Repository Pattern

```typescript
interface LeadRepository {
  save(lead: Lead): Promise<void>;
  findById(id: LeadId): Promise<Lead | null>;
}
class PrismaLeadRepository implements LeadRepository {
  /* Prisma impl */
}
```

### Value Objects

```typescript
class LeadScore extends ValueObject {
  private constructor(private value: number) {
    if (value < 0 || value > 100) throw new InvalidLeadScoreError(value);
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

## Architecture Enforcement

Tests in `packages/architecture-tests/` enforce boundaries:

```typescript
test('domain has no infrastructure dependencies', () => {
  expectNoDependencies(['packages/domain'], ['packages/adapters', 'apps/*']);
});
```

Breaking these tests fails CI.

## Extended Project Structure

Beyond the top-level shown in root CLAUDE.md:

```
infra/
  docker/          # Docker configurations
  supabase/        # Supabase migrations and config
  monitoring/      # Observability configs (OpenTelemetry, Grafana)
  terraform/       # Infrastructure as Code
tests/
  e2e/             # Playwright E2E tests
  integration/     # Integration tests
scripts/
  migration/       # Migration scripts and tracking
    artifact-move-map.csv  # Artifact relocation tracking
supabase/            # Supabase local dev (ENV-004-AI)
  config.toml        # Supabase configuration
```

## Dependency Chain Documentation

- **Master**: `docs/design/diagrams/complete-dependency-chains.md` (36 entities)
- Domain-specific files in `docs/design/diagrams/`: core-crm, legal-scheduling,
  ai-intelligence, ai-output-review, security-platform, auth-public-pages,
  platform-infrastructure, integrations, business-workflows
- Update chains when completing/starting tasks (mark with checkmarks/progress %)

**Workflow Integration**:

- `/spec-session`: Validates dependency chain exists before spec generation
- `/plan-session`: Ensures plan follows hexagonal layer order
- `/exec`: Updates dependency chain status on task completion
