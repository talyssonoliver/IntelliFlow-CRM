# Sprint Plan Change Log

This is an **append-only** log of all changes to the Sprint plan
(`Sprint_plan.csv`) and its overlay (`plan-overrides.yaml`).

## Format

Each entry must include:

- **Date**: ISO 8601 date
- **Author**: Person making the change
- **Task IDs**: Tasks affected
- **Change Type**: One of `overlay_add`, `overlay_modify`, `csv_modify`,
  `dependency_fix`, `tier_change`, `gate_update`
- **Reason**: Brief explanation
- **Link**: PR/ADR reference

---

## Change History

### 2025-12-17

| Date       | Author    | Task IDs                                                                                                                                                                   | Change Type    | Reason                                                                               | Link                                 |
| ---------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------ | ------------------------------------ |
| 2025-12-17 | Tech Lead | ENV-017-AI                                                                                                                                                                 | dependency_fix | Removed cross-sprint dependency on IFC-001. Added stub_contract exception policy.    | PLAN-FIX-001                         |
| 2025-12-17 | Tech Lead | IFC-000, EXC-INIT-001, AI-SETUP-001, AI-SETUP-002, ENV-001-AI, ENV-002-AI, ENV-003-AI, ENV-004-AI, ENV-005-AI, ENV-006-AI, ENV-007-AI, ENV-009-AI, ENV-013-AI, EXC-SEC-001 | tier_change    | Classified as Tier A with full gate_profile, acceptance_owner, and evidence_required | plan-overrides.yaml initial creation |
| 2025-12-17 | Tech Lead | AI-SETUP-003, ENV-008-AI, ENV-010-AI, ENV-011-AI, ENV-012-AI, ENV-014-AI, ENV-015-AI, ENV-016-AI, ENV-017-AI, ENV-018-AI, AUTOMATION-001, AUTOMATION-002, IFC-160          | tier_change    | Classified as Tier B/C with gate profiles                                            | plan-overrides.yaml initial creation |

---

## Change Types Reference

| Type             | Description                                     |
| ---------------- | ----------------------------------------------- |
| `overlay_add`    | New task added to plan-overrides.yaml           |
| `overlay_modify` | Existing overlay entry modified                 |
| `csv_modify`     | Sprint_plan.csv modified (requires approval)    |
| `dependency_fix` | Dependency cycle or cross-sprint issue resolved |
| `tier_change`    | Task tier classification changed                |
| `gate_update`    | Gate profile or validation rules updated        |

---

## Approval Requirements

| Change Type           | Approvers Required               |
| --------------------- | -------------------------------- |
| `csv_modify`          | Tech Lead + PM + 1 Reviewer      |
| `tier_change` (A→B/C) | Tech Lead                        |
| `dependency_fix`      | Tech Lead + affected task owners |
| `overlay_add/modify`  | 1 Reviewer                       |

---

## Notes

- All changes to `Sprint_plan.csv` must go through PR review
- `plan-overrides.yaml` changes can be made via PR with 1 reviewer
- Emergency fixes must be documented here within 24 hours
- This log is the source of truth for plan evolution history
