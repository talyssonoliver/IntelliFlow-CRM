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
| 2 | Load task from CSV, assign Lead + Supporting STOAs | **See references/stoa-selection.md** |
| 3 | Spawn STOA agents (subagent or team mode) | **See references/stoa-selection.md** |
| 4 | Aggregate verdicts, compute consensus | **See references/verdict-aggregation.md** |
| 5 | Verify mandatory gates (checkboxes, artifacts, build, STOA) | **See references/gate-execution.md** |
| 6 | Write evidence bundle + summary | **See references/evidence-format.md** |
| 7 | Propose CSV patch if PASS | **See references/verdict-aggregation.md** |

## STOA Assignment Quick Reference

| Prefix | Lead STOA |
|--------|-----------|
| `ENV-*`, `EP-*` | Foundation |
| `IFC-*` | Domain |
| `EXC-SEC-*`, `SEC-*` | Security |
| `AI-*`, `AI-SETUP-*` | Intelligence |
| `AUTOMATION-*` | Automation |

Supporting STOAs triggered by keywords — **See references/stoa-selection.md**.

## Consensus Rules

| Condition | Final Verdict |
|-----------|---------------|
| Any STOA = FAIL | FAIL |
| Any STOA = NEEDS_HUMAN | NEEDS_HUMAN |
| Any STOA = WARN (no FAIL) | WARN |
| All STOAs = PASS | PASS |

## Mandatory Gates (All BLOCKING)

| Gate | Rule | Reference |
|------|------|-----------|
| 1: Plan Checkboxes | <80% → FAIL, 80-99% → WARN | **See references/gate-execution.md** |
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
