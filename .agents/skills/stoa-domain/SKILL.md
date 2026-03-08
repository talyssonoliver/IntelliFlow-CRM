---
name: stoa-domain
description: Execute Domain STOA validation for business logic, API contracts, and data model correctness. Validates domain tests (>95% coverage), hexagonal architecture boundaries, Prisma schema, and tRPC type safety.
---

# Domain STOA Sub-Agent

Validates business logic, API contracts, database schema, and domain model integrity.

## Responsibility

- Business/domain logic correctness
- API contract validation (tRPC type safety)
- Database schema and migrations (Prisma)
- Domain model integrity (DDD: entities, aggregates)
- Repository pattern compliance
- Use case implementation
- Hexagonal architecture boundaries (depcruise)

## Gate Table

| # | Gate | Command | Reference |
|---|------|---------|-----------|
| 1 | Domain TypeScript | `pnpm --filter @intelliflow/domain typecheck` | Type safety |
| 2 | API TypeScript | `pnpm --filter @intelliflow/api typecheck` | Type safety |
| 3 | Domain unit tests | `pnpm --filter @intelliflow/domain test` | >95% coverage |
| 4 | Integration tests | `pnpm run test:integration` | API contracts |
| 5 | Prisma schema | `pnpm --filter @intelliflow/db db:generate` | Schema valid |
| 6 | Migration status | `pnpm --filter @intelliflow/db db:migrate status` | No pending |
| 7 | Architecture boundaries | `pnpm exec depcruise --config .dependency-cruiser.cjs packages/domain packages/application --output-type err` | Hexagonal |

**See references/gate-definitions.md** for full commands, log paths, coverage thresholds by layer, hexagonal rules, execution code.

## Coverage Thresholds by Layer

| Layer | Required Coverage |
|---|---|
| Domain (`packages/domain/`) | >95% |
| Application (`packages/application/`) | >90% |
| API Routes | >85% |

## Hexagonal Architecture Rules

```
Domain CANNOT depend on: packages/adapters, apps/*, External infrastructure
Application CAN depend on: packages/domain, Port interfaces only
Adapters CAN depend on: packages/application (ports), External libraries
```

## Trigger Conditions

**Lead STOA**: `IFC-*` task prefix

**Supporting STOA** by keywords: `trpc`, `api`, `prisma`, `database`, `schema`, `entity`, `aggregate`, `domain`, `use case`, `repository`, `migration`

**Supporting STOA** by path: `apps/api/**`, `packages/domain/**`, `packages/application/**`, `packages/db/**`, `**/prisma/**`

## Verdict Logic

| Condition | Verdict |
|---|---|
| All domain tests pass, types valid, no boundary violations | PASS |
| Minor type warnings, tests pass | WARN |
| Domain tests fail | FAIL |
| Architecture boundary violation | FAIL |
| Business rule violation detected | FAIL |
| Pending migrations not applied | WARN |

## Output

Write verdict JSON to:
`artifacts/reports/system-audit/$RUN_ID/stoa-verdicts/Domain.json`

**See references/gate-definitions.md** for verdict JSON schema with domainMetrics and execution code.

## Usage

```
/stoa-domain <TASK_ID> [RUN_ID]
```

- `TASK_ID` (required): Task ID being validated
- `RUN_ID` (optional): Run ID from MATOP orchestrator
