# FLOW-047: Authenticated Home Page

## Overview

| Property          | Value                                     |
| ----------------- | ----------------------------------------- |
| **Flow ID**       | FLOW-047                                  |
| **Name**          | Authenticated Home Page                   |
| **Category**      | Dashboard                                 |
| **Priority**      | High                                      |
| **Sprint**        | 13-14                                     |
| **Related Tasks** | PG-129, IFC-182, IFC-069, IFC-095, PG-001 |

## Description

Personalized dashboard for authenticated users that serves as the daily
start-of-work screen. Displays a welcome summary with daily stats, real-time
activity feed, AI-generated insights with suggested actions, pinned items for
quick access, and daily revenue/activity goals with progress tracking. All data
sourced from live CRM backend via tRPC.

---

## Actors

- **Sales Representative**: Views hot leads, daily tasks, AI insights, revenue
  goals
- **Account Manager**: Monitors deal status, customer activity, at-risk accounts
- **Support Agent**: Tracks overdue tickets, SLA alerts, task reminders
- **System**: Aggregates personalized data and streams real-time updates
- **AI Engine**: Generates contextual insights (warnings, opportunities,
  reminders)

---

## Pre-conditions

- User authenticated with valid session (Supabase Auth JWT)
- User has an active tenant assignment
- Home router endpoints available (`home.getDashboard`, `home.getActivityFeed`,
  etc.)
- At least one of: leads, deals, tasks, or contacts exist in tenant

---

## User Journey

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     AUTHENTICATED HOME PAGE FLOW                            │
└─────────────────────────────────────────────────────────────────────────────┘

[User] logs in → redirected to /
         │
         ▼
┌─────────────────┐
│ Auth Detection   │ - Check session via useAuth()
│                  │ - If authenticated → AuthenticatedHomePage
│                  │ - If visitor → PublicHomePage
└────────┬─────────┘
         │ Authenticated
         ▼
┌─────────────────────────────────────────────────────────────┐
│                  AUTHENTICATED HOME PAGE                      │
│  (apps/web/src/components/home/AuthenticatedHomePage.tsx)     │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ 1. WELCOME BANNER                                      │  │
│  │    "Good morning, {firstName}!"                        │  │
│  │    ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐  │  │
│  │    │ High-    │ │ New      │ │ Meetings │ │ Tasks  │  │  │
│  │    │ Priority │ │ Leads    │ │ Today    │ │ Due    │  │  │
│  │    │ Tasks: 5 │ │ 12      │ │ 3        │ │ 8      │  │  │
│  │    └──────────┘ └──────────┘ └──────────┘ └────────┘  │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────┐  ┌──────────────────────────────┐  │
│  │ 2. QUICK ACTIONS     │  │ 3. AI INSIGHTS               │  │
│  │    ┌────┐ ┌────┐     │  │    ⚠ Deal at risk: Acme...  │  │
│  │    │Call│ │Mail│     │  │    ★ Hot lead: Jane Smith    │  │
│  │    └────┘ └────┘     │  │    ⏰ Follow-up overdue...   │  │
│  │    ┌────┐ ┌────┐     │  │    🏆 Goal reached: 10 calls│  │
│  │    │Meet│ │Task│     │  │    [Suggested Action →]      │  │
│  │    └────┘ └────┘     │  │                              │  │
│  │    [Edit Actions ✎]  │  └──────────────────────────────┘  │
│  └──────────────────────┘                                    │
│                                                              │
│  ┌──────────────────────┐  ┌──────────────────────────────┐  │
│  │ 4. ACTIVITY FEED     │  │ 5. DAILY GOALS               │  │
│  │    Filter: [All ▾]   │  │    Revenue: ████████░░ 80%   │  │
│  │                      │  │    $8,000 / $10,000           │  │
│  │    ● John closed     │  │                              │  │
│  │      deal #1234      │  │    Calls:   ██████░░░░ 60%   │  │
│  │    ● AI scored lead  │  │    6 / 10                     │  │
│  │      Sarah: 92/100   │  │                              │  │
│  │    ● Meeting in 1h   │  │    Meetings: ████░░░░░░ 40%  │  │
│  │      with TechCorp   │  │    2 / 5                      │  │
│  │    [Load More...]    │  │                              │  │
│  └──────────────────────┘  └──────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ 6. PINNED ITEMS                                        │  │
│  │    📌 Lead: Jane Smith    📌 Deal: TechCorp Q1         │  │
│  │    📌 Report: Pipeline    📌 Doc: Contract Draft       │  │
│  │    [Edit Pinned Items ✎]                               │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

