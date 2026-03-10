---
name: matop-execute
description: Execute MATOP validation for any task. Automatically determines STOAs, runs gates, generates evidence. Validation only — no implementation. For full implementation + validation use /exec instead.
---

# MATOP Task Execution Protocol

Orchestrates STOA sub-agents to validate task completion. Loads task from Sprint_plan.csv, assigns STOAs, runs gates, aggregates verdicts, and produces a cryptographic evidence bundle.

## Phase Table

| Phase | Action | Reference |
|-------|--------|-----------|
| 1 | Initialize run (generate RUN_ID, create evidence dir) | **See references/gate-execution.md** |
| 2 | Load task from CSV, assign Primary + Supporting STOAs | **See references/stoa-selection.md** |
| 2.5 | **Run Mandatory Baseline** (typecheck, build, lint, format) — runs ONCE before any STOA | **See references/gate-execution.md** |
| 3 | Spawn STOA agents (subagent or team mode) — each runs only its UNIQUE gates | **See references/stoa-selection.md** |
| 4 | Aggregate verdicts, compute consensus | **See references/verdict-aggregation.md** |
| 5 | Verify mandatory gates (checkboxes, artifacts, baseline, STOA) | **See references/gate-execution.md** |
| 6 | Write evidence bundle + summary | **See references/evidence-format.md** |
| 7 | Propose CSV patch if PASS | **See references/verdict-aggregation.md** |

## Mandatory Baseline (Phase 2.5 — runs BEFORE any STOA)

These commands run ONCE for every task, regardless of STOA assignment. They are NOT part of any STOA — they are a prerequisite. If any baseline command fails, the entire MATOP run is FAIL (no STOA agents are spawned).

```bash
pnpm run typecheck       # TypeScript compilation (all packages via turbo)
pnpm run build           # Build validation (SSR/CSR, bundles, imports)
pnpm run lint            # ESLint --max-warnings=0
pnpm run format:check    # Prettier formatting
```

**NON-WAIVABLE.** "Frontend-only" or "simple task" are NOT valid reasons to skip.

## STOA Assignment Quick Reference

**Primary STOA** = determined by task ID prefix. Listed first in reports, runs first. All STOAs block equally.

| Prefix | Primary STOA |
|--------|--------------|
| `ENV-*`, `EP-*` | Foundation |
| `IFC-*` | Domain |
| `PG-*` | Quality |
| `EXC-SEC-*`, `SEC-*` | Security |
| `AI-*`, `AI-SETUP-*` | Intelligence |
| `AUTOMATION-*` | Automation |
| (no match) | Domain (default) |

**Supporting STOAs** triggered by keywords/paths. Foundation is always added as supporting (for its unique gates: artifact-lint, docker, depcruise). **See references/stoa-selection.md**.

## Consensus Rules

There is **NO WARN verdict**. All verdicts are binary: PASS, FAIL, or NEEDS_HUMAN.

| Condition | Final Verdict |
|-----------|---------------|
| Any STOA = FAIL | FAIL |
| Any STOA = NEEDS_HUMAN | NEEDS_HUMAN |
| All STOAs = PASS | PASS |

## Mandatory Gates (All BLOCKING)

| Gate | Rule | Reference |
|------|------|-----------|
| 1: Plan Checkboxes | 100% required, <100% → FAIL | **See references/gate-execution.md** |
| 2: Artifact Hashes | Any missing file → FAIL | **See references/gate-execution.md** |
| 3: Build Validation | Any non-zero exit → FAIL | **See references/gate-execution.md** |
| 4: STOA Aggregation | Any STOA FAIL → consensus FAIL | **See references/verdict-aggregation.md** |

## Verdict Integrity (NON-NEGOTIABLE)

- PASS requires 100% plan checkboxes, all artifacts exist, all builds pass, all STOAs pass
- Commands MUST be actually executed — no simulated exit codes
- FAIL verdicts CANNOT be manually overridden
- **See references/verdict-integrity.md** for full rules

## Coverage Tracking

Before/after coverage metrics required in every summary. **See references/evidence-format.md**.

## Output Paths

- Via `/exec`: `.specify/<TASK_ID>/execution/<RUN_ID>/matop/`
- Standalone: `artifacts/reports/system-audit/<RUN_ID>/`

**See references/evidence-format.md** for complete directory layout.
