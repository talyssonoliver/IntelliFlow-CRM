# Plan Session — Workflow Library & Agent Mode

## Shared Workflow Library

**IMPORTANT**: This command uses the shared workflow library for consistent
behavior with the UI.

Reference: `tools/scripts/lib/workflow/`

Key functions:

- `SESSION_CONFIG.plan` - Session configuration (statuses, paths)
- `getTaskPaths(sprintNumber, taskId)` - Get all artifact paths (sprint-based)
- `getSprintForTask(taskId, repoRoot)` - Look up sprint number from CSV
- `canProceedToSession(task, 'plan')` - Check prerequisites
- `getSessionStartStatus('plan')` - Returns "Planning"
- `getSessionSuccessStatus('plan')` - Returns "Plan Complete"

The shared library ensures both `/plan-session` CLI and UI "SESSION 2: Plan"
button use:

- Same status values (`Planning`, `Plan Complete`)
- Same output paths (`.specify/sprints/sprint-{N}/planning/`)
- Same prerequisite checks (spec must exist)

## Agent Mode Detection

This command supports an optional peer reviewer teammate when agent teams are
enabled.

| Mode                   | When Used                                                 | Behavior                                     |
| ---------------------- | --------------------------------------------------------- | -------------------------------------------- |
| **Subagent** (default) | Teams disabled OR simple task                             | Lead generates plan alone (current behavior) |
| **Agent Team**         | `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` AND complex task | Spawns a Plan-Reviewer teammate for critique |

**Complexity threshold** — a task is "complex" when ANY of:

- > 3 TDD phases in the decomposition
- > 5 files to create/modify
- Cross-package changes (touching ≥2 packages)

**Detection logic**: Plan session always defaults to subagent mode. Agent team
mode is opt-in — the lead checks the complexity threshold AFTER decomposing TDD
steps. If the threshold is met and teams are enabled, a reviewer is spawned.

**Token cost warning**: Spawning a Plan-Reviewer adds ~1x additional token cost
(single teammate). Only triggers for genuinely complex plans.

```typescript
import { resolveAgentMode } from './tools/scripts/lib/stoa/agent-mode.js';

// After TDD decomposition, check complexity
const tddPhases = plan.phases.length;
const fileCount = plan.files.length;
const crossPackage = plan.packages.size >= 2;
const isComplex = tddPhases > 3 || fileCount > 5 || crossPackage;

if (isComplex) {
  const mode = resolveAgentMode('plan', 1, 'team'); // force team for review
  if (mode === 'team') {
    // Spawn Plan-Reviewer teammate
    // Send draft plan for critique
    // Incorporate feedback
    // Shut down reviewer
  }
}
```
