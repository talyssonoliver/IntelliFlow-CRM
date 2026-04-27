# AI/Intelligence Domain - Dependency Chain Analysis

**Generated**: 2026-02-03 **Updated**: 2026-02-18 **Purpose**: Ensure complete
AI feature chains from chains to UI with no orphaned tasks

---

## Executive Summary

The **AI/Intelligence** domain covers Lead Scoring, Sentiment Analysis, Churn
Risk, RAG/Search, Auto-Response, AI Output Review, and AI Monitoring features.
All chains now have UI tasks assigned via the unified **AI & Agents** sidebar at
`/agent-approvals/*`.

| Feature            | AI Chain | Router     | Frontend UI                                     | Route                                        | Status                           |
| ------------------ | -------- | ---------- | ----------------------------------------------- | -------------------------------------------- | -------------------------------- |
| Lead Scoring       | IFC-005  | IFC-013    | IFC-023 + PG-148 ✅ + IFC-212 (queue wiring) ✅ | `/agent-approvals/lead-scoring`              | ✅ COMPLETE                      |
| Sentiment Analysis | IFC-039  | Partial    | PG-142 ✅                                       | `/agent-approvals/sentiment`                 | ✅ COMPLETE                      |
| Churn Risk         | IFC-095  | Partial    | PG-143 ✅                                       | `/agent-approvals/churn-risk`                | ✅ COMPLETE                      |
| RAG/Search         | IFC-039  | IFC-156    | PG-144 ✅                                       | `/agent-approvals/ai-search`                 | ✅ COMPLETE                      |
| Auto-Response      | IFC-029  | IFC-029    | IFC-149 ✅                                      | `/agent-approvals`                           | ✅ COMPLETE                      |
| AI Output Review   | IFC-128  | IFC-180 ✅ | IFC-181 ✅ + PG-150 ✅                          | `/agent-approvals/ai-review`                 | ✅ COMPLETE                      |
| AI Monitoring      | IFC-117  | IFC-197 ✅ | PG-146 ✅/152 ✅/153 ✅                         | `/agent-approvals/drift,agents,logs,latency` | 3/4 UI COMPLETE (PG-151 backlog) |
| Ticket Routing     | IFC-067  | IFC-067    | (admin dashboard TBD)                           | N/A (backend API only)                       | ✅ COMPLETE                      |
| Experiments        | IFC-025  | IFC-025    | PG-149 (Plan Complete 50%)                      | `/agent-approvals/experiments`               | PLAN COMPLETE (50%)              |

---

## Full Dependency Diagram

