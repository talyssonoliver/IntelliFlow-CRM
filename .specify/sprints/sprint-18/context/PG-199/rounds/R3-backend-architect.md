# PG-199 Round 3 CHALLENGE — Backend-Architect

Paths relative to the pg-199 worktree. Challenges are against all six R2 files plus Q7/Q8.

## Challenges
1. **Tier changes are downgrades too, and nobody covers them.**
   - With no pin, the effective model is `${purpose}-${tier}` (`llm-factory.ts:326`). The update payload still carries `tier`, so moving `premium` to `free` swaps the model for a cheaper one with no `modelId` involved.
   - `findDowngrades(before, after)` must compare **effective** models: `modelId ?? defaultModelFor(purpose, tier)`. That needs a domain table `purpose x tier -> catalog id`, derived from `infra/litellm/config.yaml:11-117` and covered by the parity test.
   - The first save from "default" is also the case "current model is not a catalog pin". It must resolve through that table, not through the "unknown current is a downgrade" rule. Otherwise every first save asks for a confirm.
2. **Price comparison needs integers, not floats.**
   - `MODEL_PRICING` is USD per 1k as floats (`ai.config.ts:198-269`). Summing `input + output` and testing "strictly lower / equal" with floats is unsafe, e.g. `0.00005 + 0.00008`.
   - The domain catalog should store integer micro-USD per million tokens, and the parity test should convert `MODEL_PRICING` with rounding.
   - Domain cannot import `apps/ai-worker`. The parity test must live in ai-worker, importing the domain catalog, not the reverse.
3. **Atomic `update` and the `expectedUpdatedAt` token have an ABA hole.**
   - "Tenant's latest row updatedAt" regresses when `resetToDefaults` deletes the newest row, so a stale client token can match again.
   - Missing rows (a purpose with no row yet) race on the unique key, so an unguarded upsert can throw P2002 or silently overwrite.
   - Fix: take `pg_advisory_xact_lock` per tenant at the start of both mutations, the pattern in `scheduled-reports.router.ts:109-110`. Then compare a token built from `(count, max(updatedAt))`. Map P2002 to CONFLICT via `rethrowConflict` (`settings-shared.ts:34-39`).
   - The downgrade diff runs on the read inside that lock, never on a pre-transaction read.
4. **The array payload should be diffed server-side.**
   - If the web sends all six purposes, unedited ones would create rows pinned to today's tier.
   - A future change to the factory default would then no longer reach that tenant. That is silent behaviour change.
   - The router should skip purposes equal to their stored-or-default effective value: no write, no audit, no `updatedAt` bump.
   - `Frontend R2 Rule B` (changed rows only) helps, but the server must not rely on it.
