# PG-199 Round 1 ANALYSIS (Frontend-Lead)

Paths are relative to the worktree root. Read-only analysis; no other file was edited.

## Files Reviewed
- `apps/web/src/app/agent-approvals/model-config/page.tsx:1-16`: client-component stub reading "coming soon". It needs replacing with a server shell.
- `approval-policies/page.tsx:9-19`: Suspense shell, `<ApprovalPoliciesLoading />` fallback, then the Content component. This is the shell to copy.
- `approval-policies/ApprovalPoliciesContent.tsx:13-18,150-162,187,197`: imports from `@intelliflow/ui`, `PageHeader` and `SectionHeader`. Its error branch renders the raw `listQuery.error.message`, with no NOT_FOUND handling. It has an `aria-live` `<output>` and the `lg:grid-cols-12` bento.
- `calendar/availability/AvailabilityContent.tsx:60-64,159-175,192-195`: a local `errorCode()` helper and the calm NOT_FOUND branch (`PageHeader` plus a static `<output>`). It computes `isDirty` as `normalize(draft) !== snapshot.baseline`, which is the playbook dirty rule.
- `docs/planning/module-settings-playbook.md:25-43` (layout), `:58-67` (CTAs, Save disabled when `!isDirty || isSaving || hasConflict`), `:69-85` (dirty snapshot), `:87-100` (TagsTab), `:139-165` (toggle wiring).
- `packages/ui/src/components/slider.tsx:1-22`: Radix Slider with a single Thumb. It shows no value and has no `aria-label` of its own, so the caller must supply both. `confirmation-dialog.tsx:17-39` takes `open`, `title`, `description`, `confirmLabel`, `onConfirm`, `variant` and `isLoading`.
- `cases/(list)/case-types/components/ResolutionChecklistEditor.tsx:130-166`: the ordered-list pattern, with up/down/remove buttons at 44px (`h-11 w-11`). The buttons carry per-index `aria-label`s and use `aria-disabled` at the ends.
- `.specify/sprints/sprint-18/context/PG-199/PG-199-owner-ruling.md:11-38`: Q1 to Q4 plus the runner constraints. `Sprint_plan.csv` row PG-199 holds the DoD.

## Interpretation
- **Page shape:** server `page.tsx` with Suspense, then `ModelConfigContent.tsx` and `ModelConfigLoading.tsx`. These sit beside the CSV ARTIFACTs, which already name `page.tsx` and `ModelConfigContent.tsx`.
- **Bento layout:** `PageHeader` with breadcrumbs `Dashboard > AI & Agents > AI Settings > Model Configuration`, copying `ApprovalPoliciesContent.tsx:38-43`. The grid is `grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5`.
- **Cards (six purposes):** each of scoring, qualification, email, reasoning, structured and rag gets one card at `lg:col-span-6`, or `xl:col-span-4` if three fit. A card holds:
  - a primary model `Select`;
  - temperature as `Slider` plus a visible value and a number `Input`;
  - max tokens as an `Input type=number`;
  - a monthly USD ceiling `Input`, with an empty value meaning no ceiling;
  - an ordered fallback list.
- **Page-level controls:** one page-level Save and Reset, driven by a dirty snapshot as in `AvailabilityContent.tsx:192`.
- **Downgrade confirm:** a pick of a lower-ranked model, primary or fallback, opens `ConfirmationDialog` before it enters the draft (rulings R2 and Q4). The dialog's `onConfirm` applies the pick to the draft only. The server writes the audit entry on Save.
- **Toggles:** the page has no Boolean toggle, so playbook section 8 and "AI defaults FALSE" need no wiring. The only possible Boolean is a per-purpose "ceiling enabled" switch, and I'd drop it in favour of a nullable ceiling. The `Switch` listed in the brief is therefore not needed.
- **DoD item TagsTab via forwardRef:** N/A. There is no tags card, and `grep forwardRef|colorToken` under `agent-approvals` finds only the PG-198 policy chips. This agrees with the exploration doc at `PG-199-spec-exploration.md:76,85`.
- **DoD item colorToken CHECK:** N/A for the same reason. Rows are keyed by purpose, not by user-labelled entities.
- **Empty state:** `EmptyState` is only reachable if the allow-list returns no models, or a purpose has an empty fallback list. For the fallback case use `entity="rules"` with `phase="passive" size="sm"` and no action button (playbook section 2).