```
                    ┌─────────────────────────────────────────────────────────────────────────┐
                    │                       AI / INTELLIGENCE DOMAIN                          │
                    │        Lead Scoring, Sentiment, Churn, RAG, Auto-Response               │
                    └─────────────────────────────────────────────────────────────────────────┘

    ╔═══════════════════════════════════════════════════════════════════════════════════════════╗
    ║  LAYER 1: AI INFRASTRUCTURE (Foundation)                                 ✅ COMPLETE    ║
    ╚═══════════════════════════════════════════════════════════════════════════════════════════╝

    ┌─────────────────────────┐    ┌─────────────────────────┐    ┌─────────────────────────┐
    │       IFC-020           │    │       IFC-021           │    │       IFC-022           │
    │  LangChain Pipeline     │    │   CrewAI Framework      │    │  Structured Outputs     │
    │                         │    │                         │    │                         │
    │  - Modular AI pipeline  │    │  - Lead qualifier       │    │  - Zod validation       │
    │  - Memory (Zep)         │    │  - Email writer         │    │  - Confidence scores    │
    │  - Tool definitions     │    │  - Follow-up agent      │    │  - Type-safe outputs    │
    │                         │    │  - Orchestration        │    │                         │
    │  Status: COMPLETED ✅   │    │  Status: COMPLETED ✅   │    │  Status: COMPLETED ✅   │
    │  Sprint: 12             │    │  Sprint: 13             │    │  Sprint: 13             │
    └─────────────────────────┘    └─────────────────────────┘    └─────────────────────────┘
                                                │
                                                ▼
    ╔═══════════════════════════════════════════════════════════════════════════════════════════╗
    ║  LAYER 2: AI CHAINS (apps/ai-worker/src/chains/)                         ✅ COMPLETE    ║
    ╚═══════════════════════════════════════════════════════════════════════════════════════════╝

    ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
    │    IFC-005      │  │    IFC-039      │  │    IFC-095      │  │    IFC-029      │
    │  scoring.chain  │  │ sentiment.chain │  │ churn-risk.chain│  │ auto-response   │
    │                 │  │                 │  │                 │  │    .chain       │
    │  - Lead scoring │  │  - Sentiment    │  │  - Churn risk   │  │                 │
    │  - Confidence   │  │  - Emotions     │  │  - Risk factors │  │  - AI drafts    │
    │  - Factors      │  │  - Urgency      │  │  - Predictions  │  │  - Approval     │
    │                 │  │  - Topics       │  │                 │  │  - State machine│
    │  COMPLETED ✅   │  │  COMPLETED ✅   │  │  COMPLETED ✅   │  │  COMPLETED ✅   │
    │  Sprint 2       │  │  Sprint 23      │  │  Sprint 8       │  │  Sprint 16      │
    └────────┬────────┘  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘
             │                    │                    │                    │
             │                    │                    │                    │

    ┌─────────────────┐  ┌─────────────────┐
    │  embedding.chain│  │  rag-context    │
    │                 │  │    .chain       │
    │  - Text embeds  │  │                 │
    │  - Batch embeds │  │  - RAG pipeline │
    │  - pgvector     │  │  - Context      │
    │                 │  │  - Retrieval    │
    │  COMPLETED ✅   │  │  COMPLETED ✅   │
    │  AI-SETUP-003   │  │  IFC-039        │
    └─────────────────┘  └─────────────────┘

    ╔═══════════════════════════════════════════════════════════════════════════════════════════╗
    ║  LAYER 3: AI VALIDATORS (packages/validators/src/ai*.ts)                 ✅ COMPLETE    ║
    ╚═══════════════════════════════════════════════════════════════════════════════════════════╝

                              ┌─────────────────────────────────────────┐
                              │     Validator Schemas                   │
                              │                                         │
                              │  - ai.ts (scoring, confidence)          │
                              │  - ai-review.ts (IFC-176, review queue) │
                              │  - auto-response.ts (IFC-029)           │
                              │  - experiment.ts (A/B testing)          │
                              │  - chain-version.ts (IFC-086)           │
                              │                                         │
                              │  All derive from domain constants       │
                              │  Status: COMPLETED ✅                   │
                              └─────────────────────────────────────────┘
```

---

## Lead Scoring Pipeline (COMPLETE)

