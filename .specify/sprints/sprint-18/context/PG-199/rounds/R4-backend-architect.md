REJECTED: D3/D6 assume one BASELINE_TIER per purpose, but callers of createLLMForTenant pass different default tiers for the same purpose, so writing a row with tier = BASELINE_TIER silently changes (and can downgrade) other callers' models.

## Agreement
I support D1, D2 (with the integer-micro rule already in D1), D4, D7, D9, D10, D12, D13, D14, D15-D23, D24-D29 as written. D11's advisory lock, per-purpose `expected`, no-op skip, in-lock downgrade diff and P2002 mapping match my R3 asks (`scheduled-reports.router.ts:109-110`, `settings-shared.ts:34-39`). D12 keeps `rateLimitPerMinute` rows alive, as the Data-Engineer required (`schema.prisma:238`).

## The blocking problem (D3, D6)
- `resolveEffectiveTier(tenantId, purpose, defaultTier)` takes the **caller's** default (`tenant-ai-config.ts:74-78`), and a row's `tier` overrides it for every caller of that purpose (`:120-129`).
- Callers disagree on the default tier within one purpose (all in `apps/ai-worker/src`):
  - `structured`: `free` in `chains/sentiment.chain.ts:236`, `chains/ticket-routing.chain.ts:178`, `contact-tag-suggestion.chain.ts:80`, `account-tag-suggestion.chain.ts:74`; `standard` in `shared/enrichment-adapter.ts:124,154` and `account-industry-inference.chain.ts:77`.
  - `scoring`: `free` in `chains/churn-risk.chain.ts:318`; `standard` in `account-scoring.chain.ts:73`.
  - `email`: `free` in `chains/auto-response.chain.ts:174`; `standard` in `contact-reply-draft.chain.ts:107`.
- So there is no single `BASELINE_TIER[purpose]`. If the router writes `tier = BASELINE_TIER` when it creates a row (D6), then saving only a ceiling or temperature for `structured` would move either the enrichment callers from standard to free (a silent downgrade, against R2/Never-Downgrade) or the tagging callers from free to standard (silent spend increase). The server-side downgrade check cannot see it, because D3 compares against one table entry.
- Effective model for a no-row tenant is therefore caller-dependent, so D3's `effectiveModel(purpose, tier, null)` is ill-defined for those three purposes.

## Modifications (concrete)
1. **Make `tier` nullable** in migration `20261019120000`: `ALTER TABLE "tenant_ai_config" ALTER COLUMN "tier" DROP NOT NULL;` (metadata-only; `schema.prisma:235` `String?`). NULL means "each caller's own default". The router never writes a tier from the page (D6 already says tier is not edited), so a new row carries `tier = NULL` unless a legacy row exists.
   - Old worker against a NULL tier: `VALID_TIERS.has(row.tier)` fails and it falls back to the caller default with a warn (`tenant-ai-config.ts:106-118`). That is the correct behaviour, but it logs once per 60 s per purpose. Say so in the skew notes, or accept the noise during the short skew window.
   - Update the CHECK to `"tier" IS NULL OR "tier" IN (...)`.
   - New worker resolver: `tier = row.tier ?? callerDefault`.
