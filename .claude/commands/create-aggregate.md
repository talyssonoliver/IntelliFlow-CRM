# Create Aggregate Command

Scaffold a new DDD aggregate with all required components and tests.

## Usage
```
/create-aggregate <name> [--context=<bounded-context>]
```

## Arguments
- `name`: Aggregate name (PascalCase, e.g., Lead, Contact, Account)
- `--context`: Bounded context (crm, intelligence, platform)

## Generated Structure

```
packages/domain/src/<context>/<name>/
├── index.ts                    # Barrel export
├── <name>.aggregate.ts         # Aggregate root
├── <name>.entity.ts            # Entity definition
├── <name>.value-objects.ts     # Value objects
├── <name>.events.ts            # Domain events
├── <name>.repository.ts        # Repository interface
├── <name>.factory.ts           # Factory pattern
└── __tests__/
    ├── <name>.aggregate.test.ts
    └── <name>.value-objects.test.ts
```

## Aggregate Template

```typescript
// Lead.aggregate.ts
import { AggregateRoot } from '@intelliflow/domain/shared';
import { LeadId, LeadScore, Email } from './Lead.value-objects';
import { LeadCreatedEvent, LeadScoredEvent } from './Lead.events';

export class Lead extends AggregateRoot<LeadId> {
  private constructor(
    id: LeadId,
    private email: Email,
    private score: LeadScore,
    private createdAt: Date
  ) {
    super(id);
  }

  static create(props: CreateLeadProps): Lead {
    const lead = new Lead(
      LeadId.generate(),
      Email.create(props.email),
      LeadScore.create(0),
      new Date()
    );
    lead.addDomainEvent(new LeadCreatedEvent(lead.id, lead.email));
    return lead;
  }

  score(value: number): void {
    this.score = LeadScore.create(value);
    this.addDomainEvent(new LeadScoredEvent(this.id, this.score));
  }
}
```

## Example
```bash
# Create Lead aggregate in CRM context
/create-aggregate Lead --context=crm

# Create AIModel aggregate in Intelligence context
/create-aggregate AIModel --context=intelligence
```