```
    ╔═══════════════════════════════════════════════════════════════════════════════════════════╗
    ║  LEAD SCORING CHAIN                                                       ✅ COMPLETE    ║
    ╚═══════════════════════════════════════════════════════════════════════════════════════════╝

    ┌─────────────────────────┐         ┌─────────────────────────────┐
    │        IFC-005          │         │        IFC-023              │
    │   Scoring Chain         │         │   Explainability UI         │
    │                         │         │                             │
    │  - scoring.chain.ts     │         │  - ScoreCard.tsx            │
    │  - < 2s latency         │ ───────►│  - ScoreFactorList.tsx      │
    │  - Structured output    │         │  - ConfidenceIndicator.tsx  │
    │  - Confidence scores    │         │  - ModelInfo.tsx            │
    │                         │         │                             │
    │  Status: COMPLETED ✅   │         │  Status: COMPLETED ✅       │
    │  Sprint: 2              │         │  Sprint: 13                 │
    └─────────────────────────┘         └─────────────────────────────┘
                 │                                       │
                 │                                       │
                 ▼                                       ▼
    ┌─────────────────────────┐         ┌─────────────────────────────┐
    │        IFC-024          │         │        IFC-025              │
    │   Human-in-the-Loop     │         │   A/B Testing Framework     │
    │                         │         │                             │
    │  - Feedback capture     │         │  - Experiment tracking      │
    │  - Score adjustments    │         │  - Statistical analysis     │
    │  - Model improvement    │         │  - Variant comparison       │
    │                         │         │                             │
    │  Status: COMPLETED ✅   │         │  Status: COMPLETED ✅       │
    │  Sprint: 14             │         │  Sprint: 14                 │
    └─────────────────────────┘         └─────────────────────────────┘

    ┌─────────────────────────┐
    │        IFC-174          │
    │   Real Ollama Benchmark │
    │                         │
    │  - Real measured data   │
    │  - Replaces simulated   │
    │  - KPI validation       │
    │  Deps: IFC-085, IFC-168 │
    │                         │
    │  Status: COMPLETED ✅    │
    │  Sprint: 14             │
    └─────────────────────────┘

    Chain Status: ✅ COMPLETE
    - AI Chain: IFC-005 ✅
    - Router: IFC-013 (lead.router) ✅
    - Frontend: IFC-023 (ScoreCard) ✅
    - Feedback: IFC-024 ✅
    - A/B Testing: IFC-025 ✅
    - Real Benchmark: IFC-174 (validates IFC-085 accuracy claims) ✅
    - **Queue wiring: IFC-212** (QueueAIService — replaces in-process LLM call with
      BullMQ enqueue+wait; preserves GuardrailsAIService decorator) ✅

    Runtime path (post-IFC-212):
      lead.router.scoreWithAI (apps/api/src/modules/lead/lead.router.ts:1027)
        → LeadService.scoreLead (packages/application/src/services/LeadService.ts:181)
          → GuardrailsAIService.scoreLead (decorator — sanitize/redact/audit)
            → QueueAIService.scoreLead (apps/api/src/services/queue/QueueAIService.ts)
              → BullMQ Queue.add('score-lead', payload, ...)  [queue: 'ai-scoring']
                → Worker QueueEvents → Job.waitUntilFinished(60s ceiling)
                  ← apps/ai-worker AIWorker.processJob → processScoringJob
                       (apps/ai-worker/src/jobs/scoring.job.ts:450)

    Default-path env: AI_PROVIDER unset (non-test) → QueueAIService.
    Opt-out paths: AI_PROVIDER=mock|ollama|litellm preserved.
```

---

## Sentiment Analysis Pipeline (COMPLETE)

```
    ╔═══════════════════════════════════════════════════════════════════════════════════════════╗
    ║  SENTIMENT ANALYSIS CHAIN                                                 ✅ COMPLETE    ║
    ╚═══════════════════════════════════════════════════════════════════════════════════════════╝

    ┌─────────────────────────┐         ┌─────────────────────────────┐
    │        IFC-039          │         │        PG-142               │
    │   sentiment.chain.ts    │         │   Sentiment Dashboard       │
    │                         │         │                             │
    │  - Sentiment labels     │         │  Route: /agent-approvals/   │
    │    (positive/negative)  │ ──────► │         sentiment           │
    │  - Emotion detection    │         │                             │
    │  - Urgency levels       │         │  - Sentiment overview       │
    │  - Topic extraction     │         │  - Timeline integration     │
    │                         │         │  - Trend visualization      │
    │  Status: COMPLETED ✅   │         │  - Email sentiment preview  │
    │  Sprint: 23             │         │                             │
    │                         │         │  Status: COMPLETED ✅       │
    │  Files:                 │         │  Sprint: 7                  │
    │  - sentiment.chain.ts   │         │  Deps: IFC-039, IFC-181     │
    │  - sentiment.chain.test │         │                             │
    └─────────────────────────┘         └─────────────────────────────┘

    Chain Status: ✅ COMPLETE
    - AI Chain: IFC-039 ✅
    - Router: Partial (in timeline.router) ⚠️
    - Frontend: PG-142 (Sprint 7) ✅
```

---

## Churn Risk Pipeline (COMPLETE)

