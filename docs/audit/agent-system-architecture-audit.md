IntelliFlow CRM — Agent System Architecture Audit

All 4 quadrants complete. Combined: ~40 distinct findings across topology,
multitenancy, memory, and lifecycle. Consolidating into one actionable  
 document.

- **General objective:**  
  Perform a meticulous audit of our agent system, evaluating our capabilities
  across layers such as:
- **System defaults:** minimum number of agents and AIs required (including
  free‑tier usage).
- **Multitenancy + RBAC:** tenant isolation, roles, permissions, and access
  scope.
- **Memory:** memory types, read/write policies, limits, and retention.
- **Skills:** tool catalog, contracts, selection, and composition.
- **Protocols:** interaction structure, rules, validations, and governance.

- **I need you to analyze, in detail, how our agent:**
  - **Receives context:**
    - How initial context is constructed (system prompt, business rules, tenant,
      user).
    - How context is updated each turn (previous messages, tool results,
      external events).

  - **Maintains continuity:**
    - How coherence is preserved across multiple interactions.
    - What short‑term and long‑term memory mechanisms are used.
    - How context‑window limits are handled.

  - **Accesses memory:**
    - What memory types exist (conversation, durable, semantic, episodic,
      entity‑based).
    - How the agent decides when to read/write to each type.
    - How retrieval is performed (semantic search, tenant/user filtering, etc.).

  - **Executes actions (skills/tools):**
    - How the agent selects which skills to call and in what order.
    - How input/output contracts for skills are defined.
    - How errors, timeouts, retries, and circuit breakers are handled.

  - **Operates under limits:**
    - Token limits, API call limits, execution time, cost.
    - How the system reacts when approaching or exceeding these limits.
    - Graceful degradation strategies (summaries, truncation, fallback models).

  - **Logs what happened (observability):**
    - What events are logged (prompts, responses, tool calls, errors).
    - How sessions are correlated with tenant, user, and business context.
    - What metrics exist (latency, error rate, memory usage, skill usage).

  - **Evolves without breaking the entire system:**
    - How new skills, memories, or protocols are introduced safely.
    - Versioning strategies for prompts, APIs, and memory schemas.
    - Feature flags, gradual rollout, and rollback mechanisms.

  - **Maintains clear separation between:**
    - **Input vs. processing:** raw user input vs. internal
      interpretation/normalization.
    - **Conversation context vs. durable memory:** what stays in the session vs.
      what persists.
    - **Semantic memory for long‑lived facts:**
      - How important facts are extracted, structured, and stored.
      - How they are retrieved and reinjected into context.

  - **Has an explicit lifecycle:**
    - Phases (initialization, planning, execution, reflection, finalization).
    - What data is created/updated in each phase.
    - How the lifecycle is represented (state machine, workflow, harness logic).

  - **Observability:**
    - How agent behavior is monitored in production.
    - Dashboards, alerts, and traces for diagnosing failures or deviations.
    - How observability data feeds back into improving prompts, memory, skills,
      and protocols.

  - **Allows customization:**
    - How each tenant can customize:
      - System instructions.
      - Enabled skills.
      - Memory and retention policies.
      - Interaction protocols (flows, approvals, limits).
    - How customization is kept safe without compromising security, isolation,
      or governance.

---

Deferred to follow-up (not this session)

     - M2 (leadAIInsight compound unique (leadId, tenantId)) — requires Prisma schema change + migration + data-conflict review. Defer.
     - H6 (TenantToolEnablement new model) — new Prisma model. Defer.
     - M8/M9 (per-tenant tier override) — new TenantAIConfig model. Defer.
     - M6/M7 (conversation history replay + summarization agent) — product decision, not a security/correctness fix.
     - M12 (OTel SDK install + spans) — cross-cuts ai-worker, api, web. Separate sprint.
     - M13 (prompt encryption at rest, DBA-015/018) — security design work.
     - Plan/Reflect phases in BaseAgent — architectural refactor worth its own ADR

---

1. Executive verdict

Your agent system has excellent schema and architectural ambition (ADRs
006/022/028/037/043/048, full RBAC model, ChainVersion state machine,  
 AIOutputReview queue, AIMonitoringEvent telemetry, Zep memory adapter, pgvector
RAG, GuardrailsAIService, CrewAI orchestrator skeleton) — but  
 significant portions of that ambition are scaffolded at the schema/interface
