# AI Output Review Feature - Dependency Chain Analysis

**Generated**: 2026-02-03
**Purpose**: Ensure complete feature implementation with no orphaned tasks

---

## Executive Summary

The **AI Output Review** feature (IFC-176 to IFC-181) is a **6-layer hexagonal architecture** implementation for human-in-the-loop review of ALL AI-generated outputs (not just email drafts).

| Layer | Task | Status | Progress |
|-------|------|--------|----------|
| Domain | IFC-128 | COMPLETED | 100% |
| Validators | IFC-176 | COMPLETED | 100% |
| Application | IFC-177 | Plan Complete | 50% |
| Database | IFC-178 | Backlog | 0% |
| Adapters | IFC-179 | Backlog | 0% |
| tRPC Router | IFC-180 | Backlog | 0% |
| Frontend UI | IFC-181 | Backlog | 0% |

**Critical Path**: IFC-177 + IFC-178 (parallel) -> IFC-179 -> IFC-180 -> IFC-181

---

## Full Dependency Diagram

```
                    ┌─────────────────────────────────────────────────────────────────────────┐
                    │                      AI OUTPUT REVIEW FEATURE                           │
                    │                    (IFC-176 to IFC-181)                                │
                    └─────────────────────────────────────────────────────────────────────────┘

    ╔═══════════════════════════════════════════════════════════════════════════════════════════╗
    ║  LAYER 1: DOMAIN (Foundation)                                                             ║
    ╚═══════════════════════════════════════════════════════════════════════════════════════════╝

                                    ┌─────────────────────────────┐
                                    │        IFC-128              │
                                    │   AI Output Review Domain   │
                                    │                             │
                                    │  - AIOutputReview entity    │
                                    │  - ReviewStatus constants   │
                                    │  - ReviewDecision enum      │
                                    │  - SLA configuration        │
                                    │                             │
                                    │  Status: COMPLETED          │
                                    │  Sprint: 3                  │
                                    └──────────────┬──────────────┘
                                                   │
                          ┌────────────────────────┼────────────────────────┐
                          │                        │                        │
                          ▼                        ▼                        ▼

    ╔═══════════════════════════════════════════════════════════════════════════════════════════╗
    ║  LAYER 2: VALIDATORS + APPLICATION + DATABASE (Can run in parallel)                       ║
    ╚═══════════════════════════════════════════════════════════════════════════════════════════╝

    ┌─────────────────────────┐    ┌─────────────────────────┐    ┌─────────────────────────┐
    │       IFC-176           │    │       IFC-177           │    │       IFC-178           │
    │   Validators Layer      │    │   Application Layer     │    │   Database Schema       │
    │                         │    │                         │    │                         │
    │  - Zod schemas          │    │  - CreateReviewUseCase  │    │  - AIOutputReview table │
    │  - aiOutputTypeSchema   │    │  - ClaimReviewUseCase   │    │  - ReviewAuditLog table │
    │  - reviewStatusSchema   │    │  - ApproveReviewUseCase │    │  - Status/tenant indexes│
    │  - reviewDecisionSchema │    │  - RejectReviewUseCase  │    │  - RLS policies         │
    │  - confidenceSchema     │    │  - EscalateReviewUseCase│    │  - Migration script     │
    │  - SLA config re-export │    │  - Repository port      │    │                         │
    │                         │    │  - RBAC ai_review       │    │                         │
    │  Status: COMPLETED      │    │                         │    │  Status: BACKLOG        │
    │  Sprint: 3              │    │  Status: PLAN COMPLETE  │    │  Sprint: 4              │
    │                         │    │  Sprint: 4 (50%)        │    │                         │
    └────────────┬────────────┘    └────────────┬────────────┘    └────────────┬────────────┘
                 │                              │                              │
                 │                              │                              │
                 └──────────────────────────────┼──────────────────────────────┘
                                                │
                                                ▼

    ╔═══════════════════════════════════════════════════════════════════════════════════════════╗
    ║  LAYER 3: ADAPTERS (Repository Implementation)                                            ║
    ╚═══════════════════════════════════════════════════════════════════════════════════════════╝

                                    ┌─────────────────────────────┐
                                    │        IFC-179              │
                                    │     Adapters Layer          │
                                    │                             │
                                    │  - PrismaAIOutputReview     │
                                    │    Repository               │
                                    │  - CRUD operations          │
                                    │  - Query filters            │
                                    │  - Event publishing         │
                                    │  - Integration tests        │
                                    │                             │
                                    │  Depends: IFC-177, IFC-178  │
                                    │  Status: BACKLOG            │
                                    │  Sprint: 5                  │
                                    └──────────────┬──────────────┘
                                                   │
                                                   ▼

    ╔═══════════════════════════════════════════════════════════════════════════════════════════╗
    ║  LAYER 4: API (tRPC Router)                                                               ║
    ╚═══════════════════════════════════════════════════════════════════════════════════════════╝

                                    ┌─────────────────────────────┐
                                    │        IFC-180              │
                                    │     tRPC Router             │
                                    │                             │
                                    │  Endpoints:                 │
                                    │  - review.list              │
                                    │  - review.get               │
                                    │  - review.claim             │
                                    │  - review.approve           │
                                    │  - review.reject            │
                                    │  - review.escalate          │
                                    │  - review.stats             │
                                    │                             │
                                    │  Depends: IFC-179           │
                                    │  Status: BACKLOG            │
                                    │  Sprint: 5                  │
                                    └──────────────┬──────────────┘
                                                   │
                                                   │
    ╔═══════════════════════════════════════╦══════╩═══════╦════════════════════════════════════╗
    ║  LAYER 5: FRONTEND UI                 ║              ║  RELATED FEATURE                   ║
    ╚═══════════════════════════════════════╩══════════════╩════════════════════════════════════╝

                                    ┌─────────────────────────────┐
                                    │        IFC-181              │
                                    │   Frontend UI               │
                                    │                             │
                                    │  Components:                │
                                    │  - ReviewQueue.tsx          │
                                    │  - ReviewCard.tsx           │
                                    │  - ConfidenceGauge.tsx      │
                                    │  - hooks/useReviews.ts      │
                                    │                             │
                                    │  Features:                  │
                                    │  - Filter by status/type    │
                                    │  - Claim/Approve/Reject     │
                                    │  - Confidence visualization │
                                    │  - SLA countdown timer      │
                                    │  - Dark mode support        │
                                    │                             │
                                    │  Depends: IFC-180, IFC-149  │
                                    │  Status: BACKLOG            │
                                    │  Sprint: 6                  │
                                    │                             │
                                    │  Design: ai-review-queue.   │
                                    │          html/png READY     │
                                    └─────────────────────────────┘

```

