# PG-199 Round 1 ANALYSIS — Data-Engineer (read-only, no other files edited)

## Files Reviewed
- `packages/db/prisma/schema.prisma:231-248`: `TenantAIConfig` has `purpose` and `tier` as plain TEXT. It also has `temperature`, `maxTokens`, `rateLimitPerMinute` and `@@unique([tenantId, purpose])`. There is no model, fallback or ceiling column and no Boolean column. I found no CHECKs on it.
- `migrations/20260421000000_feat_agent_system_tenant_customization/migration.sql:54-78`: it creates `tenant_ai_config` and runs `ENABLE ROW LEVEL SECURITY` at line 78. There is no `CREATE POLICY` in either migration that touches this table.
- `migrations/20260423000000_tenant_memory_and_rate_limits/migration.sql:48-49`: precedent for a plain additive `ADD COLUMN` on this table.
- `schema.prisma:6522-6553`: `TenantQuotaOverride` is keyed `(tenantId, key)` with `limit Int?`. `TenantUsageCounter` is keyed `(tenantId, key, period)` with `value Int`.
- `packages/domain/src/platform/quotas/QuotaRegistry.ts:13-23,80-82`: `QUOTA_KEYS` is a closed `as const` tuple and `QuotaKey` is derived from it. Only `emailsPerMonth` and `aiSpendCentsPerMonth` are monthly. `getQuotaPeriod` returns `'YYYY-MM'` in UTC.
- `packages/adapters/src/repositories/PrismaQuotaRepository.ts:56-70`: `incrementCounter` is an atomic `INSERT ... ON CONFLICT DO UPDATE` on `tenant_usage_counters`.
- `apps/ai-worker/src/utils/tenant-ai-spend.ts:12,37-64`: `AI_SPEND_KEY` is hardcoded to `aiSpendCentsPerMonth`. The recorder takes only `usage.cost` and has no purpose input.
- `20261013120000_case_types/migration.sql:1-20,44-50,82+`: the Class A header, named CHECKs, `TEXT[]` with a `<@` CHECK, and SQL-only indexes.
- `20261016120000_approval_policies/migration.sql:104-131`: `ENABLE` (not FORCE) RLS plus a `DO $$ ... EXCEPTION WHEN duplicate_object` policy block. It has `USING` and `WITH CHECK` on `current_setting('app.current_tenant_id', true)`.
- `tests/integration/approval-policies.test.ts:59-80`: `ensureMigrationSql` replays the migration SQL when the named CHECK is absent from the db:push DB.

## Interpretation
1. Q1 (per purpose) maps to the existing key `(tenantId, purpose)`, so no new table is needed. I recommend adding these columns to `tenant_ai_config`:
   - `modelId TEXT NULL`.
   - `fallbackModelIds TEXT[] NOT NULL DEFAULT '{}'`.
   - `monthlyCostCeilingCents INTEGER NULL`, where NULL means no ceiling.
   - All are metadata-only on PG 11+, matching the pattern at 20260423 lines 48-49.
2. Spend storage should reuse `tenant_usage_counters` with a new per-purpose key instead of new columns or a table.
   - It already handles atomic increments, month rollover and cascade delete.
   - The `key` column is free TEXT in the DB. Only the TypeScript `QuotaKey` is closed.
   - A new `aiSpendCents:<purpose>` key can't go through `QuotaService.increment` without widening `QUOTA_KEYS`. I'd rather not widen it, because `QuotaLimits` is `Record<QuotaKey, ...>` and the plan map would break.
   - Instead, add a dedicated port method that reuses `incrementCounter`'s SQL and calls `getQuotaPeriod('aiSpendCentsPerMonth')` for the period.
3. Applying the owner-ruling constraints to the migration:
   - **Timestamps:** the migration is `20261019120000`. The RLS policy goes in a separately removable block in a second migration, `20261019120100`.
   - **Header:** it says prod RLS state is "unknown, projects-64 verifies at rehearsal".
   - **Policy:** `ENABLE` only, never FORCE.
   - **Function:** nothing may rely on the policy filtering rows.
