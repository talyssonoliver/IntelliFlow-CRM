# PG-199 Round 2 PROPOSAL — Domain-Expert (business rules)

Paths relative to the pg-199 worktree; ai-worker paths are under `apps/ai-worker/src/`.

## Approach
Pure rules live in `packages/domain/src/ai/model-config/` (pattern: `ai/approval-policy`, exported at `packages/domain/src/index.ts:119-120`). The router, worker and web all import them. Four findings from the code change the lead's assumptions:

1. **Tier labels are not monotone.** `structured-free` is gemini-2.5-flash but `structured-standard` is mistral-small (`infra/litellm/config.yaml:36,67-70`), and flash outranks mistral-small. A tier-only change can therefore be a model downgrade. Downgrade is judged on the **effective model**, never the tier label.
2. **The factory default tier is caller-supplied** (`llm-factory.ts:380-398`). `qualification` is `standard` in the case/account chains but `free` in `base.agent.ts:164`; `structured` is `free` in tag chains and `standard` in `enrichment-adapter.ts:124`. A stored row forces one tier for all callers of that purpose (`tenant-ai-config.ts:93-105`). The domain therefore needs one `BASELINE_TIER[purpose]` as the "current" for tenants with no row (see Decisions).
3. **Every `createLLMForTenant` caller already catches errors and has a non-AI fallback**, so a typed `PurposeCeilingReachedError` thrown from the factory degrades correctly: `case-insight.chain.ts:59,82`, `account-scoring.chain.ts:90-111`, `contact-reply-draft.chain.ts:106,143`, `enrichment-adapter.ts:146`. The exceptions are `auto-response.chain.ts:10,169` (throws, per Q6) and `summarize-conversation.job.ts:215` (digest).
4. **Embeddings are not wired to tenants.** `embedding.chain.ts:61` hardcodes `createEmbeddings('free')`, and there is no tenant param and no cost recording (`llm-factory.ts:409`). Production may use Gemini via `EMBEDDING_PROVIDER` (`:424`).

## Files
Create:
- `packages/domain/src/ai/model-config/catalog.ts`: `MODEL_CATALOG`, `BASELINE_TIER`, `TIER_DEFAULT_MODEL`.
- `.../rules.ts`: `effectiveModel`, `isDowngrade`, `findDowngrades`, limits.
- `.../index.ts`.
- `packages/domain/src/ai/model-config/__tests__/*.test.ts`.
- `ai-worker` catalog-versus-YAML consistency test.

Modify:
- `llm-factory.ts:36,44`: purpose and tier become aliases of the domain types.
- PRD addendum `docs/planning/prd-module-settings.md`.
- ADR-082 Decision Outcome: option 2, plus the YAML-amendment wording.

(Router, validators, web and migration files belong to the other roles.)

### MODEL_CATALOG (append-only; ids are stable, entries are deprecated, never deleted)
Rank is a hand-assigned 0-100 capability scale (30-point gap = a different class). Higher is better. A pick is **lower** only if its rank is strictly less.

| catalog id | provider model (YAML) | rank | gen | purposes | USD per 1k in/out |
|---|---|---|---|---|---|
| `llama-3.1-8b-instant` | groq/llama-3.1-8b-instant | 20 | 3.1 | scoring, email | 0.00005 / 0.00008 |
| `gpt-oss-20b-free` | openrouter/openai/gpt-oss-20b:free | 30 | oss-20b | reasoning | 0 / 0 |
| `mistral-small` | mistral/mistral-small-latest | 35 | latest | scoring, structured | 0.0002 / 0.0006 |
| `llama-3.3-70b` | groq/llama-3.3-70b-versatile | 40 | 3.3 | qualification, email | 0.00059 / 0.00079 |
| `gpt-4o-mini` | openai/gpt-4o-mini | 48 | 4o | scoring | 0.00015 / 0.0006 |
| `gemini-2.5-flash` | gemini/gemini-2.5-flash | 50 | 2.5 | structured | 0.000075 / 0.0003 |
| `mistral-medium` | mistral/mistral-medium-latest | 55 | latest | qualification | 0.001 / 0.003 |
| `claude-haiku-4-5` | anthropic/claude-haiku-4-5 | 65 | 4.5 | email, reasoning | 0.0008 / 0.004 |
| `gpt-4o` | openai/gpt-4o | 75 | 4o | qualification, structured | 0.0025 / 0.01 |
| `claude-sonnet-4-5` | anthropic/claude-sonnet-4-5 | 85 | 4.5 | reasoning | 0.003 / 0.015 |
| `nomic-embed-text` (embedding) | ollama/nomic-embed-text | 20 | 768d | rag, locked | 0 |
| `text-embedding-3-small` (embedding) | openai/text-embedding-3-small | 40 | 1536d | rag, locked | 0.00002 / 0 |

