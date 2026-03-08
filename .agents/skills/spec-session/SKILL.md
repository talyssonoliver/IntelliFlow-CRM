---
name: spec-session
description: Run a multi-round specification session with parallel sub-agents. Generates a unified specification document through structured discussion. Phase 1 of the MATOP workflow.
---

# Spec Session Skill

Runs a multi-agent specification session with ANALYSIS → PROPOSAL → CHALLENGE → CONSENSUS rounds. Always uses file citations — analysis without file references is INVALID.

## Shared Workflow Library

Reference: `tools/scripts/lib/workflow/`
Key functions: `SESSION_CONFIG.spec`, `getTaskPaths()`, `getSprintForTask()`, `canProceedToSession()`, `getSessionStartStatus()` → "Specifying", `getSessionSuccessStatus()` → "Spec Complete"

## Status Updates (MANDATORY)

| Event | Status | Percent Complete |
|-------|--------|-----------------|
| Session Start | `Specifying` | 10% |
| Session Success | `Spec Complete` | 20% |
| Session Failure | `Backlog` | (keep current) |

Also at START: if `Planned Start` is empty, set to today (YYYY-MM-DD).

Update `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv` with the Edit tool. **MANDATORY.**

## Phase Table

| Phase | Action | Reference |
|-------|--------|-----------|
| 0 | Context hydration | **references/context-and-agents.md** |
| 0.5 | Agent selection (3-5 agents) | **references/context-and-agents.md** |
| 0.75 | Codebase exploration (invoke `/spec-exploration`) | **references/context-and-agents.md** |
| 0.9 | Dependency chain verification | **references/dependency-verification.md** |
| 0.92 | UI reachability verification (PG-*/IFC-* UI tasks) | **references/dependency-verification.md** |
| 0.95 | Dependency deep verification | **references/dependency-verification.md** |
| 0.97 | PRD/ADR resolution — create or reference | **references/prd-adr-resolution.md** |
| 1 | Round 1 ANALYSIS (parallel agents, file citations) | **references/round-types.md** |
| 2 | Round 2 PROPOSAL (referencing actual code patterns) | **references/round-types.md** |
| 3 | Round 3 CHALLENGE (risks from code evidence) | **references/round-types.md** |
| 4+ | Round 4 CONSENSUS (invoke `/spec-consensus`) | **references/round-types.md** |
| 5 | Generate unified specification | **references/output-format.md** |

## Agent Mode

| Mode | When Used | Communication |
|------|-----------|---------------|
| Subagent (default) | Teams disabled or <3 agents | Agents report to lead only |
| Agent Team | `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` AND >=3 agents | Agents message each other directly |

**See references/spawning-agents.md** for Task tool prompts and TeamCreate patterns.

## Anti-Patterns (REJECT these)

- No tool calls in exploration phase
- Analysis without file:line citations
- "Based on the context provided..." without file verification
- Proposals that don't reference existing code patterns
- Specs that add a server route/procedure/action but never identify the production caller that will use it
- Specs that describe "server-side hardening" while leaving the existing client-side or legacy bypass path unspecified
- Test requirements that only name new files and omit existing regression suites affected by the change
- Security fixes without explicit negative-path validation (mismatch, denial, fallback, timeout, etc.)

## Output Paths

```
.specify/sprints/sprint-{N}/
├── context/<TASK_ID>/
│   ├── <TASK_ID>-hydrated-context.json
│   ├── <TASK_ID>-hydrated-context.md
│   └── <TASK_ID>-agent-selection.json
└── specifications/
    ├── <TASK_ID>-spec.md
    └── <TASK_ID>-discussion.md
```

## Related Commands

- `/spec-exploration` — Phase 0.75 sub-skill (codebase exploration)
- `/spec-consensus` — Round 4+ sub-skill (consensus detection)
- `/plan-session` — Next step after spec is complete
- `/matop-execute` — Full MATOP workflow