```
    ╔═══════════════════════════════════════════════════════════════════════════════════════════╗
    ║  CHURN RISK CHAIN                                                         ✅ COMPLETE    ║
    ╚═══════════════════════════════════════════════════════════════════════════════════════════╝

    ┌─────────────────────────┐         ┌─────────────────────────────┐
    │        IFC-095          │         │        PG-143               │
    │   churn-risk.chain.ts   │         │   Churn Risk Dashboard      │
    │                         │         │                             │
    │  - Risk prediction      │         │  Route: /agent-approvals/   │
    │  - Risk factors         │ ──────► │         churn-risk          │
    │  - Confidence scores    │         │                             │
    │  - Recommendations      │         │  - Risk indicators          │
    │                         │         │  - Customer health score    │
    │  Status: COMPLETED ✅   │         │  - Intervention triggers    │
    │  Sprint: 8              │         │  - Trend charts             │
    │                         │         │                             │
    │  Files:                 │         │  Status: COMPLETED ✅       │
    │  - churn-risk.chain.ts  │         │  Sprint: 7                  │
    │  - churn-risk.chain.test│         │  Deps: IFC-095, IFC-181     │
    └─────────────────────────┘         └─────────────────────────────┘

    Chain Status: ✅ COMPLETE
    - AI Chain: IFC-095 ✅
    - Router: Partial (analytics integration needed) ⚠️
    - Frontend: PG-143 (Sprint 7) ✅
```

---

## RAG/Search Pipeline (COMPLETE)

```
    ╔═══════════════════════════════════════════════════════════════════════════════════════════╗
    ║  RAG / SEARCH CHAIN                                                       ✅ COMPLETE    ║
    ╚═══════════════════════════════════════════════════════════════════════════════════════════╝

    ┌─────────────────────────────────────────────────────────────────────────────────────────┐
    │                          RAG CONTEXT CHAIN (IFC-039)                                     │
    └─────────────────────────────────────────────────────────────────────────────────────────┘

    ┌─────────────────────────┐    ┌─────────────────────────┐    ┌─────────────────────────┐
    │        IFC-039          │    │        IFC-155          │    │        IFC-156          │
    │   rag-context.chain.ts  │    │   Permissioned Index    │    │   Case RAG Tool         │
    │                         │    │                         │    │                         │
    │  - Retrieval pipeline   │    │  - pgvector embeddings  │    │  - Agent retrieval      │
    │  - Context assembly     │───►│  - Tenant + case ACL    │───►│  - Citations            │
    │  - Source tracking      │    │  - Cross-tenant protect │    │  - Injection hardening  │
    │                         │    │                         │    │                         │
    │  Status: COMPLETED ✅   │    │  Status: COMPLETED ✅   │    │  Status: COMPLETED ✅   │
    │  Sprint: 23             │    │  Sprint: 12             │    │  Sprint: 13             │
    └─────────────────────────┘    └─────────────────────────┘    └─────────────────────────┘
                                                │
                                                ▼
                              ┌─────────────────────────────────────────┐
                              │        PG-144                           │
                              │   AI Search Dashboard                   │
                              │                                         │
                              │  Route: /agent-approvals/ai-search      │
                              │                                         │
                              │  - Universal search bar                 │
                              │  - AI-powered results                   │
                              │  - Citation display                     │
                              │  - Source highlighting                  │
                              │                                         │
                              │  Status: COMPLETED ✅                   │
                              │  Sprint: 7                              │
                              │  Deps: IFC-156, IFC-155, IFC-181        │
                              └─────────────────────────────────────────┘

    Chain Status: ✅ COMPLETE
    - AI Chain: IFC-039 ✅
    - Indexing: IFC-155 ✅
    - RAG Tool: IFC-156 ✅
    - Frontend: PG-144 (Sprint 7) ✅
```

---

## Auto-Response Pipeline (COMPLETE)

