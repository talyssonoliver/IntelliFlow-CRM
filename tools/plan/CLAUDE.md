# tools/plan - Plan Governance (Python, wired by inline path)

## Purpose

`tools/plan` is **Python** tooling (hexagonal / ports-and-adapters) that
validates and migrates the IntelliFlow sprint plan — task entities, dependency
graph (cycle + cross-sprint checks), validation rules, schema migration. Managed
via `pyproject.toml`; has its own `pytest` suite.

## How it is wired (IMPORTANT — inline path coupling, not an import)

- It is **not** a JS/TS package and has no workspace dependency. It is invoked
  at runtime by the project-tracker governance API:
  `apps/project-tracker/app/api/governance/migrate/route.ts` shells out
  `cd tools/plan && <python> -m src.adapters.cli migrate [--dry-run]` with
  `cwd = process.cwd()/../..` (repo root).
- Also referenced by path in `infra/monitoring/pipeline-status.yaml`
  (`location: tools/plan/`) and the CSV wiring scripts.

## Pitfalls

- The coupling is a **hardcoded relative path + CWD assumption**.
  Moving/renaming `tools/plan`, or changing the CLI module path
  (`src.adapters.cli`), silently breaks the governance migrate route — update
  both sides together.
- Requires a working Python interpreter on the host (route resolves it via
  `getPythonCommand`); not covered by `pnpm`/Turbo.

## Code Map

- `src/domain/` — task, dependency_graph, validation_rules (no deps).
- `src/application/` — `lint_plan.py`, `migrate_schema.py`.
- `src/adapters/` — `cli.py` (entry), `csv_repository.py`, `json_writer.py`,
  `yaml_loader.py`.