## Questions (code cannot answer)
1. Is the model allow-list returned by the API (`list` includes `models[]` with rank and price), or hardcoded in the web? I need the API contract from backend-architect. I recommend the API, because the ranking must be identical for the client confirm and the server audit.
2. Does a cost ceiling need a "spent this month" readout per card? Q2 requires spend tracking, so showing it is cheap. I recommend yes, as read-only progress text.
3. Is there a maximum fallback length? I assume 3, pending the validator.

## Concerns (code evidence)
1. **Sonar duplication:** `errorCode()` is copy-pasted in three files (`AvailabilityContent.tsx:60`, `CaseTypesContent.tsx:27`, `ContactTypesContent.tsx:28`), and `errorMessage` is also duplicated (`ApprovalPoliciesContent.tsx:45`). Adding a fourth copy risks the >3% duplicated-lines limit. I propose a shared `apps/web/src/lib/trpc-errors.ts` (`errorCode`, `errorMessage`, `isNotFound`). Migrating the three existing copies is optional and I'd keep it out of this PR. The per-purpose card also needs one `PurposeCard` component rendered six times from a metadata map, and the fallback editor should be one component, not six copies. The calm-degrade `PageHeader` plus `<output>` block (`AvailabilityContent.tsx:161-175`) is worth extracting as a small shared `ComingSoonNotice`.
2. **Deploy skew:** `ApprovalPoliciesContent.tsx:150-162` shows a raw error, which breaks the owner constraint "degrade calmly on NOT_FOUND". Copy the PG-202 branch (`:161`). Also send only fields the old API accepts, so the Save payload must not include the new fields on a NOT_FOUND `get`. The same applies to a missing spend table, where the API should fail open and the UI should show "spend unavailable", not 0.
3. **Fallback list a11y:** `ResolutionChecklistEditor.tsx:138-166` has the pattern, but no live-region announcement on reorder. Add the `aria-live` `<output>` from `ApprovalPoliciesContent.tsx:187` ("Fallback 2 moved to position 1"). Keep 44px targets and focus on the moved item after reorder. Use `<ol>`, not a div list.
4. **Slider a11y:** `slider.tsx:15` renders one Thumb with no label. Pass `aria-label` through `Slider`, plus `aria-valuetext`, and keep the number `Input` as the accessible fallback. Check whether Radix forwards `aria-label` to the Thumb. In Radix it goes to the Root, so I'd verify with a test. Contrast and touch size need checking at the 5px thumb height.
5. **Lighthouse:** `model-config` is not in `lighthouserc*.js`. The page is authenticated, so it needs `lighthouserc.authenticated.js` and playbook `docs/claude-refs/lighthouse-playbook.md`. Risks are six cards with six Selects and Sliders (Radix cost) and labels on every control. Mitigation: no extra client libraries, and skeleton dimensions that match the cards to avoid CLS.
6. **L11 build graph:** the Content imports types and constants from `@intelliflow/validators` only (zod, light). It must NOT import `@intelliflow/domain` runtime or anything from `apps/ai-worker`. `LLMPurpose` is defined only in ai-worker (exploration `:21-22`), so the purpose list and model ranks must live in `packages/validators/src/model-config.ts` (the CSV ARTIFACT), not be imported from ai-worker.
7. **Coverage:** `app/**/page.tsx` is excluded from coverage (exploration `:110`), so all logic belongs in `ModelConfigContent.tsx` and components. For diff-coverage, put the draft and dirty logic in a pure `model-config-model.ts`, mirroring `policy-model.ts`.
8. **Stale docs:** `ChainVersionEditor.tsx:68-85` also edits model, temperature and maxTokens (exploration `:73-75`). Model Config should carry a link/hint to AI Settings, not duplicate that editor.

## Dependencies on other agents
- backend-architect: the router contract. This means `list` returning `{ rows[6], models[], canManage, spend }`, an `update` input shape with the superRefine duplicate-fallback check, and the `NOT_FOUND` behaviour of old API versions.
- ai-specialist: the canonical model ids and rank order (`MODEL_PRICING`, `ai.config.ts:198-269`), which tiers/models are allow-listed per purpose, and the fallback max.
- Shared with a11y-expert (if spawned): slider and reorder-list behaviour.
