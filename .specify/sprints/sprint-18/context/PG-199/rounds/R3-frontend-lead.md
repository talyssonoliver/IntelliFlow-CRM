# PG-199 Round 3 CHALLENGE (Frontend-Lead)

Paths relative to the pg-199 worktree. I accept Q7, Q8 and the atomic Save. This file is the only file written.

## Challenges
1. **My R2 pick-time confirm is wrong for an atomic Save; move the confirm to Save.** At pick time, A to B and back to A would confirm twice for a net no-op. The downgrade is defined against the saved baseline (backend R2 computes `findDowngrades` inside the transaction against the stored row). So the web should compute `findDowngrades(snapshot, draft)` when Save is clicked and open ONE `ConfirmationDialog` (`packages/ui/src/components/confirmation-dialog.tsx:17-39`) listing every downgrade across all purposes, primary and fallback. On confirm it calls `update({ ..., acknowledgeDowngrade: true })`. At pick time the card only shows a non-modal inline note, "Lower price than saved: will ask to confirm on Save". This still satisfies Q4, because audit and confirm happen at the write.
2. **Q7 copy must say "lower price", never "weaker".** The owner accepted that llama-3.3-70b outranks gpt-4o-mini. In `MODEL_PRICING` (`apps/ai-worker/src/config/ai.config.ts:198-269`) the free/local rows are `{input:0, output:0}` (`reasoning-free`, `rag-free`), so many models tie at 0. Equal price is lateral (no confirm). The dialog text must therefore be "This model costs less per 1k tokens than the current one", and every option label shows the price, so the confirm is explainable.
3. **Retired or unknown current model.** Radix `Select` with a value that matches no item renders blank. A row whose pinned id left the catalog needs a disabled option "<id> (retired)" so the control is truthful. Per Q7 any pick from an unknown current is a downgrade, so the dialog will fire. That should be stated: "Current model is no longer offered".
4. **Spend, ceiling and month edge cases the UI must handle:**
   - Ceiling set below month-to-date spend blocks the purpose immediately. For `email`, which has no non-AI fallback (Q6), show an inline warning before Save: "Already reached: drafts stop on save".
   - Zero versus empty: empty means no ceiling, `0` means blocked now. I suggest minimum $0.01 with empty = none, and ask Domain-Expert to confirm in the validator.
   - Month rollover: the page can stay open across 00:00 UTC. Refetch on window focus, label the period "UTC", and compute "resets <first of next month>" with `timeZone: 'UTC'`.
   - `rag` runs a local $0 model by default, so its spend stays 0 and the ceiling never trips. Show "Local model: no metered cost" when the row price is 0 instead of a misleading "$0.00 of $5.00".
   - USD to cents: parse the string and use `Math.round(Number(x) * 100)` only after rejecting more than 2 decimals, otherwise float error leaks into audit values.
5. **Provider honesty.** OpenRouter picks by tier only (`llm-factory.ts:20-26`, per R1 AI-specialist) and Ollama uses one global model. The UI cannot know the active provider, so it would claim a pin that is not applied. I need `get` to return a per-row `pinHonoured: boolean` (or `provider`), and the card shows "Pinned model not applied on the current provider". If the backend cannot supply it, the page copy must say "applies when routed through LiteLLM".
6. **Fallback loops.** Changing the primary to a model already in the fallback list must show an error on the row (same superRefine rule), not silently remove the fallback (silent drop is data loss, playbook section 5 spirit). Fallback options exclude the primary and already-picked entries.
7. **Concurrency (`expectedUpdatedAt`).** Use the tenant's latest `updatedAt` from `get`. On CONFLICT, keep the draft, refetch, and show a `role=status` message with a "Reload latest" button. The seed hook must not overwrite a dirty draft (`AvailabilityContent.tsx:104-112`), and downgrades are recomputed against the new baseline. Note that a purpose with no row has `expectedUpdatedAt = null`, so a first-time Save by two admins conflicts correctly.
8. **Save payload.** Send only changed purposes. Sending all six would create six rows for a one-field edit and silently freeze defaults. Server errors have paths like `purposes.2.fallbackIds.1`; map them to fields the way `AvailabilityContent.tsx:90-96` does with `issuePathToFieldId`. The duplicate-purpose superRefine can never fire from this UI, but the test must still exist.

## Integration issues
- `@intelliflow/domain` is imported at runtime by web (`ApprovalPoliciesContent.tsx:14`), but its `exports` map (`packages/domain/package.json:9-21`) exposes only `.` plus `./crm/*` and `./shared/*`. A new `ai/model-config` module reached through the root barrel pulls the whole domain index into the client chunk (Lighthouse, L11). Either check that tree-shaking works for `ApprovalPoliciesContent` today, or add an `./ai/*` subpath export and import from it.
- ai-worker's `MODEL_PRICING` is the Q7 source, but web cannot import ai-worker. Domain's catalog must carry the prices (Domain R2 does) with the consistency test against `MODEL_PRICING`, or the UI price drifts from the real rank.

## Dead-on-arrival risk
- `TemperatureControl.tsx` and `FallbackList.tsx` have callers only in `PurposeCard`. For `rag` both are hidden, so they are not dead, but their tests must render a non-rag row.
- `trpc-errors.ts` has one caller, `ModelConfigContent`; fine, but if the lead drops extraction it must not leave a fourth copy.

## UI reachability and route conflict
- Reachable today through the sidebar (`components/sidebar/configs/agent-approvals.ts:194-199`) and `AIModuleSettingsPanel.tsx:15-22`.
- `lib/shared/settings-search.ts` has `AI Chains` at `:47-55` with a "model" keyword pointing at `/agent-approvals/ai-settings`, and no model-config or approval-policies entry. The test pins 13 items (`settings-search.test.ts:15`). I recommend adding one `Model Configuration` entry and bumping the test to 14. Approval Policies is missing too; that is PG-198's gap, so file an issue rather than fix it here.
- Route conflict: `ChainVersionEditor` edits a per-version model/temperature/maxTokens that is dead at runtime (exploration `:42`) and resets temp/maxTokens on edit (`:73-75`). Users now have two places to set a "model". The Model Config header gets a link to AI Settings, and I suggest a one-line note there ("Per-version model fields do not change routing; set models in Model Configuration"). Editing `ChainVersionEditor` is out of scope; file the reset bug as an issue.

## Suggestions
1. Confirm at Save, one combined dialog (challenge 1).
2. `get` rows add `pinHonoured`, `priceIn1k/priceOut1k` per catalog model, and `retired` handling via a model id outside the catalog.
3. Validator: ceiling minimum 1 cent, shared with the web's local validation.
4. Domain subpath export or a verified tree-shake for the client import.
5. Add the settings-search entry and bump its count test in the same commit.
