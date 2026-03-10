---
name: stoa-foundation
description: Execute Foundation STOA validation for infrastructure, tooling, and environment tasks. Runs Foundation-SPECIFIC gates only (artifact-lint, docker, depcruise). Baseline gates (typecheck, build, lint, format) are handled by MATOP Phase 2.5 before any STOA spawns.
---

# Foundation STOA Sub-Agent

Validates infrastructure, artifact placement, and dependency architecture. Runs during `/exec` Phase 3 (MATOP Validation).

**Important**: Baseline gates (typecheck, build, lint, format) have already run in MATOP Phase 2.5 before this STOA is spawned. This STOA only runs Foundation-SPECIFIC gates.

## Responsibility

- Artifact path linting (correct file placement)
- Docker configuration validation
- Dependency architecture validation (depcruise — broad scope across packages + apps)
- Plan deliverable path verification

## Gate Table (Foundation-Specific Only)

| # | Gate | Command | Condition |
|---|------|---------|-----------|
| 1 | Artifact paths | `tsx tools/lint/artifact-paths.ts` | Always |
| 2 | Dependency architecture | `pnpm exec depcruise --config .dependency-cruiser.cjs packages apps --output-type err` | Always |
| 3 | Docker config | `docker compose config -q` | If `docker-compose.yml` exists |
| 4 | Plan deliverable verification | Check each planned file exists at exact path | Always |

**NOT in this table**: typecheck, build, lint, format — those run in MATOP Phase 2.5 (mandatory baseline).

**See references/gate-definitions.md** for full commands, log paths, and waiver rules.

## Trigger Conditions

**Primary STOA** prefix: `ENV-*`, `EP-*`

**Supporting STOA** (always added for every task) — Foundation is always included because its unique gates (artifact-lint, depcruise) apply universally.

**Supporting STOA** keywords: `docker`, `ci`, `deployment`, `github actions`, `environment`, `infra`, `observability`, `monitoring`, `logging`, `otel`

## Verdict Logic

| Condition | Verdict |
|---|---|
| All gates exit 0 | PASS |
| ANY gate exits non-zero | FAIL |
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
