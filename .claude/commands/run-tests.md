# Run Tests Command

Execute tests across the monorepo with coverage and reporting.

## Usage

```
/run-tests [scope] [--coverage] [--watch] [--e2e]
```

## Arguments

- `scope`: Workspace or test path filter
- `--coverage`: Generate coverage report
- `--watch`: Run in watch mode (TDD)
- `--e2e`: Run Playwright E2E tests

## Test Types

### Unit Tests (Vitest)

```bash
# All unit tests
/run-tests

# Specific package
/run-tests @intelliflow/domain

# With coverage
/run-tests --coverage
```

### Integration Tests

```bash
# API integration tests
/run-tests apps/api --coverage

# Database integration
/run-tests packages/db
```

### E2E Tests (Playwright)

```bash
# All E2E tests
/run-tests --e2e

# Specific flow
/run-tests --e2e tests/e2e/lead-capture.spec.ts
```

## Coverage Targets

| Layer       | Target |
| ----------- | ------ |
| Domain      | >95%   |
| Application | >90%   |
| API Routes  | >85%   |
| Overall     | >90%   |

## Output

- Test results summary
- Coverage report (if --coverage)
- Failed test details with stack traces
- Performance metrics

## Example

```bash
# TDD workflow
/run-tests packages/domain --watch

# Pre-commit check
/run-tests --coverage

# Full E2E suite
/run-tests --e2e --coverage
```
