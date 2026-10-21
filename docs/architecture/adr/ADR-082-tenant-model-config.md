# ADR-082: Tenant model configuration per AI purpose

**Status:** Proposed

**Date:** 2026-10-19

**Deciders:** Talysson Oliveira (owner rulings 2026-10-13 and 2026-10-19),
PG-199 spec session

**Technical Story:** PG-199 — Module Settings - Model Config
(`/agent-approvals/model-config`). Amends ADR-048 (hybrid AI inference).

## Context and Problem Statement

ADR-048 routes every LLM call through `createLLM(purpose, tier)`, with LiteLLM's
`infra/litellm/config.yaml` as the single source of truth for which concrete
model serves each `${purpose}-${tier}` alias, for fallbacks, and (via virtual
keys, not configured) for budgets. `TenantAIConfig`
(`packages/db/prisma/schema.prisma`) already lets a tenant override tier,
temperature and max tokens per purpose, and
`apps/ai-worker/src/lib/tenant-ai-config.ts` reads it at runtime — but nothing
writes it, it has no model, fallback or cost fields, the four agents and the
conversation-summary job bypass it, and spend is tracked per tenant only.

PG-199 asks for a tenant-facing page with per-agent model selection,
temperature, max tokens, fallback chain and per-agent cost ceilings, respecting
the owner's Never-Downgrade rule. How do tenant-chosen models, fallbacks and
ceilings coexist with ADR-048's YAML-centred routing?

## Decision Drivers

- Owner ruling 2026-10-19: one row per `LLMPurpose` (6); ceiling reached → block
  that purpose (non-AI fallbacks run); agents and the summary job must honour
  tenant settings; any pick of a lower-ranked model (primary or fallback) needs
  a confirm dialog and an audit entry naming the actor.
- Owner ruling 2026-10-13 (R2): only allow-listed models may be picked.
- Never-Downgrade rule: no silent swap of a model id for an
  older/smaller/cheaper one.
- Additive, Class A migration only; tenant isolation (RLS policy + explicit
  `tenantId`).
- Tenant settings must actually change runtime behaviour (no dead fields like
  `ChainVersion.model`).

## Considered Options

1. Keep ADR-048 as is: tenants pick only a tier; no model ids, fallbacks or
   ceilings in the DB.
2. Extend `TenantAIConfig` with an allow-listed model pin, an ordered fallback
   list and a monthly cost ceiling per purpose; the allow-list and its ranking
   live in code (domain package), derived from the models the LiteLLM config
   already routes to; the worker enforces them.
3. Per-tenant LiteLLM virtual keys and per-tenant YAML generated from the DB.

## Decision Outcome

Chosen option: **2**, agreed 6/6 in the PG-199 spec consensus (2026-10-19),
because it meets every owner ruling with an additive (Class A) migration and no
new infrastructure; option 1 cannot express fallbacks or ceilings; option 3
needs the LiteLLM budget DB, which is not configured.

- **Catalog** (`packages/domain/src/ai/model-config/`): code-owned, append-only,
  each model priced in integer micro-USD per 1k (mirrors `MODEL_PRICING`) with
  per-provider ids. Downgrade = strictly lower price (owner Q7); equal price is
  lateral.
- **Storage**: `tenant_ai_config` gains a model pin, an ordered fallback list
  (≤ 3) and a monthly ceiling in cents; `tier` becomes nullable (NULL = each
  caller's own default tier). RLS policy in a separate migration.
- **ADR-048 amended**: LiteLLM YAML gains one `catalog-<id>` stanza per catalog
  chat model. Once a purpose is pinned its fallbacks are tenant-defined (the
  YAML free→standard fallback no longer applies to it). OpenRouter honours pins
  only where a mapping exists; Ollama ignores pins.
- **Metering**: spend is recorded once per chat/embedding call in the tracing
  wrappers, per purpose (hundredths of a cent) and in the existing tenant
  aggregate. Embedding spend is estimated from input text.
- **Ceilings are soft**: checked before the call, cost known after; one
  in-flight call per worker may overshoot; changes apply within ~2 minutes (60 s
  config + 30 s spend caches).
- **Deploy skew**: rollout migration → API → worker → web. An old worker reading
  a NULL tier falls to its existing fail-open path (caller default; that row's
  temperature/max tokens ignored until the worker is redeployed).

### Positive Consequences

- One canonical, audited, tenant-scoped place for model settings that the
  runtime really reads.

### Negative Consequences

- The model allow-list becomes a second list next to the LiteLLM YAML and
  `MODEL_PRICING`; parity tests keep them consistent.
- Repricing in `MODEL_PRICING` re-orders what counts as a downgrade; audit
  entries store prices at decision time.