---

## Related Feature: Agent Approvals (IFC-149)

IFC-181 depends on IFC-149 for design patterns. Here's the Agent Approvals chain:

```
    ╔═══════════════════════════════════════════════════════════════════════════════════════════╗
    ║  AGENT APPROVALS FEATURE (IFC-139 -> IFC-149)  -  ALL COMPLETED                           ║
    ╚═══════════════════════════════════════════════════════════════════════════════════════════╝

    ┌─────────────────────────┐    ┌─────────────────────────┐
    │       IFC-136           │    │       IFC-137           │
    │   Case/Matter Agg       │    │   Appointment Agg       │
    │                         │    │                         │
    │  Status: COMPLETED      │    │  Status: COMPLETED      │
    └────────────┬────────────┘    └────────────┬────────────┘
                 │                              │
                 └──────────────┬───────────────┘
                                │
                                ▼
                 ┌─────────────────────────────┐
                 │        IFC-139              │
                 │   Agent Tools               │
                 │                             │
                 │  - Search/Create/Update     │
                 │  - Approval workflow        │
                 │  - Authorization            │
                 │                             │
                 │  Status: COMPLETED          │
                 │  Sprint: 6                  │
                 └────────────┬────────────────┘
                              │
           ┌──────────────────┼──────────────────┐
           │                                     │
           ▼                                     ▼
    ┌─────────────────────────┐    ┌─────────────────────────┐
    │       IFC-147           │    │       IFC-149           │
    │   Case Timeline UI      │    │   Action Preview UI     │
    │                         │    │                         │
    │  - Deadline engine      │    │  - Diff preview         │
    │  - Reminders            │    │  - Rollback service     │
    │                         │    │  - Approval tracking    │
    │  Status: COMPLETED      │    │                         │
    │  Sprint: 5              │    │  Status: COMPLETED      │
    └─────────────────────────┘    │  Sprint: 6              │
                                   │                         │
                                   │  >> IFC-181 DEPENDS <<  │
                                   └─────────────────────────┘
```

---

## Related Feature: Auto-Response (IFC-029)

This is a SEPARATE system for email drafts only (already COMPLETED):

