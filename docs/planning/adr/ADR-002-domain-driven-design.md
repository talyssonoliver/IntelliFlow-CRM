# ADR-002: Domain-Driven Design (DDD) Approach

**Status:** Accepted

**Date:** 2025-12-21

**Deciders:** Tech Lead, Domain Architect, Backend Team

**Technical Story:** IFC-002, IFC-135

## Context and Problem Statement

IntelliFlow CRM is a complex domain with multiple bounded contexts (CRM, Case
Management, Intelligence, Platform). We need an architectural approach that
keeps business logic clean, models the domain accurately, maintains clear
boundaries between contexts, supports long-term evolution, and enables
AI-assisted development. How should we structure our domain model to balance
complexity, maintainability, and developer productivity?

## Decision Drivers

- **Domain Complexity**: Legal CRM involves complex business rules (lead
  qualification, case workflows, client relationships)
- **Bounded Contexts**: Clear separation between CRM, Intelligence, Platform
  contexts
- **Business Logic Isolation**: Domain logic must be testable without
  infrastructure
- **Long-term Maintainability**: Model must evolve with business requirements
- **Team Scalability**: Multiple developers working on different contexts
- **AI-Assisted Development**: Clear patterns make AI code generation safer
- **Type Safety**: Full TypeScript type coverage across domain model
- **Performance**: Domain operations must be fast (<20ms for business logic)

## Considered Options

- **Option 1**: Domain-Driven Design (DDD) with Aggregates and Value Objects
- **Option 2**: Anemic Domain Model (service-oriented with DTOs)
- **Option 3**: Transaction Script Pattern (procedural business logic)
- **Option 4**: Active Record Pattern (domain + persistence combined)

## Decision Outcome

Chosen option: **"Domain-Driven Design (DDD) with Aggregates and Value
Objects"**, because it provides the best structure for complex business logic,
maintains clear boundaries between contexts, enables testability without
infrastructure, and aligns perfectly with our hexagonal architecture. DDD's
tactical patterns (Entities, Value Objects, Aggregates, Domain Events) give us a
proven vocabulary for modeling the legal CRM domain.

### Positive Consequences

- **Rich Domain Model**: Business logic lives in domain entities, not services
- **Testability**: Domain logic testable with simple unit tests (no mocks)
- **Clear Boundaries**: Aggregates define consistency boundaries
- **Ubiquitous Language**: Shared vocabulary between developers and domain
  experts
- **Type Safety**: Value Objects ensure invariants at compile-time
- **Domain Events**: Decoupled communication between contexts
- **Refactoring Safety**: Changing domain logic doesn't affect infrastructure
- **AI-Friendly**: Clear patterns make AI-generated code more reliable

### Negative Consequences

- **Learning Curve**: Team must learn DDD tactical patterns
- **More Classes**: Value Objects and Entities create more files
- **Boilerplate**: Creating aggregates requires more code than simple models
- **Over-Engineering Risk**: Simple CRUD can feel over-engineered
- **Repository Pattern**: Requires abstraction layer for data access

## Pros and Cons of the Options

### Domain-Driven Design (DDD)

Rich domain model with Entities, Value Objects, Aggregates, and Domain Events.

- Good, because it keeps business logic in the domain layer
- Good, because aggregates enforce consistency boundaries
- Good, because value objects ensure invariants
- Good, because domain events decouple contexts
- Good, because it aligns with hexagonal architecture
- Good, because it's testable without infrastructure
- Bad, because it has a steep learning curve
- Bad, because it creates more classes and boilerplate
- Bad, because simple CRUD feels over-engineered

### Anemic Domain Model

DTOs with business logic in services.

- Good, because it's simple and familiar
- Good, because it has less boilerplate
- Good, because it's easy to learn
- Bad, because business logic scatters across services
- Bad, because domain objects are just data bags
- Bad, because it violates OOP principles
- Bad, because testing requires heavy mocking
- Bad, because refactoring is risky

### Transaction Script Pattern

Procedural functions for each use case.