5. **`resetToDefaults` must not erase `rateLimitPerMinute`.** The Data-Engineer is right (`schema.prisma:238`, field outside the page). My R2 used a blanket `deleteMany`. Adopt their delete-where-null-rate-limit plus `updateMany` null-out, in one `$transaction`. The downgrade check on reset compares the current effective model with the factory default (Domain R1 interpretation 5).
6. **Q8 metering cannot be done "in the factory" for embeddings as things stand.**
   - `EmbeddingChain` builds a module-level singleton with `createEmbeddings('free')` (`embedding.chain.ts:61`). `createEmbeddings` takes no tenant, purpose or model (`llm-factory.ts:409`).
   - Metering by tenant needs a per-call tenant-aware wrapper (tenant from ALS, as the cost listener does) and a spend record with usage from the provider, or from a token estimate when the provider returns none.
   - The singleton import-time boot-safety constraint (#238, `llm-factory.ts:333,442`) must not be broken.
   - `rag-premium` is priced input-only (`ai.config.ts:268`), `rag-free` is `$0` (`:244`), so with the free default a rag ceiling never trips. This is a fact for the UI copy: ceiling meaningful only when the embedding provider is paid.
7. **Fail-open versus the Data-Engineer's legacy-select retry.** Their retry on P2022 is sound, but the AI-specialist's "serve last cache up to 15 min" rule can leave a stale blocked state after an admin raises a ceiling during a DB error. Acceptable, but the `get` UI copy must not promise "applies within 60 s" unconditionally.

## Edge cases
- **Month rollover.** The period is read from the clock per call, so a new `YYYY-MM` row starts at 0 with no job. The spend cache (30 s) and the 60 s config cache can hold a blocked state about a minute past midnight UTC. Document it.
- **Purpose with no row.** `get` returns effective defaults with `updatedAt: null`. Token for an empty tenant is `(0, null)`.
- **Retired pin.** Stored `modelId` absent from the catalog: `get` returns `retired: true` and the effective model falls back to the tier default (worker logs `pin_retired`). `update` must reject re-saving the dead id with a coded error, so the UI forces a choice. Under Q7 the retired current counts as downgrade, so the next pick will ask for confirm. Say so in copy.
- **Provider lacks the pin (Ollama/OpenRouter).** The API cannot know the worker's active provider, and I found no usable signal beyond `AI_PROVIDER` in `container.ts` (7 hits). `get` must not claim the pin is effective. Copy: "applies when the platform routes through the LiteLLM gateway".
- **Fallback loops.** CHECK covers primary-in-fallbacks only for explicit pins (Data R2 `...fallbackModelIds_check`). A fallback equal to the effective **default** primary slips through, so the validator needs the resolved primary from item 1.
- **Equal price is lateral.** Audit with `lateral: true`, no confirm.

## Integration issues
- The `get` response shape differs between Frontend R2 (`rank`, `fallbackIds`, `ceilingCents`, `rows`) and my R2 (`purposes`, `fallbackModelIds`, `monthlyCostCeilingCents`). Proposal: DB and validator names `modelId`, `fallbackModelIds`, `monthlyCostCeilingCents`; the web maps to display. Under Q7, `rank` is replaced by `priceMicroPerM`, never a hand rank.
- `PurposeSpendPort` is named differently in Data R2 (`PurposeSpendRepositoryPort`, `getPurposeSpend` batch). Adopt the Data-Engineer's batch signature. `get` needs six values in one query.
- Update contract becomes one mutation (`purposes[]`, `acknowledgeDowngrade`, `expectedUpdatedAt`). My earlier per-purpose `PRECONDITION_FAILED` payload must list **all** downgrades across purposes so one confirm covers the whole save.
- Old-API safety: a new web calling `update` with the new array shape against the old API returns NOT_FOUND on the whole router, so `get` fails first and the page degrades before any write.

## Dead-on-arrival risk
- `resolveEffectiveModelConfig` (my R2): the AI-specialist's `resolveTenantModelConfig` is the real consumer. Keep one, in domain, pure; the worker resolver calls it. Otherwise two resolvers.
- `purposeSpendPeriod`: the only caller must be the port adapter, the worker and the router. Duplicate period logic exists in `getQuotaPeriod` (`QuotaRegistry.ts:80-82`): reuse it, do not add a second UTC formatter.
- `models` catalog fields (`family`, `generation`) have no consumer under Q7. Drop `capabilityRank`, `generation`; keep family only if the UI displays it.

## UI reachability and route conflict
- Reachable already: sidebar `agent-approvals.ts:194-199` and `AIModuleSettingsPanel.tsx:16-22` are the only two references. I did not verify settings-search or breadcrumb registration; Test-Engineer owns the count tests.
- Route conflict: AI Settings `ChainVersionEditor` also edits `model`/temperature/maxTokens per chain version (dead at runtime per exploration). A link is not enough: add a visible notice there that these values do not drive runtime, or the owner will edit the wrong page.

## Suggestions
1. Domain: `defaultModelFor(purpose, tier)`, `effectiveModel(row)`, integer-micro pricing, drop capability ranks.
2. Router: per-tenant advisory lock, in-lock diff, server-side no-op skip, retired-id error code, `(count, max(updatedAt))` token.
3. Reset: Data-Engineer's two-step transaction.
4. Embeddings: AI-specialist to specify a tenant-aware wrapper that leaves the import-time singleton intact; `rag` gets a ceiling UI note about free providers.
5. Single naming source: validator field names are canonical.
