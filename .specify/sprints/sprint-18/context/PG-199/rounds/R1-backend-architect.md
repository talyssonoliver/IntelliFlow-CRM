# PG-199 Round 1 ANALYSIS — Backend-Architect (read-only; nothing else edited)

## Files Reviewed
- `PG-199-owner-ruling.md:5-6` (R1 router path), `:13-18` (Q1-Q4), `:24-38` (runner constraints). `ADR-082:46-50` (Decision Outcome still "TBD").
- CSV row 579 lists `ARTIFACT:apps/api/src/modules/agent-approval/model-config.router.ts`. This contradicts R1, so the CSV needs a fix.
- `approval-policies.router.ts:211-364` (template), `:44-45` (`PolicyCtx` / `PolicyTx` types), `:226-259` (create with `$transaction` and `rethrowConflict`), `:336-344` (`resetToDefaults`).
- `settings-shared.ts:9-39` (admin roles, `assertAgentSettingsAdmin`, `rethrowConflict`). Its header at `:2-3` already anticipates PG-199.
- `contact-types.router.ts:206-223` (audit pattern), `security/types.ts:91-105` (`ResourceType`), `security/rbac.ts:55-56, 71-72, 87-88, 103-104, 119-120` (per-role permission maps).
- `router.ts:42, 173` (registration), `__tests__/app-router.smoke.test.ts:142-159` (smoke pattern).
- `packages/domain/src/index.ts:119-120` (`export * from './ai/approval-policy'`), `packages/validators/src/index.ts:105,111`.
- `ai-worker/package.json:33,36` (already depends on `@intelliflow/domain` and `validators`).
- `llm-factory.ts:36,44` (`LLMPurpose` / `LLMTier` defined in ai-worker), `:380-398` (`createLLMForTenant`).
- `tenant-ai-config.ts:56-60, 74-137` (tier / temperature / maxTokens only, with a fail-open cache).
- `schema.prisma:231-248` (`TenantAIConfig`).

## Interpretation
1. **Router.** Create `apps/api/src/modules/agent/model-config.router.ts` and mount it in `router.ts` next to line 173 as `modelConfig`.
   - Use `tenantProcedure` for everything.
   - Pass `tenantId` explicitly in every `where`. `approval-policies.router.ts:1-9` says `prismaWithTenant` does not inject it.
   - Procedures: `get` (returns `canManage`, the 6 purposes with defaults, the allow-list, ranking and limits), `update` (upsert one purpose in `$transaction`), `resetToDefaults`, and a read-only `usage` for month-to-date spend per purpose.
   - Gate every mutation with `assertAgentSettingsAdmin(ctx, 'model configuration')`.
2. **Shared constants.** Put purposes, tiers, the model allow-list with ranking, and the limits in `packages/domain/src/ai/model-config.ts`.
   - Re-export it from `domain/src/index.ts`, following the line 119-120 convention.
   - Both consumers can import it: ai-worker (`package.json:33`) and api (`approval-policies.router.ts:13-24`).
   - `LLMPurpose` / `LLMTier` (`llm-factory.ts:36,44`) become aliases of the domain types, so there is one source and no drift.
   - Domain stays free of infra imports (`packages/domain/CLAUDE.md:5`).
3. **Validators.** `packages/validators/src/model-config.ts`, exported from `index.ts` beside line 111. Use `superRefine` to reject a duplicate model between primary and fallbacks, fallbacks over the max length, and any model id not on the allow-list.
4. **Never-downgrade (R2 and Q4).** Compute server-side with a domain function `isDowngrade(current, next)` over the ranking, covering primary and every fallback entry.
   - `update` takes `acknowledgeDowngrade: boolean`.
   - If the diff contains a lower-ranked pick and the flag is false, throw `PRECONDITION_FAILED` / `BAD_REQUEST`.
   - The UI confirm dialog is not enough, because it can be bypassed by calling the API directly.
5. **Audit.** Add `'model_config'` to `ResourceType` (`types.ts:105`) and to all 5 role maps in `rbac.ts`. The PG-205 additions at lines 56/72/88/104/120 show those maps need an entry per role.
   - Call `getAuditLogger(ctx.prisma).logAction(action, 'model_config', id, tenantId, { actorId: ctx.tenant.userId, beforeState, afterState })`, fire-and-forget, as in `contact-types.router.ts:217-222`.
   - Log ids and field names only, plus a `downgrade: true` marker.