level and not wired into runtime execution. The code runs, but it's  
 running a much simpler system than the schema + ADRs describe.

Most dangerous finding: The scheduled scoring cron at scoring.job.ts:160 does
prisma.lead.findMany({ where: { OR: [{ aiInsight: null }, ...] } })  
 with no tenantId filter — a single scheduled run observes and enqueues leads
across every tenant. That's a Critical cross-tenant boundary violation in
production.

Second most dangerous:
AIMonitoringService.getStatus/getDriftMetrics/getLatencyMetrics/getROIMetrics
return cross-tenant aggregates to any authenticated user — Tenant A can observe
Tenant B's AI performance, cost, hallucination rate, and drift. That's a direct
data-leakage surface.

---

2. Runtime state map — what actually exists

┌─────────────────────────────────────┬───────────────┬────────────────────────────┬──────────────────────┬───────────────────────────────────┐

│ Component │ Schema │ Wired │ Active in prod path │ Reality │  
 ├─────────────────────────────────────┼───────────────┼────────────────────────────┼──────────────────────┼───────────────────────────────────┤

│ Agents (BaseAgent + 4 subclasses) │ ✓ │ ✓ │ ✓ │ Runs │  
 ├─────────────────────────────────────┼───────────────┼────────────────────────────┼──────────────────────┼───────────────────────────────────┤

│ Chains (8 files) │ ✓ │ ✓ │ 7 of 8 used │ Auto-response chain has no │  
 │ │ │ │ │ withStructuredOutput yet │  
 ├─────────────────────────────────────┼───────────────┼────────────────────────────┼──────────────────────┼───────────────────────────────────┤

│ Crew orchestrator │ ✓ │ ✓ │ ✗ — no BullMQ job │ Skeleton only │  
 │ │ │ │ calls it │ │  
 ├─────────────────────────────────────┼───────────────┼────────────────────────────┼──────────────────────┼───────────────────────────────────┤

│ ADR-006 tools (9 tools) │ ✓ │ ✓ │ ✓ │ Selection is rule-based, not LLM │  
 │ │ │ │ │ tool_choice │  
 ├─────────────────────────────────────┼───────────────┼────────────────────────────┼──────────────────────┼───────────────────────────────────┤

│ │ │ Partially (service exists │ ✗ — chains never │ All chains run with
hardcoded │  
 │ ADR-028 ChainVersion state machine │ ✓ │ in container.ts:387) │ load versions
from │ prompts/models │  
 │ │ │ │ DB │ │  
 ├─────────────────────────────────────┼───────────────┼────────────────────────────┼──────────────────────┼───────────────────────────────────┤

│ ADR-037 AIOutputReview │ ✓ │ ✓ │ Partial │ No feedback loop back to agent —
│  
 │ │ │ │ │ reviews are dead-ended │  
 ├─────────────────────────────────────┼───────────────┼────────────────────────────┼──────────────────────┼───────────────────────────────────┤

│ ADR-043 AIMonitoringEvent │ ✓ │ ✓ │ ✓ │ 60s flush, 30-day retention, but │  
 │ │ │ │ │ NOT tenant-filtered on read │  
 ├─────────────────────────────────────┼───────────────┼────────────────────────────┼──────────────────────┼───────────────────────────────────┤

│ Zep memory adapter │ ✓ │ ✓ (container.ts) │ ✗ — zero callers in │
Infrastructure ready, unused │  
 │ │ │ │ apps/ │ │  
 ├─────────────────────────────────────┼───────────────┼────────────────────────────┼──────────────────────┼───────────────────────────────────┤

│ ConversationSearchService │ Schema │ Stub repo │ ✗ — returns empty │ Broken
since IFC-086, memory │  
 │ │ defined │ (container.ts:477–485) │ always │ claimed fixed — NOT fixed │  
 ├─────────────────────────────────────┼───────────────┼────────────────────────────┼──────────────────────┼───────────────────────────────────┤

│ │ │ │ Global singleton has │ Throws in production unless │  
 │ RAG (pgvector) │ ✓ │ Interface defined │ null │ explicitly wired │  
 │ │ │ │ retrievalService │ │  
 ├─────────────────────────────────────┼───────────────┼────────────────────────────┼──────────────────────┼───────────────────────────────────┤

