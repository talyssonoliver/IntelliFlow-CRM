# Product Requirements Document (PRD)

## Overview

| Field             | Value                                                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Feature Name**  | Home Page (Public & Authenticated)                                                                                                   |
| **Owner**         | Growth Lead, CRM FE Lead                                                                                                             |
| **Status**        | In Progress                                                                                                                          |
| **Target Sprint** | 13-14                                                                                                                                |
| **Created Date**  | 2026-02-03                                                                                                                           |
| **Last Updated**  | 2026-03-10                                                                                                                           |
| **Related Tasks** | IFC-182, PG-001, PG-129, IFC-069, IFC-183, PG-165, IFC-195, IFC-202, IFC-211, PG-156, PG-157, PG-158, PG-159, PG-166, PG-167, PG-161 |

## Problem Statement

### Background

The Home Page (`/`) is the primary entry point for IntelliFlow CRM. It serves
two distinct user groups with different needs:

- **Visitors** need to understand the product value proposition and convert to
  users
- **Authenticated users** need a personalized dashboard to start their workday
  efficiently

Currently, the frontend components exist but the authenticated home page relies
on hardcoded data instead of real backend APIs.

### Problem Description

1. **Visitors** land on the home page and need clear value proposition, social
   proof, and easy path to signup
2. **Authenticated users** need at-a-glance view of their daily priorities,
   AI-generated insights, recent activity, and quick access to frequent actions
3. **Backend integration** is incomplete - the UI displays placeholder data
   instead of real CRM data

### Impact

**Who is affected?**

- **Prospects**: First impression of the product; directly affects conversion
  rate
- **Sales Representatives**: Daily workflow efficiency; need quick access to hot
  leads and tasks
- **Account Managers**: Customer relationship visibility; need deal status and
  activity feed
- **Support Agents**: Ticket awareness; need overdue task reminders

**What is the business impact?**

- Conversion rate from visitor to signup (public page)
- Time-to-first-action for authenticated users
- User engagement and daily active usage
- AI insight adoption and action rate

**What happens if we don't solve this?**

- Lower conversion rates due to weak value proposition
- Reduced user productivity from lack of personalized dashboard
- Missed opportunities due to invisible hot leads and at-risk deals
- Increased churn from poor first-day experience

## User Stories

### Primary User Story

**As a** sales representative **I want to** see my high-priority tasks, hot
leads, and AI insights when I log in **So that** I can immediately focus on the
most impactful actions for my day.

**Acceptance Criteria:**

- [x] Welcome banner shows personalized greeting with my name
- [x] Daily stats display: high-priority tasks, new leads, appointments today
- [x] AI insights highlight deals at risk and hot leads
- [x] Activity feed shows recent actions on my accounts
- [x] Quick actions allow one-click navigation to create call/email/meeting/task

### Additional User Stories

#### Story 2: Visitor Conversion

**As a** prospective customer **I want to** understand what IntelliFlow CRM
offers and how it's different **So that** I can decide whether to start a free
trial.

**Acceptance Criteria:**

- [x] Hero section clearly communicates value proposition
- [x] Social proof section shows trusted companies
- [x] Feature highlights explain key differentiators (AI, governance,
      accessibility)
- [x] CTAs are prominent and lead to signup/contact forms
- [ ] Page loads fast (<2s LCP) and scores >90 on Lighthouse
      <!-- Deferred: Performance testing (backlog) — needs Lighthouse CI measurement -->

#### Story 3: Goal Tracking

**As a** sales rep **I want to** see my progress toward daily revenue goals **So
that** I know how much more I need to close today.

**Acceptance Criteria:**

- [x] Circular progress indicator shows percentage toward goal
- [x] Remaining amount is clearly displayed
- [ ] Goal updates in real-time as deals close
      <!-- Deferred: PG-156 — real-time goal subscription not yet implemented -->

#### Story 4: Quick Access

**As a** power user **I want to** pin frequently accessed items (leads,
documents, reports) **So that** I can access them with one click from the home
page.

**Acceptance Criteria:**

- [x] Can pin up to 10 items
- [x] Pinned items show entity type icon and title
- [x] Can unpin items
- [x] Pin order persists across sessions

## Acceptance Criteria Checklist

### Functional Requirements

