# AI/Intelligence Domain - Dependency Chain Analysis

**Generated**: 2026-02-03
**Purpose**: Ensure complete AI feature chains from chains to UI with no orphaned tasks

---

## Executive Summary

The **AI/Intelligence** domain covers Lead Scoring, Sentiment Analysis, Churn Risk, RAG/Search, and Auto-Response features. Most AI chains are complete, but several lack frontend UI.

| Feature | AI Chain | Router | Frontend UI | Status |
|---------|----------|--------|-------------|--------|
| Lead Scoring | IFC-005 | IFC-013 | IFC-023 | COMPLETE |
| Sentiment Analysis | IFC-039 | Partial | MISSING | ORPHAN |
| Churn Risk | IFC-095 | Partial | MISSING | ORPHAN |
| RAG/Search | IFC-039 | IFC-156 | MISSING | ORPHAN |
| Auto-Response | IFC-029 | IFC-029 | IFC-149 | COMPLETE |
| AI Output Review | IFC-128 | IFC-180 | IFC-181 | BACKLOG |

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

    Chain Status: ✅ COMPLETE
    - AI Chain: IFC-005 ✅
    - Router: IFC-013 (lead.router) ✅
    - Frontend: IFC-023 (ScoreCard) ✅
    - Feedback: IFC-024 ✅
    - A/B Testing: IFC-025 ✅
```

---

## Sentiment Analysis Pipeline (ORPHAN)

```
    ╔═══════════════════════════════════════════════════════════════════════════════════════════╗
    ║  SENTIMENT ANALYSIS CHAIN                                              ⚠️ FRONTEND ORPHAN║
    ╚═══════════════════════════════════════════════════════════════════════════════════════════╝

    ┌─────────────────────────────────────────────────────────────────────────────────────────┐
    │                          SENTIMENT CHAIN (IFC-039)                                       │
    └─────────────────────────────────────────────────────────────────────────────────────────┘

    ┌─────────────────────────┐         ┌─────────────────────────────┐
    │        IFC-039          │         │        ❌ MISSING           │
    │   sentiment.chain.ts    │         │   Sentiment UI              │
    │                         │         │                             │
    │  - Sentiment labels     │         │  Need:                      │
    │    (positive/negative)  │ ──────► │  - Timeline integration     │
    │  - Emotion detection    │         │  - Sentiment badges         │
    │  - Urgency levels       │         │  - Trend visualization      │
    │  - Topic extraction     │         │  - Email sentiment preview  │
    │                         │         │                             │
    │  Status: COMPLETED ✅   │         │  CREATE: PG-142             │
    │  Sprint: 23             │         │  Sprint: 24                 │
    │                         │         │                             │
    │  Files:                 │         │  Location:                  │
    │  - sentiment.chain.ts   │         │  - packages/ui/src/         │
    │  - sentiment.chain.test │         │    components/sentiment/    │
    └─────────────────────────┘         └─────────────────────────────┘

    Chain Status: ⚠️ ORPHAN - Backend complete, Frontend missing
    - AI Chain: IFC-039 ✅
    - Router: Partial (in timeline.router) ⚠️
    - Frontend: MISSING ❌ → Create PG-142
```

---

## Churn Risk Pipeline (ORPHAN)

```
    ╔═══════════════════════════════════════════════════════════════════════════════════════════╗
    ║  CHURN RISK CHAIN                                                      ⚠️ FRONTEND ORPHAN║
    ╚═══════════════════════════════════════════════════════════════════════════════════════════╝

    ┌─────────────────────────────────────────────────────────────────────────────────────────┐
    │                          CHURN RISK CHAIN (IFC-095)                                      │
    └─────────────────────────────────────────────────────────────────────────────────────────┘

    ┌─────────────────────────┐         ┌─────────────────────────────┐
    │        IFC-095          │         │        ❌ MISSING           │
    │   churn-risk.chain.ts   │         │   Churn Dashboard UI        │
    │                         │         │                             │
    │  - Risk prediction      │         │  Need:                      │
    │  - Risk factors         │ ──────► │  - Risk indicators          │
    │  - Confidence scores    │         │  - Customer health score    │
    │  - Recommendations      │         │  - Intervention triggers    │
    │                         │         │  - Trend charts             │
    │  Status: COMPLETED ✅   │         │                             │
    │  Sprint: 8              │         │  CREATE: PG-143             │
    │                         │         │  Sprint: 25                 │
    │  Files:                 │         │                             │
    │  - churn-risk.chain.ts  │         │  Location:                  │
    │  - churn-risk.chain.test│         │  - apps/web/src/app/        │
    └─────────────────────────┘         │    analytics/churn/         │
                                        └─────────────────────────────┘

    Chain Status: ⚠️ ORPHAN - Backend complete, Frontend missing
    - AI Chain: IFC-095 ✅
    - Router: Partial (analytics integration needed) ⚠️
    - Frontend: MISSING ❌ → Create PG-143