│ RBAC tables (Permission, RBACRole, │ ✓ │ ✗ │ ✗ │ Schema defined, never queried
at │  
 │ UserRoleAssignment, UserPermission) │ │ │ │ runtime │  
 ├─────────────────────────────────────┼───────────────┼────────────────────────────┼──────────────────────┼───────────────────────────────────┤

│ Feature flags │ │ │ ✗ — zero isEnabled │ │  
 │ (InMemoryFeatureFlagProvider) │ ✓ │ ✓ │ calls in │ Flag infrastructure unused
│  
 │ │ │ │ apps/ai-worker │ │  
 ├─────────────────────────────────────┼───────────────┼────────────────────────────┼──────────────────────┼───────────────────────────────────┤

│ CircuitBreaker (retry.ts:209) │ ✓ │ ✗ │ ✗ │ Dead code — never instantiated │  
 ├─────────────────────────────────────┼───────────────┼────────────────────────────┼──────────────────────┼───────────────────────────────────┤

│ CostTracker │ ✓ │ ✓ │ Dead for litellm + │ Gated on provider === 'openai' —
│  
 │ │ │ │ ollama providers │ doesn't fire │  
 ├─────────────────────────────────────┼───────────────┼────────────────────────────┼──────────────────────┼───────────────────────────────────┤

│ DLQ │ ✗ │ — │ — │ Doesn't exist — failed jobs │  
 │ │ │ │ │ silently expire after 7 days │  
 ├─────────────────────────────────────┼───────────────┼────────────────────────────┼──────────────────────┼───────────────────────────────────┤

│ BullMQ lifecycle events │ ✓ │ │ │ │  
 │ (completed/failed/stalled) │ (QueueEvents │ ✗ │ ✗ │ No handlers registered
anywhere │  
 │ │ exists) │ │ │ │  
 ├─────────────────────────────────────┼───────────────┼────────────────────────────┼──────────────────────┼───────────────────────────────────┤

│ │ │ ✗ — no @opentelemetry/\* in │ │ Spans never emitted; collector │  
 │ OTel SDK │ Config exists │ ai-worker package.json │ ✗ │ scrapes port 3002 but
worker │  
 │ │ │ │ │ serves on 5000 │  
 ├─────────────────────────────────────┼───────────────┼────────────────────────────┼──────────────────────┼───────────────────────────────────┤

│ AuditLogEntry (actorType=AI_AGENT) │ ✓ │ ✓ │ ✗ — zero calls in │ AI writes
leave no audit trail │  
 │ │ │ │ ai-worker │ │  
 ├─────────────────────────────────────┼───────────────┼────────────────────────────┼──────────────────────┼───────────────────────────────────┤

│ GuardrailsAIService PII │ ✓ │ ✓ │ ✓ (limited) │ Email + UK phone only — no │  
 │ │ │ │ │ SSN/CC/IBAN/NHS/Brazilian CPF │  
 └─────────────────────────────────────┴───────────────┴────────────────────────────┴──────────────────────┴───────────────────────────────────┘

---

3. Severity-ranked findings (merged across 4 audits)

🔴 Critical

┌─────┬────────────────────────────────────────────────────────────┬────────────────────┬──────────────────────────────────────────────────────┐

│ # │ Finding │ File:line │ Impact │  
 ├─────┼────────────────────────────────────────────────────────────┼────────────────────┼──────────────────────────────────────────────────────┤

│ C1 │ Scheduled scoring cron iterates leads across all tenants │
scoring.job.ts:160 │ Cross-tenant data exposure; single cron job sees all │  
 │ │ (no tenantId filter) │ │ tenants' leads │  
 └─────┴────────────────────────────────────────────────────────────┴────────────────────┴──────────────────────────────────────────────────────┘

🟠 High

#: H1 Finding:
AIMonitoringService.getStatus/getDriftMetrics/getLatencyMetrics/getROIMetrics
return cross-tenant aggregates to any authenticated user  
 File:line: AIMonitoringService.ts:47, ai-monitoring.router.ts:64–82 Impact: Any
