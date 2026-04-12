# Plan Session — Plan Reviewer (ALWAYS Spawn)

## CRITICAL: How to Spawn the Plan Reviewer

The Plan-Reviewer agent is defined at `.claude/agents/plan-reviewer.md`. It MUST
be spawned for ANY task — not just "complex" tasks. Previous plans (PG-032,
PG-137) had 12+ gaps each that only surfaced during /exec.

### When to Spawn (ALWAYS)

After generating the draft plan and BEFORE writing the final version, spawn the
reviewer:

```
Task(
  subagent_type: "general-purpose",
  name: "plan-reviewer",
  description: "Review plan for <TASK_ID>",
  prompt: """
    Read your agent definition at .claude/agents/plan-reviewer.md and follow ALL review categories.

    Task: <TASK_ID>
    Sprint: {N}
    Spec: .specify/sprints/sprint-{N}/specifications/<TASK_ID>-spec.md
    Draft Plan: .specify/sprints/sprint-{N}/planning/<TASK_ID>-plan.md
    Sprint_plan.csv: apps/project-tracker/docs/metrics/_global/Sprint_plan.csv

    You MUST:
    1. Read the spec FIRST
    2. Read the draft plan
    3. Read the Sprint_plan.csv row for this task
    4. Execute ALL review categories defined in the agent
    5. Build the traceability matrix (every AC/NF from spec must map to a plan step)
    6. Audit the Files Summary count, runtime wiring checks, and validation matrix
    7. Return verdict: APPROVE or REVISE with specific fix list

    CRITICAL: Do NOT approve plans with known gaps. Previous plans had 12+ gaps
    that wasted entire exec cycles. Your job is to catch ALL issues NOW.
  """
)
```

### Handling REVISE Verdict

If the reviewer returns REVISE:

1. Apply ALL fixes from the reviewer's issue table
2. Re-write the plan file
3. Re-spawn the reviewer to verify fixes
4. Repeat until APPROVE or max 3 iterations

### Handling APPROVE Verdict

If the reviewer returns APPROVE:

1. Write the final plan file
2. Proceed with CSV status update and metrics recording

### What the Reviewer Checks (from PG-032/PG-137/Knip post-mortems)

- **Files Summary accuracy** — count matches actual files enumerated
- **Spec-to-plan AC traceability** — every AC/NF has a plan step
- **Test file completeness** — all spec-defined test files in plan
- **Test case coverage** — specific test cases from spec have checkboxes
- **Spec value consistency** — plan doesn't contradict spec values
- **Accessibility requirements** — ARIA, keyboard, focus management
- **Type/interface location clarity** — no ambiguous "import or define inline"
- **Dependency/package availability** — preflight checks for external packages
- **Hook/utility file coverage** — all spec architecture files in plan
- **CSV artifact alignment** — plan files match CSV "Artifacts To Track"
- **Effort estimate accuracy** — file counts match actual lists
- **Design mockup verification** — UI tasks have design comparison step
- **Non-functional requirements** — NF-\* items in validation checklist
- **Dependency chain update** — step to update chain docs
- **Backend API prerequisites** — formalized dependency section
- **Shared component references** — plan uses shared components from spec
- **Risk mitigation in code** — spec risks have plan mitigations
- **Layer order** — hexagonal architecture order maintained
- **Integration checkpoints** — validation after each phase
- **Plan structure** — plural block format, standard checkboxes
- **Coverage targets** — per-component targets from spec
- **Duplicate detection across monorepo** — search for same-named files before
  creating new ones
- **Cross-step import chain verification** — every created file has a planned
  consumer
- **Wiring verification for runtime code** — server actions called, handlers
  mounted, services registered
- **Direct consumer wiring** — new server routes/procedures/helpers are actually
  consumed by production code, not just created
- **Legacy bypass removal** — the plan names and retires any older path that
  would otherwise keep handling the behavior
- **Validation matrix completeness** — every step has exact commands, and final
  validation reruns touched existing suites
- **No vague validation placeholders** — reject `pnpm run test`, `run build`, or
  "verify manually" without scope when a scoped command is possible
- **Security failure-path coverage** — mismatch, denial, timeout, and fallback
  paths are represented when security logic changes

### Optional Plan Review (Agent Team Mode only)

When agent teams are enabled AND the task meets the complexity threshold:

1. Spawn a single **Plan-Reviewer** teammate
2. Send the draft plan to the reviewer via direct message
3. Reviewer critiques the plan against the specification:
   - **Completeness**: Are all spec acceptance criteria covered by TDD steps?
   - **Layer order**: Does the plan follow hexagonal architecture (Domain →
     Validators → Application → ...)?
   - **Coverage**: Are there test steps for every implementation step?
   - **Effort**: Are estimates realistic given task complexity?
   - **Integration checkpoints**: Are there enough verification gates?
4. Lead receives feedback via direct message
5. Lead incorporates feedback and writes the final plan
6. Reviewer shuts down (30s timeout)

If teams are disabled or the task is simple (≤3 TDD phases, ≤5 files, single
package): this optional extra review path is skipped. The standard Plan-Reviewer
pass above is still mandatory.
