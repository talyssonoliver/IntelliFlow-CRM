# PG-202 design check: /calendar/availability

- Date (UTC): 2026-10-17T18:06:19Z
- HEAD: 1b9202314 (implementation uncommitted at time of check)
- Skill: `/frontend-design`, invoked in this session before any UI was written
- Reference: no Figma mockup exists for this route (spec, Design section). The visual reference is
  `docs/planning/module-settings-playbook.md` §1-§4 and the PG-204 page
  `apps/web/src/app/cases/(list)/case-types/CaseTypesContent.tsx`.

## Playbook conformance

| Rule | Where | Result |
|---|---|---|
| §1 PageHeader with breadcrumbs and actions | `AvailabilityContent.tsx`: Dashboard / Calendar / Availability; actions Reset (secondary) and Save Changes (primary); omitted when read-only; no `hideOnMobile` | PASS |
| §2 12-column bento, `grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5` | Weekly hours 8, Timezone 4, Closures 8, Buffers & daily limit 4 (DOM order = reading order); skeleton mirrors 8/4/8/4 (`AvailabilityLoading.tsx`) | PASS |
| §3 `Card` + `SectionHeader` with `headingLevel={2}` and `titleId` | each card is `role="region"` with `aria-labelledby`; Weekly hours title is `focusableTitle` (focus target after Save/Reset) | PASS |
| §3 header CTA | "Add Closure" is a small button with no icon in the Closures `SectionHeader` `action`, as for "New Case Type" on PG-204 | PASS |
| §4 canonical empty state | `EmptyState entity="appointments" phase="passive" size="sm" className="py-4 px-3 gap-2"`, no CTA inside | PASS |
| Loading | Server shell `page.tsx` → `Suspense` fallback `AvailabilityLoading`; `aria-busy`, sr-only `<output>`, skeletons `aria-hidden` | PASS |
| Error state | `role="alert"` + Retry, same as PG-204 | PASS |

## Tokens and icons

- Card padding `p-4 sm:p-5`; icon tiles reuse the PG-204 palette (blue, violet) plus rose (Closures) and amber (Buffers),
  each with a dark variant.
- Error text `text-red-700 dark:text-red-300` everywhere (not `text-destructive`); the summary and server-error banners use
  `border-red-300 bg-red-50` / `dark:border-red-800 dark:bg-red-950/40`.
- Icons: `schedule`, `public`, `event_busy`, `timer`, `close`, all Material Symbols Outlined, all `aria-hidden`.
  `node tools/scripts/subset-material-symbols.mjs --verify` → `audit OK — 370 icons` (no new glyph, font unchanged).
- Touch targets: remove buttons `h-11 w-11`, Add range `min-h-11`.

## Shared pieces

Reused without forking: `PageHeader`, `SectionHeader`, `ConfirmationDialog`, `EmptyState`, `Card`, `Button`, `Input`,
`Label`, `Switch`, `Skeleton`, `TimezoneSelector`, `useTimezoneContext`, `useRequireAuth`, `trpc`.

Two additive props, no new shared component:
- `TimezoneSelector.showDetect` (default `true`), so the firm-zone field hides "detect my browser zone".
- `ConfirmationDialog.onCloseAutoFocus` (optional, passed to `AlertDialogContent`), so focus can move to the Weekly hours
  title after Reset instead of returning to the Reset button. Covered by
  `packages/ui/__tests__/confirmation-dialog.test.tsx` (RED/GREEN logs `red-ui-confirmation-dialog.txt`,
  `green-ui-confirmation-dialog.txt`).

## Accessibility behaviours wired

- Monday-first `fieldset`/`legend` per day, positional names ("Monday range 1 start"), switch "Monday open" described by
  the day summary.
- Validation runs when Save is clicked: `role="alert"` summary "N problem(s) need(s) fixing" with links that focus their
  field; focus moves to the first invalid field; field errors are linked by `aria-describedby`.
- Server error: focused `role="alert"`; CONFLICT adds Reload and disables Save until reloaded.
- Success: toast only; Reset: polite `<output>` announcement; focus to the Weekly hours title in both cases.
- Read-only: a note, values as text, no form controls.
- axe-core: zero violations in default, unconfigured, empty-closures, read-only and validation-error states
  (`AvailabilityContent.test.tsx`). A separate a11y-expert review of the built page runs in Step 21.

## Evidence

`tdd/green-web-availability.txt`: 10 files, 104 tests passed, exit 0.
