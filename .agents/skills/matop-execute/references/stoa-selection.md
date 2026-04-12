# MATOP: STOA Selection & Spawning

## Architecture: Mandatory Baseline + STOA Agents

```
┌─────────────────────────────────────────────────────┐
│  Phase 2.5: MANDATORY BASELINE (runs ONCE, always)  │
│  typecheck → build → lint → format                   │
│  If ANY fails → MATOP = FAIL (no STOAs spawned)      │
└──────────────────────┬──────────────────────────────┘
                       │ All pass
                       ▼
┌─────────────────────────────────────────────────────┐
│  Phase 3: STOA AGENTS (only UNIQUE gates per STOA)  │
│  Each STOA runs gates that baseline doesn't cover    │
│  All STOAs block equally — Primary is for ordering   │
└─────────────────────────────────────────────────────┘
```

**Key principle**: Baseline gates are NOT part of any STOA. They run once as a
prerequisite. STOAs only run their domain-specific gates. No duplication.

## Agent Mode Detection

| Mode                   | When Used                                             | MATOP Behavior                                 |
| ---------------------- | ----------------------------------------------------- | ---------------------------------------------- |
| **Subagent** (default) | Teams disabled or <2 STOAs                            | STOAs run gates independently, no peer sharing |
| **Agent Team**         | `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` AND ≥2 STOAs | STOAs share findings after gates complete      |

**Detection logic** (from `tools/scripts/lib/stoa/agent-mode.ts`):

1. Check `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` env var
2. Check `CLAUDE_CODE_IS_TEAMMATE` — if already a teammate, fall back to
   subagent (no nested teams)
3. For exec/matop sessions: require ≥2 STOAs for team mode

**Token cost warning**: Agent team mode uses ~4x tokens per STOA.

## Primary STOA Assignment (by Task ID Prefix)

**Primary** = listed first in reports, runs first. Does NOT have more authority
than other STOAs — all block equally.

| Prefix               | Primary STOA              |
| -------------------- | ------------------------- |
| `ENV-*`, `EP-*`      | Foundation                |
| `IFC-*`              | Domain                    |
| `PG-*`               | Quality                   |
| `EXC-SEC-*`, `SEC-*` | Security                  |
| `AI-*`, `AI-SETUP-*` | Intelligence              |
| `AUTOMATION-*`       | Automation                |
| (no match)           | Domain (default fallback) |

## Supporting STOA Triggers

### By Keywords

- **Foundation**: docker, ci, deployment, github actions, environment, infra,
  observability, monitoring, logging, otel
- **Security**: auth, jwt, token, session, rbac, permissions, secret, vault,
  rate-limit, csrf, xss, injection
- **Quality**: coverage, e2e, test, vitest, playwright, mutation, quality gate,
  sonarqube, lighthouse
- **Intelligence**: prompt, agent, chain, embedding, vector, scoring, llm,
  ollama, openai, langchain, crewai
- **Domain**: trpc, api, prisma, database, schema, entity, aggregate, domain,
  use case, repository, migration
- **Automation**: orchestrator, swarm, tracker, validation, artifact, audit,
  sprint, metrics, registry

### By Path Impact

- **Foundation**: `infra/`, `docker*`, `.github/`, `ci/`, `deployment*`,
  `monitoring*`
- **Security**: `*auth*`, `*security*`, `.env*`, `*vault*`, `*secrets*`
- **Quality**: `tests/`, `*.test.*`, `*.spec.*`, `*coverage*`, `*vitest*`,
  `*playwright*`
- **Intelligence**: `apps/ai-worker/**`, `**/prompts/**`, `**/chains/**`,
  `**/embeddings/**`
- **Domain**: `apps/api/**`, `packages/domain/**`, `packages/application/**`,
  `packages/db/**`, `**/prisma/**`
- **Automation**: `tools/scripts/**`, `tools/lint/**`, `apps/project-tracker/**`

### Always Added

**Foundation** is always included as a supporting STOA (for its unique gates:
artifact-lint, dependency-cruiser, docker config). Its baseline gates
(typecheck, build, lint, format) have already run in Phase 2.5.

## What Each STOA Runs (Unique Gates Only)

After baseline has already run typecheck + build + lint + format, each STOA runs
ONLY its unique gates:

