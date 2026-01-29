# PR Review Checklist

Use this checklist when reviewing pull requests to ensure code quality,
security, and consistency across the IntelliFlow CRM codebase.

## Overview

This checklist covers:

- **Tests**: Verify test coverage and quality
- **Code Quality**: Ensure adherence to project standards
- **Security**: Identify potential vulnerabilities
- **Documentation**: Verify code is properly documented
- **Architecture**: Ensure architectural boundaries are respected
- **Performance**: Check for performance implications

## Tests

### Test Coverage

- [ ] **New code has tests**: All new features and bug fixes include tests
- [ ] **All tests pass**: CI/CD pipeline shows all tests passing (unit,
      integration, E2E)
- [ ] **Coverage thresholds met**: Coverage meets or exceeds requirements
  - [ ] Domain layer: ≥95% line coverage
  - [ ] Application layer: ≥90% line coverage
  - [ ] API routes: ≥85% endpoint coverage
  - [ ] Overall project: ≥90% line coverage
- [ ] **Edge cases covered**: Tests include boundary conditions and error
      scenarios
- [ ] **No skipped tests**: No `test.skip()` or `test.todo()` without
      justification in PR description

### Test Quality

- [ ] **Tests are independent**: Each test can run in isolation without
      dependencies on other tests
- [ ] **No test interdependence**: Tests don't rely on execution order or shared
      state
- [ ] **Meaningful test names**: Test descriptions clearly explain what is being
      tested
- [ ] **Arrange-Act-Assert pattern**: Tests follow AAA structure for clarity
- [ ] **Minimal mocking**: Mocks are only used for external dependencies, not
      internal implementation
- [ ] **Test behavior, not implementation**: Tests validate outcomes, not
      internal methods

### Test Categories

- [ ] **Unit tests present**: Fast, isolated tests for business logic
- [ ] **Integration tests present** (if applicable): Tests for API endpoints and
      database interactions
- [ ] **E2E tests present** (if critical path): Playwright tests for critical
      user workflows

## Code Quality

### General Quality

- [ ] **No linting errors**: `pnpm run lint` passes with zero errors
- [ ] **Code is formatted**: `pnpm run format` has been run (Prettier)
- [ ] **TypeScript strict mode**: Code passes `pnpm run typecheck` without
      errors
- [ ] **No TypeScript `any` types**: Use proper types or `unknown` with type
      guards
- [ ] **No ESLint disable comments**: If present, include justification comment
- [ ] **Naming conventions followed**: Variables, functions, and classes use
      clear, descriptive names
  - Variables: camelCase (e.g., `leadScore`, `emailAddress`)
  - Classes: PascalCase (e.g., `LeadRepository`, `CreateLeadUseCase`)
  - Constants: UPPER_SNAKE_CASE (e.g., `MAX_RETRY_ATTEMPTS`)
  - Files: kebab-case for utilities, PascalCase for classes (e.g.,
    `lead-repository.ts`, `Lead.ts`)

### Architecture

- [ ] **Hexagonal architecture respected**: Domain code has no infrastructure
      dependencies
- [ ] **Architecture tests pass**: `packages/architecture-tests/` validates
      boundaries
- [ ] **Proper layering**:
  - [ ] Domain layer: Only business logic, no external dependencies
  - [ ] Application layer: Use cases coordinate domain logic via ports
  - [ ] Adapters layer: Infrastructure implementations
- [ ] **Dependency inversion**: High-level modules don't depend on low-level
      modules
- [ ] **No circular dependencies**: Import graph is acyclic

### SOLID Principles

- [ ] **Single Responsibility**: Each class/function has one clear purpose
- [ ] **Open/Closed**: Code is open for extension, closed for modification
- [ ] **Liskov Substitution**: Subtypes can replace base types without breaking
      behavior
- [ ] **Interface Segregation**: Interfaces are focused and client-specific
- [ ] **Dependency Inversion**: Depend on abstractions (ports), not concretions

### Domain-Driven Design

- [ ] **Entities use value objects**: Primitive obsession avoided (e.g.,
      `Email`, `LeadScore` instead of raw strings/numbers)
- [ ] **Aggregate boundaries respected**: Changes go through aggregate root
- [ ] **Domain events published**: State changes emit domain events
- [ ] **Ubiquitous language used**: Code uses domain terminology from bounded
      context

## Security

### Secrets & Sensitive Data

- [ ] **No hardcoded secrets**: No API keys, passwords, or tokens in code
- [ ] **Environment variables used**: Secrets loaded from `.env` files (not
      committed)
