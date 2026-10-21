APPROVED

# PG-199 Round 4 CONSENSUS — Domain-Expert

Paths relative to the pg-199 worktree; ai-worker paths under `apps/ai-worker/src/`.

## Agreement
I support D1-D5, D7-D10, D13-D21, D23-D25, D27-D29 as written, and D6, D11, D12, D22 and D26 with the modifications below.
- D1/D2: integer micro-USD prices, strictly-lower-price rule and the dropped rank fields resolve my R3 challenges 1-3. `round(0.00005 * 1e6)` is safe where raw float addition is not.
- D8: centicents fit INTEGER. 2,000,000 cents = 2e8 centicents, under 2.147e9. The recorder's carry logic (`utils/tenant-ai-spend.ts:40-55`) is reusable.
- D11: the cited lock pattern exists at `apps/api/src/modules/analytics/scheduled-reports.router.ts:105-110` (`pg_advisory_xact_lock(hashtextextended(...))`). The cite should include the `analytics/` path.
- D13: storing prices in the audit entry answers the repricing concern.
- D17/D19/D20: retired pins keep honouring, the `code`-based error and the narrow fail-open are consistent with the owner rulings. Every `createLLMForTenant` caller already catches errors (`case-insight.chain.ts:59,82`, `contact-reply-draft.chain.ts:106,143`, `enrichment-adapter.ts:146`).
- D22 feasibility: both job payloads carry `tenantId` (`workers/contact-embed-worker.ts:23`, `workers/ingestion-workers.ts:45`), so running handlers inside `tenantContextStore.run` is possible.

## Modifications
1. **D6 (must fix before exec): a ceiling-only save can silently downgrade other features.** A stored row overrides the tier for every caller of that purpose (`lib/tenant-ai-config.ts:93-105`; `lib/llm-factory.ts:387-388`, `chains/scoring.chain.ts:183`). D6 writes `tier = existing ?? BASELINE_TIER` for a new row. Callers' own defaults differ from the baseline:
   - email baseline `free`, but `contact-reply-draft.chain.ts:107` uses `standard`. A ceiling-only row drops reply drafts from llama-70b to llama-8b.
   - structured baseline `free`, but `shared/enrichment-adapter.ts:124` uses `standard`.
   - qualification baseline `standard`, but `agents/base.agent.ts:164` runs `free`. The same save upgrades agents and costs money.

   Fix: relax `tier` to NULLABLE (additive, Class A) in migration `20261019120000`, and have the resolver use `row.tier ?? callerDefault`. The router writes `tier = null` for rows it creates and preserves existing non-null values. The old worker survives a null tier through the `VALID_TIERS` guard (`tenant-ai-config.ts:100-110`), though that path also drops temperature and maxTokens, so the rollout order (migrate, API, worker) matters. If you prefer not to relax the constraint, the alternative is to refuse a first save that would change any caller's default, which is worse UX.
2. **D12 reset must be explicit about the existing columns.** "Null-out PG-199 columns" leaves `tier`, `temperature` and `maxTokens` on kept rows (rate-limit rows), so reset would not restore defaults. Specify: on kept rows set `tier = null` (after Mod. 1), `temperature = null`, `maxTokens = null`, `modelId = null`, `fallbackModelIds = '{}'`, ceiling null.
3. **D3 pin scope is wider than the "before" model.** A pin applies to every feature using the purpose, while `before` is a single baseline model. A pin that is cheaper than one caller's current default (for example email llama-70b versus the reply-draft default) cannot be detected as a downgrade. Accept this limitation, and add it to the page copy: "applies to every feature that uses this purpose".
4. **D3 table coverage.** `DEFAULT_MODEL[purpose][tier]` has no `rag`/`standard` entry (`infra/litellm/config.yaml:100-117`: only `rag-free` and `rag-premium`). Make the table partial for rag, and cover it by the rag lock and `BASELINE_TIER.rag = 'free'`.
5. **D3 production-provider caveat.** Production chat runs on OpenRouter, whose model is env/tier-selected (`lib/llm-factory.ts:20-26,297-318`), not the YAML alias. The "before" model derived from the YAML can differ from what runs, and the difference errs toward extra confirms, not missed ones. Document it in ADR-082.
6. **D22 deferral needs explicit mechanics.** The default behaviour on a thrown error is the queue's retry: `attempts: 3`, exponential backoff 5 s (`contact-embed-worker.ts:73-74`, `ingestion-workers.ts:335-336`). That would dead-letter documents in about 15 s. Specify BullMQ delayed handling (`job.moveToDelayed` plus `DelayedError`, or a re-enqueue with `delay`) to the next check time (capped, for example 15 min, and re-checked), and a test that a ceiling error does not consume an attempt.
7. **D8/D22 estimate.** Embedding spend is estimated from input text, since `embedQuery`/`embedDocuments` return no usage (`chains/embedding.chain.ts:82,137`). Say so in the UI copy for the rag card.