- [x] Public page renders for unauthenticated users
- [x] Authenticated dashboard renders for logged-in users
- [x] Welcome summary fetches real user data (name, stats)
- [x] AI insights generated from actual CRM data (deals, leads, tasks)
- [x] Activity feed pulls from audit log with pagination
- [x] Daily goal calculates from closed deals
- [x] Pinned items CRUD operations work correctly
- [x] All navigation links route to correct pages
- [x] Loading skeletons display during data fetch
- [x] Empty states display when no data available

### Non-Functional Requirements

- [ ] Public page Lighthouse score ≥90
      <!-- Deferred: Performance testing (backlog) — needs production build measurement -->
- [ ] Public page LCP <2s, FID <100ms, CLS <0.1
      <!-- Deferred: Performance testing (backlog) — needs Core Web Vitals measurement -->
- [ ] Authenticated page loads <500ms
      <!-- Deferred: Performance testing (backlog) — skeleton loaders support perceived <500ms but not measured -->
- [x] All tRPC endpoints respond <200ms
- [ ] WCAG 2.1 AA accessibility compliance
      <!-- Deferred: Accessibility audit (backlog) — aria-labels present, no formal audit -->
- [x] Responsive design: 1 col mobile → 4 cols desktop
- [ ] Dark mode fully supported
      <!-- Deferred: Dark mode pass (backlog) — auth dashboard not verified -->
- [x] SEO meta tags and OG tags configured

### Quality Gates

- [x] Test coverage ≥90% for home.router.ts
- [ ] Test coverage ≥95% for home.ts validators
      <!-- Deferred: PG-163 — integration test suite will measure -->
- [x] All unit tests passing
- [x] All integration tests passing
- [ ] E2E tests for critical flows passing
      <!-- Deferred: PG-164 — 5 Playwright E2E scenarios planned -->
- [x] No critical or high severity bugs
- [x] Code review completed and approved
- [ ] SonarQube issues resolved
      <!-- Deferred: SonarQube run (backlog) — not yet executed for home module -->

### Documentation

- [x] Spec document created (`docs/specs/HOME-PAGE-SPEC.md`)
- [x] API documentation in tRPC router comments
- [ ] Component JSDoc comments
      <!-- Deferred: Documentation pass (backlog) — not systematically added -->
- [ ] This PRD approved
      <!-- Deferred: PG-165 (this task) — approval follows this update -->

### Deployment

- [x] No feature flag required (always enabled)
- [x] No database migrations required
- [ ] Monitoring configured (endpoint latency)
      <!-- Deferred: Observability setup (backlog) — home-specific monitoring not configured -->
- [x] Error tracking via Sentry

## Technical Requirements

### API Endpoints

| Method | Endpoint                  | Description                   | Auth Required |
| ------ | ------------------------- | ----------------------------- | ------------- |
| GET    | `home.getWelcomeSummary`  | User greeting and daily stats | Yes           |
| GET    | `home.getAIInsights`      | AI-generated insights         | Yes           |
| GET    | `home.getActivityFeed`    | Paginated activity feed       | Yes           |
| GET    | `home.getDailyGoal`       | Daily goal progress           | Yes           |
| GET    | `home.getPinnedItems`     | User's pinned items           | Yes           |
| POST   | `home.pinItem`            | Pin a new item                | Yes           |
| POST   | `home.unpinItem`          | Remove pinned item            | Yes           |
| POST   | `home.reorderPinnedItems` | Reorder pinned items          | Yes           |

**tRPC Procedures:**

```typescript
// apps/api/src/modules/home/home.router.ts
export const homeRouter = createTRPCRouter({
  getWelcomeSummary: protectedProcedure.query(
    async ({ ctx }): Promise<WelcomeSummary> => {
      // Returns: userName, greeting, todayDate, stats
    }
  ),

  getAIInsights: protectedProcedure.query(
    async ({ ctx }): Promise<AIInsightsResponse> => {
      // Returns: insights[], lastRefreshed
    }
  ),

  getActivityFeed: protectedProcedure
    .input(activityFeedQuerySchema)
    .query(async ({ ctx, input }): Promise<ActivityFeedResponse> => {
      // Returns: items[], nextCursor, hasMore
    }),

  getDailyGoal: protectedProcedure.query(
    async ({ ctx }): Promise<DailyGoalResponse> => {
      // Returns: goal { id, type, label, progress, ... }
    }
  ),

  getPinnedItems: protectedProcedure.query(
    async ({ ctx }): Promise<PinnedItemsResponse> => {
      // Returns: items[], maxItems
    }
  ),

  pinItem: protectedProcedure
    .input(pinItemInputSchema)
    .mutation(async ({ ctx, input }) => {
      // Adds item to user preferences
    }),

  unpinItem: protectedProcedure
    .input(unpinItemInputSchema)
    .mutation(async ({ ctx, input }) => {
      // Removes item from user preferences
    }),

  reorderPinnedItems: protectedProcedure
    .input(reorderPinnedItemsInputSchema)
    .mutation(async ({ ctx, input }) => {
      // Updates item positions
    }),
});
```

