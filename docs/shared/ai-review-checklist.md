# AI Output Review Checklist

This checklist provides comprehensive criteria for reviewing AI-generated
outputs in the IntelliFlow CRM project. Use this when evaluating code, tests, or
documentation produced by AI tools (Claude Code, GitHub Copilot, etc.).

## Overview

This document covers:

- **Code Review Criteria**: Standards for AI-generated code
- **Test Review Criteria**: Validating AI-generated tests
- **Documentation Review Criteria**: Ensuring docs meet standards
- **Security Review Requirements**: Critical security checks
- **Acceptance/Rejection Criteria**: Decision framework
- **Tracking Metrics**: Monitoring acceptance rates

---

## 1. Code Review Criteria for AI-Generated Code

### 1.1 Type Safety

- [ ] **No `any` types**: Code uses proper TypeScript types or `unknown` with
      type guards
- [ ] **Strict mode compatible**: Passes `pnpm run typecheck` without errors
- [ ] **Proper generics**: Generic types are appropriately constrained
- [ ] **Zod schemas aligned**: Runtime validation matches TypeScript types
- [ ] **tRPC types flow**: End-to-end type safety maintained from API to
      frontend

### 1.2 Architecture Compliance

- [ ] **Hexagonal boundaries respected**: Domain layer has zero infrastructure
      dependencies
- [ ] **Proper layering**:
  - Domain: Pure business logic, no imports from adapters/infrastructure
  - Application: Use cases via ports, no direct database access
  - Adapters: Infrastructure implementations only
- [ ] **No circular imports**: Dependency graph is acyclic
- [ ] **Aggregate boundaries**: Changes go through aggregate roots
- [ ] **Domain events used**: State changes emit appropriate events

### 1.3 DDD Compliance

- [ ] **Value objects used**: No primitive obsession (e.g., `Email`, `LeadScore`
      classes)
- [ ] **Entities properly identified**: Clear identity and lifecycle
- [ ] **Ubiquitous language**: Code uses domain terminology consistently
- [ ] **Repository pattern**: Data access abstracted through interfaces
- [ ] **Business rules encapsulated**: Logic in domain, not scattered across
      layers

### 1.4 Code Quality

- [ ] **Naming conventions**: camelCase variables, PascalCase classes,
      UPPER_SNAKE constants
- [ ] **Single responsibility**: Each function/class has one clear purpose
- [ ] **No code duplication**: DRY principle applied appropriately
- [ ] **Error handling**: Proper try/catch, custom error types, no silent
      failures
- [ ] **Logging present**: Structured logging for significant operations
- [ ] **No hardcoded values**: Magic numbers/strings use constants or config

### 1.5 AI-Specific Red Flags

- [ ] **No hallucinated imports**: All imports exist in the codebase
- [ ] **No fabricated APIs**: External service calls use real endpoints
- [ ] **No outdated patterns**: Code uses current library versions
- [ ] **No incomplete implementations**: Check for `TODO`, `FIXME`, placeholder
      code
- [ ] **No unnecessary abstractions**: AI may over-engineer simple solutions
- [ ] **Consistent with existing code**: Matches project conventions

---

## 2. Test Review Criteria for AI-Generated Tests

### 2.1 Coverage Requirements

- [ ] **Coverage thresholds met**:
  - Domain layer: >= 95% line coverage
  - Application layer: >= 90% line coverage
  - API routes: >= 85% endpoint coverage
  - Overall: >= 90% line coverage
- [ ] **All branches covered**: Edge cases and error paths tested
- [ ] **New code tested**: Every new function/method has corresponding tests

### 2.2 Test Quality

- [ ] **Tests are independent**: Can run in any order, no shared state
- [ ] **Meaningful test names**: Describe the scenario and expected outcome
- [ ] **AAA pattern followed**: Arrange-Act-Assert structure clear
- [ ] **Tests are deterministic**: Same input always produces same result
- [ ] **No flaky tests**: Tests don't randomly fail due to timing/state

### 2.3 Test Behavior

- [ ] **Test behavior, not implementation**: Assert outcomes, not internal
      methods
- [ ] **Minimal mocking**: Only mock external dependencies
- [ ] **Realistic test data**: Use representative data, not trivial examples
- [ ] **Error cases covered**: Tests verify exception handling
- [ ] **Boundary conditions**: Edge cases at limits tested

### 2.4 AI-Specific Test Issues

- [ ] **No snapshot over-reliance**: Snapshots used appropriately, not as crutch
- [ ] **Tests actually test something**: Not just "smoke tests" that always pass
- [ ] **No tautological tests**: Tests shouldn't just verify mocks
- [ ] **No false positives**: Tests fail when code is broken
- [ ] **Integration points tested**: Tests verify actual integrations work

