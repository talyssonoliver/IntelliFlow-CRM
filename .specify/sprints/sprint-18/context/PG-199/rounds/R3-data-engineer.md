# PG-199 Round 3 CHALLENGE — Data-Engineer

I accept Q7, Q8 and the save contract. Nothing below re-proposes them; it challenges how they meet the data layer.

## Challenges
1. **`expectedUpdatedAt` as "tenant's latest row updatedAt" is unsound.** The rows are `(tenantId, purpose)`-keyed with `@updatedAt` (`schema.prisma:241`) and up to six may exist.
   - `resetToDefaults` deletes rows (`R2-backend-architect.md`, Reset). After a delete, the maximum drops to an older value. A client holding that older value passes the check and silently overwrites a reset it never saw.
   - Creating a row for a previously absent purpose bumps no value the client could hold.
   - Fix: carry `expectedUpdatedAt` **per purpose** (`Date | null`, null = "I saw no row"). Inside the `$transaction`, read the edited purposes' rows and compare each. A null expectation against an existing row is a CONFLICT. A create race falls to P2002 mapped to CONFLICT via the existing `rethrowConflict` helper.
2. **Embedding spend is sub-cent, so the rag ceiling will not trip in practice.** `text-embedding-3-small` is $0.02 per million tokens (`ai.config.ts:267`), which is about 0.0002 cents per 1k tokens. Counters write only whole cents, and the sub-cent remainder lives in an in-memory `Map` (`tenant-ai-spend.ts:40-55`). Any worker restart or deploy discards it. At low volume the stored counter understates spend indefinitely, and the "really blocks" outcome from Q8 depends on that counter.
   - Fix options: (a) store per-purpose spend in a finer unit, for example hundredths of a cent ("centicents"), keeping the ceiling in cents and multiplying by 100 when comparing. INTEGER holds 2.1e9, which is $214k per month per purpose, and the ceiling CHECK already caps at $1M, so cap the ceiling at 2,000,000 cents to stay in range. (b) Keep cents and flush the carry on `SIGTERM`. (a) removes the loss for all purposes, so I recommend it and will adjust `purposeSpendKey` docs and the CHECK upper bound.
3. **Free models never accrue spend.** `MODEL_PRICING` has `{0,0}` for free aliases (`ai.config.ts:240,243`). A purpose pinned to a free model with a ceiling of 100 cents never trips. That is correct, but the UI must not imply a block is possible there. Likewise a ceiling of 0 must block even free models: the pre-call check, not spend, decides (`isCeilingReached(0, 0)` is true).
4. **Required `tier` forces a pin when only a ceiling is saved.** `tier TEXT NOT NULL` (`20260421000000_.../migration.sql:58`). Saving only a ceiling on a fresh purpose must create a row, so the router must write some tier, which then overrides future changes to the factory default. Making `tier` nullable is unsafe: the old worker reads it through the generated non-null type and its catch path would swallow the failure as a fail-open default (`tenant-ai-config.ts:130-136`), and the rollout order is migration, API, worker. Fix: keep NOT NULL, write the tier from the picked model's catalog tier, or the resolved default when no model is picked, and state in the UI copy that a saved row pins its tier.
5. **Spend cache and period.** AI-Specialist caches spend 30 s per `(tenant, purpose)` (`R2-ai-specialist.md`). If the key omits the period, the first 30 s of a new month still see last month's spend and wrongly block. The carry map also flushes the old month's remainder into the new period. Key the cache by `(tenant, purpose, period)` and compute the period at write time from the event time.
6. **Two readers of one key format.** Backend reads spend with a raw `tenantUsageCounter.findMany` in the router while the worker uses `PurposeSpendPort` (R2-backend-architect, Challenge 2). They can drift on key and period. Both must import `purposeSpendKey` and the period helper from the domain, and the router test must assert the exact key.

## Edge cases
- **Month rollover:** a new `YYYY-MM` row appears on first write. There is no reset job, and nothing deletes old rows. Rows stay: 6 per tenant per month.
- **Purpose with no row:** the effective config is the factory default with no ceiling. `get` must still return six rows. No DB write on read.
- **Pinned model retired from the catalog:** the DB cannot validate it (no subquery in CHECK). The resolver must treat an unknown `modelId` as "use tier default" with a warn, and the UI shows it as retired. Q7 makes unknown current a downgrade, so any replacement pick requires the confirm.
- **Provider without the pinned model:** Ollama and OpenRouter need a catalog mapping per provider; if the mapping is absent, fall back to the tier default and warn. This is the worker's job, not the DB's.
- **Fallback loops:** the CHECK already forbids primary within fallbacks and over three entries (`tenant_ai_config_fallbackModelIds_check`). Duplicate fallbacks stay in Zod.
- **Concurrency:** Prisma `upsert` can race on create, so P2002 must map to CONFLICT. Counter increments are atomic (`PrismaQuotaRepository.ts:62-68`).
- **60 s cache:** raising a ceiling still takes up to 60 s for config plus up to 30 s for spend. The UI copy should say "up to two minutes".

## Integration issues
- Prisma full-select versus old DB: the legacy-select retry in my R2 needs one named caller. It lives in the resolver (`tenant-ai-config.ts:74-137`). Without it, schema skew also drops the tier override, because `findUnique` selects all columns.
- `schema.prisma` and the generated client (`packages/db/generated/prisma/models/TenantAIConfig.ts`) must be regenerated for ai-worker and api in the same PR, or typecheck fails against stale types.
- `resetToDefaults` per `R2-backend-architect.md` says "deletes tenant rows", which also removes `rateLimitPerMinute` (`schema.prisma:237`), an override this page does not own. Use my R2 form: delete only rows with a null rate limit, update the rest.

## Dead-on-arrival risk
- `incrementPurposeSpend`/`getPurposeSpend` (my R2) and Backend's `addSpentCents`/`getSpentCents` are the same port. Merge them into Backend's `PurposeSpendPort` with a batch read of the six purposes. Keep one name.
- `isCeilingReached` needs two callers: the factory pre-call check and the router's `blocked` flag. If either is missing, delete the function.
- The RLS migration has no runtime consumer by design. Say so in the PR so it is not read as dead code.

## UI reachability
The sidebar item exists (`sidebar/configs/agent-approvals.ts:194-199`). The route conflict with `/agent-approvals/ai-settings` is a Frontend concern. From the data side the only link is that `ChainVersion.model` is dead at runtime, so Model Config must not claim to govern it.

## Suggestions
1. Per-purpose `expectedUpdatedAt` map in the validator and an in-transaction compare (Challenge 1).
2. Store spend in centicents for the per-purpose keys; cap the ceiling CHECK at 2,000,000 cents; update `purposeSpendKey` docs (Challenge 2). Need AI-Specialist and Backend agreement.
3. Router writes `tier` from the picked catalog model (Challenge 4).
4. Spend cache key includes the period (Challenge 5).
5. Integration test adds: stale per-purpose update returns CONFLICT after a reset, sub-cent accumulation survives a simulated restart (if option a), and the 0-ceiling case.
