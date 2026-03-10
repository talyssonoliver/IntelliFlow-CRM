# Phase 3: MATOP Validation

## Step 1: Run Mandatory Baseline

These commands run ONCE before any STOA agent spawns. If any fails, MATOP = FAIL immediately.

```bash
pnpm run typecheck    # TypeScript compilation (all packages via turbo)
pnpm run build        # Build validation (SSR/CSR, bundles, imports)
pnpm run lint         # ESLint --max-warnings=0
pnpm run format:check # Prettier formatting
```

**NON-WAIVABLE.** No STOA agents are spawned if baseline fails.

## Step 2: STOA Selection

Analyze task characteristics and assign STOAs. The canonical selection table lives in `matop-execute/references/stoa-selection.md`.

### Primary STOA (by task ID prefix)

| Prefix | Primary STOA |
|--------|--------------|
| `ENV-*`, `EP-*` | Foundation |
| `IFC-*` | Domain |
| `PG-*` | Quality |
| `EXC-SEC-*`, `SEC-*` | Security |
| `AI-*`, `AI-SETUP-*` | Intelligence |
| `AUTOMATION-*` | Automation |
| (no match) | Domain (default) |

**Primary** = listed first in reports, runs first. All STOAs block equally — Primary has no extra authority.

### Supporting STOAs (by keywords in spec/plan)

| Keywords | STOA |
|----------|------|
| auth, jwt, token, session, rbac, permissions, secret | Security |
| coverage, e2e, test, vitest, playwright, mutation | Quality |
| prompt, agent, chain, embedding, llm, langchain, crewai | Intelligence |
| docker, ci, deployment, infra, observability | Foundation |
| trpc, api, prisma, database, schema, entity, domain | Domain |
| orchestrator, swarm, tracker, validation, sprint, metrics | Automation |

**Foundation is always added** as supporting (for its unique gates).

## Step 3: Plan-Defined Regression Matrix (MANDATORY)

Before spawning STOA agents, read the plan's `## Validation Matrix` section and execute every listed command.

Rules:
- Every command in the matrix must be executed, logged, and must exit 0
- The matrix must cover new tests and touched existing regression suites
- Do not replace a failing broad run with a smaller passing subset; broaden or fix until the matrix is green

Save logs alongside the other validation artifacts.

## Step 4: Spawn STOA Sub-Agents

Each STOA runs ONLY its unique gates (baseline already handled typecheck/build/lint/format).

STOA agents defined in `.claude/agents/stoa-*.md`. Use Task tool with `subagent_type: "general-purpose"` **in parallel**:

```
Task(
  subagent_type: "general-purpose",
  name: "stoa-foundation",
  prompt: "Execute Foundation STOA validation for task {{task_id}}, run ID {run_id}. Run /stoa-foundation {{task_id}} {run_id}"
)
```

### What each STOA runs (unique gates only)

| STOA | Unique Gates |
|------|-------------|
| Foundation | Artifact-path lint, Docker config, Dependency architecture |
| Domain | Domain tests (>95%), Integration tests, Prisma schema, Migration status, Architecture boundaries |
| Quality | Test coverage (90%), Integration tests, E2E, Mutation testing, SonarQube, Lighthouse |
| Security | Gitleaks, pnpm audit, Snyk, Semgrep, Trivy |
| Intelligence | AI worker tests, Chain evaluation, Prompt validation, Model availability |
| Automation | Sprint validation, Sprint data, Artifact-path lint, Registry, CSV uniqueness, Metrics sync |

## Step 5: Aggregate Verdicts

Each STOA returns: PASS, FAIL, or NEEDS_HUMAN. There is **NO WARN verdict**.

- All PASS → **PASS**
- Any FAIL → **FAIL**
- Any NEEDS_HUMAN (no FAIL) → **NEEDS_HUMAN**

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
├── baseline/
│   ├── turbo-typecheck.log
│   ├── turbo-build.log
│   ├── turbo-lint.log
│   └── prettier-check.log
├── gates/
│   ├── validation-matrix-1.log
│   ├── validation-matrix-2.log
│   └── ... (STOA-specific gate logs)
└── stoa-verdicts/
    ├── Foundation.json
    ├── Security.json
    └── ...
```
