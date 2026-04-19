# ADR-048: Hybrid AI Inference — LiteLLM Proxy + `createLLM` Factory

**Status:** Accepted

**Date:** 2026-04-16

**Deciders:** Architecture Team, AI Team, Platform Team

**Technical Story:** Sprint 17 Phase A/B — AI inference consolidation

## Context and Problem Statement

IntelliFlow CRM's AI worker currently hard-codes provider clients (OpenAI
`ChatOpenAI`, `OllamaEmbeddings`, Groq) directly in each chain and job file. A
code inventory across `apps/ai-worker/` found 30+ call-sites with no consistent
routing policy, no cost controls, no per-tenant budget enforcement, and no
fallback strategy. The Ollama real-benchmark showed p95 latency of 219,338 ms
for local inference under load
(`artifacts/benchmarks/ollama-real-benchmark-report.json`), making it unsuitable
for synchronous chain calls. A BullMQ audit
(`artifacts/diagnostics/2026-04-16-bullmq-audit-report.md`) identified five jobs
with no retry/timeout policy, silently dropping failures. Simultaneously, Phase
A free-tier and self-hosting research confirmed that provider free tiers carry
significant compliance and data-residency risks that must be gated.

The core question: how should IntelliFlow route LLM calls across multiple
providers (Groq, Anthropic, OpenAI, Mistral, Ollama) in a way that is
provider-agnostic for application code, enforces per-tenant budgets, satisfies
EU data-residency requirements, and can be tested locally without cloud costs?

## Decision Drivers

- **Provider agnosticism**: Chains should not contain provider-specific imports;
  switching providers should be a config change, not a code change.
- **Per-tenant budget enforcement**: Premium tenants may use Claude Sonnet;
  free-tier tenants are capped to smaller models.
- **EU data-residency**: Tenants whose data must stay in the EU must route
  exclusively to Mistral La Plateforme (France, GDPR-native).
- **Local development without cloud costs**: Developers need a full offline path
  via Ollama without special code paths.
- **Fallback + rate-limit handling**: Automatic fallback across providers when
  one is unavailable; per-provider rate-limit awareness.
- **Compliance gating**: Google Gemini free tier trains on prompts — must never
  reach production tenant data.
- **Observability**: Every LLM call must emit `provider`, `tier`, `purpose`,
  `latency_ms`, and `cost_usd` to the monitoring layer (ADR-043).

## Considered Options

- **Option A**: Keep per-chain hard-coded providers (status quo).
- **Option B**: Single shared `ChatOpenAI` instance pointing at one provider.
- **Option C**: **LiteLLM self-hosted proxy** + `createLLM(purpose, tier)`
  factory targeting the proxy.
- **Option D**: Custom routing middleware in the ai-worker (no LiteLLM).

## Decision Outcome

Chosen option: **Option C — LiteLLM self-hosted proxy** +
`createLLM(purpose, tier)` factory targeting the proxy.

Every chain talks to the LiteLLM proxy via `LITELLM_BASE_URL` (an
`OPENAI_BASE_URL`-compatible endpoint). LiteLLM owns provider routing, fallback,
rate-limit tracking, and per-tenant budget enforcement via its `model_list` +
virtual key system. Application code never imports a provider-specific SDK; it
calls `createLLM(purpose, tier)` and gets back a `BaseChatModel` instance
pre-configured for that logical model.

### Factory Contract

```typescript
// apps/ai-worker/src/lib/llm-factory.ts
type Purpose =
  | 'scoring'
  | 'qualification'
  | 'email'
  | 'reasoning'
  | 'structured'
  | 'rag';
type Tier = 'free' | 'standard' | 'premium';

export function createLLM(purpose: Purpose, tier: Tier): BaseChatModel;
// Returns a ChatOpenAI pointed at LITELLM_BASE_URL with modelName = `${purpose}-${tier}`.
```

The `modelName` is a virtual alias resolved by LiteLLM's `model_list` in
`infra/litellm/config.yaml`. That file is the **single source of truth** for
which concrete provider model backs each `purpose-tier` combination.

### Routing Table

| Virtual model name       | Concrete provider model           | Notes                             |
| ------------------------ | --------------------------------- | --------------------------------- |
| `scoring-free`           | `groq/llama-3.1-8b-instant`       | Fast, cheap scoring for free tier |
| `scoring-standard`       | `groq/llama-3.1-70b-versatile`    |                                   |
| `scoring-premium`        | `openai/gpt-4o-mini`              |                                   |
| `qualification-free`     | `groq/llama-3.1-8b-instant`       |                                   |
| `qualification-standard` | `openai/gpt-4o-mini`              |                                   |
| `qualification-premium`  | `openai/gpt-4o`                   |                                   |
| `email-free`             | `groq/llama-3.1-8b-instant`       |                                   |
| `email-standard`         | `openai/gpt-4o-mini`              |                                   |
| `email-premium`          | `openai/gpt-4o`                   |                                   |
| `reasoning-free`         | `groq/llama-3.1-70b-versatile`    |                                   |
| `reasoning-standard`     | `openai/gpt-4o-mini`              |                                   |
| `reasoning-premium`      | `anthropic/claude-sonnet-4-5`     | Highest quality reasoning         |
| `structured-free`        | `groq/llama-3.1-8b-instant`       |                                   |
| `structured-standard`    | `openai/gpt-4o-mini`              |                                   |
| `structured-premium`     | `openai/gpt-4o`                   |                                   |
| `rag-free`               | `ollama/nomic-embed-text` (local) | Embeddings only; local dev        |
| `rag-standard`           | `openai/text-embedding-3-small`   |                                   |
| `rag-premium`            | `openai/text-embedding-3-large`   |                                   |

