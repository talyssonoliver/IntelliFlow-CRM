# PG-199 Round 2 PROPOSAL (Frontend-Lead)

Paths are relative to the worktree root. Read-only analysis of existing code; this file is the only file written.

## Approach
- Copy the PG-198 shell. `approval-policies/page.tsx:9-19` is a server `page.tsx` with Suspense, and `ApprovalPoliciesContent.tsx:49-197` owns the logic. The PG-199 stub at `model-config/page.tsx:1` is a `'use client'` file and must lose that directive.
- Use PG-202's draft/snapshot discipline. `AvailabilityContent.tsx:192` computes `isDirty = normalize(draft) !== snapshot.baseline`. `:104-112` seeds the draft from query data and never overwrites a dirty draft. The same hook shape fits here (`useModelConfigDraft`).
- Use PG-202's calm NOT_FOUND branch (`AvailabilityContent.tsx:159-175`). The three existing `errorCode` copies (`AvailabilityContent.tsx:60`, `CaseTypesContent.tsx:27`, `ContactTypesContent.tsx:28`) mean this PR extracts rather than adds a fourth.
- One card per purpose, six cards, all from a single `PurposeCard` fed by a metadata map. `PageHeader` has an `actions` array (`page-header.tsx:18-33`), so Save and Reset go there, not into a per-card footer. That gives one page-level Save, as the brief requires.
- **Challenge to the lead assumptions:** the lead puts constants in `packages/domain`. That is fine for the web because `ApprovalPoliciesContent.tsx:14` already imports runtime constants from `@intelliflow/domain`. But I do not want the web to import the rank table to decide a downgrade. The API `get` should return, per model, `{ id, label, family, rank, priceIn1k, priceOut1k }`, and the web should call a shared pure `isDowngrade` from domain, so the client confirm and the server check cannot drift. The server stays authoritative through `acknowledgeDowngrade`. If the lead prefers the web not to import domain at all, `get` can return a precomputed `downgradesFrom` per model per row. I recommend the domain import, because the domain package is already in the web bundle.

## Files
Create under `apps/web/src/app/agent-approvals/model-config/` unless noted.
1. `page.tsx` (MODIFY, rewrite): server Suspense shell. EXTENDS the `approval-policies/page.tsx` pattern. Rationale: the stub is client-only and cannot stream.
2. `ModelConfigContent.tsx` (NEW file, COMPOSES `PageHeader`, `Card`, `ConfirmationDialog`, `toast`): auth gate via `useRequireAuth` (as `ApprovalPoliciesContent.tsx:50`), `trpc.modelConfig.get`, `update`, `resetToDefaults`. It owns Save, Reset, the downgrade dialog and the aria-live announcer.
3. `ModelConfigLoading.tsx` (NEW, EXTENDS `ApprovalPoliciesLoading.tsx:7-34`): same skeleton with six `lg:col-span-6` cards, and card heights equal to real cards to hold CLS at 0.
4. `components/PurposeCard.tsx` (NEW, COMPOSES `Card`, `SectionHeader`, `Select`, `Slider`, `Input`, `Label`, `Badge`): the single reusable row. NEW is justified because no existing component edits model plus parameters. Props are `{ row, models, draft, onChange, readOnly, errors }`. The same component renders the rag locked state and the email blocked state through props, so there are no forks.
5. `components/FallbackList.tsx` (NEW, EXTENDS the interaction pattern of `ResolutionChecklistEditor.tsx:130-166`): an `<ol>` with up, down and remove buttons at `h-11 w-11`, an add `Select`, and an `EmptyState entity="rules"` when empty (`entity-empty-state-config.ts:30`). It is a new file because the checklist editor edits free text, not a model list. It does not copy that file's code. Only the shape is reused, to keep duplication under the Sonar limit.
6. `components/TemperatureControl.tsx` (NEW, COMPOSES `ui/Slider` `slider.tsx:5-19`): Slider plus a synchronised number `Input` plus visible value. It is separate because `Slider` has no label or value display. It passes `aria-label` and `aria-valuetext` to the Thumb and tests that Radix forwards them.
7. `components/DowngradeDialog.tsx` is NOT created. COMPOSES the existing `ConfirmationDialog` (`confirmation-dialog.tsx:17-39`, `variant="destructive"`) inside `ModelConfigContent`, avoiding a wrapper component.
8. `model-config-model.ts` (NEW, pure, mirrors `approval-policies/components/policy-model.ts`): `toDraft`, `normalize`, `isDirty`, `buildUpdateInput`, `findPendingDowngrades`, `formatUsd`, `centsFromUsd`. All logic lives here and in Content, since `page.tsx` is excluded from coverage.
9. `apps/web/src/lib/trpc-errors.ts` (NEW): `errorCode`, `errorMessage`, `isNotFound`. Migrating the three old copies is OUT of scope. I propose only to replace `ApprovalPoliciesContent.tsx:45` if the lead wants, but I'd leave it.
10. `components/CalmNotice.tsx` or inline: skip. The NOT_FOUND branch is about 12 lines inside Content, and a shared component adds an indirection for one caller.
11. `__tests__/ModelConfigContent.test.tsx`, `PurposeCard.test.tsx`, `FallbackList.test.tsx`, `model-config-model.test.ts`: the test-engineer owns detail. The NOT_FOUND test should follow `AvailabilityContent.test.tsx:144-159` (`role=status`, no `role=alert`).
12. Docs/registries (MODIFY): `docs/design/page-registry.md`, `sitemap.md:239,449` ("Implemented" becomes true), `PAGE_MAP_AND_FLOWS.md`, `navigation-reachability-audit.md`. The sidebar already links the page (`sidebar/configs/agent-approvals.ts:194-199`), so no sidebar change.
13. `lighthouserc.authenticated.js` (MODIFY): add the URL. Per R1, this is the DoD gate.

