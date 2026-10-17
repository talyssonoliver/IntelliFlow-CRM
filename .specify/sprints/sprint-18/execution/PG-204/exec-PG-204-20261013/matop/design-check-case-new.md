# Design check: /cases/new against docs/design/mockups/case-new.png

Done 2026-10-13 (about 14:00Z) during the plan re-verify. The mockup image was opened and compared with
the form source in `apps/web/src/components/cases/CaseForm.tsx` at `653e23641`.
No dev server was rendered for this check. The DOM order comes from the JSX order. No test asserts
the full order: the CaseForm tests check the labels and the Case type slot.

| Mockup (case-new.png), top to bottom | CaseForm.tsx | Match |
|---|---|---|
| Card "Case Information" | `<h2>` Case Information (:283) | yes |
| Subject * (full width) | `subject` (:288), required mark | yes |
| Category (left) / Priority (right) | `caseType` "Case type" (:318) in the Category slot / `priority` (:343) | yes. Category is replaced by Case type (owner ruling Q1=A, spec D1) |
| Priority default "Medium" | "Use default (…)" option, so the type or module default applies | intended change (spec D4: blank priority = default) |
| Description (textarea) | `description` (:374) | yes |
| Card "Client Information", Link to Client/Account * with search hint and "create a new one" | `clientSearch` (:415), link to the new-account form | yes |
| Card "Assignment & SLA": Assign To / Deadline / Due Date | `assigneeId` (:557), `deadline` (:586) | yes |
| (not in mockup) | timezone selector and `jurisdiction` (:623) in Assignment & SLA | `jurisdiction` is already on main (origin/main CaseForm.tsx:518). The timezone feeds the SLA deadline (spec D7) |
| Footer: Cancel, Create Case (primary, right) | Cancel (:661-665), Create Case (:677) | yes |

Result: the section order, field order and actions match the mockup. The deviations are the case-type
slot and the default-priority option (both from the spec) and the fields main already had.