6. **Smoke test.** Add a block after `app-router.smoke.test.ts:159` asserting every procedure is defined.
7. **Cache invalidation.** `tenant-ai-config.ts:37` is a 60 s in-process cache in a different process, so the API cannot flush it.
   - Accept up to 60 s of staleness and state that in the UI copy. No port or container wiring is needed (`apps/api/CLAUDE.md` container rule, nothing to register).

## Questions (code cannot answer)
- **Q-A (needs the owner or AI-specialist):** What are the exact allow-list and ranking? `MODEL_PRICING` (`ai.config.ts:198-269`, per the exploration doc) is a price table, not a capability rank. Is cheaper-price-first the rank, with the version or size ordering encoded in the domain list by hand?
- **Q-B:** Does "block that purpose" at the ceiling apply to the whole calendar month in UTC? I can't resolve that from code. It affects the `usage` query window and the reset boundary.

## Concerns
1. **Deploy skew, new API with old worker.** The old worker's `findUnique` at `tenant-ai-config.ts:90` selects all columns. Added nullable columns are harmless, so the migration must stay strictly additive (Class A).
   - Old worker still honours `tier`, `temperature` and `maxTokens`.
   - It ignores model, fallbacks and ceilings until it is redeployed, so the UI must not claim enforcement until the worker ships.
   - Worker rollout order: migrate, API, then worker.
2. **Deploy skew, old API with new web.** The web page calls `modelConfig.get` and gets `NOT_FOUND`. It must degrade calmly (runner constraint `:35-36`), following `AvailabilityContent.tsx:159-174`. The new web must not send `acknowledgeDowngrade` to an API that rejects unknown keys. A plain `z.object` strips them silently, and I would not use `.strict()`.
3. **Fail-open on the ceiling.** The runner requires fail-open only until the migration is applied, and logging the reason (`:37-38`). `resolveEffectiveTier` already fails open on any error (`:130-136`), so a DB outage would also lift the ceiling.
   - Fail-open must be distinguished from fail-closed-on-known-breach, e.g. only a missing-column error (Prisma `P2022` / `P2021`) fails open. Everything else is logged at warn level.
   - This is a real design point for round 2.
4. **Concurrency.** Two admins editing concurrently is last-write-wins on an upsert. Add an `updatedAt` optimistic check (compare the expected `updatedAt` in the `where`) so a stale downgrade check can't be bypassed. Without it, the diff computed from a read can be stale by the time of the write.
5. **Unique-constraint / duplicate gaps.** `@@unique([tenantId, purpose])` (`schema.prisma:245`) makes the upsert safe, but `purpose` and `tier` are unconstrained TEXT (`:234-235`). Add named CHECKs in the migration, and validate against the domain constants in the router. That keeps stray values out of the `VALID_TIERS` warn path.
6. **RLS dependency.** The runner owns the `tenant_ai_config` policy (`:31-35`). The router must not rely on it filtering rows, so every query carries an explicit `tenantId`.
7. **CSV path conflict.** The CSV artifact path (`agent-approval/`) contradicts R1. Fix it in CSV only, then run `split-sprint-plan`.
8. **Spend attribution (Q2).** `base.agent.ts:690` hardcodes `-free` and `insight-generation.chain.ts:362-367` records 0/0 tokens (per the exploration doc, unverified by me). Ceilings built on those numbers would be wrong, so they are a prerequisite fix.

## Dependencies on other agents
- **ai-specialist:** the allow-list and ranking (Q-A), worker enforcement and spend tracking, and the `base.agent.ts` / summary-job wiring (Q3). I need its answer on how the worker will read the new columns (`resolveEffectiveTier` returns a richer shape).
- **data-engineer:** new columns, CHECK names, the spend table or columns, the migration and RLS shape. The router `select`s depend on it.
- **frontend-lead:** the `get` response shape (limits, `canManage`, allow-list with rank) and the downgrade-confirm contract (`acknowledgeDowngrade`), plus the NOT_FOUND degrade.
- **test-engineer:** router tests need cross-tenant NOT_FOUND, FORBIDDEN `it.each`, a downgrade-without-ack rejection test, and an audit-actor assertion.