## Sign-off
APPROVED, subject to Modification 1 being adopted in the spec (it is a silent downgrade the owner's Never-Downgrade rule forbids) and Modifications 2 and 6 being reflected in the plan.

## Final Notes
- AC set: amend AC-M7..M10 to "strictly lower price", add "equal price is lateral, audited", rag ceiling enforced (Q8), reset restores tier/temperature/maxTokens, and "ceiling error never consumes a queue attempt".
- Follow-ups to file as D29 lists, plus: rag/embedding worker tenant threading beyond the two handlers, and per-model `maxTokens` caps (limit 32768 is a global guess).
- Catalog prices for Gemini embeddings must come from the provider's pricing page during exec, as D22 states. I have not verified a figure.

## Files Verified
- `apps/api/src/modules/analytics/scheduled-reports.router.ts:105-110`
- `apps/ai-worker/src/lib/tenant-ai-config.ts:93-110`
- `apps/ai-worker/src/lib/llm-factory.ts:20-26,297-318,380-398,424-433`
- `apps/ai-worker/src/chains/contact-reply-draft.chain.ts:106-143`, `case-insight.chain.ts:59-84`, `scoring.chain.ts:183`
- `apps/ai-worker/src/shared/enrichment-adapter.ts:124-146`
- `apps/ai-worker/src/agents/base.agent.ts:164`
- `apps/ai-worker/src/workers/contact-embed-worker.ts:23,73-74`, `ingestion-workers.ts:45,335-336`
- `apps/ai-worker/src/chains/embedding.chain.ts:82,137`
- `infra/litellm/config.yaml:100-117`

## Round 2 vote
APPROVED

Checked against `R4-resolutions.md` lines 149-189 (Amendments A1-A8).

- **A1 adopted as required.** Nullable `tier`, `row.tier ?? callerDefaultTier`, and the router never writing or editing tier remove the silent caller-default shift I found (`lib/tenant-ai-config.ts:93-110`, `lib/llm-factory.ts:387-388`, `contact-reply-draft.chain.ts:107`, `shared/enrichment-adapter.ts:124`). Comparing an unpinned current model against the maximum price among its callers' defaults is the conservative direction. The partial `DEFAULT_MODEL` covers the missing `rag-standard`.
- **A4** now resets tier, temperature and maxTokens on kept rows. **A5** specifies delayed re-queue and the embedding-estimate disclosure. **A2, A6, A7, A8** do not touch my lens and look sound.

Non-blocking notes for the spec:
1. **A5 "until the next UTC month" is too long.** If the owner raises the ceiling mid-month, deferred jobs would not resume until the month rolls over. Use a bounded delay (for example 15 minutes) and re-check the ceiling on each wake-up.
2. **A1 skew.** During the old-worker window a NULL tier row takes the fail-open path in `tenant-ai-config.ts:130-136`, which also drops that row's temperature and maxTokens. This is harmless under the rollout order (migrate, API, worker); state it in the ADR.
3. **`CALLER_DEFAULT_TIERS` test.** The call-site-importing test should fail when a new `createLLMForTenant(purpose, tier, ...)` call introduces a tier not in the set.