---

## Flow Steps

### Step 1: Authentication Check & Routing

**Trigger**: User navigates to `/`

**Logic**:

```typescript
// apps/web/src/app/(public)/page.tsx
const { user, isAuthenticated, isLoading } = useAuth();

if (isLoading) return <HomePageSkeleton />;
if (isAuthenticated) return <AuthenticatedHomePage />;
return <PublicHomePage />;
```

---

### Step 2: Welcome Banner & Daily Stats

**tRPC Endpoint**: `home.getDashboard`

**Output**:

```typescript
interface DashboardData {
  user: {
    firstName: string;
    role: string;
    avatarUrl?: string;
  };
  stats: {
    highPriorityTasks: number;
    newLeads: number;
    meetingsToday: number;
    tasksDueToday: number;
    overdueItems: number;
  };
  greeting: string; // "Good morning" / "Good afternoon" / "Good evening"
}
```

**Greeting Logic**: Time-of-day based (morning <12, afternoon <18, evening >=18)

---

### Step 3: Quick Actions

**Configurable Actions** (user-customizable via `EditQuickActionsSheet`):

| Action           | Icon             | Route                          | Description         |
| ---------------- | ---------------- | ------------------------------ | ------------------- |
| Log Call         | `call`           | `/activities/new?type=call`    | Quick call logging  |
| Send Email       | `mail`           | `/activities/new?type=email`   | Compose email       |
| Schedule Meeting | `calendar_month` | `/activities/new?type=meeting` | Book meeting        |
| Create Task      | `task_alt`       | `/tasks/new`                   | Quick task creation |
| Add Lead         | `person_add`     | `/leads/new`                   | Create new lead     |
| Add Contact      | `contacts`       | `/contacts/new`                | Create new contact  |

**Persistence**: Enabled actions stored in `localStorage` via
`loadEnabledActions()`

---

### Step 4: AI Insights Panel

**tRPC Endpoint**: `home.getAIInsights`

**Insight Types**:

| Type          | Icon          | Color  | Example                                   |
| ------------- | ------------- | ------ | ----------------------------------------- |
| `warning`     | AlertTriangle | Amber  | "Deal at risk: Acme Corp stalled 14 days" |
| `opportunity` | Star          | Green  | "Hot lead: Jane Smith scored 92/100"      |
| `reminder`    | Clock         | Blue   | "Follow-up overdue: John Doe (3 days)"    |
| `achievement` | Trophy        | Purple | "Goal reached: 10 calls completed today"  |

**Data Structure**:

```typescript
interface AIInsight {
  id: string;
  type: 'warning' | 'opportunity' | 'reminder' | 'achievement';
  title: string;
  description: string;
  suggestedAction?: string;
  entityType?: string; // 'lead', 'deal', 'contact', 'task'
  entityId?: string;
  actionUrl?: string; // Deep link to relevant entity
  priority: 'low' | 'medium' | 'high';
  createdAt: Date;
}
```

**Behavior**:

- Max 5 insights displayed (sorted by priority desc, then recency)
- Click insight → navigate to `actionUrl`
- "Suggested Action" button triggers the recommended action
- Refreshes every 5 minutes

---

### Step 5: Activity Feed

**tRPC Endpoint**: `home.getActivityFeed`

**Input**:

