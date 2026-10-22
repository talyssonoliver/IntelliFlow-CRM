# PG-199 Round 3 CHALLENGE — Domain-Expert

Paths relative to the pg-199 worktree; ai-worker paths under `apps/ai-worker/src/`. My R2 rank table is withdrawn (Q7). `rounds/R2-ai-specialist.md` and `R2-backend-architect.md` still carry `capabilityRank`; it must go.

## Re-check of my R2 rules against Q7 and Q8
Price = (input + output) USD per 1k, from `MODEL_PRICING` (`config/ai.config.ts:198-269`):

| model | price | | model | price |
|---|---|---|---|---|
| gpt-oss-20b-free | 0 | | mistral-medium | 0.004 |
| llama-3.1-8b | 0.00013 | | claude-haiku-4-5 | 0.0048 |
| gemini-2.5-flash | 0.000375 | | gpt-4o | 0.0125 |
| gpt-4o-mini | 0.00075 | | claude-sonnet-4-5 | 0.018 |
| mistral-small | 0.0008 | | llama-3.3-70b | 0.00138 |

- **The non-monotone structured tiers disappear.** Free (0.000375), standard (0.0008) and premium (0.0125) now ascend.
- **Scoring inverts.** `scoring-standard` is mistral-small (0.0008, `config.yaml:56-58`) and `scoring-premium` is gpt-4o-mini (0.00075, `:73-76`). Moving a tenant standard to premium is a "downgrade" and needs the confirm. The dialog must name models and prices, never tiers. Owner accepted the llama-70b versus 4o-mini oddity; this is the same class.
- **My `findDowngrades` rules stay** (primary vs before; new or changed fallback vs primary after; reset vs baseline; unknown current is a downgrade). Only the comparator changes.
- **ACs to amend:**
  - AC-M7..M10: "strictly lower price".
  - New AC: equal price is lateral (no confirm, still audited).
  - AC-M15: the rag row now blocks (see Q8 below).
  - Withdraw R2 Decision 2 ("not metered yet" label).
  - AC-M18 (rag lock) stays.

## Challenges
1. **Float equality.** `0.00005 + 0.00008` is not exactly `0.00013`. "Equal price is lateral" must compare integers. Store catalog prices as integer micro-USD per 1k (`Math.round(x * 1e6)`), with a parity test against `MODEL_PRICING`. A test that pins every `MODEL_PRICING` key without a catalog route must also exist (`ai.config.ts:277` silently prices unknown keys as gpt-3.5).
2. **Domain cannot import ai-worker's `MODEL_PRICING`.** The catalog duplicates prices, and the parity test must live in ai-worker (it already depends on domain, `package.json:33`). Catalog ids map to existing pricing keys (for example haiku to `reasoning-standard`). A repricing in `MODEL_PRICING` reorders ranks silently, so the audit entry must store the from/to ids and their prices at decision time.
3. **Dead fields.** With price ranking, `capabilityRank`, `generation` and `family` have no production consumer. Drop them, or keep one only if the UI renders it.
4. **Retired pin.** Catalog is append-only (`deprecated: true`, never deleted; a snapshot test pins ids). If the worker ignored an unknown pin and fell back to the tier alias (R2-ai-specialist approach 1), that is a silent runtime downgrade, which is exactly what R2 of the owner ruling forbids. Unknown pin must keep failing visibly into the tenant's fallbacks, not to a cheaper default.
5. **LiteLLM YAML fallbacks vanish on a pin.** A no-row tenant gets free to standard fallback (`config.yaml:127-131`); a pinned `catalog-*` stanza has none. The page copy and ADR-082 must say that fallbacks are tenant-defined once pinned.