```
    ╔═══════════════════════════════════════════════════════════════════════════════════════════╗
    ║  AUTO-RESPONSE CHAIN                                                      ✅ COMPLETE    ║
    ╚═══════════════════════════════════════════════════════════════════════════════════════════╝

    ┌─────────────────────────┐    ┌─────────────────────────┐    ┌─────────────────────────┐
    │        IFC-028          │    │        IFC-029          │    │        IFC-149          │
    │   Workflow Engine       │    │   Auto-Response Chain   │    │   Action Preview UI     │
    │                         │    │                         │    │                         │
    │  - LangGraph            │    │  - auto-response.chain  │    │  - Diff preview         │
    │  - State machines       │───►│  - State machine        │───►│  - Approval tracking    │
    │  - Conditional logic    │    │  - Approval workflow    │    │  - Rollback service     │
    │                         │    │  - tRPC wiring          │    │                         │
    │  Status: COMPLETED ✅   │    │  Status: COMPLETED ✅   │    │  Status: COMPLETED ✅   │
    │  Sprint: 16             │    │  Sprint: 16             │    │  Sprint: 6              │
    └─────────────────────────┘    └─────────────────────────┘    └─────────────────────────┘
                                                │
                                                ├─────────────────────────────┐
                                                ▼                             ▼
                              ┌─────────────────────────────┐  ┌─────────────────────────────┐
                              │        IFC-030              │  │        PG-132               │
                              │   Smart Lead Routing        │  │   Smart Lead Routing UI     │
                              │                             │  │                             │
                              │  - Score-based routing      │  │  - Rules editor             │
                              │  - Load balancing           │  │  - Assignment dashboard     │
                              │  - SLA definitions          │  │  - SLA monitor              │
                              │                             │  │                             │
                              │  Status: BACKLOG            │  │  Status: BACKLOG            │
                              │  Sprint: 17                 │  │  Sprint: 18                 │
                              └─────────────────────────────┘  └─────────────────────────────┘

    Chain Status: ✅ COMPLETE
    - Workflow Engine: IFC-028 ✅
    - Auto-Response: IFC-029 ✅
    - Approval UI: IFC-149 ✅
    - Lead Routing: IFC-030 (Backlog) + PG-132 (Backlog) - Chain complete
```

---

## AI Output Review Chain (COMPLETE)

```
    ╔═══════════════════════════════════════════════════════════════════════════════════════════╗
    ║  AI OUTPUT REVIEW CHAIN                                                      ✅ COMPLETE ║
    ╚═══════════════════════════════════════════════════════════════════════════════════════════╝

    See: docs/architecture/diagrams/ai-output-review-dependency-chain.md

    Route: /agent-approvals/ai-review (+ /agent-approvals/ai-review/[id])

    Status Summary:
    ┌────────────────┬──────────────┬──────────────┐
    │ Layer          │ Task         │ Status       │
    ├────────────────┼──────────────┼──────────────┤
    │ Domain         │ IFC-128      │ COMPLETED ✅ │
    │ Validators     │ IFC-176      │ COMPLETED ✅ │
    │ Application    │ IFC-177      │ COMPLETED ✅ │
    │ Database       │ IFC-178      │ COMPLETED ✅ │
    │ Adapters       │ IFC-179      │ COMPLETED ✅ │
    │ Router         │ IFC-180      │ COMPLETED ✅ │
    │ Frontend       │ IFC-181      │ COMPLETED ✅ │
    └────────────────┴──────────────┴──────────────┘

    Related: PG-150 (AI Review History at /agent-approvals/history, Sprint 7) ✅
    Mockup Ready: docs/design/mockups/ai-review-queue.html ✅
```

---

## AI Version Management Chain

```
    ╔═══════════════════════════════════════════════════════════════════════════════════════════╗
    ║  AI CHAIN VERSIONING (IFC-086, PG-128)                                   ✅ COMPLETE     ║
    ╚═══════════════════════════════════════════════════════════════════════════════════════════╝

    ┌─────────────────────────────┐         ┌─────────────────────────────┐
    │        IFC-086              │         │        PG-128               │
    │   Chain Version Registry    │         │   Chain Versioning Admin UI │
    │                             │         │                             │
    │  - Version tracking         │         │  - Version list             │
    │  - A/B rollout control      │ ───────►│  - Performance comparison   │
    │  - Deprecation policy       │         │  - Rollout controls         │
    │  - Zep integration          │         │  - A/B test management      │
    │                             │         │                             │
    │  Status: COMPLETED ✅       │         │  Status: COMPLETED ✅       │
    │  Sprint: 12                 │         │  Sprint: 14 (100%)          │
    └─────────────────────────────┘         └─────────────────────────────┘
```

