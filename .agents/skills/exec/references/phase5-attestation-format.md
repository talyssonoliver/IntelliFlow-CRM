# Phase 5: Update Status & Delivery Report

## Attestation Location (CRITICAL)

The attestation MUST be written to the **canonical** path:
```
.specify/sprints/sprint-{N}/attestations/{{task_id}}/attestation.json
```

Do NOT write it under `execution/{run_id}/`. The integrity checker and validation-summary API
only scan the `attestations/` directory. If using the `/exec-attestation` sub-skill, it handles
this automatically. If writing attestation inline, use this path.

## Status Decision Matrix

| MATOP | Compliance | New Status | Action |
|-------|------------|------------|--------|
| PASS | PASS | Completed | Task done |
| PASS | WARN | Completed | Done, warnings documented |
| PASS | FAIL | Needs Review | Compliance blocking |
| WARN | Any | In Progress | Remediation required |
| FAIL | Any | Failed | Blocking issues |

Update Sprint_plan.csv with new status.

## Delivery Report Format

Save to `.specify/sprints/sprint-{N}/execution/{{task_id}}/{run_id}/{{task_id}}-delivery.md`:

```markdown
# Delivery Report: {{task_id}}

**Run ID**: {run_id}
**Date**: {timestamp}
**Task**: {{task_id}} - {description}

## Implementation Summary
### Files Created
| File | Lines | Purpose |

### Files Modified
| File | Changes | Reason |

### Test Files
| Test File | Tests | Status |

## TDD Execution
| Step | Description | RED | GREEN | REFACTOR |

## Acceptance Criteria Validation
| Criterion | Status | Evidence |

## Definition of Done Validation
| DoD Item | Status | Evidence |

## MATOP Validation
| STOA | Verdict | Gates Passed | Gates Failed |
**Consensus Verdict**: PASS/WARN/FAIL

## Compliance Check Results
| Check | Status | Details |

## Task Status
**Status Change**: Plan Complete → {new_status}
```

## Exec Session Summary (Final Output)

```markdown
## Exec Session Summary
**Task**: {{task_id}}
**Run ID**: {run_id}
**Steps Completed**: X/Y
**MATOP Verdict**: PASS/WARN/FAIL
**Compliance Verdict**: PASS/WARN/FAIL
**Status**: Plan Complete → {new_status}
**Artifacts**:
- Delivery: .specify/sprints/sprint-{N}/execution/{{task_id}}/{run_id}/{{task_id}}-delivery.md
- Summary: .specify/sprints/sprint-{N}/execution/{{task_id}}/{run_id}/summary.json
```
