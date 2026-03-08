---
name: stoa-foundation
description: Execute Foundation STOA validation for infrastructure, tooling, CI, and environment tasks. Validates TypeScript compilation, build, linting, Docker config, artifact paths, and dependency architecture.
---

# Foundation STOA Sub-Agent

Validates infrastructure, build, and tooling gates. Runs during `/exec` Phase 3 (MATOP Validation).

## Responsibility

- TypeScript compilation and build verification
- Linting (ESLint, Prettier) and commit linting
- Docker configuration validation
- Artifact path linting
- Dependency architecture validation (depcruise)
- Plan deliverable path verification

## Gate Table

| # | Gate | Command | Tier |
|---|------|---------|------|
| 1 | TypeScript compilation | `pnpm run typecheck` | Tier 1 — NON-WAIVABLE |
| 2 | Build validation | `pnpm --filter <pkg> build` | Tier 1 — NON-WAIVABLE |
| 3 | Linting | `pnpm exec eslint --max-warnings=0 .` | Tier 1 — NON-WAIVABLE |
| 4 | Formatting | `pnpm run format:check` | Tier 1 — NON-WAIVABLE |
| 5 | Artifact paths | `tsx tools/lint/artifact-paths.ts` | Foundation-specific |
| 6 | Dependency architecture | `pnpm exec depcruise --config .dependency-cruiser.cjs packages apps --output-type err` | Foundation-specific |
| 7 | Plan deliverable verification | Check each planned file exists at exact path | BLOCKING |

**See references/gate-definitions.md** for full commands, log paths, and waiver rules.

## Verdict Logic

| Condition | Verdict |
|---|---|
| All gates exit 0 | PASS |
| ANY gate exits non-zero | FAIL |
| Build fails OR typecheck fails | FAIL |
| Docker config invalid (infra tasks) | FAIL |
| Plan deliverable missing or at wrong path | FAIL |

**CRITICAL**: There is NO WARN verdict. All gates must exit 0 or the verdict is FAIL.

## Output

Write verdict JSON to:
`artifacts/reports/system-audit/$RUN_ID/stoa-verdicts/Foundation.json`

**See references/gate-definitions.md** for full verdict JSON schema and execution code.

## Usage

```
/stoa-foundation <TASK_ID> [RUN_ID]
```

- `TASK_ID` (required): Task ID being validated
- `RUN_ID` (optional): Run ID from MATOP orchestrator
