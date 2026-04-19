# Agent System Architecture Audit — 2026-04-17

**Status:** Findings triaged; remediation in progress (sprint-17). **Auditors:**
4 parallel Explore agents (topology, multitenancy+RBAC+customization, memory,
lifecycle+observability). **Scope:** Runtime AI agent system —
`apps/ai-worker/`, `apps/api/src/modules/ai-*/`,
`packages/adapters/src/external/`, related Prisma models. Excludes Claude Code
meta-orchestration. **Baseline:** Post-ADR-048 migration (LiteLLM +
`createLLM()` factory + `withStructuredOutput` across chains).

---

## Executive verdict

IntelliFlow CRM's agent system has **excellent schema + ADR ambition** (ADRs
006/022/028/037/043/048, full RBAC schema, ChainVersion state machine,
AIOutputReview queue, AIMonitoringEvent telemetry, Zep adapter, pgvector RAG,
GuardrailsAIService, CrewAI skeleton) — but **significant portions of that
ambition are scaffolded at the schema / interface level and are not wired into
runtime execution**. The code runs, but it is running a much simpler system than
the schema + ADRs describe.

Two findings stand out:

1. **Critical C1** — the scheduled scoring cron at
   `apps/ai-worker/src/jobs/scoring.job.ts:160` does
   `prisma.lead.findMany({ where: { OR: [{ aiInsight: null }, ...] } })` with no
   `tenantId` filter. A single cron run iterates and enqueues leads across every
   tenant.
2. **High H1** —
   `AIMonitoringService.getStatus/getDriftMetrics/getLatencyMetrics/getROIMetrics`
   return cross-tenant aggregates to any authenticated user. Tenant A can read
   Tenant B's AI performance, cost, hallucination, and drift metrics.

Both are cross-tenant boundary violations that must be closed before any GA
conversation.

---

## Quadrant A — Topology (agents, chains, tools, orchestration)

### Inventory

- **4 agents** (`BaseAgent` at `apps/ai-worker/src/agents/base.agent.ts:83` + 4
  subclasses)
  - `LeadQualificationAgent` — `qualification.agent.ts:64` — purpose
    `'qualification'`
  - `FollowupAgent` — `followup.agent.ts:54` — purpose `'reasoning'`
  - `EmailWriterAgent` — `email-writer.agent.ts:53` — purpose `'email'`
  - `NextBestActionAgent` — `next-best-action.agent.ts:175` — purpose
    `'reasoning'` (default)
- **8 chains** (`apps/ai-worker/src/chains/*.ts`)
  - `LeadScoringChain`, `ChurnRiskChain`, `InsightGenerationChain`,
    `SentimentAnalysisChain`, `RAGContextChain`, `EmbeddingChain`,
    `AutoResponseChain`, `TicketRoutingChain`
  - 7 of 8 use `withStructuredOutput`; `AutoResponseChain` does not
    (unstructured response).
- **9 tools** (`apps/api/src/agent/tools/`)
  - Read-only (no approval): `search_leads`, `search_contacts`,
    `search_opportunities`, `search_crm`
  - Mutation (30-min approval expiry): `create_case`, `create_appointment`,
    `update_case`, `update_appointment`, `draft_message`
- **3 BullMQ queues** — `ai-scoring`, `ai-prediction`, `ai-insights`

### Findings