## Interfaces
Assumed `modelConfig.get` output (backend-architect to confirm):
```ts
{ canManage: boolean; stale: { workerCacheSeconds: 60 };
  models: { id: string; label: string; family: string; rank: number; purposes: Purpose[] }[];
  limits: { temperature: {min,max,step}; maxTokens: {min,max}; fallbackMax: number; ceilingCentsMax: number };
  rows: { purpose: Purpose; modelId: string|null; fallbackIds: string[]; temperature: number|null;
          maxTokens: number|null; ceilingCents: number|null; spentCents: number|null;
          locked: boolean; blocked: boolean; updatedAt: string }[] }
```
- `update` input per purpose: `{ purpose, modelId, fallbackIds, temperature, maxTokens, ceilingCents, expectedUpdatedAt, acknowledgeDowngrade }`.
- **Rule A (old-API safety):** `buildUpdateInput` omits `acknowledgeDowngrade` unless it is true, and omits null-valued new fields. A plain `z.object` strips unknown keys (R1 backend concern 2), so this is belt and braces.
- **Rule B (save granularity):** Save sends only rows that differ from the snapshot, one `update` per changed row, run sequentially so a failure names its purpose. Per-purpose `update` is the backend's contract (R1-backend: "upsert one purpose in `$transaction`").
- **Dirty rule:** normalize `''`/undefined to null (playbook section 3). The draft is re-seeded from the query only when clean.
- **Save disabled when** `!canManage || !isDirty || isSaving || hasErrors` (playbook `:65-67`). `hasErrors` is local validation using the shared validator schema (duplicate fallback, primary in fallbacks, bounds).
- **rag row (Q5):** `locked: true`. The model `Select` is `disabled` with visible text "Fixed: changing it would change vector size", and a `<span>` explaining why, not just `disabled`. Temperature, max tokens and fallbacks are hidden for rag, since R1-ai-specialist C7 says they are meaningless there. Only the ceiling input stays editable. The card still has a heading and the same grid slot, so layout is stable.
- **email blocked (Q6):** `blocked: true` renders a `Badge` plus a `role="status"` line "Monthly AI ceiling reached for email. Drafts are paused until <first of next month, UTC>. Other purposes keep working." It is `status`, not `alert`, since it is persistent state and not an interruption. Controls stay editable so an admin can raise the ceiling. Other blocked purposes use the same state with the line "Falls back to non-AI behaviour" (the table in R1-domain-expert).
- **Spend readout:** `Intl` formatted "$3.20 of $5.00 this month" plus a `<progress>`-style bar with `aria-label`. Copy states it is an estimate (R1-ai-specialist Q-C) and takes up to 60 s to apply (R1-backend concern 7). If `spentCents` is null, show "Spend unavailable", never "$0.00".

## Integration
- Mounted at the existing route `/agent-approvals/model-config`; the sidebar link exists (`agent-approvals.ts:194-199`).
- Breadcrumbs: `Dashboard > AI & Agents > AI Settings > Model Configuration` (`ApprovalPoliciesContent.tsx:38-43`). A short `Link` to `/agent-approvals/ai-settings` states that prompt versions are edited there (`ChainVersionEditor.tsx:68-85`).
- Read-only users (`canManage` false) see the same cards, with disabled controls and a note, as `ApprovalPoliciesContent.tsx:191`.
- **Lighthouse:** server shell and skeleton, no new dependency, the Slider/Select Radix chunks are already in the shared bundle. Every control has a visible `<Label>`. Fallback buttons have `aria-label`s. Colour contrast uses the existing tokens. Reorder moves focus to the moved button (`data-*` ids as in `ResolutionChecklistEditor.tsx:143`) and announces through the page `<output aria-live="polite">` (`ApprovalPoliciesContent.tsx:187`).
- **L11:** the Content imports `@intelliflow/domain` (already used by web) and `@intelliflow/validators`. It imports nothing from ai-worker or api.
- **Duplication control:** one `PurposeCard`, one `FallbackList`, one `trpc-errors.ts`. No copy of the PG-198 dialog or card code.

## Runtime Consumer
| New thing | Production caller | Legacy path replaced |
|---|---|---|
| `modelConfig.get` / `update` / `resetToDefaults` | `ModelConfigContent.tsx` (`trpc.modelConfig.*`) | The "coming soon" stub at `model-config/page.tsx:10-13` |
| `trpc-errors.ts` | `ModelConfigContent.tsx` | None replaced (the three old copies remain, noted as follow-up) |
| `findPendingDowngrades` / domain `isDowngrade` | `ModelConfigContent` pick handlers and Save | None (new rule, R2/Q4) |
| `PurposeCard`, `FallbackList`, `TemperatureControl` | `ModelConfigContent.tsx` | None |

Reset opens a `ConfirmationDialog` that lists what resets (all six purposes: model, fallbacks, temperature, tokens, ceiling) and what stays (spend history, audit trail), per playbook `:130-131`.

## Open points for consensus
1. Per-row `update` calls versus one batch `updateAll`: one atomic batch gives a cleaner Save (all or nothing). I'd ask backend-architect for `updateAll`, or accept the sequential per-row approach with partial-failure messaging.
2. `expectedUpdatedAt` conflict (R1-backend concern 4) needs a UI message ("changed by someone else, reload"). I'd refetch and keep the draft diff visible.
