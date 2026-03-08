---
name: hydrate-context
description: Hydrate comprehensive context for a task before agent discussion or execution. Gathers task metadata, dependency artifacts, codebase patterns, and project knowledge.
---

# Context Hydration

## Overview

Gathers all necessary context for a task before agent discussion or execution.
Treats hydration as the input-gathering step of the requirements flow
(Elicitação → Análise).

Context is written to the sprint-based directory:
```
.specify/sprints/sprint-{N}/context/<TASK_ID>/
├── <TASK_ID>-hydrated-context.json    # Machine-readable context
├── <TASK_ID>-hydrated-context.md      # Human-readable context document
└── <TASK_ID>-agent-selection.json     # (if --select-agents flag)
```

## Hydration Phases

| Phase | What Happens | Reference |
|-------|-------------|-----------|
| 1. Task Metadata | Extract Task ID, section, status, dependencies, DoD, affected paths from Sprint_plan.csv | **See references/hydration-process.md §1** |
| 2. Dependency Artifacts | Find specs, plans, attestations, code files for all dependent tasks | **See references/hydration-process.md §2** |
| 3. Codebase Patterns | Search by task keywords; score by relevance; limit to max 20 patterns | **See references/hydration-process.md §3** |
| 4. Project Knowledge | Load AGENTS.md, ADRs, domain models, Prisma schemas | **See references/hydration-process.md §4** |
| 5. Context Hash | SHA256 hash of all content for integrity verification | **See references/hydration-process.md §5** |
| 6. Requirements Hook | Capture Necessidades dos Usuários, Informações de Domínio, Sistemas Existentes, Regulamentos, Leis; flag ADR gaps | **See references/hydration-process.md §6** |

## Context Structure

```typescript
interface HydratedContext {
  taskId: string;
  taskMetadata: Task;
  dependencyArtifacts: DependencyArtifact[];
  codebasePatterns: CodebasePattern[];
  projectKnowledge: {
    claudeMd: string;
    architectureDocs: string[];
    domainModels: string[];
    schemas: string[];
  };
  sources: HydrationSource[];
  hydratedAt: string;
  contextHash: string;
}
```

## Integration with MATOP

Context hydration is Phase 0 of the enhanced MATOP workflow:

```
Phase 0: Context Hydration  ← THIS COMMAND
Phase 0.5: Agent Selection
Phase 1: Spec Session
Phase 2: Plan Session
Phase 3: Gate Execution
```

When running `/matop-execute`, context hydration happens automatically.
Use this command for standalone context generation.

## Implementation

Uses the STOA library:

```typescript
import {
  hydrateContext,
  writeHydratedContext,
} from './tools/scripts/lib/stoa/context-hydration.js';

const context = await hydrateContext(taskId, repoRoot, '.specify');
const outputPath = writeHydratedContext(context, repoRoot, '.specify');
```

## Related Commands

- `/spec-session` — Run spec session with hydrated context
- `/plan-session` — Generate TDD execution plan
- `/matop-execute` — Full MATOP workflow (includes hydration)
