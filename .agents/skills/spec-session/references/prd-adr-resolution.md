# Spec Session — Phase 0.97: PRD/ADR Resolution

**This phase runs AFTER dependency verification and BEFORE Round 1 ANALYSIS.**

PRDs and ADRs are formal project governance documents. Every spec must declare
its relationship to them so plan-session and exec can track and validate them.

## When PRD/ADR is Required

| Condition                             | PRD Required                | ADR Required                            |
| ------------------------------------- | --------------------------- | --------------------------------------- |
| Task prefix PG-\* (page/UI)           | YES                         | Only if architectural decision involved |
| Task prefix IFC-\* with UI components | YES                         | YES if new pattern/technology           |
| Task prefix IFC-\* backend-only       | NO (unless user-facing API) | YES if new pattern/technology           |
| Task prefix ENV-\* (infrastructure)   | NO                          | YES                                     |
| Task changes existing architecture    | NO                          | YES (update existing ADR or create new) |
| Task adds new external dependency     | NO                          | YES                                     |

## Step 1: Check Hydrated Context

Read the hydrated context from Phase 0. Check for:

- `prd_required: true` → PRD must be created or referenced
- `adr_required: true` → ADR must be created or referenced
- `relatedPrd` → existing PRD path (if found during hydration)
- `relatedAdrs[]` → existing ADR paths (if found during hydration)

## Step 2: Resolve PRD

**If PRD is required:**

1. Search `docs/planning/prd-*.md` for a PRD that covers this task's feature
   area
2. If found: read it, extract acceptance criteria and user stories to inform the
   spec
3. If NOT found: create a new PRD using `docs/planning/prd-template.md` as the
   template
   - File: `docs/planning/prd-<feature-area>.md`
   - Fill in: Overview table (Feature Name, Status=Draft, Related Tasks, dates)
   - Fill in: Problem Statement, User Stories, Acceptance Criteria
   - Mark Status as "Draft" — it will be updated to "In Progress" during exec
4. If found but outdated: update the PRD's `Related Tasks` field to include this
   task ID, update `Last Updated` date, add any new acceptance criteria from
   this task

**If PRD is NOT required:** note `PRD: N/A (infrastructure/tooling task)` in the
spec.

## Step 3: Resolve ADR

**If ADR is required:**

1. Search `docs/planning/adr/ADR-*.md` for an ADR whose `Technical Story`
   references this task or whose decision area matches
2. If found: read it, verify the decision still applies, extract constraints for
   the spec
3. If NOT found: create a new ADR stub using `docs/planning/adr/template.md`
   - Determine next number: `ls docs/planning/adr/ADR-*.md | sort | tail -1` →
     increment
   - File: `docs/planning/adr/ADR-{NNN}-<decision-slug>.md`
   - Fill in: Status=Proposed, Date, Technical Story=TASK_ID
   - Fill in: Context and Problem Statement, Decision Drivers, Considered
     Options
   - Decision Outcome can be marked "TBD — to be finalized during spec
     consensus"
4. If found but needs update: update the ADR (add new context, update Technical
   Story)
5. Update `docs/planning/adr/README.md` index table if a new ADR was created

**If ADR is NOT required:** note `ADR: N/A (no architectural decision)` in the
spec.

## Step 4: Embed in Spec Output

The spec's output (Phase 5) MUST include a `## Related Documents` section:

```markdown
## Related Documents

| Type | Path                                               | Status   | Action                         |
| ---- | -------------------------------------------------- | -------- | ------------------------------ |
| PRD  | `docs/planning/prd-core-crm.md`                    | Updated  | Added TASK_ID to Related Tasks |
| ADR  | `docs/planning/adr/ADR-019-core-crm-foundation.md` | Accepted | Referenced existing            |
```

This section is consumed by:

- **plan-session**: Verifies PRD/ADR exist, includes paths in plan's "Files to
  Modify"
- **plan-reviewer**: Checks category BB (PRD/ADR Verification)
- **exec**: Verifies PRD/ADR exist during Phase 1 context loading
- **compliance-check**: Validates PRD/ADR as part of Section 10
- **full-pipeline**: Checks PRD/ADR during Deliverable Verification

## Rules

- NEVER skip this phase — even if the task seems simple
- A PRD created here can be a lightweight stub (Problem Statement + User
  Stories + AC)
- An ADR created here can have `Decision Outcome: TBD` — but Context and Options
  must be filled
- If unsure whether PRD/ADR is needed, CREATE IT — it's cheaper to have an
  unnecessary document than to miss a required one
- PRD naming convention: `prd-<feature-area>.md` (lowercase, hyphenated)
- ADR naming convention: `ADR-{NNN}-<decision-slug>.md` (zero-padded 3-digit
  number)
