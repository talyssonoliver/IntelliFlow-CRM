# ADR-003: Sprint-Scoped Validation for Plan Linting

**Status:** Accepted

**Date:** 2025-12-17

**Deciders:** Architecture Team, Delivery Lead

**Technical Story:** AUTOMATION-001, IFC-160

## Context and Problem Statement

The existing Node.js plan linter produced 158 errors when run against the full
303-task Sprint_plan.csv. Analysis revealed most errors were false positives:
dependency cycles and cross-sprint violations in Sprint 1+ tasks that aren't
relevant to the current Sprint 0 work. How should we scope validation to reduce
noise while maintaining integrity?

## Decision Drivers

- Reduce false positive errors to near zero
- Maintain strict validation for current sprint
- Allow future sprint tasks to have "planned" dependencies
- Support cross-sprint dependency tracking
- Enable CI/CD integration with clean exit codes
- Tier A tasks require strict validation regardless of sprint

## Considered Options

- **Option 1**: Sprint-scoped validation (default to current sprint)
- **Option 2**: Validate all sprints (current behavior)
- **Option 3**: Allow-list specific cross-sprint patterns
- **Option 4**: Ignore all cross-sprint dependencies

## Decision Outcome

Chosen option: "Sprint-scoped validation", because it eliminates false positives
from future sprint planning while maintaining strict validation for active work.
Cross-sprint dependencies within scope are validated; dependencies from current
sprint to future sprints are flagged as errors.

### Positive Consequences

- Zero false positives for well-formed current sprint
- CI passes for valid sprint 0 plan
- Future sprint planning doesn't break validation
- Cross-sprint dependency direction enforced (no forward deps)
- Tier A tasks always validated strictly

### Negative Consequences

- Future sprint issues discovered later
- Must remember to validate when sprint advances
- Some planning errors deferred

## Pros and Cons of the Options

### Sprint-Scoped Validation

- Good, because it eliminates false positives from future planning
- Good, because CI/CD has clean exit codes
- Good, because it focuses on actionable issues
- Good, because it's configurable with `--all-sprints` flag
- Bad, because future sprint issues are discovered later

### Validate All Sprints

- Good, because it catches all issues immediately
- Good, because it's comprehensive
- Bad, because it produces many false positives
- Bad, because CI fails on unrelated issues
- Bad, because it blocks current sprint work

### Allow-List Patterns

- Good, because it's explicit about what's allowed
- Bad, because it requires maintenance
- Bad, because patterns can be error-prone
- Bad, because it's complex to configure

### Ignore Cross-Sprint Dependencies

- Good, because it simplifies validation
- Bad, because it misses real errors
- Bad, because forward dependencies slip through
- Bad, because sprint integrity isn't enforced

## Links

- Related: [ADR-002 CSV Source of Truth](./ADR-002-csv-source-of-truth.md)
- [Plan Linter Implementation](../../../tools/plan/src/application/lint_plan.py)
- [Dependency Graph Domain](../../../tools/plan/src/domain/dependency_graph.py)

## Implementation Notes

### Validation Rules

**Hard Rules (Errors - block CI):** | Rule ID | Description | Scope |
|---------|-------------|-------| | CYCLE-001 | Dependency cycle detected |
Scoped sprint | | XSPRINT-001 | Sprint N depends on Sprint M (M > N) | Scoped
sprint | | UNRESOLVED-001 | Dependency task ID not found | Scoped sprint | |
TIER-A-001 | Tier A missing gate_profile | All Tier A | | TIER-A-002 | Tier A
missing acceptance_owner | All Tier A | | DUP-001 | Duplicate task ID | All
tasks |

**Soft Rules (Warnings - logged but pass CI):** | Rule ID | Description | Scope
| |---------|-------------|-------| | FANOUT-001 | High fan-out (3+ dependents)
| Scoped sprint | | VALIDATION-001 | Missing validation.yaml entry | Scoped
sprint | | TIER-B-001 | Tier B missing gate_profile | Scoped sprint | |
WAIVER-001 | Waiver expiring within 30 days | All with waivers |

### Cross-Sprint Validation Logic

```python
# Task in Sprint N cannot depend on Task in Sprint M where M > N
# (You can't depend on future work)

if task.sprint < dependency.sprint:
    # Error: forward dependency
    create_cross_sprint_error(task, dependency)
elif task.sprint > dependency.sprint:
    # OK: depending on past work
    pass
else:
    # Same sprint: validate normally
    pass
```

### CLI Usage

```bash
# Validate current sprint (default: 0)
plan-lint --sprint 0

# Validate all sprints (may produce warnings)
plan-lint --all-sprints

# Verbose output with fix suggestions
plan-lint --sprint 0 --verbose
```

### Validation Criteria

- [x] Sprint 0 validates with zero errors
- [x] Cross-sprint forward deps flagged
- [x] Same-sprint cycles detected
- [x] Tier A rules always enforced
- [x] `--all-sprints` flag works
- [x] Tests cover all rule types

### Rollback Plan

1. Revert to `--all-sprints` default behavior
2. Add explicit allow-list for known false positives
3. Update plan-overrides.yaml with waivers
