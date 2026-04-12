# MATOP: Mandatory Gate Execution

All 4 gates are BLOCKING. A FAIL on any gate sets the final verdict to FAIL.

---

## Gate 1: Plan Checkbox Verification (BLOCKING)

Before returning a PASS verdict, verify all plan checkboxes are complete.

**Verification Steps:**

1. Read plan file: `.specify/sprints/sprint-{N}/planning/<TASK_ID>-plan.md`
2. Parse all checkbox patterns: `- [ ]` and `- [x]`
3. Calculate completion percentage

| Completion % | Verdict Impact                  |
| ------------ | ------------------------------- |
| 100%         | No impact — can proceed to PASS |
| <100%        | Force verdict to FAIL           |

**Required Output:**

```
[MATOP Gate: Plan Checkboxes]
Plan: .specify/sprints/sprint-2/planning/IFC-085-plan.md
Checked: 10/12 (83.3%)
Unchecked Items:
  - [ ] Document API schema
  - [ ] Run integration tests
Impact: Verdict set to FAIL (incomplete plan checkboxes — 100% required)
```

---

## Gate 2: Artifact Hash Verification (BLOCKING)

All artifacts mentioned in plan MUST exist and have recorded hashes.

**Verification Steps:**

1. Parse plan for file paths under `**Files to Create:**` and
   `**Files to Modify:**`
2. Verify each file exists on disk
3. Calculate SHA256 hash for each file
4. Record in evidence bundle

| Condition                         | Verdict Impact        |
| --------------------------------- | --------------------- |
| All files exist with valid hashes | No impact             |
| Any file missing                  | Force verdict to FAIL |
| Hash cannot be calculated         | Force verdict to FAIL |

**CRITICAL**: Must verify ALL plan files exhaustively — count must match plan
total.

**Required Output:**

```
[MATOP Gate: Artifact Hashes]
| File | Exists | SHA256 |
|------|--------|--------|
| apps/ai-worker/src/chains/scoring.chain.ts | YES | a1b2c3d4e5f6... |
| apps/ai-worker/src/chains/scoring.chain.test.ts | NO | N/A |

Impact: Verdict set to FAIL (missing artifact)
```

---

## Gate 3: Mandatory Baseline Validation (BLOCKING)

Verifies that MATOP Phase 2.5 mandatory baseline actually executed with real
exit codes. These run ONCE before any STOA agent spawns.

**Required Commands (MUST run, not simulate):**

```bash
pnpm run typecheck    # Capture real exit code
pnpm run build        # Capture real exit code
pnpm run lint         # Capture real exit code
pnpm run format:check # Capture real exit code
```

| Command Result       | Verdict Impact        |
| -------------------- | --------------------- |
| All exit 0           | No impact             |
| Any non-zero exit    | Force verdict to FAIL |
| Command not executed | Force verdict to FAIL |

**Required Output:**

```
[MATOP Gate: Build Validation]
| Command | Exit Code | Duration | Status |
|---------|-----------|----------|--------|
| pnpm run typecheck | 0 | 15.2s | PASS |
| pnpm run build | 0 | 45.8s | PASS |
| pnpm run lint | 1 | 8.3s | FAIL |

Impact: Verdict set to FAIL (lint failed)
```

---

## Gate 4: STOA Verdict Aggregation (BLOCKING)

Final consensus MUST accurately reflect individual STOA results.

**Aggregation Rules (NO WARN — binary only):**

```
IF any STOA verdict == FAIL:
  consensus = FAIL
ELSE IF any STOA verdict == NEEDS_HUMAN:
  consensus = NEEDS_HUMAN
ELSE:
  consensus = PASS
```

CRITICAL: Do NOT override FAIL verdicts. Do NOT claim PASS when gates failed.

**Required Output:**

```
[MATOP Gate: STOA Aggregation]
| STOA | Verdict | Failed Gates |
|------|---------|--------------|
| Foundation | PASS | - |
| Security | FAIL | pnpm-audit (5 high vulnerabilities) |
| Quality | PASS | - |

Consensus: FAIL (Security STOA failed)
```

---

## Enforcement Summary Template

```
╔═══════════════════════════════════════════════════════════════════════════╗
║  MATOP VALIDATION ENFORCEMENT SUMMARY                                      ║
╠═══════════════════════════════════════════════════════════════════════════╣
║                                                                            ║
║  Gate 1: Plan Checkboxes     [10/12 - 83%]              [❌ FAIL]          ║
║  Gate 2: Artifact Hashes     [5/5 verified]             [✅ PASS]          ║
║  Gate 3: Build Validation    [2/3 passed - lint fail]   [❌ FAIL]          ║
║  Gate 4: STOA Aggregation    [Security FAIL]            [❌ FAIL]          ║
║                                                                            ║
║  FINAL VERDICT: FAIL                                                       ║
║  Reason: Lint errors + Security vulnerabilities                            ║
║                                                                            ║
║  Task CANNOT be marked "Completed" with FAIL verdict                       ║
║                                                                            ║
╚═══════════════════════════════════════════════════════════════════════════╝
```

---

## Plan Deliverables Verification in Evidence Bundle

Every MATOP summary MUST include:

```json
{
  "plan_deliverables": {
    "plan_path": ".specify/sprints/sprint-2/planning/IFC-085-plan.md",
    "files": {
      "total": 5,
      "verified": 5,
      "missing": 0,
      "items": [
        {
          "path": "apps/ai-worker/src/chains/scoring.chain.ts",
          "status": "exists"
        }
      ]
    },
    "checkboxes": {
      "total": 12,
      "checked": 10,
      "unchecked": 2,
      "items": [
        {
          "text": "Write failing test for Ollama provider",
          "checked": true,
          "phase": "Phase 1: RED"
        }
      ]
    },
    "overall_status": "partial",
    "completion_percentage": 93
  }
}
```

| Completion % | Verdict Impact       |
| ------------ | -------------------- |
| 100%         | No impact            |
| <100%        | FAIL — 100% required |

## Package Mapping for Coverage

| Task Pattern                                  | Package          |
| --------------------------------------------- | ---------------- |
| `IFC-085`, `IFC-005`, `IFC-155`, `AI-SETUP-*` | `apps/ai-worker` |
| `IFC-003`, `IFC-004`                          | `apps/api`       |
| `PG-*`, `IFC-090`, `IFC-091`                  | `apps/web`       |
