# MATOP Task Execution Protocol

Execute the complete MATOP workflow for any task with **ONE command**.
Automatically determines STOAs, runs gates, generates evidence.

## Usage

```bash
# Via Claude Code command
/matop-execute <TASK_ID>

# Via npm scripts
pnpm matop <TASK_ID>
pnpm matop <TASK_ID> --strict
pnpm matop <TASK_ID> --dry-run
```

## Arguments

- `TASK_ID` (required): The task ID from Sprint_plan.csv (e.g., ENV-001-AI, IFC-001)

## What It Does (Automatically)

1. **Load Task** from `Sprint_plan.csv`
2. **Assign STOAs** (Lead by prefix, Supporting by keywords)
3. **Collect Gates** from all involved STOAs
4. **Execute Gates** with transcript capture
5. **Create Waivers** for required-but-unavailable tools
6. **Generate Verdicts** for each STOA
7. **Aggregate Consensus** (PASS/WARN/FAIL/NEEDS_HUMAN)
8. **Propose CSV Update** if PASS
9. **Generate Evidence Bundle** with SHA256 hashes

## STOA Assignment Rules

### Lead STOA (by Task ID Prefix)

| Prefix | Lead STOA |
|--------|-----------|
| `ENV-*` | Foundation |
| `EP-*` | Foundation |
| `IFC-*` | Domain |
| `EXC-SEC-*`, `SEC-*` | Security |
| `AI-*`, `AI-SETUP-*` | Intelligence |
| `AUTOMATION-*` | Automation |

### Supporting STOA Triggers

- **Security**: auth, jwt, token, secret, vault, rbac, permissions, rate-limit
- **Quality**: coverage, e2e, test, vitest, playwright, mutation, quality gate
- **Intelligence**: prompt, agent, chain, embedding, llm, langchain, crewai
- **Foundation**: docker, ci, deployment, infra, observability, monitoring

## Sub-Agent Spawning

For each required STOA, spawn a focused sub-agent using the Task tool:

```typescript
// Example: Spawn Foundation STOA
Task({
  subagent_type: "general-purpose",
  prompt: `Execute Foundation STOA validation for task ${taskId}.
           Run /stoa-foundation ${taskId} ${runId}`,
  description: "Foundation STOA validation"
})
```

## Evidence Output

All evidence is written to:
```
artifacts/reports/system-audit/<RUN_ID>/
├── gate-selection.json       # Gates selected for execution
├── gates/                    # Gate execution logs
│   ├── turbo-typecheck.log
│   ├── turbo-build.log
│   └── ...
├── stoa-verdicts/           # STOA verdict files
│   ├── Foundation.json
│   ├── Security.json
│   └── ...
├── waivers.json             # Waiver records
├── evidence-hashes.txt      # SHA256 hashes
├── summary.json             # Machine-readable summary
└── summary.md               # Human-readable summary
```

## Execution Steps

### Step 1: Initialize Run

```bash
# Generate RUN_ID
RUN_ID=$(date +%Y%m%d-%H%M%S)-$(openssl rand -hex 4)
echo "Starting MATOP run: $RUN_ID for task: $TASK_ID"

# Create evidence directory
mkdir -p "artifacts/reports/system-audit/$RUN_ID"/{gates,stoa-verdicts,task-updates}
```

### Step 2: Load and Analyze Task

```typescript
// Use the STOA library to assign STOAs
import { loadTaskFromCsv, assignStoas, getAllInvolvedStoas } from './tools/scripts/lib/stoa/index.js';

const task = loadTaskFromCsv(taskId, repoRoot);
const assignment = assignStoas(task);
const allStoas = getAllInvolvedStoas(assignment);

console.log(`Lead STOA: ${assignment.leadStoa}`);
console.log(`Supporting STOAs: ${assignment.supportingStoas.join(', ')}`);
```

### Step 3: Spawn STOA Sub-Agents

For each STOA in `allStoas`, spawn a sub-agent:

- `/stoa-foundation` for Foundation STOA
- `/stoa-security` for Security STOA
- `/stoa-quality` for Quality STOA
- `/stoa-intelligence` for Intelligence STOA
- `/stoa-domain` for Domain STOA
- `/stoa-automation` for Automation STOA

### Step 4: Aggregate and Report

After all sub-agents complete:

1. Read all verdict files from `stoa-verdicts/`
2. Determine consensus verdict (any FAIL = FAIL, any NEEDS_HUMAN = NEEDS_HUMAN)
3. Generate evidence hashes
4. Write summary files
5. If PASS, create CSV patch proposal

## Consensus Rules

| Condition | Final Verdict |
|-----------|---------------|
| Any STOA returns FAIL | FAIL |
| Any STOA returns NEEDS_HUMAN | NEEDS_HUMAN |
| Any STOA returns WARN (no FAIL) | WARN |
| All STOAs return PASS | PASS |

## Example

```
User: /matop-execute ENV-008-AI

Claude Code (MATOP Lead):
[MATOP] Task: ENV-008-AI - Supabase Local Development Environment
[MATOP] Run ID: 20251220-143000-a1b2c3d4
[MATOP] Lead STOA: Foundation
[MATOP] Supporting STOAs: Quality, Security

[MATOP] Spawning Foundation STOA sub-agent...
  → Running baseline gates (typecheck, build, lint)
  → Running foundation gates (docker-config, artifact-lint)
  → Verdict: PASS

[MATOP] Spawning Quality STOA sub-agent...
  → Running quality gates (test-coverage)
  → Verdict: PASS

[MATOP] Spawning Security STOA sub-agent...
  → Running security gates (gitleaks, pnpm-audit)
  → Verdict: WARN (3 waivers pending)

[MATOP] Consensus: WARN
[MATOP] Evidence: artifacts/reports/system-audit/20251220-143000-a1b2c3d4/
[MATOP] CSV Patch: Proposed status change Planned → Completed (requires human approval)
```

## Related Commands

- `/stoa-foundation` - Foundation STOA sub-agent
- `/stoa-security` - Security STOA sub-agent
- `/stoa-quality` - Quality STOA sub-agent
- `/stoa-intelligence` - Intelligence STOA sub-agent
- `/stoa-domain` - Domain STOA sub-agent
- `/stoa-automation` - Automation STOA sub-agent

## Configuration

The MATOP orchestrator uses:

- `audit-matrix.yml` - Gate definitions and thresholds
- `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv` - Task source of truth
- `tools/scripts/lib/stoa/` - STOA library implementation
