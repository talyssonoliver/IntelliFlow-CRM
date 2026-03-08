# Spec Session — Spawning Agents

## How to Spawn Agents

Agents are defined in `.claude/agents/`. You MUST use the **Task tool** to spawn them.

## Subagent Mode (default)

For EACH selected agent, spawn using the Task tool:

```
Task(
  subagent_type: "general-purpose",
  name: "<agent-name>",            // e.g., "backend-architect"
  description: "Spec round for <TASK_ID>",
  prompt: """
    Read your agent definition at .claude/agents/<agent-name>.md and follow its instructions.

    Task: <TASK_ID>
    Round: <ROUND_TYPE> (ANALYSIS | PROPOSAL | CHALLENGE | CONSENSUS)
    Spec path: .specify/sprints/sprint-{N}/specifications/<TASK_ID>-spec.md

    <Round-specific instructions from the round type section above>

    CRITICAL: You MUST use Read, Grep, Glob tools. Every observation must cite file:line.
  """
)
```

Spawn agents **in parallel** for each round (they are independent within a round):

```
# Round 1: ANALYSIS — spawn all agents in parallel
Task(name="backend-architect", ..., prompt="Round 1: ANALYSIS for <TASK_ID>. Read .claude/agents/backend-architect.md ...")
Task(name="domain-expert", ..., prompt="Round 1: ANALYSIS for <TASK_ID>. Read .claude/agents/domain-expert.md ...")
Task(name="test-engineer", ..., prompt="Round 1: ANALYSIS for <TASK_ID>. Read .claude/agents/test-engineer.md ...")
Task(name="data-engineer", ..., prompt="Round 1: ANALYSIS for <TASK_ID>. Read .claude/agents/data-engineer.md ...")

# Collect results, then Round 2: PROPOSAL — spawn in parallel with Round 1 context
# ... and so on for Round 3, Round 4
```

## Agent Team Mode (when `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` AND >=3 agents)

Use TeamCreate + Task with team_name:

```
1. TeamCreate(team_name: "spec-<TASK_ID>", description: "Spec session for <TASK_ID>")
2. For each agent:
   Task(
     subagent_type: "general-purpose",
     name: "<agent-name>",
     team_name: "spec-<TASK_ID>",
     prompt: "Read .claude/agents/<agent-name>.md. You are participating in a spec session team..."
   )
3. Use SendMessage for round coordination (broadcast round type + previous summary)
4. After consensus: shutdown all teammates, TeamDelete
```

**Detection**: `resolveAgentMode('spec', agents.length)` from `tools/scripts/lib/stoa/agent-mode.ts`
**Fallback**: If team creation fails, log error and continue with subagent mode.