| STOA             | Unique Gates (not covered by baseline)                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Foundation**   | Artifact-path lint, Docker config, Dependency architecture (depcruise)                                                          |
| **Domain**       | Domain unit tests (>95%), Integration tests, Prisma schema, Migration status, Architecture boundaries (domain-scoped depcruise) |
| **Quality**      | Test coverage (90% threshold), Integration tests, E2E tests, Mutation testing, SonarQube, Lighthouse CI                         |
| **Security**     | Gitleaks, pnpm audit, Snyk, Semgrep SAST, Trivy scans                                                                           |
| **Intelligence** | AI worker tests, Chain evaluation, Prompt validation, Ollama model check, Safety guardrails                                     |
| **Automation**   | Sprint validation, Sprint data validation, Artifact-path lint, Registry consistency, CSV uniqueness, Metrics sync               |

**No STOA re-runs typecheck, build, or lint.** Those are already verified by
baseline.

## Spawning Code

```typescript
import { resolveAgentMode } from './tools/scripts/lib/stoa/agent-mode.js';
const stoaCount = selectedStoas.length;
const mode = resolveAgentMode('exec', stoaCount);
```

### Subagent Mode (default)

For each assigned STOA, spawn a focused sub-agent using the Task tool:

```typescript
Task({
  subagent_type: 'general-purpose',
  prompt: `Execute Foundation STOA validation for task ${taskId}.
           Run /stoa-foundation ${taskId} ${runId}`,
  description: 'Foundation STOA validation',
});
```

STOA commands:

- `/stoa-foundation` — Foundation STOA (unique gates only)
- `/stoa-security` — Security STOA
- `/stoa-quality` — Quality STOA
- `/stoa-intelligence` — Intelligence STOA
- `/stoa-domain` — Domain STOA
- `/stoa-automation` — Automation STOA

### Agent Team Mode (cross-STOA communication)

When agent teams enabled and ≥2 STOAs:

**Phase A: Parallel Gate Execution** All STOAs run their unique gates in
parallel as teammates.

**Phase B: Cross-STOA Findings Broadcast** After gates complete, each STOA
broadcasts key findings to all other STOAs. Other STOAs can amend verdicts based
on peer findings.

```
Cross-STOA interaction examples:
- Security → Quality: "Found CVE in auth middleware. Test exists for this?"
- Quality → Security: "No test. Amending verdict to include coverage gap."
- Domain → Foundation: "Logic issue in LeadScore. Boundary violation?"
- Foundation → Domain: "Depcruise clean. No boundary violations."
```

Each STOA can upgrade severity (PASS→FAIL) based on peer findings, but cannot
downgrade (FAIL stays FAIL).

**Fallback**: If team creation fails, log error and run as subagents.

## Step 1: Initialize Run

```bash
RUN_ID=$(date +%Y%m%d-%H%M%S)-$(openssl rand -hex 4)
echo "Starting MATOP run: $RUN_ID for task: $TASK_ID"
mkdir -p "artifacts/reports/system-audit/$RUN_ID"/{gates,stoa-verdicts,task-updates}
```

## Step 2: Load and Analyze Task

```typescript
import {
  loadTaskFromCsv,
  assignStoas,
  getAllInvolvedStoas,
} from './tools/scripts/lib/stoa/index.js';

const task = loadTaskFromCsv(taskId, repoRoot);
const assignment = assignStoas(task);
const allStoas = getAllInvolvedStoas(assignment);

console.log(`Primary STOA: ${assignment.primaryStoa}`);
console.log(`Supporting STOAs: ${assignment.supportingStoas.join(', ')}`);
```

## Example Output

```
User: /matop-execute ENV-008-AI

Claude Code (MATOP Lead):
[MATOP] Task: ENV-008-AI - Supabase Local Development Environment
[MATOP] Run ID: 20251220-143000-a1b2c3d4

[Phase 2.5: Mandatory Baseline]
  typecheck... PASS (2.3s)
  build... PASS (45.2s)
  lint... PASS (12.1s)
  format... PASS (3.4s)

[Phase 3: STOA Agents]
[MATOP] Primary STOA: Foundation
[MATOP] Supporting STOAs: Quality, Security

- Foundation: running unique gates (artifact-lint, docker, depcruise)
- Quality: running unique gates (test-coverage)
- Security: running unique gates (gitleaks, pnpm-audit)

[MATOP] Verdicts:
- Foundation: PASS
- Quality: PASS
- Security: FAIL (3 unresolved findings)

[MATOP] Consensus: FAIL
[MATOP] Evidence: artifacts/reports/system-audit/20251220-143000-a1b2c3d4/
```