Tenant A user can see Tenant B's AI performance + cost + hallucination + drift
──────────────────────────────────────── #: H2 Finding: No role gate on any AI
endpoint — SALES_REP can approve reviews, reset agent states, view all failed
jobs File:line: AI routers use tenantProcedure not adminProcedure Impact:
Privilege escalation on AI admin actions
──────────────────────────────────────── #: H3 Finding: ChainVersion state
machine exists but chains never load versions from DB — versioning is not
enforced at execution File:line: scoring.chain.ts:43–58 (bypasses
ChainVersionService) Impact: Tenant-specific prompts + A/B rollout impossible in
practice ──────────────────────────────────────── #: H4 Finding: Zero
AuditLogEntry(actorType=AI_AGENT) writes — AI agent DB mutations leave no audit
trail File:line: every AI job \*.job.ts Impact: ADR-008 compliance gap; can't
attribute AI-caused data changes ──────────────────────────────────────── #: H5
Finding: ScoringJobDataSchema.tenantId is z.string().optional() — a missing
tenantId silently passes Zod parse File:line: scoring.job.ts:34 Impact: Enqueue
bug can drop tenant scope with no error ────────────────────────────────────────
#: H6 Finding: No per-tenant tool/skill enable-disable surface (ADR-006 gap)
File:line: No model for tool enablement per tenant Impact: Tenants can't curate
their agent's toolset ──────────────────────────────────────── #: H7 Finding:
costTracker.recordUsage() gated on provider === 'openai' — dead for default
litellm + ollama File:line: base.agent.ts:287, insight-generation.chain.ts:308
Impact: No cost tracking, no warningThreshold, no dailyLimit enforcement on
production deploys ──────────────────────────────────────── #: H8 Finding: No
DLQ — failed jobs silently expire after 7 days; no stalled/failed event handlers
registered File:line: ai-worker.ts, queue-factory.ts:86 Impact: Failed job
signal lost; no on-call visibility ──────────────────────────────────────── #:
H9 Finding: CircuitBreaker defined (retry.ts:209) but never instantiated
File:line: retry.ts:209 Impact: Cascading failures on provider outages
──────────────────────────────────────── #: H10 Finding: Scoring + prediction
jobs have NO fallback path — only insight job does File:line: scoring.job.ts,
prediction.job.ts Impact: Any LLM degradation fails the full pipeline for
scoring/prediction

🟡 Medium

┌─────┬───────────────────────────────────────────────────────────────────────────────┬────────────────────────────────────────────────────────┐

│ # │ Finding │ File:line │  
 ├─────┼───────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────────────────────────┤

│ M1 │ ConversationSearchService wired with stub repo — all conversation
searches │ container.ts:477–485 │  
 │ │ return empty │ │  
 ├─────┼───────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────────────────────────┤

│ M2 │ leadAIInsight.upsert({ where: { leadId } }) has no tenantId guard in the
│ scoring.job.ts:249 │  
 │ │ upsert key │ │  
 ├─────┼───────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────────────────────────┤

│ M3 │ RAG global chain singleton has retrievalService = null — throws in
production │ rag-context.chain.ts:274, 476 │  
 │ │ unless explicitly wired │ │  
 ├─────┼───────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────────────────────────┤

│ M4 │ Prompt encryption at rest (DBA-015/DBA-018) marked TODO, not implemented
│ schema.prisma:4551,4553 │  
 ├─────┼───────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────────────────────────┤

│ M5 │ RBAC permission tables never queried at runtime for AI endpoints │
Permission, RBACRole, UserRoleAssignment unused by AI │  
 │ │ │ router middleware │  
 ├─────┼───────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────────────────────────┤

│ M6 │ Conversation messages are write-only — nothing reloads history into LLM │
no caller loads MessageRecord[] back into context │  
 │ │ prompts │ │  
 ├─────┼───────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────────────────────────┤

│ M7 │ No fact extraction / long-lived facts pipeline — ZepMemory.facts and │
memory gap — no summarization agent │  
 │ │ ConversationRecord.summary never populated │ │  
 ├─────┼───────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────────────────────────┤

│ M8 │ Feature flags never evaluated in AI paths — no per-tenant flag evaluation
│ zero isEnabled calls in apps/ai-worker/src │  
 ├─────┼───────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────────────────────────┤

│ M9 │ Model/tier selection hardcoded in chain constructors — no per-tenant
override │ scoring.chain.ts:50, auto-response.chain.ts:107 │  
 ├─────┼───────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────────────────────────┤

