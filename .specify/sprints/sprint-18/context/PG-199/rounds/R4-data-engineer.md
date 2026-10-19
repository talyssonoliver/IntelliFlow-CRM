APPROVED

## Agreement
I support D1-D5 (nothing in them touches storage beyond the shared constants), D6, D7, D8, D9, D10, D11, D12, D13, D14, D18-D20 and D22 as written, with the modifications below. D21, D23 and D24-D29 are outside my lens and I have no objection.
- D6 and D7 match my R2 migrations. The `tier NOT NULL` decision agrees with my R3 challenge 4 (`20260421000000_feat_agent_system_tenant_customization/migration.sql:58`).
- D8 adopts my R3 centicent proposal. The 2,000,000-cent ceiling cap times 100 is 2e8, inside INTEGER (2.147e9).
- D9: the P2021/P2022 retry has a working precedent in the same repo, `apps/api/src/modules/calendar/availability-enforcement.ts:33` (`MISSING_SCHEMA_CODES`), so error-code handling is an established pattern.
- D11: the advisory lock exists at `apps/api/src/modules/analytics/scheduled-reports.router.ts:110` (`pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`). It closes the create race, so P2002 becomes a residual safety net, not the main guard.

## Modifications
1. **D12, reset leaves stale values.** "Null-out PG-199 columns on the rest" is ambiguous. State it exactly: for retained rows (those with `rateLimitPerMinute` set) set `modelId = NULL`, `fallbackModelIds = '{}'`, `monthlyCostCeilingCents = NULL`, `temperature = NULL`, `maxTokens = NULL` and `tier = BASELINE_TIER[purpose]`. Otherwise a retained row keeps an old tier and the page would claim "defaults" while the worker still uses it (`tenant-ai-config.ts:93-97` reads `row.tier`). `tier` is NOT NULL (`...migration.sql:58`), so it is set, not nulled.
2. **D6, add a non-blank guard.** `modelId TEXT` has no length bound. Add `CHECK ("modelId" IS NULL OR (btrim("modelId") <> '' AND char_length("modelId") <= 100))`, named `tenant_ai_config_modelId_check`. The primary-not-in-fallbacks CHECK only sees the stored `modelId`. When `modelId` is NULL it passes vacuously, so D11's validator (effective primary) stays the real guard. Say so in the migration header.
3. **D6, keep validation of existing rows.** Add the CHECKs `NOT VALID` then `VALIDATE` in the same migration, with the pre-check SELECT in the header, as in my R2. `purpose`, `tier`, `temperature` and `maxTokens` are unconstrained today (`schema.prisma:233-238`), and `tenant-ai-config.ts:93` shows the code already defends against a bad tier. The rehearsal (projects-64) must run the pre-check.
4. **D8, counter overflow.** `value INTEGER` plus the adapter's `value + by` (`PrismaQuotaRepository.ts:66`) errors past 2,147,483,647. In the new adapter use `LEAST(tenant_usage_counters."value"::bigint + ${by}, 2147483647)::int` in the `DO UPDATE`, so a runaway purpose saturates instead of raising on every call. Document that $214k per purpose per month is the saturation point. Also name the key constant once in the domain and use it in the router (D14) and the worker. D14 must divide centicents by 100 for `spentCents`.
5. **D11, lock key.** Use a namespaced key, `model-config:${tenantId}`, so it cannot collide with the scheduled-reports lock (`scheduled-reports.router.ts:110` hashes its own key). Both `update` and `resetToDefaults` take it first.
6. **D4, upper bound versus stored data.** The CHECK allows `maxTokens` above 32768 while Zod caps it (D4). A row written earlier with a larger value would be rejected when its card is changed. The page should display it and offer clamping, and the server error should name the field. This is not a migration problem.
7. **Prisma version correction (mine).** My R1 and R2 cited "Prisma 5.22" from `packages/db/CLAUDE.md`. `packages/db/package.json:57-64` says `@prisma/client` and `prisma` ^7.8.0, and `@prisma/adapter-pg@7.8.0` maps PG `42703` to `ColumnNotFound` (`adapter-pg/dist`, line 522). So `String[] @default([])` and the P2022 mapping apply under 7.8. The exec step should confirm that a genuine missing-column error from the live adapter surfaces as `P2022`, with one unit test using the real error shape, not only a mocked code.
8. **Integration test addition.** Beyond my R3 list: re-saving with `expected` null against a rate-limit-only row returns CONFLICT; `resetToDefaults` leaves a rate-limit row with `tier = BASELINE_TIER` and all PG-199 columns cleared; and the counter saturates at 2147483647 without error.