2. **Replace `BASELINE_TIER` with `CALLER_DEFAULT_TIERS[purpose]`** in domain: the set of default tiers callers use (`structured {free,standard}`, `scoring {free,standard}`, `email {free,standard}`, `qualification {standard}`, `reasoning {free}`, `rag {free}`). A parity test greps the ai-worker call sites so the table cannot drift.
3. **D3 comparison for an unpinned current model:** treat the current price as the **maximum** price of `DEFAULT_MODEL[purpose][t]` over `t in CALLER_DEFAULT_TIERS[purpose]`. A pick strictly below that maximum asks for the confirm. This is conservative (toward confirm) and consistent with D2's rule for unknown models. Copy: "lower price than the model some features use today".
4. **D12 reset:** the downgrade check vs baseline uses the same maximum-price rule. Resetting a pinned model to "caller defaults" lowers price whenever the pin outranks that maximum.
5. **D8 overflow:** `tenant_usage_counters.value` is INTEGER (Data R2). With no ceiling set (null) a purpose can exceed 2,147,483,647 centi-cents. Use `LEAST(value + by, 2147483647)` in the adapter's `ON CONFLICT` update, or the increment errors and the carry never drains. The ceiling compare stays valid because the cap exceeds the 2,000,000-cent ceiling x 100.
6. **D5 subpath export:** `packages/domain/tsup.config.ts:4` has `entry: ['src/index.ts']` only. A `./ai/*` export pointing at `dist/ai/*.mjs` would resolve to nothing, as the existing `./crm/*` pattern suggests it may not today. Either add a `src/ai/model-config/index.ts` entry and the matching `exports` map, or take D5's measured tree-shake exception. Decide in exec with a build check, not by assumption.
7. **D27:** `settings-search.ts` exists and its test asserts `toHaveLength(13)` (`__tests__/settings-search*.test.ts:15`). The bump to 14 is correct; also check the category count (4, line 39) is unaffected by the new entry's category.

## Sign-off
Rejected only for the D3/D6 tier defect, which is code-evidenced and breaks Never-Downgrade. With Modifications 1-4 applied I would approve without further changes. Items 5-7 are non-blocking.

## Final Notes
- Rollout order stays migration, API, worker, web. The `tier` DROP NOT NULL is the one change that touches existing-column semantics, but it is a loosening and Class A.
- `get` must show `tier`-derived defaults as "per feature default" for the three split purposes rather than naming one model, since no single default exists.
- I did not verify that `prismaWithTenant` exposes `tenantUsageCounter` in the API (no existing API usage found by grep). The Data-Engineer or exec should confirm D14 against the real tenant-scoped client before relying on it. If it is missing, the read goes through `ctx.prisma` with explicit `tenantId`.

## Files Verified
- `apps/ai-worker/src/lib/tenant-ai-config.ts:74-137`; `llm-factory.ts:380-398`
- Call sites listed above (`createLLMForTenant` defaults), via grep of `apps/ai-worker/src`
- `apps/api/src/modules/analytics/scheduled-reports.router.ts:109-110`; `apps/api/src/modules/agent/settings-shared.ts:34-39`
- `packages/db/prisma/schema.prisma:231-248`
- `packages/domain/package.json` exports; `packages/domain/tsup.config.ts:4`
- `apps/web/src/lib/shared/settings-search.ts` and its test (`toHaveLength(13)`)
- `.specify/.../rounds/R4-resolutions.md` D1-D29; `R2-data-engineer.md`, `R3-brief.md`

## Round 2 vote
APPROVED

- A1 resolves my blocker: nullable `tier` with `row.tier ?? callerDefaultTier`, `CALLER_DEFAULT_TIERS[purpose]`, and the unpinned current model compared against the maximum caller-default price. The call-site evidence it cites matches what I found (`sentiment.chain.ts:236`, `enrichment-adapter.ts:124`, `churn-risk.chain.ts:318`, `account-scoring.chain.ts:73`, `auto-response.chain.ts:174`, `contact-reply-draft.chain.ts:107`).
- A2 is correct and a catch I missed: `getQuotaPeriod` returns `'all'` for non-monthly keys, so the guard test per purpose is needed.
- A3 (keep the root import, add a tsup entry only if growth is measured), A4 (reset nulls `tier` too), A6 (clamp at INT max) and the D27 count bump match my Modifications 5-7.
- One note for exec, not a condition: the old-worker skew in A1 is slightly wider than described. Against a NULL `tier`, the old worker's `findUnique` selects every column (`tenant-ai-config.ts:90`) and the generated client types `tier` as required. If Prisma throws on the null conversion, the whole `resolveEffectiveTier` call lands in the catch at `:130-136`, so the caller default applies and that purpose's temperature and max-tokens overrides are also ignored during the skew window. `resolveRateLimit` is unaffected because it selects only `rateLimitPerMinute` (`:176-179`). The behaviour is still the intended one, but add a skew test that asserts the fallback, and note it in the rollout copy.