## Q8: embeddings are harder than R2 assumed
- `getEmbeddingChain()` is a process singleton built with `createEmbeddings('free')` (`chains/embedding.chain.ts:61,371`). Its producers are queue consumers whose closures take `text` only: `ai-worker.ts:393,435`. `generateEmbedding({text})` has no tenant (`embedding.chain.ts:72`). `tenantId` exists in the contact-embed job but is dropped (`updateContactEmbedding(_prisma, contactId, _tenantId, ...)`, `:399`). Threading it needs a signature change in `EmbeddingChain`, `ContactEmbedWorker`, and `bootIngestionWorkers`; ALS (`ai-worker.ts:312`) is not set on these paths.
- **No usage is returned** by `embedQuery` / `embedDocuments` (`:82,137`). Spend must be estimated from input tokens with the local counter. State it as an estimate.
- **Pricing gap.** Production uses Gemini embeddings (`llm-factory.ts:424-433`, `gemini-embedding-001` at 1536d), which has no `MODEL_PRICING` key. It would be priced at gpt-3.5 rates (`ai.config.ts:277`), roughly 25x too high versus text-embedding-3-small. Add a catalog and pricing entry for the model actually used.
- **What the rag row shows.** The embedding model is chosen by worker env (`EMBEDDING_PROVIDER`), which the API cannot see. A tier-based display would lie. Show "platform-managed embedding model" with dimension, not a catalog name.
- **Blocked behaviour is a job problem, not a chain fallback.** `ai-worker.ts:430` shows unembedded work stays queued. A thrown ceiling error would burn BullMQ retries and dead-letter documents. For rag, jobs must be deferred (delayed retry to the next UTC month or until the ceiling rises), never failed or dropped. Retrieval queries (`rag-context.chain.ts:270` catch) need a visible "AI ceiling reached for rag" path, not a silent empty result.
- Sub-cent embeddings: a 1-cent ceiling is about 500k text-embedding-3-small tokens. The existing carry (`tenant-ai-spend.ts:40-55`) is lost on restart; accept and disclose.

## Edge cases
- **Month rollover.** Period must be computed at check and at record time; a spend cache (AI-Specialist 30 s) keyed without the period carries last month's value across midnight UTC. Include the period in the cache key; test 31 Oct 23:59:59 versus 1 Nov 00:00:00 with fake timers.
- **Ceiling lowered below spend** blocks within 60 s plus cache; raised, unblocks likewise. The page's `blocked` flag (API read of counters) can disagree with the worker for about 90 s. Copy: "may take up to 90 seconds".
- **No row.** `get` returns baseline defaults and `updatedAt: null`; saving all six creates rows. Reset on no rows is a no-op (not an error, no audit entry).
- **Provider without the pinned model.** In production the worker runs OpenRouter by default (`llm-factory.ts:297-318`), whose model is tier/env-selected (`:20-26`), not the YAML alias. A pin without an OpenRouter mapping falls back to env default; the page would show a model that is not running. Unmapped pins need a per-process warn log, plus a visible "pin not available on this provider" note (worker-visible only; flag as a follow-up if the API cannot know).
- **Fallback loops** cannot occur (<= 3, unique, not the primary), but a fallback priced below the primary triggers the confirm on nearly every sensible config. One acknowledge covers the whole batch.

## Integration issues
- Two resolver names for one concept: `resolveEffectiveModelConfig` (`R2-backend-architect.md`) versus `resolveTenantModelConfig` (`R2-ai-specialist.md`). Make the pure domain function the single comparator and the worker function the I/O wrapper; the router and web call only the domain one.
- Data's CHECK `"modelId" = ANY("fallbackModelIds")` passes when `modelId` is NULL (three-valued logic), so a no-pin row can list the tier default as a fallback. Zod/domain must reject a fallback equal to the effective model.
- `ceiling BETWEEN 0 AND 100000000` (Data) versus my 10,000,000 cents: use one constant in domain.

## Dead-on-arrival check
`isDowngrade` is called only inside `findDowngrades`; fine. `PurposeSpendPort.getSpentCents` has a worker consumer; the API reads Prisma directly, so do not export it to the router. Anything catalog-only (family, generation, `capabilityRank`) is dead (Challenge 3).

## UI reachability and route conflict
Reachable already: `sidebar/configs/agent-approvals.ts:194-199`, `AIModuleSettingsPanel.tsx:16-22`, `navigation-reachability-audit.md:184`; no sidebar change. `ChainVersionEditor.tsx:68-85` also edits a free-text "model" (dead at runtime). Two "model" fields in one product confuses admins: add a short link and copy on both pages, and file the follow-up.

## Suggestions
1. Integer micro-USD prices plus parity test; store prices in audit entries.
2. Remove rank/generation/family fields.
3. Retired pins: keep honoring, fail into fallbacks, never fall to cheaper default.
4. rag: tenant-thread the embedding path; defer jobs at ceiling; add the Gemini embedding price key; display "platform-managed".
5. Period-keyed spend cache; one audit entry per update (including lateral) and per reset.
