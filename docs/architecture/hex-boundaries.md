# Hexagonal Architecture Boundaries

## Overview

IntelliFlow CRM follows hexagonal (ports and adapters) architecture to ensure:

- Domain logic is isolated from infrastructure concerns
- Easy testing and mocking of external dependencies
- Clear separation of concerns across bounded contexts

## Layer Structure

```
+-----------------------------------------------------+
|                    apps/                            |
|        (Composition Root - wires everything)        |
+-----------------------------------------------------+
|                packages/adapters/                   |
|  (Infrastructure implementations - repositories,    |
|   external services, message queues)                |
+-----------------------------------------------------+
|               packages/application/                 |
|  (Use cases, ports/interfaces, application logic)   |
+-----------------------------------------------------+
|                 packages/domain/                    |
|  (Entities, value objects, domain events,           |
|   business rules - NO external dependencies)        |
+-----------------------------------------------------+
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

## Architecture Boundary Enforcement (IFC-131)

As of Sprint 4 (IFC-131), architecture boundaries are **strictly enforced**
through multiple mechanisms to ensure 0 boundary violations on main branch and
CI blocking of non-compliant changes.

### Enforcement Mechanisms

#### 1. Architecture Tests (`tests/architecture/`)

Comprehensive tests scan TypeScript files to verify import statements follow
hexagonal architecture rules:

```typescript
// tests/architecture/domain-dependencies.test.ts
describe('Domain Layer Dependencies', () => {
  test('domain MUST NOT import from @intelliflow/application', () => {
    // Scans all .ts files in packages/domain/src/
    // Fails if any import from @intelliflow/application is found
  });

  test('domain MUST NOT import from @intelliflow/adapters', () => {
    // Ensures domain remains pure business logic
  });

  test('domain MUST NOT import from infrastructure packages', () => {
    // Checks for Prisma, Redis, HTTP frameworks, etc.
  });
});
```

Test files:

- `domain-dependencies.test.ts` - Verifies domain layer purity
- `application-dependencies.test.ts` - Verifies application layer rules
- `adapters-dependencies.test.ts` - Verifies adapters implement ports

#### 2. ESLint Import Restrictions (`.eslintrc.js`)

ESLint `no-restricted-imports` rules provide **immediate feedback** during
development:

```javascript
// Domain layer restrictions (in .eslintrc.js)
{
  files: ['packages/domain/src/**/*.ts'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        {
          group: ['@intelliflow/application', '@intelliflow/adapters'],
          message: 'Domain layer cannot depend on outer layers'
        },
        {
          group: ['@prisma/client', 'express', 'react'],
          message: 'Domain layer cannot depend on infrastructure'
        }
      ]
    }]
  }
}
```

#### 3. CI Pipeline Integration (`.github/workflows/ci.yml`)

Architecture tests run as a **required check** in CI:

```yaml
architecture:
  name: Architecture Tests
  runs-on: ubuntu-latest
  steps:
    - name: Run architecture boundary tests
      run: cd tests/architecture && pnpm test
```

The build job depends on architecture tests passing:

```yaml
build:
  needs: [lint, typecheck, test, architecture]
```

### Forbidden Dependencies by Layer

#### Domain Layer (`packages/domain/`)

| Category                | Forbidden Packages                                                     |
| ----------------------- | ---------------------------------------------------------------------- |
| Internal (outer layers) | `@intelliflow/application`, `@intelliflow/adapters`, `@intelliflow/db` |
| Database/ORM            | `@prisma/client`, `prisma`                                             |
| HTTP Frameworks         | `express`, `fastify`, `koa`, `@trpc/*`                                 |
| Frontend Frameworks     | `react`, `next`, `vue`                                                 |
| Database Drivers        | `pg`, `mysql`, `redis`, `ioredis`, `mongodb`                           |
| Cloud SDKs              | `@aws-sdk/*`, `@azure/*`, `@google-cloud/*`                            |

#### Application Layer (`packages/application/`)

| Category                | Forbidden Packages                          |
| ----------------------- | ------------------------------------------- |
| Internal (outer layers) | `@intelliflow/adapters`, `@intelliflow/db`  |
| Database/ORM            | `@prisma/client`, `prisma`                  |
| HTTP Frameworks         | `express`, `fastify`, `koa`, `@trpc/server` |
| Frontend Frameworks     | `react`, `next`, `vue`                      |
| Database Drivers        | `pg`, `mysql`, `redis`, `ioredis`           |

### Running Architecture Checks Locally

```bash
# Run all architecture tests
cd tests/architecture && pnpm test

# Run specific layer tests
cd tests/architecture && pnpm test domain-dependencies.test.ts

# Check for ESLint violations
pnpm run lint packages/domain packages/application

# Watch mode during development
cd tests/architecture && pnpm test:watch
```

### Fixing Violations

1. **Domain violations**: Move infrastructure code to adapters layer
2. **Application violations**: Define ports (interfaces) in application,
   implement in adapters
3. **Package.json violations**: Remove forbidden dependencies from the package

### Example: Proper Dependency Flow

```
+----------------+     +-------------------+     +----------------+
|   apps/api     | --> | packages/adapters | --> | packages/app   |
|   (tRPC)       |     | (PrismaLeadRepo)  |     | (CreateLead)   |
+----------------+     +-------------------+     +----------------+
                               |                        |
                               v                        v
                       +----------------+       +----------------+
                       | @intelliflow/  |       | @intelliflow/  |
                       | application    |       | domain         |
                       | (LeadRepoPort) |       | (Lead entity)  |
                       +----------------+       +----------------+
```

## Related ADRs

- [ADR-001: Modern Stack](../planning/adr/ADR-001-modern-stack.md)
- [ADR-002: Domain-Driven Design](../planning/adr/ADR-002-domain-driven-design.md)
- [ADR-003: Architecture Boundary Enforcement](../planning/adr/ADR-003-architecture-boundary-enforcement.md)

## References

- [Hexagonal Architecture (Alistair Cockburn)](https://alistair.cockburn.us/hexagonal-architecture/)
- [IFC-131 Task Definition](../../apps/project-tracker/docs/metrics/_global/Sprint_plan.csv)
- [Architecture Tests](../../tests/architecture/README.md)