---

## AI Monitoring Pipeline (Sprint 7-8)

```
    ╔═══════════════════════════════════════════════════════════════════════════════════════════╗
    ║  AI MONITORING CHAIN                                              3/4 UI COMPLETE ⏳     ║
    ╚═══════════════════════════════════════════════════════════════════════════════════════════╝

    ┌─────────────────────────┐
    │       IFC-117           │
    │  AI Monitoring Tools    │
    │                         │
    │  - DriftDetector        │
    │  - LatencyMonitor       │
    │  - HallucinationChecker │
    │  - ROITracker           │
    │  - ChainMonitor         │
    │                         │
    │  Status: COMPLETED ✅   │
    │  Sprint: 11             │
    └────────────┬────────────┘
                 │
                 ▼
    ┌─────────────────────────┐         ┌─────────────────────────────────────────────────────┐
    │       IFC-197           │         │  MONITORING UI PAGES (Sprint 8)                      │
    │  AI Monitoring Router   │         │                                                      │
    │  (tRPC)                 │         │  ┌────────────────┐  ┌────────────────┐              │
    │                         │         │  │    PG-146      │  │    PG-151      │              │
    │  - drift.list/get       │         │  │  Drift Detect  │  │  Active Agents │              │
    │  - latency.metrics      │ ──────► │  │  COMPLETED ✅  │  │  BACKLOG       │              │
    │  - agents.status        │         │  │  /agent-       │  │  /agent-       │              │
    │  - hallucination.check  │         │  │  approvals/    │  │  approvals/    │              │
    │  - roi.dashboard        │         │  │  drift         │  │  agents        │              │
    │                         │         │  └────────────────┘  └────────────────┘              │
    │  Status: COMPLETED ✅   │         │  ┌────────────────┐  ┌────────────────┐              │
    │  Sprint: 7              │         │  │    PG-152      │  │    PG-153      │              │
    │  Deps: IFC-117, IFC-125 │         │  │  Agent Logs    │  │  Latency Mon   │              │
    └─────────────────────────┘         │  │  COMPLETED ✅  │  │  COMPLETED ✅  │              │
                                        │  │  /agent-       │  │  /agent-       │              │
                                        │  │  approvals/    │  │  approvals/    │              │
                                        │  │  logs          │  │  latency       │              │
                                        │  └────────────────┘  └────────────────┘              │
                                        │                                                      │
                                        │  All depend on: IFC-197                              │
                                        └─────────────────────────────────────────────────────┘

    Chain Status: ⏳ 3/4 monitoring UI tasks complete (PG-151 backlog)
    - Monitoring Tools: IFC-117 ✅
    - tRPC Router: IFC-197 (Sprint 7) ✅
    - Drift UI: PG-146 (Sprint 8) ✅
    - Agents UI: PG-151 (Sprint 8) ⏳ BACKLOG
    - Logs UI: PG-152 (Sprint 8) ✅
    - Latency UI: PG-153 (Sprint 8) ✅
```

---

## Additional Intelligence UI Pages (Sprint 7)