│ M10 │ AIMonitoringEvent.payload has no write-time Zod validation — ADR-048's │
schema defines payload Json? │  
 │ │ provider/tier fields not enforced │ │  
 ├─────┼───────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────────────────────────┤

│ M11 │ No token-overflow guard — tokens counted but prompt never truncated
pre-call │ token-counter.ts:205–224 is measure-only │  
 ├─────┼───────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────────────────────────┤

│ M12 │ OTel SDK not installed in ai-worker despite collector config existing │
no @opentelemetry/\* in apps/ai-worker/package.json │  
 ├─────┼───────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────────────────────────┤

│ M13 │ Hallucination check is fire-and-forget (.catch(() => {})) — detected │
ai-worker.ts:334 │  
 │ │ hallucinations never block output │ │  
 ├─────┼───────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────────────────────────┤

│ M14 │ BaseAgent has no planner/reflection phases — monolithic executeTask │
base.agent.ts:123 │  
 ├─────┼───────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────────────────────────┤

│ M15 │ LeadQualificationAgent exists but prediction.job.ts routes QUALIFICATION
type │ prediction.job.ts:635 vs qualification.agent.ts:64 │  
 │ │ to LeadScoringChain, not the agent │ │  
 ├─────┼───────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────────────────────────┤

│ M16 │ GuardrailsAIService PII coverage = email + UK phone only; no │
GuardrailsAIService.ts:471–480 │  
 │ │ SSN/CC/NHS/IBAN/Brazilian CPF │ │  
 └─────┴───────────────────────────────────────────────────────────────────────────────┴────────────────────────────────────────────────────────┘

🔵 Low

┌─────┬─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ # │ Finding │
├─────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ L1 │ correlationId flowed through job data but never injected into pino logger
context (no MDC / async-local-storage) │
├─────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ L2 │ Prometheus scrape port mismatch — otel-config targets localhost:3002,
ai-worker /metrics is on 5000 │
├─────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ L3 │ Feedback analytics is an offline script, not a scheduled cron —
retraining triggers never fire │
├─────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ L4 │ Calculator calculateConfidence() default returns hardcoded 0.8 —
confidence has no signal unless subclass overrides │
├─────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ L5 │ JIT-provisioning failure fallback returns tenantId: '' (caught later by
middleware, but fragile) │
└─────┴─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

---

4. Per-tenant customization readiness matrix

What a tenant CAN change today:

┌──────────────────────────────┬─────────────────────────────────────────────────────────────────────────────────────────────────┬────────────┐

│ Dimension │ Possible today? │ Blocker │  
 ├──────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────┼────────────┤

│ System prompt / chain prompt │ No (schema allows it, but chains never load
from DB) │ H3 │  
 ├──────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────┼────────────┤

│ Enabled skills / tools │ No (no model exists) │ H6 │  
 ├──────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────┼────────────┤

│ Memory retention policy │ No (no TenantMemoryPolicy model) │ — │  
 ├──────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────┼────────────┤

│ Human-in-the-loop toggle │ Partial — review queue exists globally; no
per-tenant on/off switch │ M5 │  
 │ │ │ adjacent │  
 ├──────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────┼────────────┤

│ Rate limits │ No — rateLimitPerMinute is a global env var │ — │  
 ├──────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────┼────────────┤

│ Model / tier selection │ No — tier is baked into each chain's constructor │ M9
│  
 ├──────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────┼────────────┤

│ Feature flag opt-ins │ Architecturally supported, but no flags are checked in
AI paths │ M8 │  
 ├──────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────┼────────────┤

│ Audit log of their AI │ No — ADR-008 schema supports it, no writes exist │ H4
│  
 │ actions │ │ │  
 ├──────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────┼────────────┤

│ Their own monitoring │ Partial — drilldown endpoints exist (getActiveAgents,
getAgentLogs) but top-line KPIs are │ H1 │  
 │ dashboard │ cross-tenant │ │  
 ├──────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────┼────────────┤

│ Cost visibility / budget cap │ No — dailyLimit code path is dead for litellm │
H7 │  
 └──────────────────────────────┴─────────────────────────────────────────────────────────────────────────────────────────────────┴────────────┘

Interpretation: IntelliFlow CRM today has near-zero runtime tenant
customization. Every tenant gets the same agent configuration, same prompts,  
 same tools, same tier. This is acceptable pre-GA but needs to be solved before
