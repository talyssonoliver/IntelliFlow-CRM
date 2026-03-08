---
name: enforce-required
description: Implement deterministic enforcement so agents cannot skip required files and cannot produce "fake green" outputs. Includes CSV contract parsing and column deprecation planning.
---

# Enforce Required Reading

## Overview

You are Codex acting as a senior monorepo governance engineer and SRE. Implement
deterministic enforcement so agents cannot skip required files and cannot
produce "fake green" outputs.

**Goal**: Convert these CSV columns into a machine-enforceable execution contract:
- `Pre-requisites` => REQUIRED CONTEXT (files/dirs/env/policies) with parseable tags
- `Artifacts To Track` => REQUIRED EVIDENCE (context_pack, context_ack, transcripts)
- `Validation Method` => REQUIRED GATES (validate/audit tool IDs)

**See references/enforcement-rules.md** for full implementation details.

## Non-Negotiable Constraints

1. Do NOT move source-code files
2. Implement enforcement using existing CSV columns (no new headers)
3. Windows compatible (PowerShell + Node/TS)
4. Deterministic: no multiple approaches, no questions

## 5 Agent Workstreams

| Agent | Responsibility | DoD |
|-------|---------------|-----|
| A — CSV Contract Spec | Define strict grammar for tags in Pre-requisites / Artifacts / Validation columns; define NOELLIPSIS rule | Grammar doc + TypeScript parser spec |
| B — Context Pack Builder | Implement `build_context_pack(task_id, run_id)`; embed FILE: excerpts (120 line limit, 50KB max) | Context pack works for IFC-006 or IFC-007 |
| C — Context Ack Gatekeeper | Require `context_ack.json` before code changes; validate hashes match manifest | Run fails deterministically when ack missing |
| D — Validation/Audit Integration | Parse contract tags; detect ellipsis; produce transcript per run | CI strict job fails on invalid contract or missing evidence |
| E — Column Deprecation | Derive `cross_quarter_deps` from Target Sprint; auto-generate CleanDependencies; produce migration plan | Deprecation plan at `artifacts/reports/deprecation/<run_id>/csv-deprecation-plan.md` |

**See references/enforcement-rules.md** for full agent prompts, DoD details, and implementation specs.

## New Validation Gates

| Gate | Description |
|------|-------------|
| Gate 9 (NEW) | Contract Tag Parser — validates FILE:, DIR:, ENV:, POLICY:, EVIDENCE:, VALIDATE:, AUDIT:, GATE: tags; applies NOELLIPSIS rule |
| Gate 10 (NEW) | Context Ack Gate — verifies context_ack.json; validates SHA256 hashes; confirms all FILE: prerequisites acknowledged |
| Gate 3 (EXTENDED) | Evidence Integrity — adds context_pack + context_ack existence check for In Progress/Completed tasks |

## Key Paths

- Sprint plan: `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv`
- Framework: `artifacts/sprint0/codex-run/Framework.md`
- Audit Matrix: `C:\taly\intelliFlow-CRM\audit-matrix.yml`
- Context packs: `artifacts/context/<run_id>/<task_id>/`
- Contract transcripts: `artifacts/reports/contract/<run_id>/<task_id>/`
- Deprecation plans: `artifacts/reports/deprecation/<run_id>/`

## Strict Mode

- Environment variable: `VALIDATION_STRICT=1` (default: 0 / unset)
- Effect: Converts all WARN results to FAIL (blocking)
- Usage: `VALIDATION_STRICT=1 pnpm run validate:sprint -- --sprint=3`