```
    ╔═══════════════════════════════════════════════════════════════════════════════════════════╗
    ║  INTELLIGENCE FEATURE PAGES (AI & Agents Sidebar)                    2/3 COMPLETE ⏳     ║
    ╚═══════════════════════════════════════════════════════════════════════════════════════════╝

    ┌─────────────────────────┐    ┌─────────────────────────┐    ┌─────────────────────────┐
    │       PG-148            │    │       PG-149            │    │       PG-150            │
    │  Lead Scoring Dashboard │    │  Experiments Dashboard  │    │  AI Review History      │
    │                         │    │                         │    │                         │
    │  Route: /agent-         │    │  Route: /agent-         │    │  Route: /agent-         │
    │  approvals/lead-scoring │    │  approvals/experiments  │    │  approvals/history      │
    │                         │    │                         │    │                         │
    │  - Score breakdown      │    │  - A/B test list        │    │  - Decision log         │
    │  - Score history        │    │  - Statistical analysis │    │  - Audit trail          │
    │  - Model performance    │    │  - Variant comparison   │    │  - Reviewer stats       │
    │                         │    │                         │    │                         │
    │  Status: COMPLETED ✅   │    │  Status: PLAN COMPLETE  │    │  Status: COMPLETED ✅   │
    │  Sprint: 7              │    │  Sprint: 7 (50%)        │    │  Sprint: 7              │
    │  Deps: IFC-005, IFC-023 │    │  Deps: IFC-025          │    │  Deps: IFC-181, IFC-180 │
    │        IFC-181          │    │        IFC-181          │    │                         │
    └─────────────────────────┘    └─────────────────────────┘    └─────────────────────────┘
```

---

## Task Status Summary (Updated 2026-02-18)

### All AI & Agents Sidebar Tasks

| Task ID | Feature                | Route                           | Dependencies              | Sprint | Status              |
| ------- | ---------------------- | ------------------------------- | ------------------------- | ------ | ------------------- |
| IFC-149 | Agent Approvals        | `/agent-approvals`              | IFC-139                   | 6      | COMPLETED ✅        |
| IFC-181 | AI Review Queue        | `/agent-approvals/ai-review`    | IFC-180, IFC-149          | 6      | COMPLETED ✅        |
| PG-142  | Sentiment Dashboard    | `/agent-approvals/sentiment`    | IFC-039, IFC-181          | 7      | COMPLETED ✅        |
| PG-143  | Churn Risk Dashboard   | `/agent-approvals/churn-risk`   | IFC-095, IFC-181          | 7      | COMPLETED ✅        |
| PG-144  | AI Search              | `/agent-approvals/ai-search`    | IFC-156, IFC-155, IFC-181 | 7      | COMPLETED ✅        |
| PG-148  | Lead Scoring Dashboard | `/agent-approvals/lead-scoring` | IFC-005, IFC-023, IFC-181 | 7      | COMPLETED ✅        |
| PG-149  | Experiments Dashboard  | `/agent-approvals/experiments`  | IFC-025, IFC-181          | 7      | PLAN COMPLETE (50%) |
| PG-150  | AI Review History      | `/agent-approvals/history`      | IFC-181, IFC-180          | 7      | COMPLETED ✅        |
| IFC-197 | AI Monitoring Router   | (tRPC)                          | IFC-117, IFC-125          | 7      | COMPLETED ✅        |
| PG-146  | Drift Detection        | `/agent-approvals/drift`        | IFC-117, IFC-197          | 8      | COMPLETED ✅        |
| PG-151  | Active Agents          | `/agent-approvals/agents`       | IFC-021, IFC-139, IFC-197 | 8      | BACKLOG             |
| PG-152  | Agent Logs             | `/agent-approvals/logs`         | IFC-148, IFC-197          | 8      | COMPLETED ✅        |
| PG-153  | Latency Monitor        | `/agent-approvals/latency`      | IFC-117, IFC-197          | 8      | COMPLETED ✅        |

### Backend Infrastructure Tasks

| Task ID | Feature                   | Status       | Notes                                               |
| ------- | ------------------------- | ------------ | --------------------------------------------------- |
| IFC-197 | AI Monitoring tRPC Router | COMPLETED ✅ | 7 endpoints operational, 22 tests, all gates passed |

---

## Orphan Status Summary (Updated 2026-02-18)