- [ ] **No sensitive data in logs**: Logs don't expose PII, credentials, or
      security tokens
- [ ] **No commented-out credentials**: Check for accidentally commented secrets

### Input Validation

- [ ] **All inputs validated**: User inputs validated with Zod schemas before
      processing
- [ ] **SQL injection prevention**: Prisma parameterized queries used (no raw
      SQL with user input)
- [ ] **XSS prevention**: User-generated content sanitized before rendering
- [ ] **CSRF protection**: Forms include CSRF tokens where applicable

### Authentication & Authorization

- [ ] **Auth checks present**: Protected routes verify authentication
- [ ] **Authorization enforced**: Users can only access/modify their own data
      (RLS or manual checks)
- [ ] **No auth bypass**: No backdoors or debug code that bypasses auth
- [ ] **JWT validation**: Tokens are validated before trusting claims

### Data Protection

- [ ] **HTTPS enforced**: No plain HTTP in production code
- [ ] **Passwords hashed**: Never store plain-text passwords (use bcrypt/argon2)
- [ ] **PII minimized**: Collect only necessary personal data
- [ ] **Secure headers**: Security headers configured (CSP, HSTS,
      X-Frame-Options)

## Performance

### Code Performance

- [ ] **No N+1 queries**: Database queries are optimized (use `include`/`select`
      in Prisma)
- [ ] **Proper indexing**: Database columns used in `WHERE` clauses are indexed
- [ ] **Efficient algorithms**: No unnecessary O(n²) or worse complexity
- [ ] **Lazy loading where appropriate**: Heavy resources loaded on-demand
- [ ] **Caching considered**: Expensive operations cached when possible (Redis)

### API Performance

- [ ] **Response time targets met**:
  - [ ] p95 < 100ms for simple queries
  - [ ] p99 < 200ms for complex operations
- [ ] **Pagination implemented**: Large result sets use cursor/offset pagination
- [ ] **Rate limiting configured**: API endpoints protected from abuse
- [ ] **Timeouts set**: Long-running operations have appropriate timeouts

### Frontend Performance

- [ ] **Bundle size checked**: No unnecessary dependencies added
- [ ] **Images optimized**: Use Next.js Image component for automatic
      optimization
- [ ] **Code splitting**: Large components lazy-loaded
- [ ] **Lighthouse score**: Target score ≥90 (run `pnpm run lighthouse`)

## Documentation

### Code Documentation

- [ ] **JSDoc comments**: Public APIs documented with JSDoc
- [ ] **Complex logic explained**: Non-obvious code includes explanatory
      comments
- [ ] **TODO comments tracked**: Any `TODO` comments reference a GitHub issue
- [ ] **No commented-out code**: Remove dead code instead of commenting

**Example JSDoc:**

```typescript
/**
 * Qualifies a lead based on AI-generated score and business rules.
 *
 * @param leadId - Unique identifier of the lead to qualify
 * @param score - AI-generated score between 0-100
 * @returns Qualified lead with updated status
 * @throws LeadNotFoundError if lead doesn't exist
 * @throws InvalidLeadScoreError if score is out of bounds
 */
async qualify(leadId: LeadId, score: LeadScore): Promise<Lead> {
  // Implementation
}
```

### Project Documentation

- [ ] **README updated**: If new setup steps or dependencies added
- [ ] **CHANGELOG updated**: Notable changes documented
- [ ] **ADR created** (if architectural change): Architecture Decision Record in
      `docs/planning/adr/`
- [ ] **API docs updated**: tRPC router changes reflected in generated docs
- [ ] **Migration guide** (if breaking change): Document upgrade path for
      consumers

### Sprint Plan Updates

- [ ] **Sprint_plan.csv updated**: If task completed, status changed to
      "Completed"
- [ ] **Task JSON created**: Metrics file created in
      `apps/project-tracker/docs/metrics/sprint-*/`
- [ ] **Artifacts created**: All artifacts from "Artifacts To Track" column
      present
- [ ] **KPIs validated**: All KPIs from sprint plan met and documented

## Deployment

### CI/CD

- [ ] **CI pipeline passes**: All GitHub Actions workflows succeed
- [ ] **Build succeeds**: `pnpm run build` completes without errors
- [ ] **Type checking passes**: `pnpm run typecheck` has zero errors
- [ ] **Migrations included**: Database migrations committed and tested

### Configuration

