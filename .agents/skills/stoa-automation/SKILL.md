---
name: stoa-automation
description:
  Execute Automation STOA validation for orchestration, validation rules,
  artifact contracts, sprint tracking infrastructure, and metrics registry
  integrity.
---

# Automation STOA Sub-Agent

Validates factory mechanics (swarm, orchestrator), artifact placement, sprint
tracking infrastructure, and metrics integrity. Also validates its own STOA
framework.

## Responsibility

- Factory mechanics (swarm, orchestrator)
- Validation rules and scripts
- Artifact placement contracts
- Sprint tracking infrastructure
- Metrics and registry integrity
- Audit/evidence generation
- CI/CD pipeline automation
- STOA framework self-validation

## Gate Table

| #   | Gate                      | Command                                     | Reference                  |
| --- | ------------------------- | ------------------------------------------- | -------------------------- | ------------ |
| 1   | Sprint 0 validation       | `pnpm run validate:sprint0`                 | Sprint data                |
| 2   | Sprint data validation    | `pnpm run validate:sprint-data`             | Data integrity             |
| 3   | Artifact paths linting    | `tsx tools/lint/artifact-paths.ts`          | Path contracts             |
| 4   | Task registry consistency | `tsx tools/scripts/validate-sprint-data.ts` | Registry check             |
| 5   | CSV uniqueness            | `git ls-files                               | grep -c 'Sprint_plan.csv'` | Must equal 1 |
| 6   | Metrics sync check        | `pnpm run sync:metrics --check`             | CSV sync                   |

**See references/gate-definitions.md** for full commands, log paths, forbidden
location rules, self-validation code, and execution code.

## Canonical File Locations

| File               | Expected Location                                     | Check            |
| ------------------ | ----------------------------------------------------- | ---------------- |
| Sprint_plan.csv    | `apps/project-tracker/docs/metrics/_global/`          | Uniqueness       |
| task-registry.json | `apps/project-tracker/docs/metrics/_global/`          | Derived from CSV |
| Task JSON files    | `apps/project-tracker/docs/metrics/sprint-0/phase-*/` | Schema valid     |

## Forbidden Locations

Runtime artifacts MUST NOT exist in:

- `apps/project-tracker/docs/metrics/.locks/**`
- `apps/project-tracker/docs/metrics/logs/**`
- `docs/**/*.tmp`, `docs/**/*.lock`

## Trigger Conditions

**Primary STOA**: `AUTOMATION-*` task prefix

**Supporting STOA** by keywords: `orchestrator`, `swarm`, `tracker`,
`validation`, `artifact`, `audit`, `sprint`, `metrics`, `registry`

**Supporting STOA** by path: `tools/scripts/**`, `tools/lint/**`,
`tools/audit/**`, `apps/project-tracker/**`, `.Codex/commands/**`

## Verdict Logic

There is **NO WARN verdict**. All verdicts are binary: PASS, FAIL, or
NEEDS_HUMAN.

| Condition                                                   | Verdict |
| ----------------------------------------------------------- | ------- |
| All validation scripts pass, artifacts in correct locations | PASS    |
| Sprint validation fails                                     | FAIL    |
| Artifact in forbidden location                              | FAIL    |
| Multiple Sprint_plan.csv copies                             | FAIL    |
| Registry inconsistent with CSV                              | FAIL    |
| Sync warnings present                                       | FAIL    |

## Evidence Bundle Requirements

Every MATOP run MUST produce:

- `summary.json` with resolved canonical paths
- `evidence-hashes.txt` with SHA256 for all artifacts
- `gate-selection.json` with execute/waiverRequired/skipped
- `stoa-verdicts/<STOA>.json` for each signing STOA

**See references/gate-definitions.md** for verdict JSON schema, self-validation
code, and example output.

## Usage

```
/stoa-automation <TASK_ID> [RUN_ID]
```

- `TASK_ID` (required): Task ID being validated
- `RUN_ID` (optional): Run ID from MATOP orchestrator