| Feature       | AI Chain   | Router     | Frontend                            | Status          |
| ------------- | ---------- | ---------- | ----------------------------------- | --------------- |
| Lead Scoring  | IFC-005 ✅ | IFC-013 ✅ | IFC-023 ✅ + PG-148 ✅              | ✅ COMPLETE     |
| Sentiment     | IFC-039 ✅ | Partial ⚠️ | PG-142 ✅                           | ✅ COMPLETE     |
| Churn Risk    | IFC-095 ✅ | Partial ⚠️ | PG-143 ✅                           | ✅ COMPLETE     |
| RAG/Search    | IFC-039 ✅ | IFC-156 ✅ | PG-144 ✅                           | ✅ COMPLETE     |
| Auto-Response | IFC-029 ✅ | IFC-029 ✅ | IFC-149 ✅                          | ✅ COMPLETE     |
| AI Review     | IFC-128 ✅ | IFC-180 ✅ | IFC-181 ✅ + PG-150 ✅              | ✅ COMPLETE     |
| Versioning    | IFC-086 ✅ | IFC-086 ✅ | PG-128 ✅                           | ✅ COMPLETE     |
| AI Monitoring | IFC-117 ✅ | IFC-197 ✅ | PG-146 ✅/152 ✅/153 ✅ (PG-151 ⏳) | 3/4 UI COMPLETE |
| Experiments   | IFC-025 ✅ | IFC-025 ✅ | PG-149 (Plan Complete 50%)          | PLAN COMPLETE   |

**All orphans resolved.** Every AI feature now has a UI task assigned.

- 0 orphaned chains (was 3)
- 8 new tasks created (IFC-197, PG-142-144 updated, PG-148-153 new)
- 4 existing tasks updated with correct `/agent-approvals/` routes
- Remaining: PG-151 (Active Agents) backlog, PG-149 (Experiments) at 50%

---

## Chain Index Summary

```
    ┌─────────────────────────────────────────────────────────────────────────────────────────┐
    │  apps/ai-worker/src/chains/index.ts                                                      │
    └─────────────────────────────────────────────────────────────────────────────────────────┘

    Exported Chains:
    ┌────────────────────────┬─────────────┬──────────────────────────────────────────────────┐
    │ Chain                  │ IFC Task    │ Status                                           │
    ├────────────────────────┼─────────────┼──────────────────────────────────────────────────┤
    │ AutoResponseChain      │ IFC-029     │ ✅ Complete + UI (IFC-149)                       │
    │ LeadScoringChain       │ IFC-005     │ ✅ Complete + UI (IFC-023) + Dashboard (PG-148)  │
    │ SentimentAnalysisChain │ IFC-039     │ ✅ Chain + UI complete (PG-142)                  │
    │ ChurnRiskChain         │ IFC-095     │ ✅ Chain + UI complete (PG-143)                  │
    │ EmbeddingChain         │ AI-SETUP-003│ ✅ Complete (internal use)                       │
    │ RAGContextChain        │ IFC-039     │ ✅ Chain + UI complete (PG-144)                  │
    └────────────────────────┴─────────────┴──────────────────────────────────────────────────┘

    ┌─────────────────────────────────────────────────────────────────────────────────────────┐
    │  apps/ai-worker/src/monitoring/index.ts                                                  │
    └─────────────────────────────────────────────────────────────────────────────────────────┘

    Monitoring Tools:
    ┌────────────────────────┬─────────────┬──────────────────────────────────────────────────┐
    │ Tool                   │ IFC Task    │ Status                                           │
    ├────────────────────────┼─────────────┼──────────────────────────────────────────────────┤
    │ DriftDetector          │ IFC-117     │ ✅ Complete, Router (IFC-197), UI (PG-146)       │
    │ LatencyMonitor         │ IFC-117     │ ✅ Complete, Router (IFC-197), UI (PG-153)       │
    │ HallucinationChecker   │ IFC-117     │ ✅ Complete, Router (IFC-197)                    │
    │ ROITracker             │ IFC-117     │ ✅ Complete, Router (IFC-197)                    │
    │ ChainMonitor           │ IFC-117     │ ✅ Complete, Router (IFC-197)                    │
    └────────────────────────┴─────────────┴──────────────────────────────────────────────────┘
```