| ID  | Finding                                                                                                                                                                                                                                               | Severity               |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| A1  | **CrewAI orchestrator is skeleton** — `apps/ai-worker/src/agents/crew.ts:68` exists with `sequential`/`parallel`/`hierarchical` modes, factory helpers `createLeadProcessingCrew()` / `createResearchCrew()` — but **not invoked by any BullMQ job**. | Low (unused)           |
| A2  | **Tool selection is rule-based, not LLM `tool_choice`** — callers look up by name from `agentToolRegistry.get()` at `tools/index.ts:74`. No LLM-driven dispatch path exists in the codebase.                                                          | Med (design)           |
| A3  | **ADR-037 review layer has no feedback loop back to agent** — jobs check `requiresHumanReview()` (`prediction.job.ts:466`), log a warning, and keep going. Reviewed outputs don't re-enter the pipeline.                                              | Med                    |
| A4  | **`QUALIFICATION` prediction type routes to `LeadScoringChain`, not `LeadQualificationAgent`** — `prediction.job.ts:635` vs `qualification.agent.ts:64`. Semantic mismatch between agent name and job routing.                                        | Low                    |
| A5  | **GuardrailsAIService PII regex covers email + UK phone only** — `GuardrailsAIService.ts:471–480`. No SSN, CC, IBAN, NHS, Brazilian CPF coverage.                                                                                                     | Med (region-dependent) |
| A6  | **No explicit DLQ** — failed jobs auto-expire after 7 days via `removeOnFail.age` (`insight-generation.job.ts:1018`). No dead-letter queue, no `stalled/failed` event handlers registered.                                                            | High                   |
| A7  | **`calculateConfidence()` default returns hardcoded `0.8`** — `base.agent.ts:218`. Confidence has no signal unless subclass overrides.                                                                                                                | Low                    |

### Dependency graph

```
BullMQ: ai-scoring
  └── processScoringJob → LeadScoringChain → LLM (withStructuredOutput) → prisma.leadAIInsight.upsert

BullMQ: ai-prediction
  └── processPredictionJob
        ├── CHURN_RISK → ChurnRiskChain → LLM → prisma.leadAIInsight.upsert / contactAIInsight.upsert
        ├── NEXT_BEST_ACTION → NextBestActionAgent
        │     ├── RAGContextChain → RetrievalService (pgvector)  [⚠ retrievalService=null at startup]
        │     ├── SentimentAnalysisChain → LLM
        │     └── LLM (recommendation generation)
        └── QUALIFICATION → LeadScoringChain → LLM → prisma.leadAIInsight.upsert

BullMQ: ai-insights
  └── processInsightJob → InsightGenerationChain → LLM (withStructuredOutput)
        → prisma.aIInsight.create
        → prisma.leadAIInsight.upsert / contactAIInsight.upsert
        → prisma.notification.create (critical/high only)
        → prisma.task.create (critical only, +2d deadline)

apps/api/src/agent/tools (tRPC)
  ├── search_*  (no approval) → prisma.*.findMany
  └── create_*/update_*/draft_message (30-min approval window)
        → pendingActionsStore.add → ApprovalWorkflowService.approveAction → tool.execute()

GuardrailsAIService (wraps AIServicePort)
  → sanitizeInput (prompt-sanitizer.ts)
  → sanitizeOutput (PII regex: email + UK phone)
  → AuditLogPort.logSecurityEvent
```

---

## Quadrant B — Multitenancy, RBAC, Customization, Governance

### tenantId propagation — per-hop status

| Hop                                 | File:line                                             | Status                        |
| ----------------------------------- | ----------------------------------------------------- | ----------------------------- |
| JWT token extraction                | `apps/api/src/context.ts:589`                         | ✅                            |
| tenantId from DB                    | `context.ts:263`                                      | ✅                            |
| Tenant middleware guard             | `trpc.ts:254`                                         | ✅                            |
| `ctx.tenant.tenantId` built         | `trpc.ts:263`                                         | ✅                            |
| Tenant-scoped Prisma client         | `trpc.ts:276` — `createTenantScopedPrisma`            | ✅                            |
| BullMQ enqueue (scheduled dispatch) | `scoring.job.ts:191`                                  | ✅                            |
| Job handler Zod parse               | `scoring.job.ts:32–34` — `.optional()`                | ⚠ **H5**                      |
| Chain invocation                    | `scoring.job.ts:297–313` — no tenantId in chain input | ⚠ **chain is tenant-unaware** |
| `leadAIInsight.upsert` where clause | `scoring.job.ts:249` — `where: { leadId }` only       | ⚠ **M2**                      |
| Scheduled cron initial `findMany`   | `scoring.job.ts:160` — no tenantId filter             | 🔴 **C1**                     |