## Sign-off
APPROVED from the data lens, conditional on modifications 1, 2 and 4 being folded into the spec. The rest are clarifications. No finding is critical: none changes the migration's Class A status (additive, nullable or constant-default columns, plain CHECKs on a small table).

## Final Notes
- Migration 1 stays free of any RLS statement. Migration 2 holds only `ENABLE ROW LEVEL SECURITY` and the guarded `CREATE POLICY`. Its header states "prod RLS state unknown, projects-64 verifies at rehearsal".
- The generated client must be regenerated for the packages that read `TenantAIConfig` (`apps/ai-worker/src/lib/tenant-ai-config.ts` and the API router), or typecheck fails.
- CI uses db:push, so every CHECK and the policy exist only through the integration test's replay. Show that the suite actually ran under Node 22 against `DATABASE_TEST_URL`.
- Spend is an estimate; sub-centicent carry is lost on restart (D8); one in-flight call per worker may overshoot (D19).

## Files Verified
- `packages/db/package.json:52-64` (Prisma 7.8)
- `node_modules/.pnpm/@prisma+adapter-pg@7.8.0/.../dist` line 522 (42703 to ColumnNotFound)
- `apps/api/src/modules/calendar/availability-enforcement.ts:25-60`
- `apps/api/src/modules/analytics/scheduled-reports.router.ts:110`
- `apps/ai-worker/src/lib/tenant-ai-config.ts:25-45,74-137`
- `packages/adapters/src/repositories/PrismaQuotaRepository.ts:56-70`
- `packages/db/prisma/schema.prisma:231-248`
- `packages/db/prisma/migrations/20260421000000_feat_agent_system_tenant_customization/migration.sql:54-78`

## Round 2 vote
APPROVED

**A1 (tier nullable) checked against the code. I withdraw R3 challenge 4.**
- The caller-default evidence holds: one purpose is called with different default tiers, so a single written baseline tier would move other callers' models. `resolveEffectiveTier` already takes the default as a parameter (`apps/ai-worker/src/lib/tenant-ai-config.ts:74-78`), so `row.tier ?? defaultTier` is a one-line change.
- **Old-worker skew, both paths fall back to the caller default.**
  - If Prisma returns `null` for the required `tier`, `VALID_TIERS.has(row.tier)` is false (`tenant-ai-config.ts:106`). The code logs a warning and returns `{ tier: defaultTier }` (`:106-117`).
  - If Prisma throws on the null, the catch at `:131-135` returns `{ tier: defaultTier }`.
  - I could not run it against a live DB here, so which path occurs is unverified. The client uses `engineType = "client"` (`schema.prisma:7`). The outcome is the same either way.
- **Rate-limit override survives.** `resolveRateLimit` selects only `rateLimitPerMinute` (`tenant-ai-config.ts:176-179`), so a NULL tier on a retained row cannot break it. That matters because A4's reset keeps rows for their rate limit and nulls their tier.
- **Cost of the skew.** While the old worker runs, a NULL-tier row loses that row's `temperature` and `maxTokens`, and the old worker logs a warn about every 60 s per tenant and purpose (`:108-111`). It is a short window (rollout order: migration, API, worker). I'd accept it and note it in the PR.

**Modifications for A1**
1. `ALTER COLUMN "tier" DROP NOT NULL` goes in migration 20261019120000 before the CHECKs. It is a catalog-only change on PG 11+ and Class A (relaxing). Name the replacement `tenant_ai_config_tier_check` with `"tier" IS NULL OR "tier" IN ('free','standard','premium')`, still `NOT VALID` then `VALIDATE`. Update `schema.prisma` to `tier String?` and its SQL-only comment.
2. The legacy select fallback (D9) must tolerate `tier` being null, and the new reader uses `row.tier ?? callerDefaultTier`. Add a resolver unit test with `tier: null`.
3. Integration test: a row inserted with `tier = NULL` is accepted, an invalid tier is rejected, and a retained rate-limit row after `resetToDefaults` has `tier IS NULL`.
4. Update my R4 Modification 1: after reset the retained row's tier is NULL (A4), not `BASELINE_TIER`. I have no objection to A2, A4 or A6. A6 matches my Modification 4 (clamp at INT max).