```

---

## RAG/Search Pipeline (ORPHAN)

```
    ╔═══════════════════════════════════════════════════════════════════════════════════════════╗
    ║  RAG / SEARCH CHAIN                                                    ⚠️ FRONTEND ORPHAN║
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
    │  Status: COMPLETED ✅   │    │  Status: SPEC (20%) ⚠️  │    │  Status: COMPLETED ✅   │
    │  Sprint: 23             │    │  Sprint: 12             │    │  Sprint: 13             │
    └─────────────────────────┘    └─────────────────────────┘    └─────────────────────────┘
                                                │
                                                ▼
                              ┌─────────────────────────────────────────┐
                              │        ❌ MISSING                       │
                              │   RAG Search UI                         │
                              │                                         │
                              │  Need:                                  │
                              │  - Universal search bar                 │
                              │  - AI-powered results                   │
                              │  - Citation display                     │
                              │  - Source highlighting                  │
                              │                                         │
                              │  CREATE: PG-144                         │
                              │  Sprint: 25                             │
                              │                                         │
                              │  Location:                              │
                              │  - apps/web/src/components/search/      │
                              └─────────────────────────────────────────┘

    Chain Status: ⚠️ ORPHAN - Backend complete, Frontend missing
    - AI Chain: IFC-039 ✅
    - Indexing: IFC-155 ✅
    - RAG Tool: IFC-156 ✅
    - Frontend: MISSING ❌ → Create PG-144
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

## AI Output Review Chain (BACKLOG)

```
    ╔═══════════════════════════════════════════════════════════════════════════════════════════╗
    ║  AI OUTPUT REVIEW CHAIN                                                   ⏳ IN PROGRESS ║
    ╚═══════════════════════════════════════════════════════════════════════════════════════════╝

    See: docs/design/diagrams/ai-output-review-dependency-chain.md

    Status Summary:
    ┌────────────────┬──────────────┬──────────────┐
    │ Layer          │ Task         │ Status       │
    ├────────────────┼──────────────┼──────────────┤
    │ Domain         │ IFC-128      │ COMPLETED ✅ │
    │ Validators     │ IFC-176      │ COMPLETED ✅ │
    │ Application    │ IFC-177      │ COMPLETED ✅ │
    │ Database       │ IFC-178      │ Backlog      │
    │ Adapters       │ IFC-179      │ Backlog      │
    │ Router         │ IFC-180      │ Backlog      │
    │ Frontend       │ IFC-181      │ Backlog      │
    └────────────────┴──────────────┴──────────────┘

    Mockup Ready: docs/design/mockups/ai-review-queue.html ✅
```

---

## AI Version Management Chain

```
    ╔═══════════════════════════════════════════════════════════════════════════════════════════╗
    ║  AI CHAIN VERSIONING (IFC-086, PG-128)                                   ⏳ IN PROGRESS  ║
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
    │  Status: COMPLETED ✅       │         │  Status: SPEC COMPLETE      │
    │  Sprint: 12                 │         │  Sprint: 14 (0%)            │
    └─────────────────────────────┘         └─────────────────────────────┘
```

---

## Missing Tasks Summary (To Create)

### Frontend Pages (AI Features Need UI)

| New Task ID | Feature | Description | Dependencies | Sprint |
|-------------|---------|-------------|--------------|--------|
| PG-142 | Sentiment | Sentiment Analysis UI - timeline badges, trends | IFC-039 | 24 |
| PG-143 | Churn | Churn Risk Dashboard - health scores, interventions | IFC-095 | 25 |
| PG-144 | RAG | AI Search UI - universal search, citations | IFC-156, IFC-155 | 25 |

---

## Orphan Status Summary

| Feature | AI Chain | Router | Frontend | Action Required |
|---------|----------|--------|----------|-----------------|
| Lead Scoring | IFC-005 ✅ | IFC-013 ✅ | IFC-023 ✅ | None - Complete |
| Sentiment | IFC-039 ✅ | Partial ⚠️ | MISSING ❌ | Create PG-142 |
| Churn Risk | IFC-095 ✅ | Partial ⚠️ | MISSING ❌ | Create PG-143 |
| RAG/Search | IFC-039 ✅ | IFC-156 ✅ | MISSING ❌ | Create PG-144 |
| Auto-Response | IFC-029 ✅ | IFC-029 ✅ | IFC-149 ✅ | None - Complete |
| AI Review | IFC-128 ✅ | IFC-180 (Backlog) | IFC-181 (Backlog) | Already tracked |
| Versioning | IFC-086 ✅ | IFC-086 ✅ | PG-128 (Backlog) | Already tracked |

**Total New Tasks Required: 3**
- 3 Frontend (PG-142, PG-143, PG-144)
- 0 Backend (chains complete, routers need integration)

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
    │ LeadScoringChain       │ IFC-005     │ ✅ Complete + UI (IFC-023)                       │
    │ SentimentAnalysisChain │ IFC-039     │ ⚠️ Chain complete, UI MISSING                   │
    │ ChurnRiskChain         │ IFC-095     │ ⚠️ Chain complete, UI MISSING                   │
    │ EmbeddingChain         │ AI-SETUP-003│ ✅ Complete (internal use)                       │
    │ RAGContextChain        │ IFC-039     │ ⚠️ Chain complete, UI MISSING                   │
    └────────────────────────┴─────────────┴──────────────────────────────────────────────────┘
```
