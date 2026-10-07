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

### 2026-10-05

| Date       | Author                   | Task IDs                                                                                           | Change Type | Reason                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Link             |
| ---------- | ------------------------ | -------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| 2026-10-05 | Observability audit lane | IFC-032, IFC-074, IFC-097, IFC-116, IFC-142, EP-001-AI, ENV-008-AI, INFRA-TF-004, IFC-043, IFC-052 | csv_modify  | Completed -> In Progress (50%). Each rested on evidence that fails its own criteria: production OTel export is off on every Railway service, trace evidence came from an in-memory exporter or hand-written IDs, the restore drill and on-call files describe teams and systems that do not exist, and some DoD artifacts were never produced. Per-task evidence is in each `.specify/sprints/sprint-N/planning/<ID>-plan.md`.                                                                                                                                                                    | honest-status PR |
| 2026-10-05 | Observability audit lane | IFC-033, IFC-117, PG-014, IFC-056                                                                  | csv_modify  | Owner ruling 2026-10-05: IFC-033, IFC-117, PG-014 Completed -> In Progress (50%); IFC-056 Completed -> Backlog (0%). k6 ran against localhost only; AI metrics are scraped by nothing in production; the public status page shows hard-coded and pseudo-random data; the upskilling evidence described people who do not exist (removed). Fabricated "(actual: ...)" KPI values on reopened rows removed (targets kept). 125 unverified "files read" entries (sha256 "verified-placeholder") removed from 47 attestations; those tasks keep Completed because every deliverable they list exists. | honest-status PR |

### 2026-10-06

| Date       | Author                   | Task IDs | Change Type | Reason                                                                                                                                                                                                                                                                                                                                                                                                                    | Link                   |
| ---------- | ------------------------ | -------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| 2026-10-06 | Observability audit lane | IFC-151  | csv_modify  | Completed -> In Progress (50%): the DoD requires "metrics and alerts", but the DLQ alerts are not loaded by anything connected to production (see IFC-032). IFC-125 and IFC-152 were also checked (their stale `attestation-latest.json` says INCOMPLETE). The newer re-validations are true in code (the audit logger is wired in container.ts; case-document.ts and documents.router.ts exist), so they stay Completed. | remove-fabrications PR |
| 2026-10-06 | Observability audit lane | IFC-032  | csv_modify  | In Progress -> Completed (100%) on production evidence: real ai-worker traces in Grafana Cloud (trace-examples.json now holds production trace IDs, replacing the in-memory capture), alert rules applied as code, test alert received by the owner at 18:05 BST. Owner ruling 18:20 BST "Just close it!". Logs, api spans and availability are follow-up issues.                                                         | ifc-032-close PR       |

### 2026-10-07

| Date       | Author                          | Task IDs                                   | Change Type | Reason                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Link                              |
| ---------- | ------------------------------- | ------------------------------------------ | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| 2026-10-07 | Completion-integrity audit lane | SALES-001                                  | csv_modify  | Completed -> Backlog (100% -> 0%). The DoD requires a single canonical link to the Figma/Canva design source; `artifacts/misc/sales/pitch-deck-source-link.txt` only ever held a placeholder and was deleted in 182bdd67b, and the outline still says "TBD". The outline and one-pager are delivered. Exempt from the strict sprint gates until 2026-10-11 23:59 London (owner ruling 2026-10-07).                                                                                                                                                                                                                                             | integrity-audit PR (sprints 1-17) |
| 2026-10-07 | Completion-integrity audit lane | IFC-125, IFC-139, DOC-011, IFC-029, PG-184 | csv_modify  | Artifacts To Track repointed to the files that exist; status unchanged (verified delivered). IFC-125: sanitizer moved to `packages/domain/src/security/prompt-sanitizer.ts`. DOC-011: the skill lives in `.agents/skills/compliance-check/` (tracked), not the gitignored `.claude/skills/`. PG-184: page is in the `deals/(list)/` route group. IFC-139: dropped `artifacts/logs/agent-actions.log`, a gitignored runtime log (the code is wired via `modules/agent/agent.router.ts`). IFC-029: dropped the generated, gitignored metrics-cache copy of its attestation; the canonical `.specify` attestation is COMPLETE with 4 validations. | integrity-audit PR (sprints 1-17) |

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
