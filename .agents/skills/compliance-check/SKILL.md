---
name: compliance-check
description: Validates task completion against design system, architecture, tests, linting, and key objectives. MUST run before marking any task as "Completed" in Sprint_plan.csv.
license: IntelliFlow CRM Internal
---

# Compliance Check Skill

Validates that a completed task meets all quality gates before marking it as "Completed".

## When This Skill Runs

- **AUTOMATICALLY** triggered by `/exec` before setting task status to "Completed"
- **MANUALLY** invokable via `/compliance-check [TASK_ID]` for ad-hoc validation

## Validation Sections

| # | Section | Blocking? | Reference |
|---|---------|-----------|-----------|
| 1 | Design Compliance (UI tasks only) | No | `references/design-compliance.md` |
| 2 | Source of Truth Updated | No | Sprint_plan.csv status matches actual state |
| 3 | Tests, Typecheck, Linter | Yes | Focused `--filter <package>` commands |
| 4 | Plan Deliverables Verification | **BLOCKING** | `references/plan-deliverables.md` |
| 5 | Context Acknowledgement | **BLOCKING** | `references/context-acknowledgement.md` |
| 6 | CSV Artifact Completeness vs Plan | **BLOCKING** | `references/csv-artifact-tracking.md` |
| 6b | Attestation Forensics | Yes | `references/attestation-forensics.md` |
| 7 | Mock Coverage Audit | Yes | `references/attestation-forensics.md` |
| 8 | Key Objectives | No | Code Quality, Security, Performance, etc. |
| 9 | Architecture Compliance | Yes | Hexagonal layer verification |
| 10 | PRD/ADR Governance | Yes | `references/prd-adr-governance.md` |
| 11 | Accessibility Doc Gate (UI route tasks) | **BLOCKING** | `references/accessibility-doc-gate.md` |

### Section 2: Source of Truth

Verify `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv` is updated.

### Section 3: Tests, Typecheck, Linter

**CRITICAL**: Run FOCUSED commands to avoid terminal hangs (full test suite takes ~10 minutes).

```bash
pnpm --filter <package> typecheck
pnpm --filter <package> lint
pnpm --filter <package> test --run
pnpm --filter @intelliflow/validators build  # if validators changed
```

Package mapping: PG-* → `@intelliflow/web` | IFC-* → `@intelliflow/api`, `@intelliflow/domain` | ENV-* → Root or specific app

### Section 8: Key Objectives

| Objective | Requirement |
|-----------|-------------|
| Code Quality | DRY, type-safe, >90% coverage |
| Integration | Fits existing architecture |
| Security | OWASP compliance, no secrets |
| Performance | Response <200ms, Lighthouse >90 |
| Documentation | Specs and docs updated |

### Section 9: Architecture Compliance

```
packages/domain (const arrays with `as const`)
       ↓
packages/validators (Zod schemas derived from domain)
       ↓
packages/application (use cases, ports)
       ↓
packages/adapters (infrastructure implementations)
       ↓
apps/api & apps/web (consuming packages)
```

Domain layer CANNOT import from adapters or apps. Validators MUST derive from domain constants.

### Section 11: Accessibility Doc Gate

**Applies to**: PG-* and IFC-* tasks with `page.tsx` in plan artifacts (excluding `(developer)/` routes).
**Blocking**: Yes — new routes added without VPAT/conformance statement updates fail compliance.

Detects new or modified Next.js routes in the task's plan file. Verifies that:
- `docs/compliance/wcag-conformance-statement.md` Section 2 includes the route
- `docs/compliance/vpat-2.5.md` header route count is updated
- Both documents have current Document Control entries

See `references/accessibility-doc-gate.md` for full verification procedure.

## Coverage Comparison (MANDATORY)

Show before/after coverage impact. **See `references/coverage-comparison.md`**.

## Output Format

**See `references/output-format.md`** for the full output template and decision tree.

## Integration with /exec

The `/exec` skill MUST call `/compliance-check` before:
1. Setting task status to "Completed" in Sprint_plan.csv
2. Generating the final delivery report

If compliance check returns FAIL: do NOT mark task as Completed. Set to "Needs Review" or keep "In Progress".

## Performance Notes

- **ALWAYS use focused package filters** (`--filter <package>`)
- **NEVER run full `pnpm test`** (takes ~10 minutes)
- Typical focused check: <30 seconds
- Full compliance check: <2 minutes