### 2.5 Test Infrastructure

- [ ] **Proper test utilities**: Uses shared fixtures and helpers
- [ ] **Database tests isolated**: Each test has clean database state
- [ ] **Mocks properly typed**: Mock objects match interface contracts
- [ ] **No test pollution**: Tests clean up resources after execution

---

## 3. Documentation Review Criteria

### 3.1 JSDoc Standards

- [ ] **Public APIs documented**: All exported functions have JSDoc
- [ ] **Parameters documented**: @param with type and description
- [ ] **Return values documented**: @returns with type and meaning
- [ ] **Exceptions documented**: @throws for error conditions
- [ ] **Examples provided**: Complex APIs include usage examples

```typescript
/**
 * Calculates the lead score based on engagement metrics and AI analysis.
 *
 * @param lead - The lead entity to score
 * @param engagementData - Historical engagement metrics
 * @returns Promise resolving to a LeadScore value object (0-100)
 * @throws LeadNotFoundError if lead doesn't exist
 * @throws InsufficientDataError if engagement data is incomplete
 *
 * @example
 * const score = await calculateLeadScore(lead, metrics);
 * if (score.isHighPriority()) {
 *   await notifySalesTeam(lead);
 * }
 */
```

### 3.2 README/Documentation

- [ ] **Accurate descriptions**: Docs match actual implementation
- [ ] **Setup instructions work**: Commands execute successfully
- [ ] **Links valid**: No broken internal or external links
- [ ] **No outdated information**: Docs reflect current state
- [ ] **Clear structure**: Logical organization, easy to navigate

### 3.3 ADR Standards (Architecture Decision Records)

- [ ] **Context clear**: Problem and constraints explained
- [ ] **Decision stated**: What was decided and why
- [ ] **Consequences documented**: Trade-offs acknowledged
- [ ] **Status accurate**: Proposed/Accepted/Deprecated/Superseded
- [ ] **Alternatives listed**: Other options considered

### 3.4 AI-Specific Documentation Issues

- [ ] **No fabricated references**: Links and citations are real
- [ ] **No invented features**: Docs describe actual capabilities
- [ ] **Consistent terminology**: Uses project's ubiquitous language
- [ ] **No contradictions**: Docs agree with code behavior
- [ ] **Version accuracy**: References correct library/tool versions

---

## 4. Security Review Requirements

### 4.1 Critical Security Checks

- [ ] **No secrets in code**: No API keys, passwords, tokens committed
- [ ] **No secrets in logs**: Logging doesn't expose sensitive data
- [ ] **Input validation**: All user inputs validated with Zod
- [ ] **SQL injection prevention**: Parameterized queries only
- [ ] **XSS prevention**: User content sanitized before rendering
- [ ] **CSRF protection**: Forms include CSRF tokens

### 4.2 Authentication/Authorization

- [ ] **Auth checks present**: Protected routes verify authentication
- [ ] **Authorization enforced**: Users access only their own data
- [ ] **No auth bypass**: No debug backdoors
- [ ] **Token validation**: JWTs validated before trusting claims
- [ ] **Session management**: Secure session handling

### 4.3 AI-Specific Security Risks

- [ ] **Prompt injection prevention**: AI inputs sanitized
- [ ] **LLM output validation**: AI responses validated before use
- [ ] **No sensitive data to LLMs**: Check what data is sent to AI services
- [ ] **Rate limiting on AI calls**: Prevent abuse of AI endpoints
- [ ] **Cost protection**: Guards against excessive AI API usage

### 4.4 Data Protection

- [ ] **PII minimized**: Only necessary personal data collected
- [ ] **Encryption in transit**: HTTPS enforced
- [ ] **Encryption at rest**: Sensitive data encrypted
- [ ] **Audit logging**: Security-relevant events logged
- [ ] **Data retention**: Compliance with data retention policies

---

## 5. Acceptance/Rejection Criteria

### 5.1 Automatic Rejection Triggers

The following issues require **immediate rejection** without further review:

1. **Security vulnerabilities**: Secrets, SQL injection, auth bypass
2. **Architecture violations**: Domain depending on infrastructure
3. **Failing tests**: CI/CD shows test failures
4. **Coverage below thresholds**: Below 90% overall
5. **Type errors**: TypeScript strict mode violations
6. **Linting errors**: ESLint failures not addressed
7. **Hallucinated code**: Non-existent imports, fake APIs
8. **Breaking changes without migration**: Undocumented breaking changes

### 5.2 Conditional Acceptance

May accept with modifications if:

- Minor naming convention issues (quick fix)
- Missing JSDoc on internal (non-exported) functions
- Suboptimal but correct implementation
- Missing edge case tests (if tracked as follow-up)
- Minor documentation gaps

