# PG-199 — a11y-expert review (WCAG 2.1 AA)

Reviewer: `a11y-expert` sub-agent spawned with the Agent tool, 2026-10-19 (read-only; no tests run).
Scope: `apps/web/src/app/agent-approvals/model-config/**` and the shared components it composes.

## Verdict as returned

`VERDICT: FAIL` — 0 blockers, 4 major, 6 minor, 1 note (AAA).

## Findings and resolution (commit `ef870c036`)

| Sev | SC | Finding | Resolution |
|---|---|---|---|
| major | 3.3.1, 3.3.3 | Model, temperature and fallback errors not tied to a control; no focus on failed Save | Fixed: `aria-invalid` + `aria-describedby` on the model trigger and the range; fallback entry errors on the Remove button and the Add trigger; list error via `listErrorId`; first `[aria-invalid="true"]` takes focus after client or server validation fails. Tests in `PurposeCard.test.tsx` and `ModelConfigContent.test.tsx`. |
| major | 2.4.3 | Focus restored to a disabled Save/Reset after confirm | Fixed: `onCloseAutoFocus` moves focus to the period line (`#mc-period`, `tabIndex=-1`) when the dialog closed by confirming. |
| major | 2.4.6, 1.3.1 | `EmptyState entity="rules"` showed "No rules configured" copy and added a tab stop | Fixed: explicit title "No fallbacks" + description, `tabIndex={-1}`. The component's `role="region"` is kept (overriding it to `group` is rejected by `jsx-a11y/prefer-tag-over-role`). |
| major | 4.1.3 | Notes appearing after a pick were not announced | Fixed: notes render inside an always-mounted `<output>` (`NoticeRegion`). |
| minor | 4.1.2 | Disabled range read "0.7" while "Default" is shown | Fixed: `aria-valuetext`. |
| minor | 1.4.1 | `aria-disabled` buttons looked active | Fixed: `aria-disabled:opacity-50 aria-disabled:cursor-not-allowed`. |
| minor | 3.3.1 | Add with no choice / Up on the first row silent; repeated message not re-read | Fixed: "Choose a model to add first.", "<id> is already first/last.", zero-width suffix on repeats. |
| minor | 3.3.2 | Error replaced the help text in `aria-describedby` | Fixed: help and error both referenced. |
| minor | 4.1.3 | Toast + page live region + alert can all speak one outcome | Kept, same pattern as the accepted PG-198 Approval Policies page (`ApprovalPoliciesContent.tsx` announce = toast + queued output). |
| minor | 2.4.1 | Landmark noise from six empty-state regions | Reduced only by the empty-state change above (regions remain while lists are empty); shared component behaviour, not changed here (L1). |
| note | 2.3.3 (AAA) | No `prefers-reduced-motion` handling for shared animations | Out of scope (AAA, shared CSS). |

Design decisions the reviewer accepted: native range + "Custom temperature" checkbox; `aria-disabled` reorder buttons with focus handling; queued page live region; `<output>` for the calm NOT_FOUND state; the confirm dialog text listing every downgrade.

Re-run after fixes: `pnpm --filter @intelliflow/web exec vitest run src/app/agent-approvals/model-config` → 72/72 (`logs/32-fix-web.txt`), axe checks included.