### Data Model Changes

**No new tables required.** Data is aggregated from existing models:

- `User` - name, preferences (JSON for pinned items)
- `Task` - high priority count, overdue count
- `Lead` - new leads count, hot leads (score ≥80)
- `Opportunity` - closed deals for revenue goal, deals at risk
- `Appointment` - today's appointment count
- `AuditLog` - activity feed source

**Modified Tables:**

- Table: `User`
  - Uses existing `preferences` JSON column for pinned items storage
  - No schema change required

### Domain Model

**No new aggregates required.** Uses existing:

- `Lead` aggregate (packages/domain/src/crm/lead/)
- `Opportunity` aggregate (packages/domain/src/crm/opportunity/)
- `Task` aggregate (packages/domain/src/crm/task/)

**New Use Cases:**

- `GetWelcomeSummary` - Aggregates stats across entities
- `GetAIInsights` - Rule-based insight generation (future: ML-based)
- `GetActivityFeed` - Queries audit log with filtering
- `ManagePinnedItems` - CRUD for user preferences

### Integration Points

**Internal Services:**

| Service      | Purpose                  | Communication |
| ------------ | ------------------------ | ------------- |
| Auth Context | User identity, tenant ID | tRPC context  |
| Prisma       | Database queries         | Direct ORM    |
| Audit Log    | Activity feed source     | Prisma query  |

**AI/LLM Integration:**

- **Current**: Rule-based insights (no LLM)
- **Future** (Sprint 16+):
  - Model: OpenAI GPT-4 / Ollama local
  - Purpose: Personalized insight generation
  - Input: User's CRM data summary
  - Output: Prioritized action recommendations
  - Fallback: Rule-based insights
  - Cost Budget: <$0.01 per insight refresh

### UI/UX Components

**Pages:**

| Route | Component               | Type   | Data Loading       |
| ----- | ----------------------- | ------ | ------------------ |
| `/`   | `HomePageContent`       | Client | Conditional render |
| `/`   | `PublicHomePage`        | Server | Static             |
| `/`   | `AuthenticatedHomePage` | Client | tRPC queries       |

**New Components:**

| Component         | Location                  | Purpose                |
| ----------------- | ------------------------- | ---------------------- |
| `InsightCard`     | AuthenticatedHomePage.tsx | Display AI insight     |
| `InsightsSection` | AuthenticatedHomePage.tsx | Insights container     |
| `FeedItemCard`    | AuthenticatedHomePage.tsx | Activity feed item     |
| `FeedSection`     | AuthenticatedHomePage.tsx | Feed container         |
| `GoalSection`     | AuthenticatedHomePage.tsx | Progress ring          |
| `PinnedItemCard`  | AuthenticatedHomePage.tsx | Pinned item row        |
| `PinnedSection`   | AuthenticatedHomePage.tsx | Pinned items container |
| `*Skeleton`       | AuthenticatedHomePage.tsx | Loading states (4)     |

### State Management

- **Global State**: None required
- **Server State**: tRPC + React Query
- **Form State**: None (no forms on home page)
- **Cache Strategy**: React Query default (staleTime: 0, cacheTime: 5min)

### Performance Considerations

- **Expected Load**: 100+ concurrent users on home page
- **Database Indexes**: Existing indexes sufficient
- **Caching Strategy**: React Query client-side caching
- **Optimization Techniques**:
  - Parallel data fetching (5 queries in parallel)
  - Skeleton loaders for perceived performance
  - Cursor-based pagination for feed

### Security Considerations

- **Authentication**: Required for all home.\* endpoints
- **Authorization**: User can only see own data (userId filter)
- **Tenant Isolation**: tenantId filter on all queries
- **Input Validation**: Zod schemas for all inputs
- **Rate Limiting**: Standard tRPC rate limits apply

### Goal Management RBAC (IFC-211)