```typescript
interface ActivityFeedRequest {
  filter?: 'all' | 'mention' | 'call' | 'email' | 'task' | 'deal' | 'lead';
  cursor?: string;
  limit?: number; // Default: 10
}
```

**Feed Item Structure**:

```typescript
interface ActivityFeedItem {
  id: string;
  type:
    | 'mention'
    | 'call'
    | 'email'
    | 'task'
    | 'deal'
    | 'lead'
    | 'system'
    | 'ai';
  title: string;
  description: string;
  timestamp: Date;
  relativeTime: string; // "2 hours ago", "just now"
  actor?: {
    id: string;
    name: string;
    avatarUrl?: string;
    initials: string;
  };
  attachment?: {
    name: string;
    type: string;
    url?: string;
  };
  badges?: {
    id: string;
    label: string;
    variant: 'success' | 'warning' | 'info' | 'default';
  }[];
  actionUrl?: string;
  isActionable: boolean;
}
```

**Filter Options** (from `FEED_FILTER_OPTIONS`):

- All Activity, Mentions, Calls, Emails, Tasks, Deals, Leads

**Pagination**: Cursor-based with "Load More" button

---

### Step 6: Daily Goals

**tRPC Endpoint**: `home.getDailyGoals`

**Goal Types**:

| Goal Type  | Unit     | Example Target |
| ---------- | -------- | -------------- |
| `revenue`  | Currency | $10,000/day    |
| `calls`    | Count    | 10 calls/day   |
| `meetings` | Count    | 5 meetings/day |
| `tasks`    | Count    | 8 tasks/day    |
| `custom`   | Variable | User-defined   |

**Data Structure**:

```typescript
interface DailyGoal {
  id: string;
  type: 'revenue' | 'calls' | 'meetings' | 'tasks' | 'custom';
  label: string;
  targetValue: number;
  currentValue: number;
  unit: string;
  progress: number; // 0-100 percentage
  remainingToTarget: number;
  remainingFormatted: string; // "$2,000 remaining"
}
```

**Visualization**: Horizontal progress bars with percentage labels and remaining
amounts

---

### Step 7: Pinned Items

**tRPC Endpoint**: `home.getPinnedItems` (from `User.preferences` JSON field)

**Behavior**:

- Max 10 pinned items per user
- Each item shows entity type icon + title
- Click navigates to entity detail page
- "Edit Pinned Items" opens `EditPinnedNavigationSheet`
- Pin/unpin available via `useEntityPin` hook on entity pages

**Pinnable Entity Types**:

- Leads, Contacts, Accounts, Deals, Tasks, Documents, Reports

**Persistence**: Stored in `User.preferences` JSON field in database

---

## Edge Cases

| Scenario                 | Handling                                                               |
| ------------------------ | ---------------------------------------------------------------------- |
| New user (no data)       | Show onboarding state: "Welcome! Start by creating your first lead."   |
| No AI insights available | Hide insights panel; show "AI insights will appear as you use the CRM" |
| Activity feed empty      | Show empty state with illustration and CTA                             |
| All goals at 0%          | Show encouraging message: "Your day is just getting started!"          |
| All goals at 100%        | Show celebration: "Amazing day! All goals achieved!"                   |
| Session expires mid-view | Auth context catches 401; redirect to login with return URL            |
| Slow API response        | Skeleton loading for each section independently                        |
| Pinned item deleted      | Show "Item no longer available" with auto-unpin option                 |
| Timezone change          | Greeting and goals recalculate based on user timezone                  |

---

## Technical Artifacts

### Frontend (IMPLEMENTED)

| Artifact              | Path                                                     | Status   |
| --------------------- | -------------------------------------------------------- | -------- |
| AuthenticatedHomePage | `apps/web/src/components/home/AuthenticatedHomePage.tsx` | COMPLETE |
| PinnedItemsSheet      | `apps/web/src/components/home/PinnedItemsSheet.tsx`      | COMPLETE |
| PublicHomePage        | `apps/web/src/components/home/PublicHomePage.tsx`        | COMPLETE |
| HomePageContent       | `apps/web/src/components/home/HomePageContent.tsx`       | COMPLETE |
| PRD                   | `docs/planning/prd-home-page.md`                         | COMPLETE |