- [ ] **Environment variables documented**: New env vars added to `.env.example`
- [ ] **Feature flags configured**: New features use feature flags if applicable
- [ ] **Monitoring added**: New endpoints/features have appropriate
      logging/tracing
- [ ] **Error handling**: Errors are caught and reported to Sentry

## Breaking Changes

- [ ] **Breaking changes documented**: CHANGELOG clearly marks breaking changes
- [ ] **Deprecation warnings**: Old APIs log deprecation warnings before removal
- [ ] **Migration path provided**: Documentation explains how to upgrade
- [ ] **Version bump**: `package.json` version incremented appropriately
      (semver)

## Observability

### Logging

- [ ] **Structured logging**: Use logger with correlation IDs, not `console.log`
- [ ] **Log levels appropriate**:
  - `error`: Unhandled exceptions, failures
  - `warn`: Degraded behavior, retries
  - `info`: Significant events (user actions, state changes)
  - `debug`: Detailed diagnostics (dev only)
- [ ] **No excessive logging**: Production logs don't spam high-volume debug
      info

### Tracing

- [ ] **OpenTelemetry spans**: Critical operations create spans for distributed
      tracing
- [ ] **Trace context propagated**: Correlation IDs passed through async
      operations
- [ ] **Span attributes meaningful**: Spans tagged with useful metadata (user
      ID, lead ID, etc.)

### Metrics

- [ ] **Custom metrics added** (if applicable): New features emit Prometheus
      metrics
- [ ] **Dashboards updated**: Grafana dashboards updated for new metrics
- [ ] **Alerts configured**: Critical paths have alerting configured

## Accessibility (Frontend)

- [ ] **Semantic HTML**: Use proper HTML elements (`<button>`, `<nav>`,
      `<main>`)
- [ ] **ARIA labels**: Interactive elements have accessible labels
- [ ] **Keyboard navigation**: All interactive elements accessible via keyboard
- [ ] **Color contrast**: Text meets WCAG AA contrast requirements (4.5:1
      minimum)
- [ ] **Screen reader tested**: Critical flows tested with screen reader

## Final Checks

- [ ] **PR description complete**: PR describes what, why, and how of changes
- [ ] **Screenshots included** (if UI change): Before/after screenshots attached
- [ ] **Related issues linked**: PR references GitHub issues (Closes #123)
- [ ] **Self-review completed**: Author has reviewed their own changes
- [ ] **No merge conflicts**: Branch is up to date with target branch
- [ ] **Reviewers assigned**: Appropriate team members assigned for review

## Approval Criteria

A PR should only be approved if:

1. All tests pass
2. Coverage thresholds met
3. No security vulnerabilities introduced
4. Architecture boundaries respected
5. Code follows project conventions
6. Documentation is complete

## Common Rejection Reasons

PRs may be rejected for:

- **Failing tests**: CI/CD shows test failures
- **Insufficient coverage**: Coverage below 90% overall or layer-specific
  thresholds
- **Security issues**: Secrets committed, SQL injection risks, missing auth
  checks
- **Architecture violations**: Domain depending on infrastructure, circular
  dependencies
- **Missing documentation**: No JSDoc, README not updated, ADR missing for
  architectural change
- **Poor code quality**: ESLint errors, `any` types, commented-out code
- **Performance regressions**: Introduces N+1 queries, slow response times

## Questions?

If unsure about any checklist item:

1. Reference `docs/tdd-guidelines.md` for testing standards
2. Review `CLAUDE.md` for project architecture and conventions
3. Check existing code for examples
4. Ask the team in pull request comments

## Checklist Summary

Copy this template into PR comments for quick review:

```markdown
## Review Checklist

### Tests

- [ ] New code has tests
- [ ] All tests pass
- [ ] Coverage thresholds met (Domain ≥95%, Application ≥90%, Overall ≥90%)

### Code Quality

- [ ] No lint errors
- [ ] TypeScript strict mode passing
- [ ] Architecture boundaries respected
- [ ] SOLID principles followed

### Security

- [ ] No hardcoded secrets
- [ ] Input validation with Zod
- [ ] Auth/authz checks present
- [ ] No security vulnerabilities

### Documentation

- [ ] JSDoc on public APIs
- [ ] README/CHANGELOG updated
- [ ] Sprint plan updated (if applicable)

### Performance

- [ ] No N+1 queries
- [ ] Response time targets met
- [ ] Bundle size acceptable

### Deployment

- [ ] CI/CD passes
- [ ] Environment variables documented
- [ ] Migrations included
```
