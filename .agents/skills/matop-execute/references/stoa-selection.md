# MATOP: STOA Selection & Spawning

## Agent Mode Detection

| Mode | When Used | MATOP Behavior |
|------|-----------|----------------|
| **Subagent** (default) | Teams disabled or <2 STOAs | STOAs run gates independently, no peer sharing |
| **Agent Team** | `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` AND ≥2 STOAs | STOAs share findings after gates complete |

**Detection logic** (from `tools/scripts/lib/stoa/agent-mode.ts`):
1. Check `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` env var
2. Check `CLAUDE_CODE_IS_TEAMMATE` — if already a teammate, fall back to subagent (no nested teams)
3. For exec/matop sessions: require ≥2 STOAs for team mode

**Token cost warning**: Agent team mode uses ~4x tokens per STOA.

## Lead STOA Assignment (by Task ID Prefix)

| Prefix | Lead STOA |
|--------|-----------|
| `ENV-*`, `EP-*` | Foundation |
| `IFC-*` | Domain |
| `EXC-SEC-*`, `SEC-*` | Security |
| `AI-*`, `AI-SETUP-*` | Intelligence |
| `AUTOMATION-*` | Automation |

## Supporting STOA Triggers (Keywords)

- **Security**: auth, jwt, token, secret, vault, rbac, permissions, rate-limit
- **Quality**: coverage, e2e, test, vitest, playwright, mutation, quality gate
- **Intelligence**: prompt, agent, chain, embedding, llm, langchain, crewai
- **Foundation**: docker, ci, deployment, infra, observability, monitoring

## Spawning Code

```typescript
import { resolveAgentMode } from './tools/scripts/lib/stoa/agent-mode.js';
const stoaCount = selectedStoas.length;
const mode = resolveAgentMode('exec', stoaCount);
```

### Subagent Mode (default)

For each required STOA, spawn a focused sub-agent using the Task tool:

```typescript
Task({
  subagent_type: 'general-purpose',
  prompt: `Execute Foundation STOA validation for task ${taskId}.
           Run /stoa-foundation ${taskId} ${runId}`,
  description: 'Foundation STOA validation',
});
```

STOA commands:
- `/stoa-foundation` — Foundation STOA
- `/stoa-security` — Security STOA
- `/stoa-quality` — Quality STOA
- `/stoa-intelligence` — Intelligence STOA
- `/stoa-domain` — Domain STOA
- `/stoa-automation` — Automation STOA

### Agent Team Mode (cross-STOA communication)

When agent teams enabled and ≥2 STOAs:

**Phase A: Parallel Gate Execution**
All STOAs run their gates in parallel as teammates. Each STOA teammate runs its standard `/stoa-*` validation command.

**Phase B: Cross-STOA Findings Broadcast**
After gates complete, each STOA broadcasts key findings to all other STOAs. Other STOAs can amend verdicts based on peer findings.

```
Cross-STOA interaction examples:
- Security → Quality: "Found CVE in auth middleware. Test exists for this?"
- Quality → Security: "No test. Amending verdict to include coverage gap."
- Domain → Foundation: "Logic issue in LeadScore. Still compiles?"
- Foundation → Domain: "Compiles with warning. Advisory added."
```

Each STOA can upgrade severity (PASS→WARN, WARN→FAIL) based on peer findings, but cannot downgrade (FAIL→WARN/PASS stays FAIL).

**Fallback**: If team creation fails, log error and run as subagents:
```typescript
try {
  // Create STOA team, run Phase A + B...
} catch (error) {
  console.warn(`[MATOP Team] Failed, falling back to subagents: ${error}`);
  // Standard subagent execution
}
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

console.log(`Lead STOA: ${assignment.leadStoa}`);
console.log(`Supporting STOAs: ${assignment.supportingStoas.join(', ')}`);
```

## Step 1: Initialize Run

```bash
RUN_ID=$(date +%Y%m%d-%H%M%S)-$(openssl rand -hex 4)
echo "Starting MATOP run: $RUN_ID for task: $TASK_ID"
mkdir -p "artifacts/reports/system-audit/$RUN_ID"/{gates,stoa-verdicts,task-updates}
```

## Agent Team Example Output

```
User: /matop-execute ENV-008-AI

Claude Code (MATOP Lead):
[MATOP] Task: ENV-008-AI - Supabase Local Development Environment
[MATOP] Run ID: 20251220-143000-a1b2c3d4
[MATOP] Agent Mode: TEAM (3 STOAs, teams enabled)
[MATOP] Lead STOA: Foundation
[MATOP] Supporting STOAs: Quality, Security

[Phase 3a: Gate Execution]
Creating STOA team...
- Foundation teammate: running baseline + foundation gates
- Quality teammate: running quality gates
- Security teammate: running security gates

[Phase 3b: Cross-STOA Reconciliation]
- Security → Quality: "Found outdated dependency with known CVE.
  Is there test coverage for the affected auth module?"
- Quality → Security: "Coverage is 72% for auth module. Adding advisory finding."
- Foundation → Security: "Docker config passes. No exposed ports."

[MATOP] Shutting down STOA team (30s timeout)

[MATOP] Verdicts:
- Foundation: PASS
- Quality: PASS (advisory: auth coverage could improve)
- Security: WARN (3 waivers pending, peer-confirmed no exposed ports)

[MATOP] Consensus: WARN
[MATOP] Evidence: artifacts/reports/system-audit/20251220-143000-a1b2c3d4/
```
