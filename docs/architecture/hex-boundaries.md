# Hexagonal Architecture Boundaries

## Overview

IntelliFlow CRM follows hexagonal (ports and adapters) architecture to ensure:
- Domain logic is isolated from infrastructure concerns
- Easy testing and mocking of external dependencies
- Clear separation of concerns across bounded contexts

## Layer Structure

```
┌─────────────────────────────────────────────────────┐
│                    apps/                            │
│        (Composition Root - wires everything)        │
├─────────────────────────────────────────────────────┤
│                packages/adapters/                   │
│  (Infrastructure implementations - repositories,    │
│   external services, message queues)                │
├─────────────────────────────────────────────────────┤
│               packages/application/                 │
│  (Use cases, ports/interfaces, application logic)   │
├─────────────────────────────────────────────────────┤
│                 packages/domain/                    │
│  (Entities, value objects, domain events,           │
│   business rules - NO external dependencies)        │
└─────────────────────────────────────────────────────┘
```

## Dependency Rules

### Domain Layer (`packages/domain/`)
- **CAN import**: Only standard library, no framework dependencies
- **CANNOT import**: adapters, application, apps, infrastructure packages
- Contains: Entities, Value Objects, Domain Events, Domain Services

### Application Layer (`packages/application/`)
- **CAN import**: domain package only
- **CANNOT import**: adapters, apps, infrastructure packages
- Contains: Use Cases, Port interfaces, Application Services

### Adapters Layer (`packages/adapters/`)
- **CAN import**: domain, application packages
- **CANNOT import**: apps (circular dependency)
- Contains: Repository implementations, External API clients, Message handlers

### Apps Layer (`apps/`)
- **CAN import**: All packages (composition root)
- Wires together: domain + application + adapters
- Contains: HTTP handlers, tRPC routers, Workers, UI components

## Port Definitions

### Repository Ports (`packages/application/src/ports/repositories/`)

```typescript
// Lead repository port
export interface LeadRepository {
  save(lead: Lead): Promise<void>;
  findById(id: LeadId): Promise<Lead | null>;
  findByEmail(email: Email): Promise<Lead | null>;
  findAll(query: LeadQuery): Promise<Lead[]>;
  delete(id: LeadId): Promise<void>;
}
```

### External Service Ports (`packages/application/src/ports/external/`)

```typescript
// AI Scoring service port
export interface AIScoreService {
  scoreLead(lead: Lead): Promise<LeadScore>;
  getModelVersion(): string;
}
```

## Adapter Implementations

### Repository Adapters (`packages/adapters/src/repositories/`)

```typescript
// Prisma implementation of LeadRepository
export class PrismaLeadRepository implements LeadRepository {
  constructor(private prisma: PrismaClient) {}

  async save(lead: Lead): Promise<void> {
    // Prisma-specific implementation
  }
}

// In-memory implementation for testing
export class InMemoryLeadRepository implements LeadRepository {
  private leads = new Map<string, Lead>();

  async save(lead: Lead): Promise<void> {
    this.leads.set(lead.id.value, lead);
  }
}
```

## Architecture Tests

Architecture boundaries are enforced via tests in `tests/architecture/`:

```typescript
// tests/architecture/boundary-tests.ts
describe('Hexagonal Architecture Boundaries', () => {
  it('domain should not import from adapters', () => {
    // Enforced via dependency-cruiser
  });

  it('domain should not import from application', () => {
    // Pure domain, no use case awareness
  });

  it('application should not import from adapters', () => {
    // Uses ports, not implementations
  });
});
```

## CI Enforcement

Architecture rules are validated in CI via:
1. **dependency-cruiser**: Static analysis of import paths
2. **Architecture tests**: Runtime verification of boundaries
3. **ESLint rules**: Import restrictions per package

## Related ADRs

- [ADR-001: Modern Stack](../planning/adr/ADR-001-modern-stack.md)
- [ADR-002: Domain-Driven Design](../planning/adr/ADR-002-domain-driven-design.md)
