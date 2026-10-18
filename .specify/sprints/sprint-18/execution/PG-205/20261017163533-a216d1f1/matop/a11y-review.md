# PG-205 a11y-expert review (WCAG 2.1 AA), recovery lane

Spawned: an a11y-expert sub-agent (Agent tool, read-only static review plus a contrast script), launched after
commit `e929eb220`. Verdict: **PASS_WITH_FIXES** (no blocker).
Not verified at runtime or with a screen reader (the reviewer marked those items UNVERIFIED).

## Findings and disposition

| # | Where | WCAG | Sev | Finding | Disposition |
|---|---|---|---|---|---|
| 1 | ContactTypesContent.tsx default RadioGroup | 3.2.2, 2.1.1 | Medium | Radix radios select on arrow focus; `onValueChange` saves each intermediate type as the tenant default | fixed or noted (fix log) |
| 2 | ContactTypeDialog.tsx Save | 3.3.1, 3.3.2, 4.1.3 | Medium | Blank name: Save natively disabled with no reason; focus-first-invalid (A11Y-9) unreachable | fixed or noted (fix log) |
| 3 | ContactTypeDialog.tsx read-only key `<p aria-labelledby>` | 1.3.1, 4.1.2 | Low | aria-labelledby on `<p>` is ignored | fixed or noted (fix log) |
| 4 | new/page.tsx account hint `text-slate-400` | 1.4.3 | Low | 2.56:1 on white | fixed or noted (fix log) |
| 5 | DefaultTagPicker.tsx capped boxes | 1.4.1, 4.1.3 | Low | aria-disabled boxes look enabled; repeated cap message not re-announced | fixed or noted (fix log) |
| 6 | ContactTypesContent/Loading error+loading states | 1.3.1, 2.4.6 | Low | no h1 outside the loaded state | fixed or noted (fix log) |
| 7 | EntitySearchField "Account" label (pre-existing component) | 1.3.1, 4.1.2 | Low | label has no htmlFor; the input is named by aria-label "Search accounts" (2.5.3 passes) | pre-existing shared component (tasks/EntitySearchField.tsx, PG-204 pattern); not changed in PG-205 (L1) |
| 8 | ContactTypeSelect border slate-200 on slate-50 | 1.4.11 | Low | 1.18:1, copies the existing form-control pattern | pre-existing form pattern, consistent with the host forms; not changed (L1) |
| 9 | ContactsPageClient removeVipSegment | 4.1.3 | Low | the announcement may be pre-empted by the focus move; same text not re-announced | fixed or noted (fix log) |
| 10 | DeleteContactTypeDialog pending button | none | Info | focus while disabled; Radix traps focus | no change |

## Contrast (computed, Tailwind v3 hex; v4 oklch exact values unverified)

All 18 badge pairs (`-900` on `-200`) pass 4.5:1 (lowest: rose 6.78). Swatch outline slate-500: 4.76 (light card),
4.44 (light dialog), 3.10 (dark card, thin margin), 3.73 (dark dialog). Selected ring primary: 3.55-4.27. All
pass 3:1. Muted foreground: 5.43 / 5.74. Error text: 6.47 / 7.76.

## Fix log

RED 2026-10-17T21:53:06Z / GREEN 21:54:39Z (`red-green/22-a11y-review.*`):

- #1 fixed: the radio group only changes a draft; a "Save default" button saves (disabled while unchanged or busy).
- #2 fixed: Save is no longer natively disabled on a bad name; activating it shows "Name is required." (role=alert,
  aria-invalid, aria-describedby) and focuses the name; `aria-required="true"` on the name input.
- #3 fixed: the key is a read-only `Input` with `<Label htmlFor>`.
- #4 fixed: the account hint is `text-slate-500 dark:text-slate-400` (4.76:1).
- #5 partly fixed: capped boxes get `aria-disabled:opacity-50 aria-disabled:cursor-not-allowed`. Re-announcing the
  same cap message is not changed (Low; the hint stays linked via aria-describedby).
- #6 fixed: a visually hidden h1 "Contact Types" in the error and loading states.
- #9 not changed (Low, UNVERIFIED with a screen reader). The announcement and the focus move are covered by the
  existing A11Y-8 test.
- #7 and #8: pre-existing shared patterns, left as is (L1).
