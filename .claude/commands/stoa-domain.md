# Domain STOA Sub-Agent

Execute Domain STOA validation for business logic, API contracts, and data model
correctness.

## Usage

```
/stoa-domain <TASK_ID> [RUN_ID]
```

## Arguments

- `TASK_ID` (required): The task ID being validated
- `RUN_ID` (optional): The run ID from MATOP orchestrator. If not provided,
  generates a new one.

## Responsibility

The Domain STOA owns:

- Business/domain logic correctness
- API contract validation (tRPC)
- Database schema and migrations
- Domain model integrity (DDD)
- Entity and aggregate validation
- Repository pattern compliance
- Use case implementation
- Cross-context boundaries

## Gate Profile (Mandatory)

Execute these gates in order:

### Type Safety

```bash
# 1. TypeScript compilation (domain packages)
pnpm --filter @intelliflow/domain typecheck 2>&1 | tee "artifacts/reports/system-audit/$RUN_ID/gates/domain-typecheck.log"

# 2. API type checking
pnpm --filter @intelliflow/api typecheck 2>&1 | tee "artifacts/reports/system-audit/$RUN_ID/gates/api-typecheck.log"
```

### Domain Tests

```bash
# 3. Domain layer unit tests (>95% coverage required)
pnpm --filter @intelliflow/domain test 2>&1 | tee "artifacts/reports/system-audit/$RUN_ID/gates/domain-test.log"
```

### Integration Tests

```bash
# 4. API integration tests
pnpm run test:integration 2>&1 | tee "artifacts/reports/system-audit/$RUN_ID/gates/test-integration.log"
```

### Database Validation

```bash
# 5. Prisma schema validation
pnpm --filter @intelliflow/db db:generate 2>&1 | tee "artifacts/reports/system-audit/$RUN_ID/gates/prisma-generate.log"

# 6. Migration check (pending migrations)
pnpm --filter @intelliflow/db db:migrate status 2>&1 | tee "artifacts/reports/system-audit/$RUN_ID/gates/migration-status.log"
```

### Architecture Enforcement

```bash
# 7. Hexagonal architecture boundary check
pnpm exec depcruise --config .dependency-cruiser.cjs packages/domain packages/application --output-type err 2>&1 | tee "artifacts/reports/system-audit/$RUN_ID/gates/architecture-boundaries.log"
```

## Domain Layer Requirements

### Coverage Thresholds (Enforced)

| Layer                                 | Required Coverage |
| ------------------------------------- | ----------------- |
| Domain (`packages/domain/`)           | >95%              |
| Application (`packages/application/`) | >90%              |
| API Routes                            | >85%              |

### Hexagonal Architecture Rules

```
Domain CANNOT depend on:
- packages/adapters
- apps/*
- External infrastructure

Application CAN depend on:
- packages/domain
- Port interfaces only

Adapters CAN depend on:
- packages/application (ports)
- External libraries
```

## Verdict Logic

| Condition                                                  | Verdict |
| ---------------------------------------------------------- | ------- |
| All domain tests pass, types valid, no boundary violations | PASS    |
| Minor type warnings, tests pass                            | WARN    |
| Domain tests fail                                          | FAIL    |
| Architecture boundary violation                            | FAIL    |
| Pending migrations not applied                             | WARN    |
| Business rule violation detected                           | FAIL    |

## Verdict Output

Produce verdict file at:
`artifacts/reports/system-audit/$RUN_ID/stoa-verdicts/Domain.json`

```json
{
  "stoa": "Domain",
  "taskId": "<TASK_ID>",
  "verdict": "PASS|WARN|FAIL|NEEDS_HUMAN",
  "rationale": "Domain tests passed, no architecture violations",
  "toolIdsSelected": ["domain-typecheck", "domain-test", "test-integration"],
  "toolIdsExecuted": ["domain-typecheck", "domain-test", "test-integration"],
  "waiversProposed": [],
  "findings": [],
  "domainMetrics": {
    "entitiesValidated": 5,
    "aggregatesChecked": 3,
    "useCasesCovered": 12,
    "boundaryViolations": 0
  },
  "timestamp": "2025-12-20T14:30:00.000Z"
}
```

## When to Trigger

The Domain STOA is triggered when:

### By Task Prefix (Lead)

- `IFC-*` tasks (default for product features)

### By Keywords (Supporting STOA)

- `trpc`, `api`, `prisma`, `database`
- `schema`, `entity`, `aggregate`
- `domain`, `use case`, `repository`
- `migration`

### By Path Impact

- `apps/api/**`
- `packages/domain/**`
- `packages/application/**`
- `packages/db/**`
- `**/prisma/**`
- `**/schema/**`

## Example Output

```
[Domain STOA] Task: IFC-101
[Domain STOA] Running 5 gates...

  [1/5] domain-typecheck... PASS (3.2s)
  [2/5] api-typecheck... PASS (4.1s)
  [3/5] domain-test... PASS (12.3s)
        - 45 tests passed
        - Coverage: 96.2%
  [4/5] test-integration... PASS (18.7s)
        - 23 integration tests passed
  [5/5] architecture-boundaries... PASS (2.1s)
        - No boundary violations

[Domain STOA] Verdict: PASS
[Domain STOA] Rationale: All domain tests passed, 96.2% coverage, no boundary violations
[Domain STOA] Output: artifacts/reports/system-audit/<RUN_ID>/stoa-verdicts/Domain.json
```

## Related Commands

- `/matop-execute` - MATOP orchestrator (spawns this sub-agent)
- `/stoa-foundation` - Foundation STOA sub-agent
- `/stoa-quality` - Quality STOA sub-agent