See `infra/litellm/config.yaml` for the authoritative `model_list` entries,
fallback lists, and per-virtual-key budget limits.

### EU Data-Residency Override

Mistral La Plateforme (France, GDPR-native) is the EU data-residency option. All
EU-tenant PII workloads route to Mistral regardless of nominal tier. This is
enforced via a LiteLLM routing rule that inspects the `x-tenant-region` header:
when `eu`, the `model_list` entry substitutes `mistral/mistral-medium` (or an
equivalent Mistral model) for any standard-or-below tier.

### Positive Consequences

- Provider coupling eliminated from all 30+ chain call-sites.
- LiteLLM handles retries, fallbacks, and rate-limit backoff transparently.
- Per-tenant budget caps enforceable via LiteLLM virtual keys without
  application-layer logic.
- EU data-residency achieved through routing config, not code branching.
- Local development works fully offline: `rag-free` routes to
  `ollama/nomic-embed-text`; other free-tier routes can be overridden to Ollama
  via `config.yaml` in dev mode.
- `AIMonitoringEvent.payload` (ADR-043) gains `provider` + `tier` fields emitted
  by the factory — no Prisma migration required.
- Chain version records (ADR-028) now store the `purpose+tier` logical name
  rather than a concrete provider model, making them stable across provider
  switches.

### Negative Consequences

- LiteLLM proxy is a new self-hosted service that must be kept healthy; single
  point of failure mitigated by health-check + fallback-to-direct-call circuit
  breaker.
- `infra/litellm/config.yaml` must be kept in sync with tier-entitlement logic;
  drift = wrong provider for tenant tier.
- **Google Gemini free tier trains on prompts (verified in Phase A research).**
  Used during dev phase only because data is synthetic; gated behind
  `NODE_ENV !== 'production'` before launch. Vertex AI (paid, with DPA) is
  required for any production Gemini usage.
  <!-- TODO(pre-prod): see ADR-048 compliance gate -->
- OpenAI and Anthropic do not offer free API tiers. Any "free" usage in the
  routing table refers to IntelliFlow's internal tenant tier, not provider cost.
- Mistral La Plateforme EU routing adds latency (~40–80 ms) for non-EU tenants
  who are incorrectly tagged as EU; tenant-region metadata must be accurate in
  the tenant record.

## Pros and Cons of the Options

### Option A — Status quo (hard-coded per chain)

- Good, because zero new infrastructure.
- Bad, because provider switches require code changes in 30+ files.
- Bad, because no centralized budget enforcement or fallback.
- Bad, because compliance risks (Gemini free tier) are invisible at call-site.

### Option B — Single shared ChatOpenAI instance

- Good, because minimal code change.
- Bad, because still one concrete provider; no multi-provider routing.
- Bad, because no tier-based model selection.

### Option C — LiteLLM proxy + factory (chosen)

- Good, because all routing logic lives in one config file.
- Good, because `BaseChatModel` abstraction keeps chains fully
  provider-agnostic.
- Good, because LiteLLM's virtual key system natively supports per-tenant
  budgets.
- Good, because provider-level observability (cost, latency) is centralised.
- Bad, because new infra service to operate.

### Option D — Custom routing middleware in ai-worker

- Good, because no external service.
- Bad, because re-implements LiteLLM's feature set (fallback, rate limits,
  budget) manually — high ongoing maintenance.

## Supersedes

This ADR **partially supersedes** the following:

- **ADR-001** §AI/LLM — "Why OpenAI + Ollama?" — provider selection is replaced
  by the LiteLLM proxy + router. All other decisions in ADR-001 (Turborepo,
  tRPC, Prisma, Next.js, Supabase, observability) remain in force.
- **ADR-006** §Considered Options — "LLM native function calling" rejection
  rationale no longer fully applies; provider coupling is now resolved by
  LiteLLM's normalization layer. The chosen tRPC-tools approach remains in
  force.
- **ADR-022** §Eval baseline — Eval suite must be re-run with each
  LiteLLM-routed provider and results tagged with `provider` + `tier`.
- **ADR-031** §Provider — "Ollama for local LLM development" role is replaced by
  LiteLLM routing. LangChain + CrewAI + BullMQ remain unchanged.

**ADR-037** (AI Output Review) and **ADR-043** (AI Monitoring Persistence) are
**related, not superseded** — they extend naturally to the LiteLLM model.

