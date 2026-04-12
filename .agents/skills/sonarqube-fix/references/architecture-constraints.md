# SonarQube Fix — Architecture Constraints & Anti-Patterns

## Architecture Constraints (CRITICAL — Must maintain)

### 1. Hexagonal Architecture

- Domain layer CANNOT depend on infrastructure
- No adapters/infrastructure imports in `packages/domain/`
- Use ports/interfaces for external dependencies

### 2. Type Safety

- No `any` types (except well-justified cases)
- Strict null checks enforced
- Zod schemas for runtime validation

### 3. DDD Principles

- Entities, Value Objects, Aggregates maintained
- No anemic domain models
- Business logic in domain, not services

### 4. Test Coverage

- Domain: >95%
- Application: >90%
- Overall: >90%
- No regression in coverage

## Anti-Patterns to Avoid

1. **No quick hacks**
   - Don't suppress warnings with comments
   - Don't disable rules without justification
   - Don't sacrifice quality for speed

2. **No breaking changes**
   - Don't change public APIs without deprecation
   - Don't modify interfaces used across layers
   - Don't break existing tests

3. **No security compromises**
   - Don't disable security checks
   - Don't weaken validation
   - Don't expose sensitive data

4. **No technical debt**
   - Don't leave TODOs without tickets
   - Don't create "temporary" workarounds
   - Don't skip documentation

## Sub-Agent Coordination

Use TodoWrite to track sub-agent tasks:

```json
{
  "todos": [
    {
      "content": "Quality Agent: Analyze code smells in LeadService",
      "status": "in_progress",
      "activeForm": "Quality Agent analyzing code smells"
    },
    {
      "content": "Security Agent: Review authentication vulnerabilities",
      "status": "pending",
      "activeForm": "Security Agent reviewing auth"
    },
    {
      "content": "Automation Agent: Apply automated fixes",
      "status": "pending",
      "activeForm": "Automation Agent applying fixes"
    }
  ]
}
```

Spawn agents in parallel where possible:

```
Task tool with subagent_type='stoa-quality' for code quality
Task tool with subagent_type='stoa-security' for security
Task tool with subagent_type='stoa-automation' for automation
```