4. There is no Boolean column, so "AI defaults FALSE" has nothing to apply to. `colorToken` doesn't apply either, since rows are keyed by purpose, not by user-labelled entity.

## Questions (code cannot answer)
- Q-DE1: Is the ceiling stored as integer cents (my recommendation, to match `aiSpendCentsPerMonth`) or as USD in the UI only? The owner ruling says "monthly USD ceiling". I assume the UI converts to cents. Please confirm.
- Q-DE2: Should the ceiling counter key be `aiSpendCents:<purpose>` in `tenant_usage_counters`? If so, backend-architect must agree to a port method that sits outside the closed `QuotaKey` type.

## Concerns (code evidence)
1. **Closed enum:** the `QuotaRegistry.ts:13-20` change would ripple into `QuotaLimits`, the plan map and `partner.router.ts:162`. Avoid it.
2. **Attribution gap:** `tenant-ai-spend.ts:37-64` receives only `{cost}` and has no purpose. Per-purpose attribution needs the purpose passed from `llm-factory` or from an AsyncLocalStorage purpose context. That is an ai-specialist dependency. Also `base.agent.ts:690` hardcodes `-free`, so attribution is wrong until Q3 is wired.
3. **Carry rounding:** the recorder carries sub-cent costs in an in-memory Map (`:40-55`). A per-purpose carry is lost on a restart, so the ceiling will be slightly under-counted. The ceiling is an estimate and the UI should say so.
4. **CHECKs on the TEXT-typed columns:**
   - `purpose` IN the 6 values (the table has ~no rows today, but I haven't proved it for prod).
   - `tier` IN (free, standard, premium).
   - `temperature` BETWEEN 0 AND 2, NULL allowed.
   - `maxTokens` > 0, NULL allowed.
   - `monthlyCostCeilingCents` >= 0, NULL allowed. Note 0 means "block outright", consistent with `QuotaService.ts:59`.
   - `cardinality(fallbackModelIds) <= N`.
   - Use plain `ADD CONSTRAINT ... CHECK`, not NOT VALID. Existing rows were written only by seed or admin, but I can't verify prod rows, so Class A gate 1 needs a pre-check query.
   - Do not use `<@` against a model allow-list in SQL. The allow-list changes, so it belongs in Zod only.
5. **Fallback type:** `TEXT[]` over JSONB. Prisma 5.22 supports `String[]`, order is preserved, there's precedent in `case_types.requiredFields`, and the CHECK is simple. A JSONB array would need element-typed validation.
6. **Never-downgrade audit:** the confirm and audit entry lives in the API (`ResourceType` in `security/types.ts`), not in the DB. No audit column is needed.
7. **Fail open:** the reader must treat a missing column or table as "no ceiling". Prisma selects named columns, so with the new client against the old DB a query would throw on a missing column. The resolver must catch and log the reason.
8. **db:push:** CI skips the CHECKs and RLS. The integration test needs `ensureMigrationSql` with a sentinel named CHECK. Don't drop `tenant_ai_config` to replay, since the real table has rows from other suites. Apply only the `ALTER`s guarded by `IF NOT EXISTS` / constraint-presence checks.
9. **Destructive writes:** "reset to defaults" is a `deleteMany` for the tenant and must run in `$transaction`. Writes use `upsert` on `tenantId_purpose`. No `createMany`, so `skipDuplicates` is moot.
10. **No new index:** the existing `(tenantId, purpose)` unique index covers every read.
11. **schema.prisma comment:** add a "SQL-only objects" comment on `TenantAIConfig` in the style of `schema.prisma:2415`. It lists the CHECKs and the RLS policy.

## Dependencies on other agents
- ai-specialist: the purpose-attribution mechanism for spend (concern 2), how the resolver reads the pin, fallback and ceiling, and the model rank table for the downgrade check.
- backend-architect: the port method for per-purpose counters (decision 2), the `ResourceType` audit member, and the router `resetToDefaults` transaction.
- frontend-lead: send only the new fields when present, and degrade calmly on NOT_FOUND. Per the ruling, no new fields may be sent to an API that predates this migration.