```
    ╔═══════════════════════════════════════════════════════════════════════════════════════════╗
    ║  AUTO-RESPONSE FEATURE (IFC-028 -> IFC-029)  -  COMPLETED                                 ║
    ╚═══════════════════════════════════════════════════════════════════════════════════════════╝

    ┌─────────────────────────┐         ┌─────────────────────────┐
    │       IFC-028           │         │       IFC-029           │
    │   Workflow Engine       │ ──────► │   Auto-Response         │
    │   (LangGraph)           │         │   with Approval Gate    │
    │                         │         │                         │
    │  Status: COMPLETED      │         │  - AI chain (scoring,   │
    └─────────────────────────┘         │    sentiment, auto-resp)│
                                        │  - State machine        │
                                        │  - tRPC router wired    │
                                        │                         │
                                        │  Status: COMPLETED      │
                                        │  Sprint: 16             │
                                        └────────────┬────────────┘
                                                     │
                              ┌───────────────────────┴───────────────────────┐
                              │                                               │
                              ▼                                               ▼
                 ┌─────────────────────────────┐         ┌─────────────────────────────┐
                 │       IFC-030               │         │       IFC-031               │
                 │   Smart Lead Routing        │         │   Workflow Builder UI       │
                 │                             │         │   (React Flow)              │
                 │  Status: BACKLOG            │         │                             │
                 │  Sprint: 17                 │         │  Status: BACKLOG            │
                 └─────────────────────────────┘         │  Sprint: 17                 │
                                                         └─────────────────────────────┘
```

---

## Comparison: AI Review Queue vs Agent Approvals

| Aspect | Agent Approvals (IFC-149) | AI Review Queue (IFC-181) |
|--------|---------------------------|---------------------------|
| **Scope** | Email drafts ONLY | ALL AI outputs |
| **Output Types** | AUTO_RESPONSE_EMAIL | EMAIL_DRAFT, LEAD_SCORE, SENTIMENT, SUMMARY, CHURN_RISK, ACTION_RECOMMENDATION |
| **Backend** | autoResponse router | ai-review router (TBD) |
| **UI Location** | /agent-approvals | /ai-review (governance) |
| **Status** | COMPLETED | BACKLOG |
| **Dependency** | IFC-181 references this | Needs IFC-149 pattern |

---

## Execution Plan (Recommended Order)

### Phase 1: Complete Application Layer (Can Start NOW)

```
┌─────────────────────────────────────────────────────────────────┐
│  IFC-177: Application Layer                                     │
│  Status: Plan Complete (50%)                                    │
│                                                                 │
│  Remaining Work:                                                │
│  - Implement 6 use cases with tests                             │
│  - Define repository port interface                             │
│  - Add RBAC for ai_review resource                              │
│  - HMAC lock token implementation                               │
│                                                                 │
│  CAN START IMMEDIATELY (IFC-176 + IFC-128 completed)            │
└─────────────────────────────────────────────────────────────────┘
```

### Phase 2: Database Schema (Can Run PARALLEL with Phase 1)

```
┌─────────────────────────────────────────────────────────────────┐
│  IFC-178: Database Schema                                       │
│  Status: Backlog                                                │
│                                                                 │
│  Work:                                                          │
│  - Create AIOutputReview Prisma model                           │
│  - Create ReviewAuditLog Prisma model                           │
│  - Add indexes for performance                                  │
│  - Create migration script                                      │
│  - Apply RLS policies                                           │
│                                                                 │
│  CAN START IMMEDIATELY (only needs IFC-128)                     │
│  RUN IN PARALLEL WITH IFC-177                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Phase 3: Adapters Layer (Blocked until Phase 1+2 complete)

```
┌─────────────────────────────────────────────────────────────────┐
│  IFC-179: Adapters Layer                                        │
│  Status: Backlog                                                │
│                                                                 │
│  Work:                                                          │
│  - Implement PrismaAIOutputReviewRepository                     │
│  - CRUD operations                                              │
│  - Query filters (status, tenant, SLA)                          │
│  - Event publishing                                             │
│  - Integration tests                                            │
│                                                                 │
│  BLOCKED BY: IFC-177 + IFC-178                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Phase 4: API Layer (Blocked until Phase 3 complete)

