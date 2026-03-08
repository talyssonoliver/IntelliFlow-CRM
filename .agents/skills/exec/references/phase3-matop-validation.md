# Phase 3: MATOP Validation

## STOA Selection

Analyze task characteristics and select relevant STOAs:

| Keyword Pattern | STOA to Include |
|-----------------|-----------------|
| PG-*, component, page, UI | Foundation (lead) |
| auth, login, security, permission | Security |
| test, coverage, a11y, accessibility | Quality |
| FLOW-*, business logic, domain | Domain |
| AI, ML, embedding, model | Intelligence |
| CI, CD, pipeline, docker | Automation |

**Always include Foundation** (typecheck, build, lint).

## Baseline Gates (all tasks)

```bash
pnpm run typecheck    # turbo-typecheck
pnpm run build        # turbo-build
pnpm run lint         # turbo-lint
```

## Plan-Defined Regression Matrix (MANDATORY)

Before spawning STOA agents, read the plan's `## Validation Matrix` section and execute every listed command.

Rules:
- Every command in the matrix must be executed, logged, and must exit 0
- The matrix must cover new tests and touched existing regression suites
- Do not replace a failing broad run with a smaller passing subset; broaden or fix until the matrix is green

Save logs alongside the other validation artifacts.

## STOA-Specific Gates

- **Foundation**: artifact-validation
- **Security**: pnpm audit, csrf-validation, auth-security-review
- **Quality**: test-coverage (>80%), a11y-audit
- **Domain**: flow-compliance, business-logic-validation
- **Intelligence**: ai-performance-check
- **Automation**: infrastructure-validation

## Spawn STOA Sub-Agents

STOA agents defined in `.claude/agents/stoa-*.md`. Use Task tool with `subagent_type: "general-purpose"` **in parallel**:

```
Task(
  subagent_type: "general-purpose",
  name: "stoa-foundation",
  prompt: "Read .claude/agents/stoa-foundation.md. Execute all gates for task {{task_id}}, run ID {run_id}."
)
```

## Aggregate Verdicts

Each STOA returns: PASS, WARN, or FAIL.

- All PASS → **PASS**
- Any FAIL → **FAIL**
- No FAIL but any WARN → **WARN**

## Sub-Agent Coordination

Track STOA sub-agent progress using TodoWrite:

1. Create a task list entry per STOA agent spawned
2. Mark each as `in_progress` when spawned via Task tool
3. Collect verdicts as each agent completes
4. Mark `completed` when verdict received
5. Aggregate only after ALL spawned agents have returned

This prevents premature consensus calculation if a STOA agent is still running.

## Save Evidence

```
.specify/sprints/sprint-{N}/execution/{{task_id}}/{run_id}/matop/
├── gate-selection.json
├── validation-matrix.json
├── gates/
│   ├── turbo-typecheck.log
│   ├── turbo-build.log
│   ├── turbo-lint.log
│   ├── validation-matrix-1.log
│   ├── validation-matrix-2.log
│   └── ... (STOA-specific)
└── stoa-verdicts/
    ├── Foundation.json
    ├── Security.json
    └── ...
```
