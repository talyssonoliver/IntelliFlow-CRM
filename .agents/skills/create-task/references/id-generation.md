# Task ID Generation

## Procedure

1. **Determine prefix** from user intent:
   - `IFC-` — IntelliFlow Core features (domain logic, API, integrations)
   - `PG-` — Page/UI implementations (components, pages, layouts)
   - `ENV-*-AI` — Environment setup with AI automation
   - `EXC-*` — Exception/special tasks (one-off, cross-cutting)
   - `AI-SETUP-` — AI tooling configuration
   - `AUTOMATION-` — AI agent coordination
   - `EP-` — Engineering Process
   - `BRAND-` — Brand/design tasks
   - `DOC-` — Documentation tasks
   - `GTM-` — Go-to-market tasks
   - `SALES-` — Sales infrastructure
   - `GOV-` — Governance tasks
   - `ENG-OPS-` — Engineering operations
   - `PM-OPS-` — Project management operations
   - `ANALYTICS-` — Analytics features
   - `EXP-` — Experimental/exploration

2. **Scan task-registry.json** for all existing IDs with the prefix:

   ```
   Read apps/project-tracker/docs/metrics/_global/task-registry.json
   ```

   Extract all task IDs from `tasks_by_status` (all status arrays: DONE,
   PLANNED, BACKLOG, IN_PROGRESS, etc.).

3. **Fallback**: If registry seems incomplete, Grep across split CSV files:

   ```
   Grep pattern="^IFC-\d+" in Sprint_plan_A.csv through Sprint_plan_E.csv
   ```

4. **Allocate MAX + 1** — never fill gaps in the sequence.
   - Example: If IFC-182 is the highest, next is IFC-183.
   - For ENV-\*-AI: Extract numeric part (ENV-018-AI → 18), allocate 19 →
     ENV-019-AI.

5. **Collision check**: Grep the allocated ID across all split files and
   task-registry.json to confirm uniqueness.

## Special Prefix Rules

- **ENV-\*-AI**: Always ends with `-AI` suffix. Numeric part is zero-padded to 3
  digits (ENV-001-AI, ENV-019-AI).
- **EXC-\***: Uses descriptive slugs, not numbers (e.g., EXC-INIT-001,
  EXC-SEC-001). Scan existing EXC-\* IDs to avoid slug collision.
- **EXP-\***: Experimental prefix, uses descriptive slugs (e.g.,
  EXP-PLATFORM-001, EXP-SCRIPTS-001).

## ID Pattern Regex

All IDs must match the schema pattern: `^[A-Z]+-[A-Z0-9-]+$`

Examples of valid IDs:

- `IFC-183`, `PG-152`, `ENV-019-AI`, `EXC-SEC-002`, `AUTOMATION-003`

Examples of invalid IDs:

- `ifc-183` (lowercase), `IFC_183` (underscore), `IFC183` (no hyphen)
