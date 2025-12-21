# ADR-001: Adopt Hexagonal Architecture Pattern

**Status:** Accepted

**Date:** 2025-12-20

**Deciders:** Architecture Team, Backend Team Lead

**Technical Story:** IFC-106, IFC-002

## Context and Problem Statement

IntelliFlow CRM needs a sustainable architecture that supports rapid AI-assisted
development, maintains high testability, and allows infrastructure changes
without touching business logic. How should we structure our codebase to achieve
clean separation of concerns while maintaining developer productivity?

## Decision Drivers

- **Testability**: Domain logic must be testable in isolation without
  infrastructure dependencies
- **AI-First Development**: Clear boundaries make it easier for AI assistants to
  modify code safely
- **Technology Independence**: Business logic shouldn't depend on frameworks,
  databases, or external services
- **Maintainability**: Clear separation reduces cognitive load and makes
  codebase easier to understand
- **Flexibility**: Infrastructure changes (e.g., swapping databases) shouldn't
  require business logic changes
- **DDD Alignment**: Architecture must support Domain-Driven Design principles
- **Monorepo Support**: Structure must work well with Turborepo workspace
  organization

## Considered Options

- **Option 1**: Hexagonal Architecture (Ports and Adapters)
- **Option 2**: Layered Architecture (traditional N-tier)
- **Option 3**: Clean Architecture (Uncle Bob)
- **Option 4**: Feature-based modules with mixed concerns

## Decision Outcome

Chosen option: "Hexagonal Architecture (Ports and Adapters)", because it
provides the clearest separation between domain logic and infrastructure, has
explicit contracts through ports, and aligns perfectly with our DDD approach and
monorepo structure.

### Positive Consequences

- Domain layer has zero infrastructure dependencies (enforced by architecture
  tests)
- Business logic can be tested with simple unit tests (no mocks needed)
- Infrastructure can be swapped without touching domain code
- Clear contracts through port interfaces make AI-generated code safer
- Aligns with DDD bounded contexts and aggregates
- Works naturally with monorepo packages (domain, application, adapters)
- Easier onboarding - developers know exactly where code belongs
- Better support for concurrent development across teams

### Negative Consequences

- Additional abstraction layers add initial complexity
- More files to navigate (ports, implementations, mappers)
- Requires discipline to maintain boundaries (mitigated by architecture tests)
- May feel like over-engineering for simple CRUD operations
- Mappers add boilerplate for converting between layers

## Pros and Cons of the Options

### Hexagonal Architecture

- Good, because it provides the strongest separation of concerns
- Good, because domain logic is completely testable in isolation
- Good, because it has explicit contracts through port interfaces
- Good, because it aligns perfectly with DDD principles
- Good, because it works well with monorepo package structure
- Good, because infrastructure is fully swappable
- Bad, because it requires more initial setup and boilerplate
- Bad, because it has more abstraction layers to navigate
- Bad, because it requires discipline to maintain boundaries

### Layered Architecture

- Good, because it's well-understood by most developers
- Good, because it's simpler to set up initially
- Good, because it has fewer abstraction layers
- Bad, because layers often leak dependencies
- Bad, because domain typically depends on data layer
- Bad, because infrastructure changes ripple through layers
- Bad, because testing requires heavy mocking

### Clean Architecture

- Good, because it provides strong dependency rules
- Good, because it's well-documented with many examples
- Good, because it supports high testability
- Bad, because it has more concentric layers than hexagonal
- Bad, because the additional layers add complexity without clear benefit for
  our use case
- Bad, because it's less intuitive than hexagonal's ports metaphor

### Feature-based Modules

- Good, because it groups related code together
- Good, because it's easy to navigate
- Good, because it reduces file count
- Bad, because it mixes concerns within modules
- Bad, because testing requires infrastructure setup
- Bad, because business logic couples to frameworks
- Bad, because it makes refactoring harder

## Links

