# Sprint Plan Governance

This document defines the governance model for managing the IntelliFlow CRM
Sprint Plan.

## Overview

The Sprint Plan follows a **CSV-as-Code** model where:

- `Sprint_plan.csv` is the **immutable baseline** (changes require formal
  approval)
- `plan-overrides.yaml` is the **surgical overlay** (fixes, tiers, gates without
  modifying CSV)
- `validation.yaml` defines **automated validation rules** per task
- `plan-linter` enforces **governance rules** in CI

## File Hierarchy

```
BASELINE (Immutable)
├── Sprint_plan.csv          # Source of truth for tasks, deps, sprints
│
OVERLAY (Mutable with review)
├── plan-overrides.yaml      # Tier assignments, gate profiles, dep overrides
├── validation.yaml          # Task-specific validation commands
│
GENERATED (Auto-updated)
├── review-queue.json        # Tasks requiring human review
├── plan-lint-report.json    # Full linter output
│
TRACKING (Append-only)
├── plan-change-log.md       # History of all plan changes
├── plan-remediation.csv     # PLAN-FIX tasks for governance issues
├── debt-ledger.yaml         # Technical debt with expiry dates
```

## CSV-as-Code Policy

### Sprint_plan.csv Modifications

| Rule                 | Description                            |
| -------------------- | -------------------------------------- |
| **No Direct Edits**  | Never edit CSV directly on main branch |
| **PR Required**      | All changes via Pull Request           |
| **Multi-Approver**   | Requires Tech Lead + PM + 1 Reviewer   |
| **Automated Checks** | `pnpm run plan-lint` must pass         |
| **Change Log**       | Entry required in `plan-change-log.md` |

### Allowed CSV Changes

1. **Add new tasks** - With all required columns populated
2. **Update Status** - From Planned → In Progress → Completed
3. **Fix typos** - In descriptions, owners, etc.
4. **Add dependencies** - If missing

### Prohibited CSV Changes

1. **Delete tasks** - Mark as "Cancelled" in Status instead
2. **Change Task IDs** - IDs are immutable after creation
3. **Move between sprints** - Use `sprint_override` in overlay instead
4. **Remove dependencies** - Use `override_deps_remove` in overlay

## Overlay Policy

### plan-overrides.yaml

The overlay file allows surgical fixes without modifying the baseline CSV.

| Field                  | Purpose               | When to Use                                |
| ---------------------- | --------------------- | ------------------------------------------ |
| `tier`                 | Task priority (A/B/C) | All Sprint 0 tasks should have tier        |
| `gate_profile`         | Validation gates      | Required for Tier A, recommended for B     |
| `override_deps_add`    | Add missing deps      | When CSV has incorrect deps                |
| `override_deps_remove` | Remove deps           | To break cycles or cross-sprint violations |
| `sprint_override`      | Change sprint         | When task needs to move                    |
| `exception_policy`     | Document exceptions   | stub, contract, waiver                     |
| `acceptance_owner`     | Sign-off authority    | Required for Tier A                        |
| `debt_allowed`         | Allow tech debt       | Must have waiver_expiry                    |
| `waiver_expiry`        | Debt deadline         | Max 90 days from creation                  |
| `evidence_required`    | Completion artifacts  | Required for Tier A                        |

### Approval Requirements

| Change Type          | Reviewers                  |
| -------------------- | -------------------------- |
| Add Tier A task      | Tech Lead                  |
| Change tier A→B/C    | Tech Lead                  |
| Add exception_policy | Tech Lead + affected owner |
| Add debt_allowed     | Tech Lead + PM             |
| Modify gate_profile  | 1 Reviewer                 |

## Tier System

### Tier A - Critical

- **Definition**: High fan-out tasks, security tasks, root tasks
- **Requirements**:
  - `gate_profile` (mandatory)
  - `acceptance_owner` (mandatory)
  - `evidence_required` (mandatory)
- **Review**: Always in review queue
- **Validation**: All gates must pass before completion

### Tier B - Important

- **Definition**: Foundation tasks, dependencies of Tier A
- **Requirements**:
  - `gate_profile` (recommended)
  - `acceptance_owner` (optional)
- **Review**: In queue if high fan-out or missing validation
- **Validation**: Build + typecheck + lint minimum

### Tier C - Standard

- **Definition**: All other tasks
- **Requirements**: None specific
- **Review**: Only if flagged by linter
- **Validation**: Default global checks

## Validation Gates

### Gate Profiles

Each gate maps to a validation command:

| Gate            | Command              | Required Level |
| --------------- | -------------------- | -------------- |
| `build`         | `pnpm run build`     | Tier B+        |
| `typecheck`     | `pnpm run typecheck` | Tier B+        |
| `lint`          | `pnpm run lint`      | Tier B+        |
| `unit`          | `pnpm test --run`    | Tier A         |
| `security_scan` | `pnpm audit`         | Security tasks |
| `manual_review` | Human sign-off       | Tier A         |

### Adding New Gates

1. Define in `plan-overrides.yaml` under `gate_profiles`
2. Implement validation command
3. Add to relevant task's `gate_profile` array
4. Document in this file

## CI Integration

### Plan Linter

The `pnpm run plan-lint` command:

1. **Loads** Sprint_plan.csv + plan-overrides.yaml + validation.yaml
2. **Checks** hard rules (fail CI on violation)
3. **Checks** soft rules (warnings, review queue items)
4. **Generates** review-queue.json and lint report
5. **Exits** with code 0 (pass) or 1 (fail)

### Hard Rules (CI Fails)

| Rule                         | Description                           |
| ---------------------------- | ------------------------------------- |
| `NO_CYCLES`                  | No dependency cycles                  |
| `NO_CROSS_SPRINT_UNRESOLVED` | No Sprint N→N+1 deps without override |
| `TIER_A_GATES_REQUIRED`      | Tier A must have gate_profile         |
| `TIER_A_OWNER_REQUIRED`      | Tier A must have acceptance_owner     |
| `TIER_A_EVIDENCE_REQUIRED`   | Tier A must have evidence_required    |
| `DEPS_RESOLVE`               | All deps must exist in CSV            |

### Soft Rules (Warnings)

| Rule                 | Description                      |
| -------------------- | -------------------------------- |
| `MISSING_VALIDATION` | Task lacks validation.yaml entry |
| `AI_TASKS_MVP`       | AI tasks need MVP criteria       |
| `HIGH_FANOUT`        | Task has 3+ dependents           |
| `WAIVER_EXPIRING`    | Waiver expires within 30 days    |

### CI Workflow

```yaml
# .github/workflows/ci.yml
plan-lint:
  runs-on: ubuntu-latest
  if: |
    contains(github.event.pull_request.changed_files, 'Sprint_plan.csv') ||
    contains(github.event.pull_request.changed_files, 'plan-overrides.yaml')
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v2
    - run: pnpm install --filter @intelliflow/plan-linter
    - run: pnpm run plan-lint
```

## Review Queue

### Generation

The review queue is auto-generated by the plan linter and includes:

1. All Tier A tasks
2. High fan-out tasks (3+ dependents)
3. Tasks with waivers
4. Tasks with linter errors/warnings
5. Tasks missing validation coverage

### Review Process

1. **Check queue**: `cat apps/project-tracker/docs/metrics/review-queue.json`
2. **Assign reviewers**: Based on `acceptance_owner` field
3. **Complete review**: Verify evidence, run gates, sign off
4. **Update status**: Mark task as reviewed in tracking system

## Technical Debt

### Debt Ledger

The `docs/debt-ledger.yaml` file tracks all technical debt:

```yaml
DEBT-001:
  origin_task: ENV-008-AI
  owner: DevOps Engineer
  severity: medium
  description: Predictive monitoring deferred to post-Sprint 0
  expiry_date: 2026-02-28
  remediation_plan: Implement full predictive monitoring in Sprint 2
  status: open
```

### Debt Rules

1. **Max waiver period**: 90 days
2. **Expiry alerts**: 30 days before expiry
3. **Review cadence**: Weekly debt review
4. **Remediation required**: Before expiry or extend with approval

## Evidence Packs

### Required Contents

Each completed Tier A task must have an evidence pack:

```yaml
task_id: ENV-001-AI
spec_link: .specify/specifications/ENV-001-AI.md
plan_link: Sprint_plan.csv row 6

validation_runs:
  - id: run-001
    timestamp: 2025-12-15T10:30:00Z
    status: passed
    log: artifacts/logs/ENV-001-AI-validation.log

tests:
  - name: turbo_validate
    run_id: ci-123
    status: passed
  - name: build
    run_id: ci-123
    status: passed

artifacts:
  - path: turbo.json
    sha256: abc123...
  - path: pnpm-workspace.yaml
    sha256: def456...

audit_result: passed
pr_ref: '#42'
commit_ref: 'abc1234'
```

### Storage

Evidence packs stored in:
`apps/project-tracker/docs/metrics/sprint-0/phase-*/TASK-ID.json`

## Contacts

| Role            | Responsibility                     |
| --------------- | ---------------------------------- |
| Tech Lead       | Plan governance, tier assignments  |
| PM              | Sprint planning, stakeholder comms |
| DevOps Engineer | CI integration, automation         |
| QA Lead         | Validation rules, evidence review  |