- Good, because it's simple for small applications
- Good, because it requires minimal structure
- Bad, because logic duplicates across scripts
- Bad, because no domain model emerges
- Bad, because scaling is difficult
- Bad, because testing is challenging

### Active Record Pattern

Domain objects with built-in persistence.

- Good, because it's simple and productive
- Good, because it reduces abstraction layers
- Good, because ORMs support it well
- Bad, because domain couples to database
- Bad, because testing requires database
- Bad, because changing persistence is hard
- Bad, because domain logic mixes with data access

## Implementation Notes

### Bounded Contexts

IntelliFlow CRM is divided into three bounded contexts:

```
┌─────────────────────────────────────────────────────────┐
│                    IntelliFlow CRM                      │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │     CRM      │  │ Intelligence │  │   Platform   │ │
│  │   Context    │  │   Context    │  │   Context    │ │
│  ├──────────────┤  ├──────────────┤  ├──────────────┤ │
│  │ • Lead       │  │ • AI Scoring │  │ • Tenant     │ │
│  │ • Contact    │  │ • Prediction │  │ • User       │ │
│  │ • Account    │  │ • Agent      │  │ • Auth       │ │
│  │ • Opportunity│  │ • Workflow   │  │ • Billing    │ │
│  │ • Task       │  │ • Memory     │  │ • Analytics  │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
│                                                         │
│         ↓ Domain Events ↓                              │
│  ┌─────────────────────────────────────────────────┐  │
│  │           Shared Kernel (minimal)               │  │
│  │  • Common Value Objects (Email, Money, etc.)    │  │
│  │  • Domain Event Base Classes                    │  │
│  └─────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Tactical DDD Patterns

#### 1. Entities

Domain objects with unique identity:

```typescript
// packages/domain/src/crm/lead/Lead.ts
import { AggregateRoot } from '../shared/AggregateRoot';
import { LeadId } from './LeadId';
import { Email } from '../shared/Email';
import { LeadScore } from './LeadScore';
import { LeadStatus } from './LeadStatus';
import { LeadScoredEvent } from './events/LeadScoredEvent';

export class Lead extends AggregateRoot {
  private constructor(
    private readonly id: LeadId,
    private email: Email,
    private score: LeadScore,
    private status: LeadStatus,
    private createdAt: Date,
    private updatedAt: Date
  ) {
    super();
  }

  // Factory method
  public static create(props: {
    id: LeadId;
    email: Email;
    score?: LeadScore;
    status?: LeadStatus;
  }): Lead {
    const lead = new Lead(
      props.id,
      props.email,
      props.score || LeadScore.unscored(),
      props.status || LeadStatus.new(),
      new Date(),
      new Date()
    );

    lead.addDomainEvent(new LeadCreatedEvent(lead.id, lead.email));

    return lead;
  }

  // Business logic encapsulated in entity
  public updateScore(newScore: LeadScore, scoredBy: 'ai' | 'manual'): void {
    if (this.score.equals(newScore)) {
      return; // No change
    }

    const previousScore = this.score;
    this.score = newScore;
    this.updatedAt = new Date();

    this.addDomainEvent(
      new LeadScoredEvent(this.id, previousScore, newScore, scoredBy)
    );
  }

  public qualify(): Result<void, DomainError> {
    if (!this.score.isQualified()) {
      return Result.fail(new LeadNotQualifiedError(this.id, this.score));
    }

    this.status = LeadStatus.qualified();
    this.updatedAt = new Date();

    this.addDomainEvent(new LeadQualifiedEvent(this.id));

    return Result.ok();
  }

  public disqualify(reason: string): void {
    this.status = LeadStatus.disqualified();
    this.updatedAt = new Date();

    this.addDomainEvent(new LeadDisqualifiedEvent(this.id, reason));
  }

  // Getters (no setters - immutability)
  public getId(): LeadId {
    return this.id;
  }

  public getEmail(): Email {
    return this.email;
  }

  public getScore(): LeadScore {
    return this.score;
  }