### RBAC model

Schema is complete:

- `Permission` — `schema.prisma:2260`
- `RBACRole` — `schema.prisma:2293`
- `RolePermission` — `schema.prisma:2317`
- `UserRoleAssignment` — `schema.prisma:2338`
- `UserPermission` — `schema.prisma:2361`

Enforcement: **none of these tables are queried at runtime for AI endpoints.**
Every AI router uses `tenantProcedure` (no role gate). The only role check is
`isAdmin` at `trpc.ts:185`, which checks `ctx.user.role === 'ADMIN'` — a field,
not the RBAC graph.

### Severity-ranked findings

| ID     | Finding                                                                                                                                                                       | Severity     |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| **C1** | Scheduled scoring cron scans all tenants — `scoring.job.ts:160`                                                                                                               | **Critical** |
| **H1** | `AIMonitoringService.getStatus/getDriftMetrics/getLatencyMetrics/getROIMetrics` return cross-tenant aggregates — `AIMonitoringService.ts:47`, `ai-monitoring.router.ts:64–82` | High         |
| **H2** | No role gate on any AI endpoint — any `SALES_REP` can approve reviews, reset agents, view all failed jobs                                                                     | High         |
| **H3** | ChainVersion state machine exists but chains never load versions from DB — `scoring.chain.ts:43–58` bypasses `ChainVersionService` at `container.ts:387`                      | High         |
| **H4** | Zero `AuditLogEntry(actorType=AI_AGENT)` writes — AI agent DB mutations leave no audit trail (ADR-008 gap)                                                                    | High         |
| **H5** | `ScoringJobDataSchema.tenantId` is `z.string().optional()` — `scoring.job.ts:34`. Missing tenantId silently passes validation                                                 | High         |
| H6     | No per-tenant tool/skill enable-disable surface (ADR-006 gap) — no `TenantToolEnablement` model exists                                                                        | High         |
| M1     | `ConversationSearchService` wired with **stub repo** at `container.ts:477–485` — all searches return `{ conversations: [], total: 0 }`                                        | Med          |
| M2     | `leadAIInsight.upsert({ where: { leadId } })` has no `tenantId` guard — cross-tenant `leadId` collision could upsert wrong tenant's row                                       | Med          |
| M3     | Prompt encryption at rest (DBA-015/DBA-018) marked TODO — `schema.prisma:4551,4553`                                                                                           | Med          |
| M4     | RBAC permission tables (`RBACRole`, `UserRoleAssignment`) never queried at runtime for AI endpoints                                                                           | Med          |
| M5     | Model/tier selection hardcoded in chain constructors — `scoring.chain.ts:50`, `auto-response.chain.ts:107`. No per-tenant override                                            | Med          |
| M6     | Feature flags never evaluated in AI paths — zero `isEnabled` calls in `apps/ai-worker/src`                                                                                    | Med          |
| M7     | `AIMonitoringEvent.payload` has no write-time Zod validation — ADR-048's `provider`/`tier` fields not enforced                                                                | Med          |

### Per-tenant customization matrix

What a tenant **can** change today:

