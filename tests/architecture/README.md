# Architecture Tests

This directory contains tests that enforce hexagonal architecture boundaries in
the IntelliFlow CRM codebase.

## Purpose

These tests ensure that:

1. **Domain layer** remains pure business logic with no infrastructure
   dependencies
2. **Application layer** depends only on domain, not on infrastructure
3. **Adapters layer** implements infrastructure concerns without polluting
   domain

## Running Tests

```bash
# Run architecture tests
cd tests/architecture
pnpm test

# Run in watch mode
pnpm test:watch
```

## Tests

### `boundary-tests.ts`

Scans TypeScript files to ensure import statements follow hexagonal architecture
rules:

- **Domain MUST NOT import** from `@intelliflow/application`,
  `@intelliflow/adapters`, or infrastructure libraries
- **Application MUST NOT import** from `@intelliflow/adapters` or infrastructure
  libraries
- **Adapters CAN import** from domain, application, and infrastructure

### `dependency-rules.ts`

Documents and validates the explicit dependency rules for each layer.

## How It Works

1. **File Scanning**: Recursively scans `.ts` files in each package
2. **Import Analysis**: Uses regex to extract import statements
3. **Rule Validation**: Checks imports against forbidden patterns
4. **CI Integration**: These tests run in CI and will fail the build if
   violations occur

## CI Enforcement

These tests are **required to pass** in CI. Any violations will:

- Fail the pull request checks
- Prevent merging to main branch
- Generate detailed violation reports

## Violation Examples

If you see a violation like:

```
Domain layer violations:
  - packages/domain/src/entities/Lead.ts
```

This means `Lead.ts` is importing from a forbidden package (e.g.,
`@intelliflow/adapters` or `@prisma/client`).

## Fixing Violations

1. **Domain violations**: Move infrastructure code to adapters layer
2. **Application violations**: Define ports (interfaces) in application,
   implement in adapters
3. **Adapter violations**: Generally allowed, but avoid if possible

## Adding New Rules

To add new dependency rules:

1. Update `boundary-tests.ts` with new forbidden patterns
2. Update `dependency-rules.ts` documentation
3. Run tests locally to verify
4. Commit changes