  public getStatus(): LeadStatus {
    return this.status;
  }
}
```

#### 2. Value Objects

Immutable objects without identity:

```typescript
// packages/domain/src/crm/shared/Email.ts
import { ValueObject } from '../shared/ValueObject';

interface EmailProps {
  value: string;
}

export class Email extends ValueObject<EmailProps> {
  private constructor(props: EmailProps) {
    super(props);
  }

  public static create(email: string): Result<Email, DomainError> {
    if (!email || email.trim().length === 0) {
      return Result.fail(new InvalidEmailError('Email cannot be empty'));
    }

    if (!this.isValidEmail(email)) {
      return Result.fail(
        new InvalidEmailError(`Invalid email format: ${email}`)
      );
    }

    return Result.ok(new Email({ value: email.toLowerCase().trim() }));
  }

  private static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  public getValue(): string {
    return this.props.value;
  }

  public getDomain(): string {
    return this.props.value.split('@')[1];
  }

  public toString(): string {
    return this.props.value;
  }
}
```

```typescript
// packages/domain/src/crm/lead/LeadScore.ts
import { ValueObject } from '../shared/ValueObject';

interface LeadScoreProps {
  value: number;
}

export class LeadScore extends ValueObject<LeadScoreProps> {
  private constructor(props: LeadScoreProps) {
    super(props);
  }

  public static create(score: number): Result<LeadScore, DomainError> {
    if (score < 0 || score > 100) {
      return Result.fail(
        new InvalidLeadScoreError(`Score must be 0-100, got ${score}`)
      );
    }

    return Result.ok(new LeadScore({ value: Math.round(score) }));
  }

  public static unscored(): LeadScore {
    return new LeadScore({ value: 0 });
  }

  public isQualified(): boolean {
    return this.props.value >= 60;
  }

  public isLowQuality(): boolean {
    return this.props.value < 40;
  }

  public getValue(): number {
    return this.props.value;
  }

  public add(points: number): Result<LeadScore, DomainError> {
    return LeadScore.create(this.props.value + points);
  }
}
```

#### 3. Aggregates

Consistency boundaries:

```typescript
// packages/domain/src/crm/opportunity/Opportunity.ts
export class Opportunity extends AggregateRoot {
  private constructor(
    private readonly id: OpportunityId,
    private accountId: AccountId,
    private value: Money,
    private stage: OpportunityStage,
    private probability: Probability,
    private lineItems: LineItem[], // Internal entities
    private closedDate: Date | null
  ) {
    super();
  }

  // Aggregate enforces consistency of line items
  public addLineItem(
    product: ProductId,
    quantity: number,
    price: Money
  ): Result<void, DomainError> {
    if (this.stage.isClosed()) {
      return Result.fail(
        new InvalidOperationError('Cannot add items to closed opportunity')
      );
    }

    const lineItem = LineItem.create({
      product,
      quantity,
      price,
    });

    this.lineItems.push(lineItem);

    // Recalculate total value
    this.value = this.calculateTotalValue();

    this.addDomainEvent(
      new LineItemAddedEvent(this.id, lineItem.getId(), this.value)
    );

    return Result.ok();
  }

  public removeLineItem(lineItemId: LineItemId): Result<void, DomainError> {
    const index = this.lineItems.findIndex((item) =>
      item.getId().equals(lineItemId)
    );

    if (index === -1) {
      return Result.fail(new LineItemNotFoundError(lineItemId));
    }

    this.lineItems.splice(index, 1);
    this.value = this.calculateTotalValue();

    this.addDomainEvent(new LineItemRemovedEvent(this.id, lineItemId));

    return Result.ok();
  }

  private calculateTotalValue(): Money {
    return this.lineItems.reduce(
      (total, item) => total.add(item.getTotal()),
      Money.zero('USD')
    );
  }

  // Only Opportunity aggregate can modify line items
  // External code cannot access lineItems directly
}
```

#### 4. Domain Events

Decouple contexts:

```typescript
// packages/domain/src/crm/lead/events/LeadScoredEvent.ts
import { DomainEvent } from '../../shared/DomainEvent';