| Dimension                    | Possible today?                                                            | Blocker     |
| ---------------------------- | -------------------------------------------------------------------------- | ----------- |
| System prompt / chain prompt | ❌ (schema allows; chains never load)                                      | H3          |
| Enabled skills / tools       | ❌ (no model)                                                              | H6          |
| Memory retention policy      | ❌ (no `TenantMemoryPolicy`)                                               | —           |
| Human-in-the-loop toggle     | ⚠ Partial (global review queue, no per-tenant flag)                        | M4-adjacent |
| Rate limits                  | ❌ (`rateLimitPerMinute` is global env var)                                | —           |
| Model / tier selection       | ❌ (baked into chain constructors)                                         | M5          |
| Feature flag opt-ins         | ❌ (flags never evaluated in AI paths)                                     | M6          |
| Audit log of own AI actions  | ❌ (writes don't exist)                                                    | H4          |
| Monitoring dashboard         | ⚠ Partial (drill-down endpoints tenant-scoped; top-line KPIs cross-tenant) | H1          |
| Cost visibility / budget cap | ❌ (`dailyLimit` code path dead for LiteLLM)                               | H7          |

**Interpretation:** Near-zero runtime tenant customization today. Acceptable
pre-GA; blocker for enterprise-tier conversations.

---

## Quadrant C — Memory architecture

### Memory types

| Type                                                     | Status                                | Implementation                                                                                                                                                          |
| -------------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Conversation (per-turn context replay)**               | ❌ Missing                            | `MessageRecord` (`schema.prisma:1305`) is write-only — nothing reloads history into LLM prompts                                                                         |
| **Zep episodic session memory**                          | ⚠ Infrastructure exists, disconnected | `ZepMemoryAdapter` + `ZepEpisodeUsage` (`schema.prisma:4507/4526`) implemented; never called from any agent or chain                                                    |
| **ConversationSearch** (semantic conversation retrieval) | ❌ Broken stub                        | `container.ts:477–485` — stub repo returns empty always                                                                                                                 |
| **Durable AI outputs**                                   | ✅ Implemented                        | `AIInsight` (`schema.prisma:3833`), `LeadAIInsight` (`2417`, upsert-safe), `ContactAIInsight` (`2443`, upsert-safe), `AIScore` (`1227`, append-only)                    |
| **RAG / pgvector**                                       | ⚠ Partially implemented               | `IRetrievalService` interface exists; global chain singleton has `retrievalService = null` at `rag-context.chain.ts:476` — throws in production unless explicitly wired |
| **Episodic telemetry**                                   | ✅ Implemented                        | `AIMonitoringEvent` (`schema.prisma:2140`); 60s flush; 30-day retention; telemetry-only                                                                                 |
| **Entity memory (per-lead/contact)**                     | ⚠ Partial snapshot                    | `LeadAIInsight` / `ContactAIInsight` as job-written snapshots; no agent-interactive entity memory                                                                       |
| **Fact extraction / long-lived facts**                   | ❌ Missing                            | No fact chain, no facts table, `ZepMemory.facts` unconnected, `ConversationRecord.summary` never populated                                                              |

### Vector columns (pgvector)

- `Lead.embedding vector(1536)` — `schema.prisma:363`
- `Contact.embedding vector(1536)` — `schema.prisma:530`
- `LeadNote.embedding vector(1536) + searchVector tsvector` —
  `schema.prisma:425`
- `ContactNote.embedding vector(1536) + searchVector tsvector` —
  `schema.prisma:2407`
- **Account has no vector column** — gap vs chain's declared RAG sources.

### Context-window management

| Mechanism                     | Location                            | Detail                                                                                |
| ----------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------- |
| `js-tiktoken` counting        | `token-counter.ts:49`               | Dynamic import with fallback to char÷4 heuristic                                      |
| Payload capping (insight job) | `insight-generation.job.ts:370–372` | `MAX_DEALS/LEADS/CONTACTS_PER_JOB = 10`                                               |
| Document chunking             | `embedding.chain.ts:190`            | 1000-char chunks with 200-char overlap (custom, not `RecursiveCharacterTextSplitter`) |
| **Summarization pass**        | **Not found**                       | No prior-turn summarization exists                                                    |
| **Pre-call truncation guard** | **Not found**                       | Tokens counted but prompt never truncated pre-call                                    |

---

## Quadrant D — Lifecycle, Limits, Observability

### Agent lifecycle phases

| Phase                                  | Present?  | Notes                                                                                            |
| -------------------------------------- | --------- | ------------------------------------------------------------------------------------------------ |
| Init                                   | ✅        | `base.agent.ts:92–118`                                                                           |
| **Plan** (pre-tool decomposition)      | ❌        | Absent — no planner phase                                                                        |
| Execute (LLM call)                     | ✅        | `base.agent.ts:266` `invokeLLM()`                                                                |
| **Reflect** (post-output quality gate) | ⚠ Partial | Hallucination check at `ai-worker.ts:334` is fire-and-forget (`.catch(() => {})`) — never blocks |
| Finalize                               | ⚠ Partial | `markAgentIdle()` + cost tracker; no guaranteed flush per call                                   |

Interpretation: Current code is "structured LLM call pipelines" rather than
"agents that reason about their own work."

### BullMQ job lifecycle

| Parameter                 | Value              | Location                                                                                   |
| ------------------------- | ------------------ | ------------------------------------------------------------------------------------------ |
| `lockDuration`            | 180 000 ms (3 min) | `ai-worker.ts:82`                                                                          |
| `stalledInterval`         | 90 000 ms          | `ai-worker.ts:83`                                                                          |
| `maxStalledCount`         | 3                  | `ai-worker.ts:84`                                                                          |
| `concurrency`             | 2                  | `ai-worker.ts:85`                                                                          |
| `extendLock` (before LLM) | 5 min (`300_000`)  | `insight-generation.job.ts:894,955`, `scoring.job.ts:310`, `prediction.job.ts:431,575,643` |

### Limits

| Limit                    | Config                               | Enforced?                                                                                     |
| ------------------------ | ------------------------------------ | --------------------------------------------------------------------------------------------- |
| Token ceiling            | `maxTokens: 2000`                    | Passed to LangChain; enforced provider-side                                                   |
| LLM timeout              | 30s OpenAI, 60s Ollama, 120s LiteLLM | Passed to LangChain                                                                           |
| Job-level LLM guard      | 120s `LLM_TIMEOUT_MS`                | `Promise.race` in insight job only                                                            |
| Rate limit (client-side) | `rateLimitPerMinute: 60`             | Fixed-delay in scoring+sentiment chains only (NOT prediction/insight)                         |
| Cost tracking            | `MODEL_PRICING` map                  | ⚠ **Dead for litellm/ollama** — `base.agent.ts:287` gated on `provider === 'openai'` → **H7** |
| Daily budget             | `dailyLimit` in config               | Enforced inside `CostTracker.checkThresholds()` — but gated dead path                         |
| Circuit breaker          | Defined at `retry.ts:209`            | ❌ **Never instantiated** → **H9**                                                            |

### Fallbacks & graceful degradation

- `insight-generation.job.ts:564–598` — `generateInsightsWithFallback()` wraps
  LLM in `Promise.race` with 120s timeout; on timeout/error, calls
  `chain.generateFallbackInsights()`.
- `scoring.job.ts` + `prediction.job.ts` — **no fallback path** → **H10**
- Token-overflow → no truncation; falls through to retry
- Rate-limit → no retry-then-fallback for 429

### Observability

- **Logging**: pino; no MDC / async-local-storage — `correlationId` flows
  through job data but is not injected into logger context → **L1**
- **Prometheus metrics**: served from ai-worker; `intelliflow_ai_*` names
- **OTel SDK**: ❌ `apps/ai-worker/package.json` has **no `@opentelemetry/*`
  deps**; infra config scrapes port 3002 but worker serves `/metrics` on 5000 →
  **L2**
- **AIMonitoringEvent**: 60s flush interval; 30-day retention; `tenantId`
  nullable (drift events intentionally global)
- **Alerts** (`infra/monitoring/alerts-config.yaml`): drift-detected,
  drift-critical, hallucination-rate, latency-p95, cost-spike, success-rate —
  all reference Prometheus metrics that depend on the scrape port being correct

### Feedback loop

- `feedback-analytics-generator.ts` reads `FeedbackRecord` → summary stats +
  retraining triggers — but **runs as offline script, not scheduled job**
- `roi-tracker.ts:35` declares `feedback_correction` type — never written to
- Drift-detected alerts are **advisory only** — no automated prompt-update,
  model-switch, or retraining trigger fires
- ADR-037 approval callbacks write to `ConversationRecord` — never used to
  regenerate prompts

### Lifecycle-dimension severity findings

| ID      | Finding                                                                                       | Severity |
| ------- | --------------------------------------------------------------------------------------------- | -------- |
| **H7**  | Cost tracking dead for litellm/ollama (`base.agent.ts:287` gate)                              | High     |
| **H8**  | No DLQ; no `completed`/`failed`/`stalled` event handlers registered                           | High     |
| **H9**  | `CircuitBreaker` defined but never instantiated                                               | High     |
| **H10** | Only `insight-generation.job.ts` has LLM-timeout fallback; scoring + prediction have none     | High     |
| M8      | BullMQ lifecycle events (`completed/failed/stalled`) handlers not registered on `QueueEvents` | Med      |
| M9      | Token overflow guard — prompt never truncated pre-call                                        | Med      |
| M10     | OTel SDK not in ai-worker deps; no spans emitted despite infra config                         | Med      |
| M11     | Hallucination check is fire-and-forget — detected hallucinations never block output           | Med      |
| M12     | `BaseAgent.executeTask` is monolithic — no planner or reflection phases                       | Med      |
| L1      | `correlationId` not bound to logger context (no MDC)                                          | Low      |
| L2      | Prometheus scrape port mismatch (otel-config → 3002; ai-worker `/metrics` → 5000)             | Low      |
| L3      | Feedback analytics is offline script; no automated prompt updates                             | Low      |

---

## Remediation roadmap

### Sprint-17 hot fixes (Phase 1, in progress)

1. **C1** — add tenantId filter to scheduled scoring cron
2. **H5** — `ScoringJobDataSchema.tenantId` → required; mirror across
   prediction/insight schemas
3. **H1** — tenant-scope `AIMonitoringService` read endpoints
4. **H2** — `adminProcedure` gate on admin-sensitive AI endpoints
5. **H7** — remove `provider === 'openai'` gate on costTracker; verify
   `MODEL_PRICING` coverage
6. **H4 (partial)** — lightweight `AI_AGENT` audit-log helper wired from 3 job
   handlers

### Sprint-17 structural (Phase 2)

7. **H3** — wire `ChainVersionService` into chain constructors (6 chains)
8. **H8** — register BullMQ lifecycle listeners + DLQ queue
9. **H9** — instantiate per-provider `CircuitBreaker` in LLM factory
10. **H10** — port `Promise.race + fallback` to scoring + prediction jobs

### Sprint-17 wiring (Phase 3)

11. **M3 / RAG wiring** — `setRetrievalService()` at ai-worker startup; new
    `PrismaRetrievalService`
12. **M1 / ConversationSearch** — real `PrismaConversationSearchRepository`
    replacing stub

### Deferred (separate sprints)

- **M2** — `leadAIInsight` compound unique `(leadId, tenantId)`: requires Prisma
  migration + data-conflict review
- **H6** — `TenantToolEnablement` new model
- **M5 (per-tenant tier)** — `TenantAIConfig` new model
- **Memory: conversation replay (M6) + fact extraction (M7)** — product design
  work
- **M10 (OTel SDK)** — cross-cuts workspaces; separate sprint
- **M3/DBA-015 prompt encryption at rest** — security design
- **M12 Plan/Reflect phases** — architectural refactor; own ADR

---

## Cross-reference to prior session evidence

- ADR-048 migration evidence:
  `docs/architecture/adr/ADR-048-hybrid-ai-inference.md`
- BullMQ audit (same day):
  `artifacts/diagnostics/2026-04-16-bullmq-audit-report.md`
- Ollama p95 benchmark: `artifacts/benchmarks/ollama-real-benchmark-report.json`
- Memory rules (no downgrades, no fake-greens):
  `memory/feedback_never_downgrade_without_approval.md`,
  `memory/feedback_pg186_audit_lessons.md`

---

**Document version:** 1.0 — 2026-04-17 **Next review:** after Phase 3
validation + regression reviewer signs off