Adds role-based access control to the daily goal endpoints introduced by IFC-195
so that managers can set goals for direct reports and admins can define org-wide
defaults without breaking self-service.

- **Resource Type**: `goal` is added to the `ResourceType` union in
  `apps/api/src/security/types.ts` and to the `DEFAULT_PERMISSIONS` matrix in
  `apps/api/src/security/rbac.ts`. Default actions per role: VIEWER (own read);
  USER (own read, own write); SALES_REP (own read, own write); MANAGER (own +
  team read/write/manage); ADMIN (org read/write/manage).
- **Scope rules**:
  - **Self scope**: Any authenticated user can read/write their own goal.
  - **Team scope**: A MANAGER can set a goal for a direct report only when the
    target user is a `TeamMember` of a `Team` whose `leaderId` is the manager
    (same `tenantId`). Cross-team writes are denied.
  - **Org scope**: An ADMIN can set tenant-wide default goals that apply to all
    users without an explicit override.
- **Resolution order on read** (`getDailyGoal`): user override
  (`User.preferences.dailyGoal`) → team override (manager-set, persisted on the
  target user) → org default (`TenantGoalDefault`) → hardcoded `GOAL_DEFAULTS`.
- **Audit trail**: Every successful goal write logs an `UPDATE` audit entry via
  `AuditLogger.logAction('UPDATE', 'goal', <targetUserId|tenantId>, tenantId, { actorId, beforeState, afterState })`.
  Permission denials log
  `logPermissionDenied('goal', ..., 'goal:<action>', ...)`.
- **Audit fields captured**: `actorId`, `actorRole`, `resourceType: 'goal'`,
  `resourceId` (target user ID or tenant ID for org defaults), `beforeState` /
  `afterState` (goal type + targetValue + label), and
  `metadata.scope: 'self' | 'team' | 'org'`.
- **API surface (additive, non-breaking)**: `home.updateDailyGoal` accepts an
  optional `targetUserId`. `home.getDailyGoal` accepts an optional
  `targetUserId` for managers/admins reading on behalf. New
  `home.setOrgGoalDefault` (admin-only) and `home.getOrgGoalDefault`
  (tenant-scoped read) procedures cover the org-default path.
- **Failure modes**: Forbidden actions return tRPC `FORBIDDEN` with the RBAC
  reason and an audit `PERMISSION_DENIED` entry. Tenant mismatches and
  cross-team writes always deny.

## Success Metrics

### Performance Targets

| Metric                    | Target | Measurement Method   |
| ------------------------- | ------ | -------------------- |
| API Response Time (p95)   | <150ms | OpenTelemetry traces |
| API Response Time (p99)   | <200ms | OpenTelemetry traces |
| Page Load Time (FCP)      | <1s    | Lighthouse           |
| Time to Interactive (TTI) | <1s    | Lighthouse (PG-166)  |
| Public Page LCP           | <2s    | Core Web Vitals      |
| Public Page CLS           | <0.1   | Core Web Vitals      |

### Quality Targets

| Metric                      | Target | Measurement Method     |
| --------------------------- | ------ | ---------------------- |
| Test Coverage (home.router) | ≥90%   | Vitest coverage report |
| Test Coverage (validators)  | ≥95%   | Vitest coverage report |
| Lighthouse Score (Public)   | ≥90    | Lighthouse CI          |
| Lighthouse Score (Auth)     | ≥90    | Lighthouse CI (PG-166) |
| Accessibility Score         | ≥95    | axe DevTools           |

### Business Metrics

| Metric                | Target        | Measurement Method     |
| --------------------- | ------------- | ---------------------- |
| Visitor → Signup Rate | >5%           | Analytics              |
| Daily Active Users    | Track         | Analytics              |
| Insight Click Rate    | >20%          | Analytics              |
| Quick Action Usage    | >30%          | Analytics              |
| Pinned Items Adoption | >15% of users | Analytics              |
| Time on Home Page     | <30s          | Analytics (efficiency) |

### AI Metrics (Future)

| Metric              | Target | Measurement Method |
| ------------------- | ------ | ------------------ |
| Insight Relevance   | ≥80%   | User feedback      |
| Action Taken Rate   | ≥25%   | Click tracking     |
| AI Cost per Refresh | <$0.01 | Cost tracking      |

## Dependencies

### Prerequisite Tasks

From `Sprint_plan.csv` Dependencies column:

- [x] IFC-003: tRPC API Foundation
- [x] IFC-089: Lead Management Core
- [x] IFC-069: Unified Activity Feed Service (for real-time)
- [x] IFC-183: Notifications Router (for notification count)

### Technical Prerequisites

- [x] tRPC server configured and running
- [x] Prisma schema includes all required models
- [x] Auth context provides userId and tenantId
- [x] Audit logging enabled for activity feed

### Team Dependencies

- [x] UI component design approved (using existing shadcn/ui)
- [x] API contracts defined (Zod schemas)
- [ ] Analytics tracking plan defined
      <!-- Deferred: Analytics setup (backlog) — tracking plan not yet defined -->

## Risks and Mitigations

| Risk                       | Likelihood | Impact | Mitigation                                       |
| -------------------------- | ---------- | ------ | ------------------------------------------------ |
| Slow aggregation queries   | Medium     | High   | Add database indexes, use parallel queries       |
| AI insights not useful     | Medium     | Medium | Start with rule-based, iterate based on feedback |
| Activity feed too noisy    | Low        | Medium | Implement type filters, smart batching           |
| Public page SEO regression | Low        | High   | Lighthouse CI on every commit                    |
| Performance degradation    | Medium     | High   | Set up alerting for p99 >200ms                   |

## Out of Scope

**Explicitly NOT included in this release:**

- ML-based AI insights (using rule-based) <!-- Deferred: PG-162 -->
- ~~Customizable daily goal types/targets~~ — Implemented: IFC-195
- Drag-and-drop reorder for pinned items <!-- Deferred: PG-158 -->
- Calendar widget

**Delivered since initial PRD:**

- ~~Real-time WebSocket updates for activity feed~~ — Delivered by IFC-069
- ~~Notification bell with count~~ — Delivered by IFC-183

**Future Considerations:**

- ML-based insights with LangChain - Target: Sprint 16 (PG-162)
- ~~Customizable goals in user settings~~ — Implemented: IFC-195 (Sprint 15)
- Drag-and-drop reorder for pinned items (PG-158)
- ~~View All AI Insights page~~ — Delivered by PG-160 (Sprint 15): `/insights`
  route with `getAllInsights` endpoint, pagination, and type filtering

## Timeline

| Milestone            | Sprint | Owner        | Status   |
| -------------------- | ------ | ------------ | -------- |
| PRD Review           | 13     | Product Lead | Complete |
| Backend Router       | 13     | Backend Dev  | Complete |
| Frontend Integration | 13     | Frontend Dev | Complete |
| Unit Tests           | 13     | QA           | Complete |
| Integration Tests    | 14     | QA           | Complete |
| E2E Tests            | 14     | QA           | Pending  |
| Performance Testing  | 14     | QA           | Pending  |
| Production Deploy    | 14     | DevOps       | Pending  |

## Approval

| Role                | Name  | Date  | Signature |
| ------------------- | ----- | ----- | --------- |
| Product Owner       | [TBD] | [TBD] | Pending   |
| Tech Lead           | [TBD] | [TBD] | Pending   |
| Engineering Manager | [TBD] | [TBD] | Pending   |

## References

- **Spec Document**: `docs/specs/HOME-PAGE-SPEC.md`
- **Sprint Plan**: `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv`
- **Integration Backlog**: `docs/design/integration-backlog.md`
- **Flow Index**:
  `apps/project-tracker/docs/metrics/_global/flows/flow-index.md`
- **ADR-020**: `docs/architecture/adr/ADR-020-public-site-auth.md`
- **Page Map**: `docs/design/PAGE_MAP_AND_FLOWS.md`

## Revision History

| Version | Date       | Author | Changes                                                                                                                                                                                                           |
| ------- | ---------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.0     | 2026-02-03 | Claude | Initial draft                                                                                                                                                                                                     |
| 2.0     | 2026-02-23 | Claude | PG-165: Checkbox audit — 38/51 marked complete, 13 deferred with task references                                                                                                                                  |
| 2.1     | 2026-03-02 | Claude | PG-166: Lighthouse audit — TTI target tightened to <1s, auth Lighthouse score raised to >=90, added PG-166 to Related Tasks                                                                                       |
| 2.2     | 2026-04-26 | Claude | IFC-211: Added "Goal Management RBAC" subsection to Security Considerations covering goal resource type, self/team/org scopes, resolution order, audit fields, and API surface (targetUserId + setOrgGoalDefault) |