- Purposes per model are exactly the YAML `model_list` aliases of that purpose (`config.yaml:11-117`), so every pinned model is already proven for its purpose. Prices equal `MODEL_PRICING` (`ai.config.ts:198-269`), per 1k tokens.
- Each default alias model ascends free < standard < premium for scoring, qualification, email and reasoning, so tier moves there are upgrades. Exception: structured (50 down to 35).
- Changing an existing rank retroactively changes what counts as a downgrade, so ranks are frozen. Changing one needs an ADR-082 amendment and owner sign-off. A test snapshots ids and ranks.
- Ranks are my judgment, to be ratified by the owner in the spec.

## Interfaces
- `effectiveModel(purpose, tier, modelId|null): CatalogId` = the pin, else `TIER_DEFAULT_MODEL[purpose][tier]`.
- `isDowngrade(before: CatalogId|null, after: CatalogId): boolean`. Unknown or retired `before` returns **true** (safe toward a confirm).
- `findDowngrades(before: Config, after: Config): Downgrade[]`, with `{purpose, slot: 'primary'|'fallback', from, to}`:
  - **Primary:** `rank(effective primary after) < rank(effective primary before)`. For a purpose with no row, `before` = `TIER_DEFAULT_MODEL[purpose][BASELINE_TIER[purpose]]`.
  - **Fallback (Q4):** a fallback that is new or changed, with `rank(entry) < rank(primary after)`. Unchanged entries never re-prompt. Equal rank is not a downgrade.
  - **Reset:** a downgrade whenever the current effective model outranks the baseline.
- Limits:
  - temperature 0-2, maxTokens 1-32768 (AI-specialist to verify per-model caps; none are asserted here).
  - fallbacks <= 3, no duplicates, none equal to the primary, all allowed for the purpose.
  - ceiling integer cents, 0-10,000,000 (0 = block outright). Null means no ceiling.
  - `rag`: model, tier, fallbacks, temperature and maxTokens are locked (null or empty). Only the ceiling is editable.

## Behaviour per purpose when the ceiling is reached
Check is pre-call, per UTC month, so one overshoot call is possible. Spend is an estimate from `MODEL_PRICING`, not an invoice. Tenant-wide `aiSpendCentsPerMonth` (`agent.router.ts:378`) still applies independently.

| purpose | blocked behaviour |
|---|---|
| scoring | default low-confidence score (`scoring.chain.ts:294`); churn heuristic (`churn-risk.chain.ts:593`) |
| qualification | chain `source:'fallback'` (case-*, account-*); qualification agent errors visibly |
| email | auto-response throws "monthly AI ceiling reached for email" (Q6); reply-draft returns `requiresReview` fallback (`contact-reply-draft.chain.ts:7`) |
| reasoning | insight heuristics (`insight-generation.chain.ts:412`); summary digest |
| structured | ticket keyword routing (`ticket-routing.chain.ts:255`); sentiment neutral (`sentiment.chain.ts:313`) |
| rag | not enforceable today (finding 4); see Decisions |

Fail open only on a missing column or table (`P2021`/`P2022`), with a logged reason. Any other DB error does not lift a ceiling that is already known.

## Reset semantics
`resetToDefaults`: one transaction, all six purposes.
- Delete rows with `rateLimitPerMinute` null. Rows carrying a rate limit (P2.8, `schema.prisma:236`) are kept: pin, fallbacks, ceiling, temperature and maxTokens are nulled and tier is set to baseline.
- Confirm text lists what is reset (model, fallbacks, temperature, max tokens, ceiling, with the blocked state lifted) and what is kept (month-to-date spend, audit log, rate limit).
- If it lowers any purpose's effective model, it needs `acknowledgeDowngrade` plus an audit entry.
- Reset always writes one audit entry with before and after.