- [Architecture Overview](../overview.md)
- [Repository Layout](../repo-layout.md)
- Related: IFC-002 (Domain Model Design)
- Related: IFC-106 (Hexagonal Module Boundaries)
- [Hexagonal Architecture by Alistair Cockburn](https://alistair.cockburn.us/hexagonal-architecture/)

## Implementation Notes

### Package Structure

```
packages/
├── domain/              # Core domain layer (no dependencies)
│   ├── entities/        # Aggregates and entities
│   ├── value-objects/   # Immutable value objects
│   ├── events/          # Domain events
│   └── repositories/    # Repository interfaces (ports)
│
├── application/         # Application layer (orchestration)
│   ├── ports/           # Input/output port interfaces
│   │   ├── input/       # Use case interfaces
│   │   └── output/      # Infrastructure interfaces
│   ├── usecases/        # Use case implementations
│   └── services/        # Application services
│
└── adapters/            # Adapter layer (infrastructure)
    ├── repositories/    # Repository implementations
    ├── external/        # External API clients
    ├── messaging/       # Event publishers
    └── cache/           # Caching adapters
```

### Dependency Rules

1. **Domain Layer**: No dependencies on any other layer
2. **Application Layer**: Depends only on Domain layer
3. **Adapters Layer**: Depends on Domain and Application layers
4. **API/Web Layer**: Depends on all layers

### Architecture Tests

```typescript
// tests/architecture/boundaries.test.ts
import { expectNoDependencies } from '@intelliflow/architecture-tests';

test('domain has no infrastructure dependencies', () => {
  expectNoDependencies(
    ['packages/domain/**'],
    ['packages/adapters/**', 'apps/**', 'node_modules/**']
  );
});

test('application depends only on domain', () => {
  expectNoDependencies(
    ['packages/application/**'],
    ['packages/adapters/**', 'apps/**']
  );
});
```

### Validation Criteria

- [x] Domain package has zero external dependencies in package.json
- [x] Application package depends only on domain package
- [x] Architecture tests written and passing
- [x] All repository interfaces defined in domain layer
- [x] All repository implementations in adapters layer
- [x] Example use case implemented following pattern
- [x] Documentation updated with examples
- [x] Team trained on hexagonal architecture principles

### Migration Path

For existing code:

1. **Phase 1**: Create package structure (domain, application, adapters)
2. **Phase 2**: Move entities and value objects to domain package
3. **Phase 3**: Extract repository interfaces to domain layer
4. **Phase 4**: Move repository implementations to adapters layer
5. **Phase 5**: Create use cases in application layer
6. **Phase 6**: Add architecture tests to enforce boundaries
7. **Phase 7**: Refactor API layer to use use cases

### Code Examples

**Domain Entity (no infrastructure dependencies):**

```typescript
// packages/domain/src/entities/Lead.ts
export class Lead extends AggregateRoot {
  private constructor(
    private id: LeadId,
    private email: Email,
    private score: LeadScore,
    private status: LeadStatus
  ) {
    super();
  }

  public updateScore(newScore: LeadScore): void {
    if (this.score.equals(newScore)) return;

    this.score = newScore;
    this.addDomainEvent(new LeadScoredEvent(this.id, newScore));
  }

  public qualify(): Result<void, DomainError> {
    if (!this.score.isQualified()) {
      return Result.fail(new LeadNotQualifiedError(this.id));
    }

    this.status = LeadStatus.Qualified;
    this.addDomainEvent(new LeadQualifiedEvent(this.id));
    return Result.ok();
  }
}
```

**Repository Interface (output port in domain):**

```typescript
// packages/domain/src/repositories/LeadRepository.ts
export interface LeadRepository {
  save(lead: Lead): Promise<void>;
  findById(id: LeadId): Promise<Lead | null>;
  findByEmail(email: Email): Promise<Lead | null>;
}
```

**Use Case (application layer):**

```typescript
// packages/application/src/usecases/ScoreLeadUseCase.ts
export class ScoreLeadUseCase {
  constructor(
    private leadRepository: LeadRepository, // Output port
    private aiScoringService: AIServicePort, // Output port
    private eventBus: EventBusPort // Output port
  ) {}

  async execute(input: ScoreLeadInput): Promise<Result<LeadScore, Error>> {
    // 1. Load lead
    const lead = await this.leadRepository.findById(input.leadId);
    if (!lead) return Result.fail(new LeadNotFoundError(input.leadId));

    // 2. Calculate score using AI
    const scoreResult = await this.aiScoringService.scoreLead(lead);
    if (scoreResult.isFailure()) return scoreResult;

    // 3. Update domain entity
    lead.updateScore(scoreResult.value);

    // 4. Persist changes
    await this.leadRepository.save(lead);

    // 5. Publish domain events
    await this.eventBus.publishAll(lead.getDomainEvents());

    return Result.ok(scoreResult.value);
  }
}
```

**Repository Implementation (adapter):**

```typescript
// packages/adapters/src/repositories/PrismaLeadRepository.ts
export class PrismaLeadRepository implements LeadRepository {
  constructor(private prisma: PrismaClient) {}

  async save(lead: Lead): Promise<void> {
    const data = LeadMapper.toPersistence(lead);

    await this.prisma.lead.upsert({
      where: { id: data.id },
      create: data,
      update: data,
    });
  }

  async findById(id: LeadId): Promise<Lead | null> {
    const record = await this.prisma.lead.findUnique({
      where: { id: id.value },
    });

    return record ? LeadMapper.toDomain(record) : null;
  }
}
```

**API Layer (driving adapter):**

```typescript
// apps/api/src/modules/leads/leads.router.ts
export const leadsRouter = router({
  score: protectedProcedure
    .input(scoreLeadSchema)
    .mutation(async ({ input, ctx }) => {
      const useCase = new ScoreLeadUseCase(
        ctx.leadRepository,
        ctx.aiScoringService,
        ctx.eventBus
      );

      const result = await useCase.execute(input);

      if (result.isFailure()) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.error.message,
        });
      }

      return result.value;
    }),
});
```

### Rollback Plan

If hexagonal architecture proves too complex:

1. Keep domain entities and value objects (they're still valuable)
2. Remove port interfaces and use concrete implementations directly
3. Merge application and adapters layers into single "services" layer
4. Update to simpler layered architecture
5. Remove architecture boundary tests
6. Update documentation to reflect new structure

However, we should give this pattern at least 2 sprints before considering
rollback, as the benefits become clearer with scale.

---

**Last Updated:** 2025-12-20 **Review Date:** After Sprint 4 (IFC-010 Phase 1
Go/No-Go decision)
