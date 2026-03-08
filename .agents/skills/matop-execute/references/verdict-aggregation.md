# MATOP: Verdict Aggregation & CSV Patch

## Step 4: Aggregate and Report

After all sub-agents/teammates complete:

1. Read all verdict files from `stoa-verdicts/`
2. Determine consensus verdict (any FAIL = FAIL, any NEEDS_HUMAN = NEEDS_HUMAN)
3. Generate evidence hashes
4. Write summary files
5. If PASS, create CSV patch proposal

## Consensus Rules

| Condition | Final Verdict |
|---|---|
| Any STOA returns FAIL | FAIL |
| Any STOA returns NEEDS_HUMAN | NEEDS_HUMAN |
| All STOAs return PASS | PASS |

```
IF any STOA verdict == FAIL:
  consensus = FAIL
ELSE IF any STOA verdict == NEEDS_HUMAN:
  consensus = NEEDS_HUMAN
ELSE:
  consensus = PASS
```

**Note**: There is NO WARN verdict. All STOA verdicts are binary (PASS/FAIL/NEEDS_HUMAN only).

## CSV Patch Proposal (PASS only)

When consensus = PASS, propose a status change in Sprint_plan.csv:

```
[MATOP] CSV Patch: Proposed status change Planned → Completed (requires human approval)
```

The patch is a PROPOSAL only. Human must approve before the CSV is actually updated.

## Subagent Mode Example

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
  → Verdict: PASS

[MATOP] Consensus: PASS
[MATOP] Evidence: artifacts/reports/system-audit/20251220-143000-a1b2c3d4/
[MATOP] CSV Patch: Proposed status change Planned → Completed (requires human approval)
```

## Coverage Delta Assessment

| Delta | Verdict Impact |
|---|---|
| Positive (↑) | No impact on MATOP verdict |
| Zero (→) | No impact on MATOP verdict |
| Small negative (↓ <5%) | May contribute to FAIL |
| Large negative (↓ ≥5%) | FAIL |