export class LeadScoredEvent extends DomainEvent {
  constructor(
    public readonly leadId: LeadId,
    public readonly previousScore: LeadScore,
    public readonly newScore: LeadScore,
    public readonly scoredBy: 'ai' | 'manual'
  ) {
    super();
  }

  public getAggregateId(): string {
    return this.leadId.getValue();
  }
}
```

```typescript
// packages/domain/src/shared/DomainEvent.ts
export abstract class DomainEvent {
  public readonly occurredAt: Date;
  public readonly id: string;

  constructor() {
    this.occurredAt = new Date();
    this.id = uuidv4();
  }

  public abstract getAggregateId(): string;
}
```

#### 5. Repository Interfaces (Ports)

Defined in domain, implemented in adapters:

```typescript
// packages/domain/src/crm/lead/LeadRepository.ts
export interface LeadRepository {
  save(lead: Lead): Promise<void>;
  findById(id: LeadId): Promise<Lead | null>;
  findByEmail(email: Email): Promise<Lead | null>;
  findQualifiedLeads(tenantId: TenantId): Promise<Lead[]>;
}
```

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
      where: { id: id.getValue() },
    });

    return record ? LeadMapper.toDomain(record) : null;
  }

  async findByEmail(email: Email): Promise<Lead | null> {
    const record = await this.prisma.lead.findFirst({
      where: { email: email.getValue() },
    });

    return record ? LeadMapper.toDomain(record) : null;
  }

  async findQualifiedLeads(tenantId: TenantId): Promise<Lead[]> {
    const records = await this.prisma.lead.findMany({
      where: {
        tenant_id: tenantId.getValue(),
        score: { gte: 60 },
        status: 'qualified',
      },
    });

    return records.map(LeadMapper.toDomain);
  }
}
```

### Package Structure

```
packages/domain/
├── src/
│   ├── crm/                    # CRM Bounded Context
│   │   ├── lead/
│   │   │   ├── Lead.ts         # Aggregate Root
│   │   │   ├── LeadId.ts       # Value Object
│   │   │   ├── LeadScore.ts    # Value Object
│   │   │   ├── LeadStatus.ts   # Value Object
│   │   │   ├── LeadRepository.ts # Port
│   │   │   └── events/
│   │   │       ├── LeadCreatedEvent.ts
│   │   │       ├── LeadScoredEvent.ts
│   │   │       └── LeadQualifiedEvent.ts
│   │   ├── contact/
│   │   ├── account/
│   │   ├── opportunity/
│   │   └── task/
│   ├── intelligence/           # Intelligence Bounded Context
│   │   ├── scoring/
│   │   ├── prediction/
│   │   └── agent/
│   ├── platform/               # Platform Bounded Context
│   │   ├── tenant/
│   │   ├── user/
│   │   └── billing/
│   └── shared/                 # Shared Kernel
│       ├── AggregateRoot.ts
│       ├── Entity.ts
│       ├── ValueObject.ts
│       ├── DomainEvent.ts
│       ├── Result.ts
│       ├── DomainError.ts
│       ├── Email.ts            # Shared Value Object
│       └── Money.ts            # Shared Value Object
└── package.json
```

### Testing Domain Logic

Domain tests require no infrastructure:

```typescript
// packages/domain/src/crm/lead/Lead.spec.ts
import { Lead } from './Lead';
import { LeadId } from './LeadId';
import { Email } from '../shared/Email';
import { LeadScore } from './LeadScore';

describe('Lead', () => {
  describe('qualify', () => {
    it('should qualify lead with score >= 60', () => {
      const lead = Lead.create({
        id: LeadId.create(),
        email: Email.create('test@example.com').value,
      });

      lead.updateScore(LeadScore.create(75).value, 'ai');

      const result = lead.qualify();

      expect(result.isSuccess()).toBe(true);
      expect(lead.getStatus().isQualified()).toBe(true);

      const events = lead.getDomainEvents();
      expect(events).toHaveLength(3); // Created, Scored, Qualified
      expect(events[2]).toBeInstanceOf(LeadQualifiedEvent);
    });

    it('should fail to qualify lead with score < 60', () => {
      const lead = Lead.create({
        id: LeadId.create(),
        email: Email.create('test@example.com').value,
      });

      lead.updateScore(LeadScore.create(45).value, 'manual');

      const result = lead.qualify();

      expect(result.isFailure()).toBe(true);
      expect(result.error).toBeInstanceOf(LeadNotQualifiedError);
      expect(lead.getStatus().isNew()).toBe(true);
    });
  });

  describe('updateScore', () => {
    it('should emit LeadScoredEvent when score changes', () => {
      const lead = Lead.create({
        id: LeadId.create(),
        email: Email.create('test@example.com').value,
      });

      lead.updateScore(LeadScore.create(80).value, 'ai');

      const events = lead.getDomainEvents();
      const scoredEvent = events.find((e) => e instanceof LeadScoredEvent);

      expect(scoredEvent).toBeDefined();
      expect((scoredEvent as LeadScoredEvent).newScore.getValue()).toBe(80);
      expect((scoredEvent as LeadScoredEvent).scoredBy).toBe('ai');
    });

    it('should not emit event if score unchanged', () => {
      const lead = Lead.create({
        id: LeadId.create(),
        email: Email.create('test@example.com').value,
        score: LeadScore.create(50).value,
      });

      lead.clearDomainEvents();

      lead.updateScore(LeadScore.create(50).value, 'manual');

      expect(lead.getDomainEvents()).toHaveLength(0);
    });
  });
});
```

### Validation Criteria

- [x] All aggregates identified (Lead, Contact, Account, Opportunity, Task)
- [x] Value Objects created for business concepts (Email, Money, LeadScore)
- [x] Domain events defined for inter-context communication
- [x] Repository interfaces defined in domain layer
- [x] Domain logic testable without infrastructure
- [x] Bounded context map documented
- [x] > 95% test coverage on domain layer (enforced in CI)
- [x] Architecture tests validate no infrastructure dependencies

### Rollback Plan

If DDD proves too complex:

1. Keep Value Objects (they're valuable even without full DDD)
2. Simplify to Anemic Domain Model with service layer
3. Move business logic to Application Services
4. Use simple DTOs instead of rich entities
5. Remove aggregate complexity

However, we should evaluate after Sprint 4 (IFC-010 decision gate) before
rolling back.

## Links

- [Architecture Overview](../../architecture/overview.md)
- [Hexagonal Architecture](../../architecture/adr/001-hexagonal-architecture.md)
- Related: [ADR-001 Modern Stack](./ADR-001-modern-stack.md)
- Related:
  [IFC-002 Domain Model Design](../../apps/project-tracker/docs/metrics/_global/Sprint_plan.csv)
- [DDD Reference](https://www.domainlanguage.com/ddd/reference/)
- [Bounded Context Pattern](https://martinfowler.com/bliki/BoundedContext.html)

## References

- [Domain-Driven Design by Eric Evans](https://www.domainlanguage.com/ddd/)
- [Implementing Domain-Driven Design by Vaughn Vernon](https://vaughnvernon.com/books/)
- [DDD Aggregate Pattern](https://martinfowler.com/bliki/DDD_Aggregate.html)
- [Value Objects](https://martinfowler.com/bliki/ValueObject.html)
- [Domain Events](https://martinfowler.com/eaaDev/DomainEvent.html)

---

**Conclusion**: Domain-Driven Design provides the optimal approach for modeling
IntelliFlow CRM's complex legal domain. The tactical patterns (Entities, Value
Objects, Aggregates, Domain Events) give us a proven structure for maintaining
business logic, ensuring testability, and enabling long-term evolution. Combined
with hexagonal architecture, DDD creates a robust foundation for AI-assisted
development and multi-team collaboration.

**Status**: ✅ DDD patterns implemented in domain layer. Ready for Sprint 1 use
case development.