```
┌─────────────────────────────────────────────────────────────────┐
│  IFC-180: tRPC Router                                           │
│  Status: Backlog                                                │
│                                                                 │
│  Work:                                                          │
│  - Create ai-review.router.ts                                   │
│  - Wire all 7 endpoints                                         │
│  - Authentication/authorization                                 │
│  - Response <200ms                                              │
│  - Unit tests                                                   │
│                                                                 │
│  BLOCKED BY: IFC-179                                            │
└─────────────────────────────────────────────────────────────────┘
```

### Phase 5: Frontend UI (Blocked until Phase 4 complete)

```
┌─────────────────────────────────────────────────────────────────┐
│  IFC-181: Frontend UI                                           │
│  Status: Backlog                                                │
│                                                                 │
│  Work:                                                          │
│  - Create /ai-review route                                      │
│  - ReviewQueue, ReviewCard, ConfidenceGauge components          │
│  - Wire to tRPC endpoints                                       │
│  - Match ai-review-queue.html mockup                            │
│  - Lighthouse >=90                                              │
│  - Dark mode support                                            │
│                                                                 │
│  BLOCKED BY: IFC-180 + IFC-149 (pattern reference)              │
│  MOCKUP READY: docs/design/mockups/ai-review-queue.html         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Orphan Check

| Task | Has Backend? | Has Frontend? | Notes |
|------|--------------|---------------|-------|
| AI Output Review | IFC-177/178/179/180 | IFC-181 | Complete chain |
| Auto-Response | IFC-029 (DONE) | /agent-approvals (DONE) | Complete chain |
| Workflow Builder | IFC-028 (DONE) | IFC-031 (Backlog) | Frontend pending |
| Smart Lead Routing | IFC-030 (Backlog) | **PG-132 (Backlog)** | **CREATED** |

**Findings**:
- AI Output Review: Complete BE+FE chain defined
- Auto-Response: Complete and DONE
- Workflow Builder UI (IFC-031): Backend done, Frontend in backlog - NOT ORPHANED
- Smart Lead Routing (IFC-030): **PG-132 CREATED** - Complete chain now defined

---

## NEW: Smart Lead Routing Chain (IFC-030 -> PG-132)

**Created PG-132** to complete the frontend for Smart Lead Routing:

```
    ╔═══════════════════════════════════════════════════════════════════════════════════════════╗
    ║  SMART LEAD ROUTING FEATURE (IFC-029 -> IFC-030 -> PG-132)                                ║
    ╚═══════════════════════════════════════════════════════════════════════════════════════════╝

    ┌─────────────────────────┐
    │       IFC-029           │
    │   Auto-Response         │
    │   with Approval Gate    │
    │                         │
    │  Status: COMPLETED      │
    └────────────┬────────────┘
                 │
                 ▼
    ┌─────────────────────────┐         ┌─────────────────────────┐
    │       IFC-030           │         │       PG-132            │
    │   Smart Lead Routing    │ ──────► │   Smart Lead Routing UI │
    │   (Backend)             │         │   (Frontend)            │
    │                         │         │                         │
    │  - Score-based routing  │         │  - RoutingRulesEditor   │
    │  - Load balancing       │         │  - AssignmentDashboard  │
    │  - SLA definitions      │         │  - SLAMonitor           │
    │                         │         │  - LeadQueueView        │
    │  Status: BACKLOG        │         │  - AgentWorkload        │
    │  Sprint: 17             │         │                         │
    │                         │         │  Status: BACKLOG        │
    └─────────────────────────┘         │  Sprint: 18             │
                                        │                         │
                                        │  ** NEW TASK **         │
                                        └─────────────────────────┘
```

---

## Summary

The AI Output Review feature has a **complete hexagonal architecture chain** from Domain to Frontend:

```
IFC-128 (Domain) ✅
    └── IFC-176 (Validators) ✅
    └── IFC-177 (Application) ⏳ 50%  ──┐
    └── IFC-178 (Database) ⬜ 0%     ──┼──► IFC-179 (Adapters) ⬜ 0%
                                           └──► IFC-180 (tRPC) ⬜ 0%
                                                 └──► IFC-181 (Frontend) ⬜ 0%
                                                       └── Mockup READY ✅
```

**Next Actions**:
1. Complete IFC-177 (Application Layer) - can start now
2. Start IFC-178 (Database) in parallel
3. Proceed sequentially: IFC-179 → IFC-180 → IFC-181

**No orphaned tasks detected** - all chains have complete BE+FE coverage.

**New Task Created**:
- **PG-132**: Smart Lead Routing UI (Sprint 18) - Frontend for IFC-030
