# AI Output Review Feature - Dependency Chain Analysis

**Generated**: 2026-02-03
**Updated**: 2026-02-08
**Purpose**: Ensure complete feature implementation with no orphaned tasks

---

## Executive Summary

The **AI Output Review** feature (IFC-176 to IFC-181) is a **6-layer hexagonal architecture** implementation for human-in-the-loop review of ALL AI-generated outputs (not just email drafts).

| Layer | Task | Status | Progress |
|-------|------|--------|----------|
| Domain | IFC-128 | COMPLETED | 100% |
| Validators | IFC-176 | COMPLETED | 100% |
| Application | IFC-177 | COMPLETED | 100% |
| Database | IFC-178 | COMPLETED | 100% |
| Adapters | IFC-179 | COMPLETED | 100% |
| tRPC Router | IFC-180 | COMPLETED | 100% |
| Frontend UI | IFC-181 | COMPLETED | 100% |

**Route**: `/agent-approvals/ai-review` (queue) + `/agent-approvals/ai-review/[id]` (detail)
**Related**: PG-150 (AI Review History at `/agent-approvals/history`, Sprint 7)
**All layers COMPLETED** - full hexagonal chain from Domain to Frontend is done

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
    │  Status: COMPLETED      │    │                         │    │  Status: COMPLETED      │
    │  Sprint: 3              │    │  Status: COMPLETED      │    │  Sprint: 4              │
    │                         │    │  Sprint: 4              │    │  Completed: 2026-02-04  │
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
                                    │  Status: COMPLETED          │
                                    │  Sprint: 5                  │
                                    │  Completed: 2026-02-04      │
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
                                    │  Status: COMPLETED          │
                                    │  Sprint: 5                  │
                                    │  Completed: 2026-02-05      │
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
                                    │  Components (DRY-compliant):│
                                    │  - ReviewQueue.tsx          │
                                    │  - ReviewCard.tsx           │
                                    │  - hooks.ts (lock tokens)   │
                                    │  - date-utils.ts (shared)   │
                                    │                             │
                                    │  Reuses from packages/ui:   │
                                    │  - ConfidenceIndicator      │
                                    │  - StatusBadge (+ review)   │
                                    │  - EmptyState, Skeleton     │
                                    │                             │
                                    │  Reuses from shared:        │
                                    │  - SearchFilterBar          │
                                    │                             │
                                    │  Features:                  │
                                    │  - Filter by status/type    │
                                    │  - Claim/Approve/Reject     │
                                    │  - SLA countdown timer      │
                                    │  - Dark mode support        │
                                    │                             │
                                    │  Depends: IFC-180, IFC-149  │
                                    │  Status: COMPLETED ✅       │
                                    │  Sprint: 6                  │
                                    │  Completed: 2026-02-07      │
                                    │                             │
                                    │  Route: /agent-approvals/   │
                                    │         ai-review           │
                                    │  48/48 tests PASS           │
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
| **Backend** | autoResponse router | ai-review router (IFC-180 ✅) |
| **UI Location** | /agent-approvals | /agent-approvals/ai-review |
| **Status** | COMPLETED ✅ | COMPLETED ✅ |
| **Dependency** | IFC-181 references this | Uses IFC-149 pattern |

---

## Execution Plan (Recommended Order)

### Phase 1: Complete Application Layer (Can Start NOW)

```
┌─────────────────────────────────────────────────────────────────┐
│  IFC-177: Application Layer                                     │
│  Status: COMPLETED (100%) ✅                                    │
│                                                                 │
│  Completed Work:                                                │
│  - 6 use cases implemented (Create, Claim, Approve,             │
│    Reject, Release, Escalate)                                   │
│  - IAIOutputReviewRepository port defined                       │
│  - HMAC lock tokens with timing-safe comparison                 │
│  - 54 tests passing, 90% line coverage                          │
│                                                                 │
│  Completed: 2026-02-05                                          │
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

### Phase 4: API Layer (COMPLETED)

```
┌─────────────────────────────────────────────────────────────────┐
│  IFC-180: tRPC Router                                           │
│  Status: COMPLETED (100%) ✅                                    │
│                                                                 │
│  Completed Work:                                                │
│  - Created ai-review.router.ts                                  │
│  - All 7 endpoints wired                                        │
│  - Authentication/authorization implemented                     │
│  - Response <200ms validated                                    │
│  - Unit tests passing                                           │
│                                                                 │
│  Completed: 2026-02-05                                          │
└─────────────────────────────────────────────────────────────────┘
```

### Phase 5: Frontend UI (Blocked until Phase 4 complete)

```
┌─────────────────────────────────────────────────────────────────┐
│  IFC-181: Frontend UI                                           │
│  Status: COMPLETED (100%) ✅                                     │
│                                                                 │
│  Work (DRY-compliant — no custom gauge/filter/empty):           │
│  - Create /ai-review route + /ai-review/[id] detail             │
│  - ReviewQueue.tsx, ReviewCard.tsx (new components)              │
│  - hooks.ts (lock tokens, mutations, cache invalidation)        │
│  - date-utils.ts (shared SLA clock utility)                     │
│  - Extend StatusBadge with REVIEW_STATUS_CONFIG                 │
│  - Reuse: ConfidenceIndicator, SearchFilterBar, EmptyState      │
│  - Wire governance sidebar + sidebar configs                    │
│  - Lighthouse >=90, dark mode                                   │
│                                                                 │
│  UNBLOCKED: IFC-180 ✅ + IFC-149 ✅                              │
│  SPEC: .specify/sprints/sprint-6/specifications/IFC-181-spec.md │
│  PLAN: .specify/sprints/sprint-6/planning/IFC-181-plan.md       │
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
    └── IFC-177 (Application) ✅ 100% ──┐
    └── IFC-178 (Database) ✅ 100%   ──┼──► IFC-179 (Adapters) ✅ 100%
                                           └──► IFC-180 (tRPC) ✅ 100% (2026-02-05)
                                                 └──► IFC-181 (Frontend) ✅ 100% (2026-02-07)
                                                       ├── Route: /agent-approvals/ai-review
                                                       ├── 48/48 tests PASS
                                                       └── PG-150 (History, Sprint 7)
```

**All 7 layers COMPLETED**:
- IFC-128 (Domain) - Completed Sprint 3
- IFC-176 (Validators) - Completed Sprint 3
- IFC-177 (Application) - Completed 2026-02-04
- IFC-178 (Database) - Completed 2026-02-04, 37 tests, schema validated
- IFC-179 (Adapters) - Completed 2026-02-04, 37 new tests, 155 total
- IFC-180 (tRPC Router) - Completed 2026-02-05
- IFC-181 (Frontend UI) - Completed 2026-02-07, 48/48 tests, full sidebar integration

**Related Tasks**:
- **PG-150**: AI Review History UI (Sprint 7) - at `/agent-approvals/history`
- **PG-132**: Smart Lead Routing UI (Sprint 18) - Frontend for IFC-030

**No orphaned tasks detected** - all chains have complete BE+FE coverage.
