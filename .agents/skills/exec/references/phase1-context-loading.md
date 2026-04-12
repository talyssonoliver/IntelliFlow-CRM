# Phase 1: Load Context

## 1. Read Specification

Parse `.specify/sprints/sprint-{N}/specifications/{{task_id}}-spec.md`:

- Extract acceptance criteria
- Extract functional requirements
- Extract non-functional requirements
- Extract test requirements

## 2. Read Plan

Parse `.specify/sprints/sprint-{N}/planning/{{task_id}}-plan.md`:

- Extract implementation steps
- Extract files to create/modify
- Extract TDD phases (RED, GREEN, REFACTOR)
- Extract validation checkpoints

## 3. Read Hydrated Context

Load
`.specify/sprints/sprint-{N}/context/{{task_id}}/{{task_id}}-hydrated-context.json`:

- Get relevant code patterns
- Get integration points
- Get type definitions
- Confirm requirements inputs (user needs, constraints, regs, existing systems)
  are present; if missing, pause and enrich the spec before coding

### 3.1 PRD/ADR Verification (MANDATORY)

Read the spec's `## Related Documents` section to extract PRD and ADR paths.

For each declared PRD/ADR path (not `N/A`):

1. Verify the file EXISTS on disk at the declared path
2. If missing → create it using the appropriate template before proceeding:
   - PRD template: `docs/planning/prd-template.md`
   - ADR template: `docs/planning/adr/template.md`
3. If the plan lists PRD/ADR under "Files to Modify", note them for Phase 2

If the spec has NO `## Related Documents` section (older spec format):

- Determine if PRD/ADR is needed based on task type (see rules below)
- Create the documents if needed and note for plan update

**PRD required**: Task prefix PG-_ or IFC-_ with UI components **ADR required**:
Task introduces new pattern/technology or ENV-\* infrastructure

### 3.2 Page Documentation Co-Change Detection (MANDATORY)

If the plan's "Files to Create:" sections include ANY `page.tsx` file:

1. **Read** `docs/design/PAGE_MAP_AND_FLOWS.md` — verify the task's new routes
   are documented
2. **Read** `docs/design/sitemap.md` — verify total page count will need
   updating
3. **Read** `docs/design/navigation-reachability-audit.md` — verify route is
   reachable

If the plan does NOT include PAGE_MAP_AND_FLOWS.md in "Files to Modify:",
**STOP** and add it. This prevents the most common documentation drift pattern:
pages ship without doc updates.

Cross-reference: plan-reviewer category CC enforces this at planning time. This
gate catches any plans that bypassed the reviewer or were created before CC was
added.

**Mandatory co-artifacts for page-creating tasks:**

- `FILE:docs/design/PAGE_MAP_AND_FLOWS.md` — route entry + total count update
- `FILE:docs/design/sitemap.md` — total count update (if page count changes)
- `FILE:docs/design/diagrams/complete-dependency-chains.md` — UI layer status
  update

## Phase 1.4: Preflight Checkbox Enforcement (MANDATORY)

After loading context, execute each preflight check in the plan's
`## Preflight Checks` section. For each item: run the verification, then
**immediately** use the Edit tool to check off the box:

```markdown
- [ ] Verify dependency X is complete → - [x] Verify dependency X is complete
```

**Rules:**

- ALL preflight checkboxes MUST be checked before Phase 2 begins
- If a preflight check fails, STOP — do not proceed to implementation
- Gate 1 (Phase 4.5) counts ALL checkboxes in the plan file, including
  preflights
- Unchecked preflights will cause Gate 1 to BLOCK

This prevents the "verified mentally but forgot to check the box" anti-pattern.

## Phase 1.5: Context Acknowledgement Gate (BLOCKING)

**STOP — This gate MUST pass before any implementation begins.**

If `Artifacts To Track` in Sprint_plan.csv contains
`EVIDENCE:...context_ack.json`:

### Step 0: Resolve Sprint Number (MANDATORY — do this FIRST)

**Before writing any attestation artifact**, look up the **Target Sprint**
column from `Sprint_plan.csv` for this task ID.

- Read the CSV row for `{{task_id}}`
- Extract the numeric value from the `Target Sprint` column
- If value is `Continuous` or empty → use `0`
- Store this as `{N}` for ALL paths in this phase

**NEVER infer the sprint number from context, session memory, or the current
execution sprint.** **NEVER use a sprint number from a previous session or from
the task's execution history.** The Target Sprint column in the CSV is the ONLY
valid source for `{N}`.

### Step 1: Check if required

Read task row → check for `EVIDENCE:` with `context_ack.json`. If NOT required →
skip to Phase 2.

### Step 2: Gather FILE: prerequisites

Parse `Pre-requisites` column → extract `FILE:` entries → verify each exists →
compute SHA256: `certutil -hashfile <path> SHA256`

### Step 2.5: Generate context_pack.md (MANDATORY)

Run the context pack builder to embed bounded excerpts of all FILE:
prerequisites:

```bash
npx tsx tools/scripts/build-context-pack-cli.ts {{task_id}} {run_id}
```

This creates two files at
`.specify/sprints/sprint-{N}/attestations/{{task_id}}/`:

- `context_pack.md` — bounded excerpts (120 lines max per file, 50KB total)
- `context_pack.manifest.json` — SHA256 hashes for cross-verification

**This step MUST run before context_ack.json creation.** The manifest provides
the expected hashes that the context_ack gate validates against.

### Step 3: Create context_ack.json

Write to
`.specify/sprints/sprint-{N}/attestations/{{task_id}}/context_ack.json`:

**FILENAME RULE**: The file MUST be named exactly `context_ack.json` (plain
name). Do NOT prefix with the task ID (e.g., `IFC-021-context_ack.json` is
WRONG). The task identity is encoded in the directory path, not the filename.

```json
{
  "task_id": "{{task_id}}",
  "run_id": "{run_id}",
  "files_read": [
    {
      "path": "relative/path",
      "sha256": "<64-char-hex>",
      "read_at": "<ISO-8601>"
    }
  ],
  "invariants_acknowledged": ["At least 5 task-specific invariants"],
  "created_at": "<ISO-8601>"
}
```

Requirements:

- `files_read` MUST include ALL `FILE:` prerequisites
- `sha256` MUST be real hashes, NEVER all-zeros
- `invariants_acknowledged` >= 5 entries, each specific to the task

### Step 4: Validate

Verify: file exists, valid JSON, task_id matches, file count >= prerequisites,
no all-zero hashes, >= 5 invariants.

**BLOCKING**: All checks pass → proceed. Any failure → fix before implementing.
