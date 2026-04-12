# Verification Checklist

Run all 10 gates after creating/updating files. Every gate is binary: PASS or
FAIL.

## Gate 1: Task ID Uniqueness

Verify the new ID does not exist anywhere:

- Grep task-registry.json for the exact ID
- Grep all Sprint_plan split files (A through E) for the ID

**FAIL** if the ID already exists.

## Gate 2: JSON Schema Compliance

Verify the task JSON against `task-status.schema.json`:

- `task_id` and `status` are present (required fields)
- `status` value is in the allowed enum
- No extra fields at any level (`additionalProperties: false` everywhere)
- `dependencies` object has only: `required`, `all_satisfied`, `verified_at`,
  `notes`
- `artifacts.created` items are objects with `path`, `sha256`, `created_at` (not
  strings)
- `kpis` values have `target`, `actual`, `met` (all required)
- `status_history` items have `status` and `at` (both required)
- ISO timestamps match pattern ending in `Z`

**FAIL** if any field violates the schema.

## Gate 3: Dependency IDs Exist

For every ID in the new task's `dependencies.required`:

- Verify the ID exists in dependency-graph.json `nodes`
- Verify the ID exists in task-registry.json

**FAIL** if any dependency ID is not found.

## Gate 4: No Circular Dependencies

Walk the dependency chain from the new task:

- Collect all transitive dependencies recursively
- The new task ID must NOT appear in the chain

**FAIL** if a cycle is detected.

## Gate 5: Artifact Path Plausibility

For each path in `artifacts.expected`:

- Verify the path follows the project's package structure
- Paths should start with recognized prefixes: `packages/`, `apps/`, `docs/`,
  `artifacts/`, `tools/`
- No absolute paths, no paths outside the monorepo

**FAIL** if any path looks implausible.

## Gate 6: PRD/ADR Governance

Based on the task prefix:

- PG-_ or IFC-_ with UI → PRD must exist or be created
- ENV-\* or architecture → ADR must exist or be created
- Other prefixes → governance satisfied automatically

Verify the PRD/ADR path is linked in the CSV Pre-requisites column.

**FAIL** if governance requires a document but none is linked.

## Gate 7: CSV Multi-Value Separators

Verify the CSV row:

- Multi-value fields (Dependencies, Dependency Types) use commas between task
  IDs
- Intra-field lists (Pre-requisites, Artifacts To Track, Validation Method) use
  semicolons
- No unescaped commas within a field (would break CSV column alignment)
- Fields with commas in their content are wrapped in double quotes

**FAIL** if separator convention is violated.

## Gate 8: $schema Relative Path

Verify the JSON file's `$schema` field resolves to `task-status.schema.json`:

- Count directory depth from JSON file to `docs/metrics/`
- Verify the relative path uses the correct number of `../` segments

**FAIL** if the path would not resolve to the schema file.

## Gate 9: Dependency Types Mirror

If the Dependencies column has values, verify:

- Dependency Types column has the same task IDs with `:FS` suffix
- Order matches
- Count matches

Example: Dependencies `IFC-002,IFC-131` → Dependency Types
`IFC-002:FS,IFC-131:FS`

**FAIL** if Dependency Types doesn't mirror Dependencies.

## Gate 10: Split Files Stale Reminder

After editing Sprint_plan.csv, the split files (A through E) become stale.

Remind the user:

```
Split files are now stale. Regenerate with:
  npx tsx tools/scripts/split-sprint-plan.ts

Then sync derived JSONs:
  curl -X POST http://localhost:3002/api/sync-metrics
  — OR —
  cd apps/project-tracker && npx tsx scripts/sync-metrics.ts
```

This gate always **PASSES** (informational only) but the reminder is mandatory.