### 5.3 Acceptance Criteria

Accept AI output when:

1. All security checks pass
2. Architecture boundaries respected
3. Tests pass with required coverage
4. TypeScript compiles without errors
5. Code follows project conventions
6. Documentation is complete
7. Performance targets met
8. No AI-specific red flags present

### 5.4 Decision Matrix

| Criteria      | Pass      | Fail     | Action            |
| ------------- | --------- | -------- | ----------------- |
| Security      | Required  | Reject   | Fix and resubmit  |
| Tests Pass    | Required  | Reject   | Fix failing tests |
| Coverage      | >= 90%    | < 90%    | Add missing tests |
| TypeScript    | No errors | Errors   | Fix type issues   |
| Architecture  | Valid     | Violated | Restructure code  |
| Documentation | Complete  | Missing  | Add docs          |
| Performance   | On target | Degraded | Optimize          |

---

## 6. Tracking Metrics

### 6.1 Acceptance/Rejection Ratio

Track the following metrics to monitor AI output quality:

```json
{
  "period": "2025-Q1",
  "metrics": {
    "total_ai_outputs_reviewed": 0,
    "accepted": 0,
    "accepted_with_modifications": 0,
    "rejected": 0,
    "acceptance_rate": 0.0,
    "rejection_reasons": {
      "security_issues": 0,
      "architecture_violations": 0,
      "test_failures": 0,
      "coverage_insufficient": 0,
      "type_errors": 0,
      "hallucinated_code": 0,
      "quality_issues": 0,
      "documentation_missing": 0
    }
  }
}
```

### 6.2 Metrics Collection

- **Record each AI output review** in `artifacts/metrics/ai-review-log.json`
- **Update weekly** with aggregated statistics
- **Review monthly** to identify patterns and improve prompts
- **Target acceptance rate**: >= 80% (with modifications acceptable)
- **Zero tolerance**: Security issues, architecture violations

### 6.3 Metrics Dashboard

Key metrics to display:

1. **Acceptance Rate**: `(accepted + accepted_with_modifications) / total`
2. **First-Pass Rate**: `accepted / total` (no modifications needed)
3. **Rejection Rate by Category**: Which issues cause most rejections
4. **Time to Review**: Average review duration
5. **Modification Frequency**: What changes are most common

### 6.4 Continuous Improvement

Use metrics to:

1. **Improve AI prompts**: Address common rejection reasons
2. **Update guidelines**: Add rules for frequent issues
3. **Train reviewers**: Focus on areas with inconsistent reviews
4. **Tool selection**: Compare quality across different AI tools
5. **Process refinement**: Optimize review workflow

---

## 7. Review Process Workflow

### 7.1 Pre-Review Preparation

1. Identify the AI tool used (Claude, Copilot, etc.)
2. Understand the task/prompt that generated the output
3. Check related existing code for context
4. Note any specific concerns from the requestor

### 7.2 Review Execution

1. **First pass**: Scan for obvious issues (security, architecture)
2. **Detailed review**: Go through each checklist section
3. **Run validations**: Execute tests, linting, type checks
4. **Document findings**: Record issues and their severity
5. **Make decision**: Accept, modify, or reject

### 7.3 Post-Review Actions

- **If accepted**: Merge with any minor modifications noted
- **If modifications needed**: Return with specific change requests
- **If rejected**: Document reasons, suggest alternative approach
- **Log metrics**: Update tracking data

---

## 8. Quick Reference Checklist

Copy this template for quick reviews:

```markdown
## AI Output Review

**AI Tool Used**: **\*\***\_\_\_**\*\*** **Task Description**:
**\*\***\_\_\_**\*\*** **Reviewer**: **\*\***\_\_\_**\*\*** **Date**:
**\*\***\_\_\_**\*\***

### Critical Checks (Required)

- [ ] No security vulnerabilities
- [ ] Architecture boundaries respected
- [ ] All tests pass
- [ ] Coverage thresholds met
- [ ] TypeScript strict mode passes
- [ ] No hallucinated imports/APIs

### Code Quality

- [ ] Follows naming conventions
- [ ] DDD principles applied
- [ ] Proper error handling
- [ ] No code duplication

### Tests

- [ ] Tests are meaningful
- [ ] Edge cases covered
- [ ] Tests are independent

### Documentation

- [ ] JSDoc on public APIs
- [ ] README updated if needed

### Decision

- [ ] Accept
- [ ] Accept with modifications
- [ ] Reject

**Notes**:

---
```

---

## Related Documents

- `docs/shared/review-checklist.md` - General PR review checklist
- `docs/shared/fallback-procedure.md` - Manual fallback when AI outputs fail
- `docs/tdd-guidelines.md` - Testing standards
- `CLAUDE.md` - Project architecture and conventions
