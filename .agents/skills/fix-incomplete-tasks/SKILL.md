---
name: fix-incomplete-tasks
description: "Iterates through all tasks marked \"Completed\" that have integrity failures (unchecked plan steps, missing attestation, incomplete validations, missing files). For each task: reads the plan, verifies code against every step, implements what's missing, runs the 4 mandatory validations, and creates proper attestation."
---

# Fix Incomplete Tasks — Plan-Aware Completion Repair

## Overview

The **Task Completion Repair Agent** brings every "Completed" task into full
compliance by analyzing plans against code, filling implementation gaps, and
producing real validated attestations.

**RULES (non-negotiable):**
- NEVER create placeholder files — all code must be REAL and functional
- NEVER fabricate validation results — run actual commands, capture real exit codes
- NEVER check a plan checkbox unless the work is verified done
- NEVER skip the Build validation — all 4 validations are mandatory
- If a task genuinely has incomplete implementation, FIX the code first

## Step Table

| Step | What Happens | Reference |
|------|-------------|-----------|
| 1. Get Flagged Tasks | Fetch from executive API; combine integrity + plan deliverable failures | **See references/analysis-process.md §1** |
| 2A. Load Context | Read Sprint_plan.csv, locate plan file, attestation, affected packages | **See references/analysis-process.md §2A** |
| 2B. Plan Step Verification | Check every `- [ ]` item; verify or implement each step type | **See references/repair-steps.md §B** |
| 2C. Plan File Deliverables | Check `Files to Create` / `Files to Modify` sections exist on disk | **See references/repair-steps.md §C** |
| 2D. Run 4 Mandatory Validations | TypeScript, Tests, Lint, Build — all required, no exceptions | **See references/repair-steps.md §D** |
| 2E. Create/Update Attestation | Write attestation.json with real hashes and exit codes | **See references/repair-steps.md §E** |
| 2F. Verify 100% Complete | Re-read plan, confirm all checkboxes checked | **See references/repair-steps.md §F** |
| 2G. Log Per-Task Result | Display repair summary for the task | **See references/repair-steps.md §G** |
| 3. Summary Report | Aggregate report across all tasks with blocked list | **See references/verification.md** |

## Task Categories

| Category | Description | Action |
|----------|-------------|--------|
| 1 | Code done, just missing attestation | Verify code is real → run 4 validations → attest |
| 2 | Code done, plan checkboxes unchecked | Verify each step → mark `[x]` → attest |
| 3 | Partial implementation — some steps not done | Implement missing → test → mark `[x]` → attest |
| 4 | Legacy/sprint-0 tasks — no plan file | Validation-only repair; do not create retroactive checkboxes |
| 5 | Attestation exists but <4 validations | Run missing validations → update attestation |

**See references/analysis-process.md** — full category handling detail.

## Delegation to Sub-Skills

| Sub-Skill | When to Use |
|-----------|------------|
| `/exec-gates <TASK_ID>` | Full gate verification (all 7 gates) — use for thorough check |
| `/exec-attestation <TASK_ID>` | Attestation creation structure reference |
| `/compliance-check` | Final compliance verification — run on tasks that had code changes |

## Configuration

- Sprint plan: `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv`
- Attestation schema: `apps/project-tracker/docs/metrics/schemas/attestation.schema.json`
- Plan files: `.specify/sprints/sprint-{N}/planning/{TASK_ID}-plan.md`
- Attestation dir: `.specify/sprints/sprint-{N}/attestations/{TASK_ID}/`
- Executive API: `http://localhost:3002/api/metrics/executive`