## Decisions for the lead
1. **`BASELINE_TIER`:** scoring `free`, qualification `standard`, email `free`, reasoning `free`, structured `free`, rag `free`. These are the majority call-site defaults. Please ratify.
2. **rag ceiling:** Q5 says it is editable, but embeddings are tenantless and unmetered, so the ceiling would never trip. Recommend keeping it editable per Q5 and labelling it "not metered yet" (an accepted exception to the playbook's no-pending-badge rule). File the follow-up. Alternative: read-only. Needs the owner's choice.
3. **Metering must cover every `createLLMForTenant` caller.** Spend is recorded today only at `base.agent.ts:694` and `insight-generation.chain.ts:362`. The case, account and contact chains record nothing, so a qualification or email ceiling would never trip. Capture tokens in the tracing callback wrapper rather than per chain.
4. **Catalog pins need YAML routes.** Add additive `model_name` entries for catalog ids (no existing alias edited). The YAML-consistency test asserts `litellm_params.model` equality per catalog entry.

## Final DoD applicability (13 items)
| # | item | status |
|---|---|---|
| 1 | Never-Downgrade model ids | Applies: catalog, `findDowngrades`, server ack, audit |
| 2 | PageHeader + bento | Applies |
| 3 | Canonical EmptyState | Applies (fresh tenant, no spend) |
| 4 | System-compliant CTAs | Applies |
| 5 | TagsTab forwardRef | **N/A**: no tags card (cf. PG-198 AC-P17) |
| 6 | `$transaction` on destructive writes | Applies: update, reset |
| 7 | No `skipDuplicates` | Applies (no `createMany`) |
| 8 | Zod `superRefine` duplicate keys | Applies: purposes, fallbacks, "rows N and M" |
| 9 | colorToken CHECK | **N/A**: rows keyed by the fixed purpose enum |
| 10 | AI defaults FALSE | **N/A**: no Boolean column (ceiling null = off) |
| 11 | Wire every Boolean toggle | **N/A**: no Booleans; every setting has a runtime consumer |
| 12 | Cross-tenant negative test | Applies |
| 13 | Lighthouse >= 90 | Applies; NEEDS_HUMAN if `LHCI_TEST_*` creds absent |

## PRD addendum ACs
- AC-M1: playbook layout.
- AC-M2: admin-only mutations (FORBIDDEN), read-only for others.
- AC-M3: six purpose rows, each a model pick from the catalog filtered by purpose.
- AC-M4: temperature and max tokens bounds.
- AC-M5: fallback chain bounds (<= 3, ordered, no duplicate, not the primary).
- AC-M6: cost ceiling in cents, USD in the UI, estimate disclaimer.
- AC-M7: a lower-ranked primary pick needs a server-verified acknowledge, a confirm dialog and an audit entry naming the actor.
- AC-M8: same for a new or changed lower-ranked fallback.
- AC-M9: a tier-only change that lowers the effective model also needs the acknowledge.
- AC-M10: unknown current model needs the acknowledge.
- AC-M11: tenant-scoped, foreign id is NOT_FOUND.
- AC-M12: multi-row writes are transactional.
- AC-M13: no row means unchanged behaviour.
- AC-M14: pin, fallbacks, temperature, maxTokens and ceiling are honoured at runtime by every caller, including agents and the summary job.
- AC-M15: ceiling reached blocks only that purpose, per the table above.
- AC-M16: email shows "monthly AI ceiling reached"; the page shows the purpose as blocked.
- AC-M17: reset semantics as above.
- AC-M18: rag model, tier and fallbacks are locked.
- AC-M19: old API gives calm NOT_FOUND degrade; no unknown fields sent.
- AC-M20: cross-tenant negative test.
- AC-M21: fail open only on missing column or table, with a logged reason.
- AC-M22: settings may take up to 60 s to apply (worker cache).

## Integration
- Boundary: domain (pure) is imported by the API router, ai-worker, validators and web. No infra imports.
- Prisma `TenantAIConfig` gains modelId, fallbackModelIds, ceiling cents.
- Counters are `tenant_usage_counters` `aiSpendCents:<purpose>`, UTC month period.
- Audit via `getAuditLogger` with `model_config` resource.

## Runtime Consumer
| new item | production caller | legacy replaced |
|---|---|---|
| `effectiveModel`, catalog | `createLLMForTenant` and web catalog list | tier-only alias at `llm-factory.ts:326` |
| `findDowngrades` | `modelConfig.update`, `resetToDefaults`, web confirm | none (new rule) |
| `PurposeCeilingReachedError` | `createLLMForTenant`, caught by each chain's existing fallback | none |
| `BASELINE_TIER` | `findDowngrades` for no-row tenants | caller-supplied default for ranking |
| tenant-aware `BaseAgent` | agents `invokeLLM` | `createLLM(purpose,'free')` at `base.agent.ts:164` |
| tenant-aware summary job | `processSummarizeJob` | `createLLM('reasoning','free')` at `:223` |

## Follow-up issues to file (confirm with team-lead first)
1. `ChainVersion.model` (`schema.prisma:5603`) is stored but dead at runtime.
2. `ChainVersionEditor.tsx:73-85` resets temperature and max tokens on edit (data loss).
3. Embeddings tenantless and unmetered (`embedding.chain.ts:61`); wire the rag model and ceiling.
4. Per-model `maxTokens` caps in the catalog.
5. `docs/design/sitemap.md:239,449` marks the route "Implemented" while it is a stub.
6. Fix inline in this PR if feasible: spend misattribution at `base.agent.ts:690` and `insight-generation.chain.ts:362-367`.