any enterprise-tier sales conversation — enterprise buyers will  
 absolutely ask.

---

5. Lifecycle phase coverage

┌──────────────────────────────────────────────────────┬──────────┬──────────────────────────────────────────────────────────────┐
│ Phase │ Present? │ Notes │
├──────────────────────────────────────────────────────┼──────────┼──────────────────────────────────────────────────────────────┤
│ Init (construct, load config) │ ✓ │ base.agent.ts:92–118 │
├──────────────────────────────────────────────────────┼──────────┼──────────────────────────────────────────────────────────────┤
│ Plan (decompose + tool-select BEFORE execution) │ ✗ │ No planner — agents call
executeTask straight │
├──────────────────────────────────────────────────────┼──────────┼──────────────────────────────────────────────────────────────┤
│ Execute (LLM call + tool invocations) │ ✓ │ via invokeLLM │
├──────────────────────────────────────────────────────┼──────────┼──────────────────────────────────────────────────────────────┤
│ Reflect (output gate, quality check, block-or-retry) │ ✗ │ Hallucination check
is async fire-and-forget │
├──────────────────────────────────────────────────────┼──────────┼──────────────────────────────────────────────────────────────┤
│ Finalize (persist + metrics + cleanup) │ Partial │ markAgentIdle() + cost
tracker; no guaranteed flush per call │
└──────────────────────────────────────────────────────┴──────────┴──────────────────────────────────────────────────────────────┘

The two missing phases (Plan + Reflect) are what makes agent frameworks actually
agentic. Your current code is effectively "structured LLM call  
 pipelines" rather than "agents that reason about their own work."

---

6. Recommended remediation sequence

Sprint 17 hot-fixes (1–3 days of work, shippable this sprint)

1. C1 fix — add tenantId filter to the scheduled scoring cron's initial
   findMany. One-line change. Paired with a new '**scheduled**' iteration that
   groups by tenant first.
2. H5 fix — change ScoringJobDataSchema.tenantId from .optional() to required.
   Same for prediction/insight schemas. Any enqueue site that doesn't  
   supply tenantId becomes a TypeError (desirable).
3. H1 fix — add tenantId: ctx.tenant.tenantId to the 5 AIMonitoringService calls
   in ai-monitoring.router.ts:64–82. Update AIMonitoringService.get\* to filter
   where.tenantId.
4. H2 fix — gate admin-sensitive AI endpoints (getFailedJobs, reset, approve,
   reject) with adminProcedure.
5. H7 fix — remove the provider === 'openai' gate at base.agent.ts:287 and
   insight-generation.chain.ts:308. Cost tracker records everything;  
   LiteLLM token counts come through OpenAI-compat responses anyway.
6. M2 fix — change leadAIInsight.upsert({ where: { leadId } }) to where: {
   leadId_tenantId: { leadId, tenantId } } (requires a compound unique on The
   model — small migration).

Sprint 18 structural work (1–2 weeks)

7. H3 — wire ChainVersionService into chain constructors.
   LeadScoringChain.constructor({ tenantId }) loads active version from DB;
   falls back to  
   hardcoded default on cache miss.
8. H4 — AuditLogPort.logAIAgentAction() called from every
   prisma.leadAIInsight.upsert / prisma.aIInsight.create / tool-approval
   execute.
9. H8 — register completed/failed/stalled handlers in ai-worker.ts; write a DLQ
   queue + move jobs after final retry exhaustion.
10. H9 — wrap every LLM invocation path in CircuitBreaker. Per-provider breaker
    instance (OpenAI, Anthropic, Groq, vLLM).
11. H10 — port the insight-job's Promise.race + fallback pattern to scoring +
    prediction.

Sprint 19–20 productization (2–4 weeks)

12. H6 — new TenantToolEnablement Prisma model + middleware that filters
    agentToolRegistry.get() by tenant config.
13. M8 + M9 — per-tenant tier override via TenantAIConfig model. Passed into
    createLLM(purpose, tier) from request context, not hardcoded.
14. M6 + M7 — conversation history replay (load last N MessageRecord[] into LLM
    context) + summarization agent (populates ConversationRecord.summary).
15. Plan + Reflect phases — refactor BaseAgent.executeTask into plan() →
    execute() → reflect(). Even a minimal reflect step that asks the LLM  
    "would you stand by this output?" is a significant quality gain.

---
