# ADR-010: Architecture Boundary Enforcement

**Status:** Accepted

**Date:** 2025-12-26

**Deciders:** Tech Lead (STOA-Foundation), Architecture Team

**Technical Story:** IFC-131 - Architecture boundary enforcement:
domain/infrastructure dependency rules + architecture tests in CI

## Context and Problem Statement

IntelliFlow CRM follows hexagonal (ports and adapters) architecture as
documented in ADR-001 and ADR-002. However, without automated enforcement,
developers can accidentally introduce architecture violations by importing from
the wrong layers. These violations erode the benefits of the architecture over
time, making the codebase harder to maintain and test.

How should we enforce architecture boundaries to ensure the domain layer remains
pure and the dependency direction flows inward?

## Decision Drivers

- **Architecture Integrity**: Domain layer must remain free of infrastructure
  dependencies to enable easy testing and reasoning about business logic
- **Developer Experience**: Violations should be caught early (IDE, local lint)
  rather than only in CI
- **CI Blocking**: Non-compliant changes must be blocked from merging to main
- **Zero Tolerance**: KPI requires 0 boundary violations on main branch
- **Actionable Feedback**: Developers need clear messages about what's wrong and
  how to fix it

## Decision Outcome

Implement a three-layer enforcement strategy:

1. **Architecture Tests** (`tests/architecture/`) - Comprehensive boundary
   verification using file scanning
2. **ESLint Rules** (`.eslintrc.js`) - Immediate IDE feedback via
   `no-restricted-imports`
3. **CI Integration** (`.github/workflows/ci.yml`) - Required check blocking
   non-compliant PRs

### Positive Consequences

- Violations are caught at multiple stages: IDE, local lint, CI
- Clear error messages guide developers to the correct solution
- Build cannot succeed with boundary violations
- Domain layer guaranteed to remain pure
- Easy to add new forbidden patterns as needed

### Negative Consequences

- Slightly longer lint/test times due to file scanning
- Requires maintaining multiple enforcement mechanisms
- Developers must learn the architecture patterns to fix violations

## Enforcement Details

### Layer 1: Architecture Tests

Location: `tests/architecture/`

Three test files covering each layer:

1. **`domain-dependencies.test.ts`**
   - Scans all `.ts` files in `packages/domain/src/`
   - Verifies no imports from `@intelliflow/application`,
     `@intelliflow/adapters`
   - Verifies no imports from infrastructure packages (Prisma, Express, React,
     etc.)

2. **`application-dependencies.test.ts`**
   - Scans all `.ts` files in `packages/application/src/`
   - Verifies no imports from `@intelliflow/adapters`
   - Verifies imports from `@intelliflow/domain` are allowed

3. **`adapters-dependencies.test.ts`**
   - Verifies adapters implement port interfaces from application
   - Verifies proper dependency direction

### Layer 2: ESLint Rules

Added to `.eslintrc.js` as overrides for specific directories:

```javascript
// Domain layer - most restrictive
{
  files: ['packages/domain/src/**/*.ts'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        { group: ['@intelliflow/application'], message: '...' },
        { group: ['@intelliflow/adapters'], message: '...' },
        { group: ['@prisma/client'], message: '...' },
        // ... more patterns
      ]
    }]
  }
}

// Application layer - allows domain only
{
  files: ['packages/application/src/**/*.ts'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        { group: ['@intelliflow/adapters'], message: '...' },
        { group: ['@prisma/client'], message: '...' },
        // ... more patterns
      ]
    }]
  }
}
```

### Layer 3: CI Integration

Added `architecture` job to `.github/workflows/ci.yml`:

```yaml
architecture:
  name: Architecture Tests
  runs-on: ubuntu-latest
  steps:
    - name: Run architecture boundary tests
      run: cd tests/architecture && pnpm test
```

Build job now depends on architecture tests:

```yaml
build:
  needs: [lint, typecheck, test, architecture]
```

## Forbidden Dependencies by Layer

### Domain Layer (Most Restrictive)

| Category            | Forbidden Packages                                                     |
| ------------------- | ---------------------------------------------------------------------- |
| Internal packages   | `@intelliflow/application`, `@intelliflow/adapters`, `@intelliflow/db` |
| Database/ORM        | `@prisma/client`, `prisma`                                             |
| HTTP frameworks     | `express`, `fastify`, `koa`, `@trpc/*`                                 |
| Frontend frameworks | `react`, `next`, `vue`, `svelte`                                       |
| Database drivers    | `pg`, `mysql`, `redis`, `ioredis`, `mongodb`                           |
| Cloud SDKs          | `@aws-sdk/*`, `@azure/*`, `@google-cloud/*`                            |
| Message queues      | `amqplib`, `kafka`, `bullmq`                                           |

### Application Layer

| Category            | Forbidden Packages                         |
| ------------------- | ------------------------------------------ |
| Internal packages   | `@intelliflow/adapters`, `@intelliflow/db` |
| Database/ORM        | `@prisma/client`                           |
| HTTP frameworks     | `express`, `fastify`, `@trpc/server`       |
| Frontend frameworks | `react`, `next`                            |
| Database drivers    | `pg`, `mysql`, `redis`, `ioredis`          |

### Allowed Dependencies

| Layer       | Allowed Packages                                           |
| ----------- | ---------------------------------------------------------- |
| Domain      | `uuid`, `lodash`, `date-fns`, `zod` (validation)           |
| Application | `@intelliflow/domain`, `uuid`, `lodash`, `date-fns`, `zod` |
| Adapters    | All packages (outer layer)                                 |

## Validation

### KPIs

- **0 boundary violations on main**: Architecture tests must pass
- **CI blocks non-compliant changes**: Build requires architecture job

### Verification Commands

```bash
# Run architecture tests
cd tests/architecture && pnpm test

# Run ESLint on hexagonal packages
pnpm run lint packages/domain packages/application

# Verify CI config
cat .github/workflows/ci.yml | grep -A5 "architecture:"
```

## Alternatives Considered

### Option 1: dependency-cruiser Only

Using only dependency-cruiser for static analysis.

**Pros:**

- Single tool for all enforcement
- Powerful graph-based analysis

**Cons:**

- No IDE integration
- Configuration complexity
- Slower feedback loop

### Option 2: Package.json "bundledDependencies" Restrictions

Using package.json settings to restrict dependencies.

**Pros:**

- Native npm/pnpm enforcement
- Simple configuration

**Cons:**

- Only blocks at install time, not at import time
- Doesn't prevent relative path circumvention
- No developer feedback

### Option 3: TypeScript Path Mappings Only

Using tsconfig.json path mappings to control imports.

**Pros:**

- Type-safe enforcement
- IDE support

**Cons:**

- Easy to circumvent with relative paths
- Complex configuration for monorepos
- Doesn't block third-party packages

## Related Decisions

- [ADR-001: Modern Stack](ADR-001-modern-stack.md) - Establishes the hexagonal
  architecture pattern
- [ADR-002: Domain-Driven Design](ADR-002-domain-driven-design.md) - Defines
  domain layer structure

## References

- [Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture/)
- [ESLint no-restricted-imports](https://eslint.org/docs/rules/no-restricted-imports)
- [IFC-131 Task](../../apps/project-tracker/docs/metrics/_global/Sprint_plan.csv)
- [Architecture Documentation](../../docs/architecture/hex-boundaries.md)