## Migration Plan

| Phase | Task ID | Description                                                                                    |
| ----- | ------- | ---------------------------------------------------------------------------------------------- |
| 1     | B0      | LiteLLM scaffold — `infra/litellm/config.yaml`, Docker Compose service, health check endpoint  |
| 2     | B2a     | `createLLM` factory — `apps/ai-worker/src/lib/llm-factory.ts`, unit tests, env var wiring      |
| 3     | B2b     | Chain migration — replace all 30+ hard-coded provider imports with `createLLM(purpose, tier)`  |
| 4     | B2c     | Job hardening — retry/timeout policies on five identified BullMQ jobs from audit               |
| 5     | B3      | Docs + monitoring — update `infra/litellm/config.yaml` docs, emit `provider`+`tier` to ADR-043 |
| 6     | —       | Eval re-baseline — re-run ADR-022 eval suite with LiteLLM-routed providers, tag results        |

## Evidence References

- `artifacts/benchmarks/ollama-real-benchmark-report.json` — p95 = 219,338 ms
  (confirms Ollama unsuitable for synchronous chain calls under load).
- `artifacts/diagnostics/2026-04-16-bullmq-audit-report.md` — identifies five
  jobs with missing retry/timeout policies.
- Phase A free-tier research report — Google Gemini free tier trains on prompts
  (verified); Anthropic and OpenAI have no free API tiers.
- Phase A self-hosting report — LiteLLM proxy v1.x performance benchmarks.
- Phase A LangChain SDK report — `BaseChatModel` `OPENAI_BASE_URL` compatibility
  confirmed for LiteLLM proxy endpoint.
- Phase A code inventory — 30+ hard-coded provider call-sites across
  `apps/ai-worker/src/`.

## Implementation Notes

### Environment Variables

```bash
LITELLM_BASE_URL=http://litellm:4000        # LiteLLM proxy endpoint
LITELLM_API_KEY=sk-...                      # Master key (dev: "sk-dev")
# Per-tenant virtual keys issued by LiteLLM; stored in tenant record
```

### Config Source of Truth

`infra/litellm/config.yaml` is the **authoritative routing table**. Any change
to provider assignments or budget limits must be made there, not in application
code.

### Monitoring Integration

```typescript
// Factory emits to AIMonitoringEvent (ADR-043)
const model = createLLM('scoring', 'free');
// Internally tags every call with { provider: 'groq', tier: 'free', purpose: 'scoring' }
```

### Chain Versioning Integration

Chain version records (ADR-028) store `modelName = 'scoring-free'` (logical
alias), not `groq/llama-3.1-8b-instant` (concrete model). This keeps version
records stable when provider assignments change in `config.yaml`.

### Validation Criteria

- [ ] LiteLLM proxy starts healthy in Docker Compose
- [ ] `createLLM('scoring', 'free')` returns a `BaseChatModel` connected to
      proxy
- [ ] All 30+ chain call-sites migrated (zero direct provider imports)
- [ ] Per-tenant budget enforcement verified via LiteLLM virtual keys
- [ ] EU tenant routes to Mistral La Plateforme
- [ ] `AIMonitoringEvent.payload` includes `provider` + `tier`
- [ ] Eval suite re-baselined with LiteLLM-routed providers
- [ ] `NODE_ENV !== 'production'` gate verified for Gemini dev usage

### Rollback Plan

1. Set `LITELLM_BASE_URL` to empty / unset to trigger factory's direct-client
   fallback mode (restores pre-ADR-048 hard-coded behaviour per chain).
2. LiteLLM service can be stopped independently; no DB migration required.
3. Chain call-sites retain the `createLLM` wrapper — swap factory internals to
   hard-code if needed.

## Links

- [LiteLLM Documentation](https://docs.litellm.ai/)
- [infra/litellm/config.yaml](../../../infra/litellm/config.yaml) — routing
  source of truth
- [ADR-001 Modern Stack](./ADR-001-modern-stack.md) — partially superseded
- [ADR-006 Agent Tools](./ADR-006-agent-tools.md) — context updated
- [ADR-022 AI Features Quality](./ADR-022-ai-features-quality.md) — eval
  re-baseline required
- [ADR-028 AI Chain Versioning](./ADR-028-ai-chain-versioning.md) — logical
  model name convention
- [ADR-031 AI Pipeline Design](./ADR-031-ai-pipeline-design.md) — partially
  superseded (Ollama role)
- [ADR-037 AI Output Review](./ADR-037-ai-output-review.md) — related
- [ADR-043 AI Monitoring Data Persistence](./ADR-043-ai-monitoring-data-persistence.md)
  — extended
- [artifacts/benchmarks/ollama-real-benchmark-report.json](../../../artifacts/benchmarks/ollama-real-benchmark-report.json)
- [artifacts/diagnostics/2026-04-16-bullmq-audit-report.md](../../../artifacts/diagnostics/2026-04-16-bullmq-audit-report.md)
