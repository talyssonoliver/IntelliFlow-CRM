# PG-199 Round 1 ANALYSIS — Domain-Expert (business rules)

Paths are relative to the pg-199 worktree. Read-only analysis.

## Files Reviewed
- `.specify/sprints/sprint-18/context/PG-199/PG-199-owner-ruling.md:5-26` (R1, R2, Q1-Q4, runner constraints) and `PG-199-spec-exploration.md:10-124`.
- `apps/ai-worker/src/config/ai.config.ts:198-269`. `MODEL_PRICING` is keyed by LiteLLM alias (`scoring-free`, `reasoning-premium`) plus legacy OpenAI names (`gpt-4o`, `gpt-4o-mini`). It holds no Anthropic, Mistral, Groq or Gemini model ids.
- `infra/litellm/config.yaml:11-117` (alias to concrete model) and `:127-131` (fallbacks, free to standard for scoring, qualification, reasoning and structured only).
- `apps/ai-worker/src/lib/tenant-ai-config.ts:60-125` (fail-open, no row means factory default) and `llm-factory.ts:20-26`, `:232-240`, `:326`.
- `apps/api/src/modules/agent/settings-shared.ts:9-23` (admin roles ADMIN, MANAGER, OWNER, SUPER_ADMIN).
- `packages/db/prisma/schema.prisma:231-248` (`TenantAIConfig`) and `:5603` (`ChainVersion.model`).
- `docs/planning/module-settings-playbook.md:124-166` (§7-§8), `docs/planning/prd-module-settings.md:878-990` (template) and `docs/architecture/adr/ADR-082-tenant-model-config.md` (Outcome "TBD", leaning option 2).
- Fallback behaviour: `chains/auto-response.chain.ts:10,174`, `chains/ticket-routing.chain.ts:255-295`, `chains/churn-risk.chain.ts:593-676`, `chains/insight-generation.chain.ts:399-412`, `chains/scoring.chain.ts:294`, `chains/sentiment.chain.ts:313`, `jobs/summarize-conversation.job.ts:215-220` (all under `apps/ai-worker/src/`).

## Interpretation
1. **Never-Downgrade ranking.** There is no single scalar today. Price is the only numeric signal: `ai.config.ts:198-269` has input and output rates per alias. Price alone mis-ranks:
   - `reasoning-free` and `rag-free` price at 0.
   - `qualification-free` (groq llama-3.3-70b, $0.59/$0.79) costs more than `scoring-premium` (gpt-4o-mini, $0.15/$0.60).
   - Embedding models are not comparable with chat models.

   Proposal: an explicit, code-owned allow-list in the domain package. One entry per concrete model, with `provider`, `family`, a numeric `capabilityRank` and `generation`, scoped per purpose. "Lower" means a strictly lower `capabilityRank`. Equal rank is not a downgrade. A different family with the same rank is a lateral move: no confirm, but still audited as a change. Price is only a tiebreaker and a ceiling-UI aid, never the rank.
2. **Allow-list per provider.** Initial contents are exactly what `config.yaml:11-117` routes to: groq llama-3.1-8b and 3.3-70b, openrouter gpt-oss-20b:free, gemini-2.5-flash, mistral small and medium, claude-haiku-4-5, claude-sonnet-4-5, gpt-4o-mini, gpt-4o, plus rag: nomic-embed-text and text-embedding-3-small. A YAML-versus-code consistency test is already promised in ADR-082 "Negative Consequences".
3. **Tenants with no row.** Behaviour unchanged. `tenant-ai-config.ts:93-105` already treats an absent row as the factory tier. New columns must be nullable: null model means the `${purpose}-${tier}` alias, null fallbacks means YAML fallbacks only, null ceiling means no ceiling. No backfill. Class A.
4. **"Block that purpose" per purpose** (owner Q2). Behaviour differs, so the spec must state it for each:

   | Purpose | What runs when blocked |
   |---|---|
   | scoring | Churn and insight heuristics exist (`churn-risk.chain.ts:593`, `insight-generation.chain.ts:412`). Scoring returns a default low-confidence score (`scoring.chain.ts:294`). |
   | structured | Ticket routing keyword heuristic (`ticket-routing.chain.ts:255`). Sentiment returns neutral (`sentiment.chain.ts:313`). |
   | reasoning | Insight fallback. Summarize job writes a digest (`summarize-conversation.job.ts:215`). |
   | email | **No non-AI fallback.** `auto-response.chain.ts:10` says "MUST call real LLM, no template fallback allowed"; `:169` throws on failure. |
   | qualification | case-* and account-* chains need inspection (see Questions). |
   | rag | No chat call exists, only `createEmbeddings` (`llm-factory.ts:409`). |

   Blocking email must fail visibly (typed "ceiling reached" error, queue state) and must not synthesise a template.
