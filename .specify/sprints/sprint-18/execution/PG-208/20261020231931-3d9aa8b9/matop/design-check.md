# PG-208 design check (plan Step 20) — 2026-10-21

Reference: `docs/planning/module-settings-playbook.md` §1-§4 and the PG-201 Scheduled Reports page (no mockup on the
CSV row). Checked against the code and the passing page tests; file:line refer to commit `1ef8ad24f`.

| Playbook item | PG-208 | Evidence |
|---|---|---|
| §1 PageHeader with breadcrumbs, title, description; no ModuleSettingsLayout | Yes (Dashboard › Tasks › Automation; spec: no page actions) | `TaskAutomationContent.tsx` header block; `TaskAutomationContent.test.tsx` "renders the header…" |
| §1 12-col bento `grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-12`, 8 / 4 | Yes | `TaskAutomationContent.tsx:341,345,403` |
| §1 Cards `p-4 sm:p-5`, SectionHeader with `action` slot, `w-full` wrapper | Yes | `TaskAutomationContent.tsx:335,347,405`; shared `section-header.tsx` |
| §1 Skeleton mirrors the bento shape | Yes (8 rules / 4 settings + tags) | `TaskAutomationLoading.tsx`; `TaskAutomationLoading.test.tsx` |
| §1 Mobile stacks below `lg` | Yes (single column; rule rows `flex-col sm:flex-row`) | `AutomationRuleList.tsx` row markup |
| §2 `<EmptyState entity phase="passive" size="sm" className="py-4 px-3 gap-2">`, no CTA inside | Yes (`entity="rules"`) | `AutomationRuleList.tsx:309`; content test "passive empty state with no CTA inside it" |
| §3 "New Rule" / "New Tag" `<Button size="sm">`, Title Case, no icon, in the SectionHeader action slot | Yes | `TaskAutomationContent.tsx` Rules / Tags SectionHeaders |
| §3 Save disabled when `!isDirty \|\| isSaving` | Yes (card-local Save Settings) | `AutomationSettingsCard.tsx:186`; settings card tests |
| §4 TagsTab via `forwardRef` + `useImperativeHandle({ openCreate })`, `swatchClass` slate fallback, legacy-token normalisation | Yes (shared `components/shared/tags-tab.tsx`, PG-201's card lifted) | `TagsTab.test.tsx` (task automation and shared) |
| Icons: Material Symbols only | Yes | eslint `no-restricted-imports` passes |

## Rendered screenshots (2026-10-22)

These are authenticated captures of the production build. The setup matches the authenticated Lighthouse run (`artifacts/lighthouse/PG-208/waiver-evidence.md`): the seeded admin, three real rules (event, schedule, webhook), onboarding completed and the cookie banner accepted. The capture script is Playwright: Chromium, signing in like `tools/lighthouse/lhci-auth.js`. The files are in `artifacts/screenshots/PG-208/`:

| File | Viewport | What it shows |
| --- | --- | --- |
| `tasks-automation-lg.png` | 1440×900 @2x, full page | PageHeader, 8/4 bento, three rules with summaries and owner text, Settings card, Tags empty state |
| `tasks-automation-mobile.png` | 390×844, full page | Single column; each rule's actions wrap below its summary |
| `tasks-automation-rule-dialog-lg.png` | 1440×900 @2x | New Rule dialog: Name, Description, Tags, the Trigger fieldset and the ordered Actions fieldset |
| `tasks-automation-rule-dialog-trigger-zoom.png` | Trigger fieldset @2x | The trigger radio group |

**Defect found and fixed.** In the first `lg` capture, a webhook rule's row (two extra actions: Rotate Secret and New URL) pushed the action group to its full single-line width. That squeezed the rule's name and summary into a column about 120 px wide ("Billing follow- / ups").

The fix is in `AutomationRuleList.tsx`:
- the summary column now has `sm:min-w-64`;
- the action group has `sm:max-w-md`, so its buttons wrap onto a second line.

The re-capture shows every summary on readable lines.

**Pre-existing, shared, filed (#978).** Some Material Symbols render clipped:
- the selected radio indicator (`fiber_manual_record` in `packages/ui` RadioGroupItem) draws as a squiggle;
- the collapsed Tasks sidebar shows `warning`, `priority_high` and `flag` as "C" arcs, and `category` with its right part clipped.

The subset font contains all of these glyphs (measured in Chromium). Neither component is changed by PG-208.

Verdict: matches the playbook and the PG-201 pattern, now confirmed on a rendered, authenticated page.
