# PG-205 design check (plan Step 18)

There is no DESIGN mockup for this row: `Sprint_plan_I.csv` row PG-205 has no `DESIGN:` entry. The shipped UI was
compared with the nearest references instead.

| Surface | Reference | Result |
|---|---|---|
| `/contacts/contact-types` | PG-204 `/cases/case-types` (merged #894) and `docs/planning/module-settings-playbook.md` §1-§4 | Same structure: PageHeader with breadcrumbs (Dashboard / Contacts / Contact Types), 12-column bento (8 + 4), shared `SectionHeader` at h2, canonical `EmptyState entity="contacts" phase="passive"`, CTA in the section header, `forwardRef` `openCreate` handle, AlertDialog delete, Suspense skeleton with the same grid. |
| New Contact type picker | `docs/design/mockups/create-new-contact.html` (step 1 personal details only; it has no type field) | Kept where the existing form had it (step 3, "Additional Information", left column next to Status). It uses the same label (`text-sm font-semibold text-slate-700`) and field classes as the neighbouring native selects. |
| Edit Contact type picker | `ContactForm.tsx` existing step 3 layout | Placed above Tags in the right column, using `fieldClassName()` like the other fields. |
| Contacts list | `docs/design/mockups/contact-list.html` (filter bar: Status, Company, Sort; table columns) | The Type filter is a further `SearchFilterBar` dropdown with the same pattern as Status/Company (icon + label). The mockup has no type column; the shipped DataTable gains a "Type" column after Account, using the `@intelliflow/ui` `Badge` (outline) with a colour dot and the type name as text. The VIP segment chip sits under the filter bar in the slate tokens of the filter bar. |

Colour: 18 shared tokens from `apps/web/src/lib/color-tokens.ts`. Badge text is `-900` on `-200`, and every swatch
has a `ring-slate-500` outline. Contrast is asserted in `contact-type-colors.test.ts` (fails the run below 4.5:1
for text or 3:1 for the ring). Icons: Material Symbols only (`badge`, `flag`, `check`, `close`, `progress_activity`);
`subset-material-symbols.mjs --verify` passed (370 icons).

Deviations from the references: none beyond the added Type column and filter, which the row requires (AC-CTY-014).