5. **Reset to defaults.** Delete the tenant's rows (or null the new columns) to restore factory behaviour. Playbook §7 `resetToDefaults`, modelled on `availability.router.ts:162`. Confirm text must list what is reset (model, fallbacks, temperature, max tokens, ceiling) and what is kept (spend history, audit log). Reset to a lower-ranked model counts as a downgrade only if the tenant's current model outranks the factory default; that case needs the confirm and an audit entry.
6. **Who may edit.** `assertAgentSettingsAdmin` (`settings-shared.ts:22`). Reads open to any tenant user; `list` returns `canManage` as PG-198 does.

## DoD applicability (CSV row, 13 items)
- **Applies:** PageHeader and bento layout; canonical EmptyState (entity plus passive); system-compliant CTAs; `$transaction` on multi-row writes; no `skipDuplicates`; Zod `superRefine` for duplicates (purpose keys and repeated fallback entries, "rows N and M"); AI defaults FALSE (the `SET DEFAULT false` restatement applies only if a Boolean is added); cross-tenant negative test; Lighthouse >= 90 (likely NEEDS_HUMAN as PG-198 AC-P16); `pnpm test`.
- **N/A with evidence:**
  - TagsTab: no tags card, as PG-198 AC-P17.
  - colorToken CHECK: rows are keyed by the fixed purpose enum, not user-labelled entities (exploration §4).
- **Boolean toggles (§8):** prefer none. Ceiling-enabled is expressible as a null ceiling, avoiding an unwired Boolean. If one is added it must be category 1 (wired in the factory).
- **CSV defect:** the ARTIFACT path says `modules/agent-approval/`, but R1 puts the router in `modules/agent/`. Fix in the CSV only, then regenerate splits.

## Questions (code cannot answer)
1. Is a ceiling a hard stop for in-flight calls, or checked before each call? `cost-tracker.ts:186-197` throws after the call. Proposal: pre-call check, one overshoot call accepted.
2. Does the ceiling window reset on the UTC calendar month or on the billing cycle? `aiSpendCentsPerMonth` needs checking.
3. Is blocking the `email` purpose acceptable, given it has no non-AI fallback?

## Concerns
1. **`rag` purpose is a trap.** No chat call uses it; only embeddings do. Temperature and max tokens are meaningless there. Switching embedding models changes the vector dimension (768 vs 1536), which corrupts pgvector search. Recommend `rag` be read-only or excluded from model pick, and flag to the data-engineer. This contradicts the owner's "6 purposes" answer, so it needs an owner confirm.
2. **Tier and model both persisted.** `resolveEffectiveTier` returns the tier only. A model pin must override the alias, and the cache key `llm-factory.ts:153` has no model id. The AI-specialist must settle which wins, and the cache must include the model.
3. **Cost attribution is wrong today**, so per-purpose ceilings would be wrong too. `base.agent.ts:690` hardcodes `-free`; `insight-generation.chain.ts:362-367` records 0/0 tokens. Fix in this PR or declare the limitation and file it.
4. **Fail-open on missing spend table.** Per the owner constraint, log the reason and do not block.

## Follow-up issues to file (out of scope; confirm with team-lead before creating)
- `ChainVersion.model` (`schema.prisma:5603`) is stored and edited but dead at runtime.
- `ChainVersionEditor.tsx:73-85` resets temperature and max tokens to 0.7 and 2000 on edit (data loss).
- Cost misattribution at `base.agent.ts:690` and `insight-generation.chain.ts:362`, unless fixed here.
- `docs/design/sitemap.md:239,449` marks the route "Implemented" although it is a stub.

## Dependencies on other agents
- **ai-specialist:** model-versus-tier precedence, factory cache key, pre-call ceiling check, `rag` handling.
- **data-engineer:** nullable columns, CHECKs, spend table (per tenant, purpose and month), RLS step.
- **backend-architect:** `ResourceType` member for the audit log (`security/types.ts:91-105`) and `resetToDefaults`.
- **frontend-lead:** downgrade confirm dialog, calm NOT_FOUND degrade, link to AI Settings rather than duplicating it.
