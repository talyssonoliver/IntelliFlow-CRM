# Fix Incomplete Tasks - Quick Start Guide

This document provides a quick-start guide for validating and fixing tasks marked as "Completed" but missing evidence or artifacts.

## Overview

The `/fix-incomplete-tasks` command iterates through all tasks flagged by the governance system as having incomplete evidence, validates each one, and either confirms completion with proper evidence or reverts the task to "In Progress" status.

**Key Principle**: All evidence must be REAL. Never use placeholder files.

---

## Quick Start

### 1. Check Current Status

First, identify tasks requiring validation:

```bash
# Via governance API
curl -s http://localhost:3002/api/governance/revert-incomplete | jq '.tasksWithMissingArtifacts | length'

# Or via executive metrics
curl -s http://localhost:3002/api/metrics/executive | jq '.tasksRequiringRevertDetails | length'
```

### 2. Run the Validator

Execute the fix-incomplete-tasks command:

```bash
# Full run - validates and fixes all incomplete tasks
/fix-incomplete-tasks

# Dry run - analyze only, no changes
/fix-incomplete-tasks --dry-run

# Resume from specific task
/fix-incomplete-tasks --start-from IFC-001
```

### 3. Review Results

After execution, check the summary report:

```
artifacts/reports/task-validation-summary-<timestamp>.json
```

---

## What Gets Validated

For each task, the validator checks:

| Check | Description |
|-------|-------------|
| **Artifacts** | All `ARTIFACT:` paths exist and are not placeholders |
| **Evidence** | All `EVIDENCE:` attestation files are valid |
| **Dependencies** | All dependent tasks are truly complete |
| **KPIs** | All KPI metrics from Sprint_plan.csv are met |
| **Validations** | All `VALIDATE:` commands pass |
| **Gates** | All `GATE:` quality gates pass |

---

## Placeholder Detection

Files are flagged as placeholders if they:

- Contain only comments like `# Placeholder` or `// TODO`
- Are < 50 bytes with no meaningful content
- Contain "placeholder", "stub", "todo", "fixme" as main content
- Are JSON files with empty `{}` or minimal stub data
- Are Markdown files with only a title and no content

---

## Output Files

The validator produces:

| File | Purpose |
|------|---------|
| `artifacts/attestations/<TASK_ID>/context_ack.json` | Main attestation for validated tasks |
| `artifacts/attestations/<TASK_ID>/artifact_hashes.json` | SHA256 hashes of all artifacts |
| `artifacts/reports/remediation/<TASK_ID>.json` | Issues found for incomplete tasks |
| `artifacts/reports/task-validation-summary-<timestamp>.json` | Summary of validation run |

---

## Issue Types

When tasks fail validation, issues are categorized as:

| Type | Description |
|------|-------------|
| `missing_artifact` | Required file does not exist |
| `placeholder_detected` | File exists but contains placeholder content |
| `failed_validation` | VALIDATE: command returned non-zero exit code |
| `unmet_kpi` | KPI metric not meeting threshold |
| `incomplete_dependency` | Dependent task is not complete |

---

## Typical Workflow

```
1. Run /fix-incomplete-tasks --dry-run    # See what needs fixing
2. Review remediation/<TASK_ID>.json      # Understand issues
3. Fix actual issues in codebase          # Implement real artifacts
4. Run /fix-incomplete-tasks              # Validate and complete
5. Verify task-validation-summary         # Confirm success
```

---

## Related Resources

- Full command documentation: `.claude/commands/fix-incomplete-tasks.md`
- Task source of truth: `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv`
- Audit matrix: `audit-matrix.yml`
- Validation rules: `apps/project-tracker/docs/metrics/validation.yaml`

---

## Related Commands

| Command | Purpose |
|---------|---------|
| `/matop-execute <TASK_ID>` | Full MATOP validation for single task |
| `/stoa-quality` | Quality STOA validation |
| `/stoa-security` | Security STOA validation |
| `/compliance-check` | Validates task against all gates |

---

## Troubleshooting

### "No incomplete tasks found"

This means governance API shows all tasks as properly validated. Check:
```bash
curl -s http://localhost:3002/api/governance/revert-incomplete | jq
```

### "Dependency chain incomplete"

A task cannot be marked complete if its dependencies are incomplete. Fix dependencies first (they're processed in dependency order).

### "KPI not met"

Check the specific KPI requirement in Sprint_plan.csv and ensure the metric is actually achieved:
- Coverage >90% - Run tests with coverage
- Response <200ms - Check performance benchmarks
- Lighthouse >90 - Run lighthouse audit

---

*Last updated: 2026-01-30*
*Part of: EXP-REPORTS-002 - Technical Debt & Quality Tracking (Continuous)*
