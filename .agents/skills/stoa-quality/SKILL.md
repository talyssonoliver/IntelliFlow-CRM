---
name: stoa-quality
description:
  Execute Quality STOA validation for test coverage, quality gates, and CI
  enforcement. Validates test execution, coverage thresholds (90%), regression
  prevention, and performance benchmarks.
---

# Quality STOA Sub-Agent

Validates test coverage, quality gates, and CI enforcement.

## Responsibility

- Test strategy and execution (unit/integration/e2e)
- Coverage enforcement (90% thresholds)
- Regression prevention
- Lint and typecheck enforcement
- Mutation testing (when enabled)
- Performance benchmarks and Lighthouse CI

## Gate Table

| #   | Gate               | Command                                    | Condition                 |
| --- | ------------------ | ------------------------------------------ | ------------------------- |
| 1   | Test with coverage | `pnpm exec turbo run test:coverage`        | Always                    |
| 2   | Integration tests  | `pnpm run test:integration`                | If defined                |
| 3   | E2E tests          | `pnpm run test:e2e`                        | UI-impacting changes      |
| 4   | Mutation testing   | `pnpm exec stryker run`                    | If `ENABLE_MUTATION=true` |
| 5   | SonarQube          | `node scripts/sonarqube-helper.js analyze` | If `SONAR_TOKEN` set      |
| 6   | Lighthouse CI      | `pnpm exec lighthouse-ci autorun`          | If `RUN_LIGHTHOUSE=true`  |

**See references/gate-definitions.md** for full commands, log paths, coverage
parsing code, and execution TypeScript.

## Coverage Thresholds (Enforced)

| Metric     | Threshold | Action if Below |
| ---------- | --------- | --------------- |
| Statements | 90%       | FAIL            |
| Branches   | 90%       | FAIL            |
| Functions  | 90%       | FAIL            |
| Lines      | 90%       | FAIL            |

CRITICAL: `vitest.config.ts` MUST have `thresholdAutoUpdate: false`. If `true`,
gate is ineffective — report NEEDS_HUMAN.

## Verdict Logic

There is **NO WARN verdict**. All verdicts are binary: PASS, FAIL, or
NEEDS_HUMAN.

| Condition                           | Verdict     |
| ----------------------------------- | ----------- |
| Coverage >= 90%, all tests pass     | PASS        |
| Coverage below 90%                  | FAIL        |
| Tests fail                          | FAIL        |
| Coverage enforcement not configured | NEEDS_HUMAN |

## Trigger Conditions

**Primary STOA**: `PG-*` task prefix (page implementations need test coverage,
E2E, Lighthouse)

**Supporting STOA** by keywords: `coverage`, `e2e`, `test`, `vitest`,
`playwright`, `mutation`, `quality gate`, `sonarqube`, `lighthouse`

**Supporting STOA** by path: `tests/`, `*.test.*`, `*.spec.*`, `*coverage*`,
`*vitest*`, `*playwright*`

## Output

Write verdict JSON to:
`artifacts/reports/system-audit/$RUN_ID/stoa-verdicts/Quality.json`

**See references/gate-definitions.md** for full verdict JSON schema with metrics
and execution code.

## Usage

```
/stoa-quality <TASK_ID> [RUN_ID]
```

- `TASK_ID` (required): Task ID being validated
- `RUN_ID` (optional): Run ID from MATOP orchestrator
