# PG-199 Round 2 PROPOSAL — brief from the lead

Read ALL six Round 1 files in this folder (R1-*.md) and the updated PG-199-owner-ruling.md
(now Q1–Q6 + runner constraints + lead decisions). Then write your Round 2 PROPOSAL to
rounds/R2-<your-role>.md (only file you may create/edit).

Lead working assumptions (challenge them in your proposal if the code says otherwise):
- Shared constants + rules in `packages/domain/src/ai/model-config/` (zero infra deps): the 6
  purposes, 3 tiers, a MODEL_CATALOG (catalog id → provider-specific model ids, family,
  capabilityRank, generation, allowed purposes, price per 1k for UI), defaults/limits, and
  pure functions `isDowngrade(current, next)` / `findDowngrades(before, after)`. ai-worker's
  `LLMPurpose`/`LLMTier` become aliases of the domain types. A test keeps the catalog
  consistent with infra/litellm/config.yaml.
- Validators `packages/validators/src/model-config.ts` (superRefine: duplicate purposes, primary
  in fallbacks, duplicate fallbacks, catalog/purpose membership, rag model locked, bounds).
- Router `apps/api/src/modules/agent/model-config.router.ts` → `modelConfig.{get,update,
  resetToDefaults}`; server-side downgrade check with an explicit acknowledge flag; audit via
  getAuditLogger with actorId; `$transaction`; explicit tenantId everywhere.
- Migration 20261019120000: additive nullable columns on tenant_ai_config (model pin, TEXT[]
  fallbacks default '{}', monthly ceiling cents) + named CHECKs; 20261019120100: the
  separately removable RLS policy (case_types shape, ENABLE not FORCE, DO/duplicate_object).
- Per-purpose spend: tenant_usage_counters key `aiSpendCents:<purpose>`, period YYYY-MM UTC,
  incremented from the existing cost listener with purpose attributed; ceiling check pre-call in
  the tenant-aware factory; typed PurposeCeilingReachedError; fail open (+ logged reason) only
  when the columns/counters are absent (pre-migration).
- ai-worker: model pin per provider, fallback chain executed in worker, breaker/cache keys include
  model; base.agent + summarize job resolve tenant config at invoke time; fix spend
  misattribution (base.agent.ts:690, insight-generation.chain.ts:362-367).
- Web: server page.tsx + ModelConfigContent.tsx + ModelConfigLoading.tsx + small components;
  one card per purpose; page-level Save/Reset with dirty snapshot; downgrade ConfirmationDialog
  for primary AND fallback; calm NOT_FOUND via a shared `apps/web/src/lib/trpc-errors.ts`
  (extract, don't add a 4th copy); never send fields the old API rejects.
- DoD N/A with evidence: TagsTab-forwardRef, colorToken CHECK, Boolean toggles (none).

Round 2 sections (file:line citations required): Approach (referencing existing patterns);
Files (create/modify, each with rationale; UI files carry REUSES/EXTENDS/COMPOSES/NEW(justified));
Interfaces (signatures/contracts); Integration; Runtime Consumer (production caller of every new
procedure/function + legacy path replaced). Under 1000 words.
