# Architecture Tests (IFC-131)

This directory contains tests that enforce hexagonal architecture boundaries in
the IntelliFlow CRM codebase.

## Purpose

These tests ensure that:

1. **Domain layer** remains pure business logic with no infrastructure
   dependencies
2. **Application layer** depends only on domain, not on infrastructure
3. **Adapters layer** implements infrastructure concerns without polluting
   domain

## Test Files

| File                               | Purpose                                         |
| ---------------------------------- | ----------------------------------------------- |
| `boundary-tests.ts`                | Original boundary verification (basic checks)   |
| `domain-dependencies.test.ts`      | Comprehensive domain layer purity verification  |
| `application-dependencies.test.ts` | Application layer dependency verification       |
| `adapters-dependencies.test.ts`    | Adapters layer port implementation verification |
| `dependency-rules.ts`              | Documents explicit dependency rules             |

## Running Tests

```bash
# Run all architecture tests
cd tests/architecture
pnpm test

# Run in watch mode
pnpm test:watch

# Run specific test file
pnpm test domain-dependencies.test.ts
```

## Hexagonal Architecture Rules

### Domain Layer (`packages/domain/`)

- **CAN import**: `uuid`, `lodash`, `date-fns`, `zod` (pure utilities only)
- **MUST NOT import**:
  - `@intelliflow/application` (outer layer)
  - `@intelliflow/adapters` (outer layer)
  - `@intelliflow/db` (infrastructure)
  - `@prisma/client` (ORM)
  - `express`, `fastify`, `koa` (HTTP frameworks)
  - `react`, `next` (frontend frameworks)
  - `pg`, `mysql`, `redis`, `mongodb` (database drivers)
  - `@aws-sdk/*`, `@azure/*` (cloud SDKs)

### Application Layer (`packages/application/`)

- **CAN import**: `@intelliflow/domain`, pure utilities
- **MUST NOT import**:
  - `@intelliflow/adapters` (outer layer)
  - `@intelliflow/db` (infrastructure)
  - `@prisma/client` (ORM)
  - `express`, `fastify` (HTTP frameworks)
  - `react`, `next` (frontend frameworks)
  - `pg`, `mysql`, `redis` (database drivers)

### Adapters Layer (`packages/adapters/`)

- **CAN import**: `@intelliflow/domain`, `@intelliflow/application`,
  infrastructure packages
- **SHOULD**: Implement port interfaces defined in application layer

## CI Enforcement

These tests run in CI as a **required check** (see `.github/workflows/ci.yml`):

```yaml
architecture:
  name: Architecture Tests
  runs-on: ubuntu-latest
  steps:
    - name: Run architecture boundary tests
      run: cd tests/architecture && pnpm test
```

The build job depends on architecture tests:

```yaml
build:
  needs: [lint, typecheck, test, architecture]
```

Any violations will:

- Fail the pull request checks
- Prevent merging to main branch
- Generate detailed violation reports in the CI summary

## ESLint Integration

In addition to these tests, ESLint rules in `.eslintrc.js` provide immediate
feedback during development via `no-restricted-imports`.

## Violation Examples

If you see a violation like:

```
Domain layer violations:
  - packages/domain/src/entities/Lead.ts:5 - @prisma/client
```

This means `Lead.ts` is importing from `@prisma/client`, which is forbidden in
the domain layer.

## Fixing Violations

1. **Domain violations**: Move infrastructure code to adapters layer. Create
   repository interfaces (ports) in application layer.

2. **Application violations**: Use ports (interfaces) instead of concrete
   implementations. The adapter layer provides the implementations.

3. **Package.json violations**: Remove forbidden dependencies from the package's
   `package.json`.

## Adding New Forbidden Patterns

To add new dependency rules:

1. Update the test file (e.g., `domain-dependencies.test.ts`)
2. Add the pattern to `FORBIDDEN_DOMAIN_IMPORTS` or equivalent array
3. Update `.eslintrc.js` with the new pattern for IDE feedback
4. Run tests locally to verify
5. Update documentation

## Related Resources

- [ADR-010: Architecture Boundary Enforcement](../../docs/planning/adr/ADR-010-architecture-boundary-enforcement.md)
- [Hexagonal Architecture Documentation](../../docs/architecture/hex-boundaries.md)
- [IFC-131 Task](../../apps/project-tracker/docs/metrics/_global/Sprint_plan.csv)