### Backend (PARTIAL)

| Artifact             | Path                                                              | Status              |
| -------------------- | ----------------------------------------------------------------- | ------------------- |
| Home Router          | `apps/api/src/modules/home/home.router.ts`                        | PARTIAL             |
| AI Insights Endpoint | `apps/api/src/modules/home/insights.ts`                           | **NOT IMPLEMENTED** |
| Daily Goals Endpoint | `apps/api/src/modules/home/goals.ts`                              | **NOT IMPLEMENTED** |
| Home Page Spec       | `docs/specs/HOME-PAGE-SPEC.md`                                    | **NOT IMPLEMENTED** |
| ADR-027              | `docs/architecture/adr/ADR-027-authenticated-home-composition.md` | **NOT IMPLEMENTED** |

---

## Performance Requirements

| Metric                         | Target  |
| ------------------------------ | ------- |
| Page TTI                       | <1s P95 |
| Dashboard data load            | <500ms  |
| Activity feed query            | <200ms  |
| AI insights query              | <300ms  |
| Lighthouse performance         | >90     |
| LCP (Largest Contentful Paint) | <2s     |

---

## Security Requirements

| Requirement             | Implementation                                        |
| ----------------------- | ----------------------------------------------------- |
| Authentication required | `useAuth()` guard; redirect if unauthenticated        |
| Tenant isolation        | All queries scoped to user's active tenant            |
| Pinned items ACL        | Verify user still has access to pinned entity on load |
| AI insights filtered    | Only show insights for entities user can access       |
| Rate limiting           | Standard authenticated limits (1000 req/min)          |

---

## Accessibility Requirements

| Requirement           | Implementation                                              |
| --------------------- | ----------------------------------------------------------- |
| Keyboard navigation   | Tab through all sections; Enter to activate                 |
| Screen reader support | Proper headings (h1-h3), ARIA labels on interactive widgets |
| Color contrast        | WCAG AA for all text and status indicators                  |
| Reduced motion        | Respect `prefers-reduced-motion` for progress animations    |
| Focus management      | Auto-focus on first interactive element after load          |

---

## Success Metrics

| KPI                      | Target                      | Validation                          |
| ------------------------ | --------------------------- | ----------------------------------- |
| Page load TTI p95        | <1s                         | Lighthouse + performance monitoring |
| Time-to-first-action     | <30s                        | Analytics event tracking            |
| Daily active usage       | >80% of authenticated users | DAU/MAU metrics                     |
| AI insight click-through | >40%                        | Event tracking                      |
| Goal completion rate     | Tracked per user            | Daily goal analytics                |
| Pinned items usage       | >50% of users               | Feature adoption metrics            |

---

## Related Flows

- **FLOW-042**: Insights Dashboard (KPI cards share data sources)
- **FLOW-020**: Activity Timeline (activity feed component reused)
- **FLOW-043**: Revenue Forecasting (revenue goal uses forecast data)
- **FLOW-046**: Account Management (pinned accounts link here)

---

## Implementation Tasks

| Task                           | Sprint | Status      |
| ------------------------------ | ------ | ----------- |
| IFC-182 (Home Router Backend)  | 13     | IN PROGRESS |
| PG-129 (Authenticated Home UI) | 14     | PLANNED     |
| PG-001 (Public Home Page)      | 14     | PLANNED     |
| IFC-069 (Activity Feed)        | TBD    | PLANNED     |
| IFC-095 (AI Insights Engine)   | TBD    | PLANNED     |
| **ADR-027**                    | TBD    | NOT STARTED |
| **HOME-PAGE-SPEC.md**          | TBD    | NOT STARTED |

---

_Flow documented: 2026-02-09_ _Last updated: 2026-02-09_
