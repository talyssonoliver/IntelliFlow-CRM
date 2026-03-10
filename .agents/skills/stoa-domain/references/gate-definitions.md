# Domain STOA: Gate Definitions

## Baseline Gates — NOT Part of This STOA

TypeScript compilation (`pnpm run typecheck`) runs in MATOP Phase 2.5 (mandatory baseline) and covers ALL packages including `@intelliflow/domain` and `@intelliflow/api` via turbo. Do NOT re-run typecheck here.

## Domain-Specific Gates

```bash
# 1. Domain layer unit tests (>95% coverage required)
pnpm --filter @intelliflow/domain test 2>&1 | tee "artifacts/reports/system-audit/$RUN_ID/gates/domain-test.log"

# 2. API integration tests
pnpm run test:integration 2>&1 | tee "artifacts/reports/system-audit/$RUN_ID/gates/test-integration.log"

# 3. Prisma schema validation
pnpm --filter @intelliflow/db db:generate 2>&1 | tee "artifacts/reports/system-audit/$RUN_ID/gates/prisma-generate.log"

# 4. Migration check (pending migrations)
pnpm --filter @intelliflow/db db:migrate status 2>&1 | tee "artifacts/reports/system-audit/$RUN_ID/gates/migration-status.log"

# 5. Hexagonal architecture boundary check (domain-scoped)
pnpm exec depcruise --config .dependency-cruiser.cjs packages/domain packages/application --output-type err 2>&1 | tee "artifacts/reports/system-audit/$RUN_ID/gates/architecture-boundaries.log"
```

## Coverage Thresholds (Enforced)

| Layer | Required Coverage |
|---|---|
| Domain (`packages/domain/`) | >95% |
| Application (`packages/application/`) | >90% |
| API Routes | >85% |

## Hexagonal Architecture Rules

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

There is **NO WARN verdict**. All verdicts are binary: PASS, FAIL, or NEEDS_HUMAN.

| Condition | Verdict |
|---|---|
| All domain tests pass, types valid, no boundary violations | PASS |
| Domain tests fail | FAIL |
| Type errors (not warnings — actual errors) | FAIL |
| Architecture boundary violation | FAIL |
| Pending migrations not applied | FAIL |
| Business rule violation detected | FAIL |

## Verdict JSON Schema

```json
{
  "stoa": "Domain",
  "taskId": "<TASK_ID>",
  "verdict": "PASS|FAIL|NEEDS_HUMAN",
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

### By Task Prefix (Primary)
- `IFC-*` tasks (default for product features, also default fallback for unrecognized prefixes)

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
[Domain STOA] Note: Baseline (typecheck, build, lint, format) already passed in Phase 2.5
[Domain STOA] Running 5 domain-specific gates...

  [1/5] domain-test... PASS (12.3s)
        - 45 tests passed
        - Coverage: 96.2%
  [2/5] test-integration... PASS (18.7s)
        - 23 integration tests passed
  [3/5] prisma-generate... PASS (2.1s)
  [4/5] migration-status... PASS (1.3s)
  [5/5] architecture-boundaries... PASS (2.1s)
        - No boundary violations

[Domain STOA] Verdict: PASS
[Domain STOA] Rationale: All domain tests passed, 96.2% coverage, no boundary violations
[Domain STOA] Output: artifacts/reports/system-audit/<RUN_ID>/stoa-verdicts/Domain.json
```
