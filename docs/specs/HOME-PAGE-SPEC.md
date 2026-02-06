# Home Page Specification

> **Document**: `docs/specs/HOME-PAGE-SPEC.md`
> **Version**: 1.0.0
> **Created**: 2026-02-03
> **Related Tasks**: IFC-182, PG-001, PG-129 
> **Route**: `/`

---

## 1. Overview

The Home Page (`/`) is the primary entry point for IntelliFlow CRM. It renders **conditionally** based on authentication state:

| User State | Component | Purpose |
|------------|-----------|---------|
| **Unauthenticated** | `PublicHomePage` | Marketing landing page with value proposition, CTAs |
| **Authenticated** | `AuthenticatedHomePage` | Personalized dashboard with insights, activity, goals |

### File Locations

```
apps/web/src/
├── app/(public)/page.tsx           # Route entry point
└── components/home/
    ├── HomePageContent.tsx         # Conditional router
    ├── PublicHomePage.tsx          # Marketing page (372 lines)
    ├── AuthenticatedHomePage.tsx   # Dashboard page (677 lines)
    └── index.ts                    # Exports

apps/api/src/modules/home/
└── home.router.ts                  # tRPC router (624 lines)

packages/validators/src/
└── home.ts                         # Zod schemas (234 lines)
```

---

## 2. Public Home Page (Unauthenticated)

### 2.1 Purpose

Convert visitors into users through clear value proposition, social proof, and prominent CTAs.

### 2.2 Sections & Functional Requirements

#### 2.2.1 Hero Section

| Element | Requirement | Status |
|---------|-------------|--------|
| Headline | "Move faster, stay governed..." | Implemented |
| Subheadline | Design flows once... | Implemented |
| Primary CTA | "Start free trial" → `/signup` | Implemented |
| Secondary CTA | "Talk to sales" → `/contact` | Implemented |
| Feature badges | 3 badges (AI playbooks, Audit-matrix, Accessible) | Implemented |
| Hero card | Live governance health stats | Implemented |
| Background | Gradient with blur effects | Implemented |

**FR-PUB-001**: Hero section shall load within 200ms LCP budget.
**FR-PUB-002**: CTAs shall have proper focus-visible states for accessibility.

#### 2.2.2 Social Proof Section

| Element | Requirement | Status |
|---------|-------------|--------|
| Company logos | 6 placeholder names | Implemented |
| Layout | Grid: 2 cols mobile → 6 cols desktop | Implemented |

**FR-PUB-003**: Company logos should be real customer logos when available.

#### 2.2.3 Value Pillars Section

| Pillar | Description | Icon |
|--------|-------------|------|
| Automation with safeguards | AI-first workflows with approvals | `verified` |
| Evidence-backed delivery | Audit-matrix gates, performance budgets | `rule` |
| Human-centered AI | Assistive by default, accessible by design | `support_agent` |

**FR-PUB-004**: Each pillar shall be a clickable card linking to relevant documentation.

#### 2.2.4 Flow Highlights Section

| Flow | Reference | Description |
|------|-----------|-------------|
| Lead → Deal | FLOW-005/006 | Capture, score, convert |
| Pipeline clarity | FLOW-007/008 | Kanban, forecasting, playbooks |
| Service intelligence | FLOW-011/012 | Intent routing, SLA timers |

**FR-PUB-005**: Flow cards should link to detailed flow documentation.

#### 2.2.5 How It Works Section

| Step | Title | Description |
|------|-------|-------------|
| 1 | Model the flow | Pick from sitemap-aligned templates |
| 2 | Wire guardrails | Enable audit-matrix gates, WCAG patterns |
| 3 | Ship with evidence | Emit attestation, hashes, Lighthouse proof |

#### 2.2.6 Security & Compliance Section

| Item | Status |
|------|--------|
| WCAG 2.1 AA defaults | Listed |
| Audit-matrix gates | Listed |
| Zero-trust posture | Listed |

#### 2.2.7 CTA Section

| Element | Requirement | Status |
|---------|-------------|--------|
| Headline | "Ready to launch AI-first..." | Implemented |
| Primary CTA | "Begin your trial" → `/signup` | Implemented |
| Secondary CTA | "Book a call with sales" → `/contact` | Implemented |

### 2.3 Non-Functional Requirements

| NFR | Target | Measurement |
|-----|--------|-------------|
| **NFR-PUB-001** | Lighthouse Performance ≥ 90 | Lighthouse CI |
| **NFR-PUB-002** | LCP < 1.8s | Core Web Vitals |
| **NFR-PUB-003** | FID < 100ms | Core Web Vitals |
| **NFR-PUB-004** | CLS < 0.1 | Core Web Vitals |
| **NFR-PUB-005** | WCAG 2.1 AA compliance | axe-core audit |
| **NFR-PUB-006** | SEO optimized (meta tags, OG) | Lighthouse SEO |

---

## 3. Authenticated Home Page (Dashboard)

### 3.1 Purpose

Provide personalized, actionable dashboard showing:
- Daily priorities and stats
- AI-generated insights
- Activity feed
- Goal progress
- Quick access to pinned items

### 3.2 Sections & Functional Requirements

#### 3.2.1 Welcome Banner

| Element | Requirement | Status |
|---------|-------------|--------|
| Greeting | Time-based (morning/afternoon/evening) | Implemented |
| User name | First name from auth context | Implemented |
| Stats summary | Dynamic message based on stats | Implemented |
| View Schedule button | Navigate to calendar | Implemented |
| Go to Dashboard button | Navigate to `/dashboard` | Implemented |
| Gradient background | Blue to indigo gradient | Implemented |

**FR-AUTH-001**: Greeting shall change based on time of day:
- Before 12:00 → "Good morning"
- 12:00-17:00 → "Good afternoon"
- After 17:00 → "Good evening"

**FR-AUTH-002**: Welcome message shall dynamically include:
- High priority tasks count
- New leads assigned count
- Deal closing rate trend (% change week-over-week)

**Data Source**: `home.getWelcomeSummary` tRPC endpoint

#### 3.2.2 AI Daily Insights Section

| Element | Requirement | Status |
|---------|-------------|--------|
| Section header | "AI Daily Insights" with sparkle icon | Implemented |
| View All button | Link to insights page | Implemented (placeholder) |
| Insight cards | Up to 5 insights | Implemented |
| Loading state | Skeleton loader | Implemented |
| Empty state | "No insights at this time" | Implemented |

**Insight Types**:

| Type | Icon | Color | Example |
|------|------|-------|---------|
| `warning` | `warning` | Amber | Deal at risk |
| `opportunity` | `trending_up` | Emerald | Hot lead detected |
| `reminder` | `schedule` | Blue | Overdue tasks |
| `achievement` | `emoji_events` | Purple | On track notification |

**FR-AUTH-003**: System shall generate insights based on:
- Deals with no interaction in 14+ days → warning
- Leads with score ≥ 80 not converted → opportunity
- Overdue tasks → reminder
- No urgent items → achievement

**FR-AUTH-004**: Each insight shall include:
- Title
- Description
- Suggested action (optional)
- Entity link (optional)
- Priority (low/medium/high)

**Data Source**: `home.getAIInsights` tRPC endpoint

#### 3.2.3 Quick Actions Section

| Action | Icon | Route | Status |
|--------|------|-------|--------|
| Log Call | `add_call` | `/calls/new` | Implemented |
| Email | `mail` | `/emails/compose` | Implemented |
| Meeting | `event` | `/calendar/new` | Implemented |
| Task | `task` | `/tasks/new` | Implemented |

**FR-AUTH-005**: Quick actions shall be static (no API call needed).
**FR-AUTH-006**: Each action shall have hover state with scale animation.

#### 3.2.4 Your Feed Section (Activity Feed)

| Element | Requirement | Status |
|---------|-------------|--------|
| Section header | "Your Feed" with filter button | Implemented |
| Feed items | Paginated list (default 5) | Implemented |
| Load More button | When hasMore = true | Implemented |
| Loading state | Skeleton loader | Implemented |
| Empty state | "No recent activity" with inbox icon | Implemented |

**Activity Types**:

| Type | Icon/Initials | Color |
|------|---------------|-------|
| `mention` | Actor initials | Blue |
| `call` | `call_received` | Emerald |
| `email` | `mail` | Indigo |
| `task` | `task_alt` | Amber |
| `deal` | `handshake` | Green |
| `lead` | `person_add` | Cyan |
| `ai` | "AI" initials | Purple |
| `system` | `notifications` | Slate |

**FR-AUTH-007**: Feed items shall display:
- Actor avatar or initials
- Title and description
- Relative timestamp (e.g., "10m ago")
- View Details link (when actionable)

**FR-AUTH-008**: Feed shall support cursor-based pagination.

**FR-AUTH-009**: Feed shall filter by user's tenant and mentions.

**Data Source**: `home.getActivityFeed` tRPC endpoint

#### 3.2.5 Today's Focus Section (Daily Goal)

| Element | Requirement | Status |
|---------|-------------|--------|
| Section header | "Today's Focus" with goal type badge | Implemented |
| Progress ring | Circular SVG visualization | Implemented |
| Progress percentage | Centered in ring | Implemented |
| Remaining amount | Formatted with unit | Implemented |
| Loading state | Skeleton loader | Implemented |

**Goal Types**:

| Type | Unit | Example |
|------|------|---------|
| `revenue` | `$` | Sales target |
| `calls` | calls | Call target |
| `meetings` | meetings | Meeting target |
| `tasks` | tasks | Task completion |
| `custom` | varies | User-defined |

**FR-AUTH-010**: Goal progress shall be calculated as: `(currentValue / targetValue) * 100`

**FR-AUTH-011**: Default goal type is `revenue` with $5,000 daily target.

**FR-AUTH-012**: Future enhancement: Allow users to customize goal type and target.

**Data Source**: `home.getDailyGoal` tRPC endpoint

#### 3.2.6 Pinned Items Section

| Element | Requirement | Status |
|---------|-------------|--------|
| Section header | "Pinned" with edit button | Implemented |
| Pinned items list | Max 10 items | Implemented |
| Loading state | Skeleton loader | Implemented |
| Empty state | "No pinned items" | Implemented |

**Pinnable Entity Types**:

| Type | Icon | Color |
|------|------|-------|
| `lead` | `person` | Cyan |
| `contact` | `contacts` | Blue |
| `account` | `business` | Slate |
| `opportunity` | `attach_money` | Green |
| `document` | `folder_special` | Orange |
| `report` | `assessment` | Purple |
| `list` | `contacts` | Blue |

**FR-AUTH-013**: Users shall be able to:
- Pin items (max 10)
- Unpin items
- Reorder pinned items (drag & drop - future)

**FR-AUTH-014**: Pinned items stored in user preferences (JSON field).

**Data Source**: `home.getPinnedItems`, `home.pinItem`, `home.unpinItem`, `home.reorderPinnedItems`

#### 3.2.7 Footer Section

| Column | Links |
|--------|-------|
| Product | Features, Pricing, Security, Integrations |
| Company | About, Contact, Partners, Press |
| Resources | Documentation, API Reference, Support, Status |
| Legal | Privacy Policy, Terms of Service, Cookie Policy, GDPR |

**FR-AUTH-015**: Footer shall include social links (Twitter/X, LinkedIn, GitHub).

### 3.3 Grid Layout

```
Desktop (lg:grid-cols-4):
┌─────────────────────────────────────────────────────────────┐
│                     WELCOME BANNER                          │
├───────────────────────────────────┬─────────────────────────┤
│      AI Daily Insights (3 cols)   │   Quick Actions (1 col) │
├───────────────────────────────────┼─────────────────────────┤
│                                   │   Today's Focus (1 col) │
│      Your Feed (3 cols, 2 rows)   ├─────────────────────────┤
│                                   │   Pinned (1 col)        │
└───────────────────────────────────┴─────────────────────────┘
```

### 3.4 Non-Functional Requirements

| NFR | Target | Measurement |
|-----|--------|-------------|
| **NFR-AUTH-001** | Page load < 500ms | Performance API |
| **NFR-AUTH-002** | All API endpoints < 200ms | Server metrics |
| **NFR-AUTH-003** | Lighthouse Performance ≥ 90 | Lighthouse CI |
| **NFR-AUTH-004** | Activity feed real-time (future) | WebSocket |
| **NFR-AUTH-005** | Skeleton loaders for all async data | Visual |
| **NFR-AUTH-006** | Dark mode support | Tailwind dark: classes |
| **NFR-AUTH-007** | Responsive: 1 col mobile → 4 cols desktop | CSS Grid |

---

## 4. Backend API Specification

### 4.1 tRPC Router: `home.*`

| Endpoint | Type | Input | Output | Status |
|----------|------|-------|--------|--------|
| `getWelcomeSummary` | Query | - | `WelcomeSummary` | Implemented |
| `getAIInsights` | Query | - | `AIInsightsResponse` | Implemented |
| `getActivityFeed` | Query | `ActivityFeedQuery` | `ActivityFeedResponse` | Implemented |
| `getDailyGoal` | Query | - | `DailyGoalResponse` | Implemented |
| `getPinnedItems` | Query | - | `PinnedItemsResponse` | Implemented |
| `pinItem` | Mutation | `PinItemInput` | `{ success, message }` | Implemented |
| `unpinItem` | Mutation | `UnpinItemInput` | `{ success, message }` | Implemented |
| `reorderPinnedItems` | Mutation | `ReorderPinnedItemsInput` | `{ success, message }` | Implemented |

### 4.2 Data Models

#### WelcomeSummary

```typescript
{
  userName: string;
  greeting: string;
  todayDate: Date;
  stats: {
    highPriorityTasksCount: number;
    newLeadsCount: number;
    dealClosingRateTrend: number; // percentage
    appointmentsToday: number;
    overdueTasksCount: number;
  };
}
```

#### AIInsight

```typescript
{
  id: string;
  type: 'warning' | 'opportunity' | 'reminder' | 'achievement';
  title: string;
  description: string;
  suggestedAction?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  actionUrl?: string | null;
  priority: 'low' | 'medium' | 'high';
  createdAt: Date;
}
```

#### ActivityFeedItem

```typescript
{
  id: string;
  type: 'mention' | 'call' | 'email' | 'task' | 'deal' | 'lead' | 'system' | 'ai';
  title: string;
  description: string;
  timestamp: Date;
  relativeTime: string;
  actor?: {
    id: string;
    name: string;
    avatarUrl?: string | null;
    initials: string;
  } | null;
  attachment?: {
    name: string;
    type: string;
    url?: string;
  } | null;
  badges?: { id: string; label: string; variant: string; }[];
  actionUrl?: string | null;
  isActionable: boolean;
}
```

#### DailyGoal

```typescript
{
  id: string;
  type: 'revenue' | 'calls' | 'meetings' | 'tasks' | 'custom';
  label: string;
  targetValue: number;
  currentValue: number;
  unit: string;
  progress: number; // 0-100
  remainingToTarget: number;
  remainingFormatted: string;
}
```

#### PinnedItem

```typescript
{
  id: string;
  entityType: 'lead' | 'contact' | 'account' | 'opportunity' | 'document' | 'report' | 'list';
  entityId: string;
  title: string;
  subtitle?: string | null;
  icon?: string | null;
  url: string;
  pinnedAt: Date;
  position: number;
}
```

---

## 5. Implementation Status

### 5.1 Completed

| Item | Task | Status |
|------|------|--------|
| PublicHomePage component | PG-001 | Done |
| AuthenticatedHomePage component | PG-129 | Done |
| HomePageContent conditional router | - | Done |
| home.router.ts tRPC endpoints | IFC-182 | Done |
| Zod validation schemas | IFC-182 | Done |
| Welcome banner with stats | IFC-182 | Done |
| AI insights generation | IFC-182 | Done |
| Activity feed from audit logs | IFC-182 | Done |
| Daily goal progress | IFC-182 | Done |
| Pinned items CRUD | IFC-182 | Done |
| Loading skeletons | - | Done |
| Dark mode support | - | Done |
| Responsive layout | - | Done |

### 5.2 TODO / Missing Features

| Item | Priority | Sprint | Task ID | Notes |
|------|----------|--------|---------|-------|
| Real-time activity feed (WebSocket) | High | 14 | IFC-069 | Depends on IFC-089, IFC-091, IFC-093, IFC-109 |
| Notifications integration | High | 13-14 | IFC-183 | Depends on IFC-003 |
| Customizable daily goals | Medium | 15 | PG-129 | User settings page |
| Drag & drop pinned items reorder | Medium | 15 | PG-129 | UX enhancement |
| Filter activity feed by type | Medium | 15 | PG-129 | UI filter component |
| AI insights from ML model | High | 16 | - | Replace rule-based logic |
| View Schedule button functionality | Low | 14 | PG-129 | Link to calendar |
| View All insights page | Low | 15 | PG-129 | New route needed |
| Real customer logos | Low | - | - | Marketing content |

---

## 9. Implementation Context for TODO Items

> Each item below provides the full context needed to start implementation.
> Current state, files to modify, approach, and acceptance criteria are included.

### 9.1 Real-time Activity Feed (IFC-069) — Sprint 14, High Priority

**Sprint Plan**: IFC-069 (Unified Activity Feed Service)
**Dependencies**: IFC-089, IFC-091, IFC-093, IFC-109 (entity routers must exist)
**Owner**: Backend Dev + Frontend Dev (STOA-Domain)

**Current State**:
- `home.getActivityFeed` in `apps/api/src/modules/home/home.router.ts:406-485` queries `auditLogEntry` table via polling
- The frontend (`AuthenticatedHomePage.tsx`) calls `trpc.home.getActivityFeed.useQuery()` — no real-time subscription
- WebSocket server already runs on port 3001 (`apps/ws/`)
- tRPC subscriptions infrastructure exists (see `apps/web/src/hooks/use-trpc-subscriptions.ts`)

**What Needs to Change**:

1. **Create `ActivityFeedService`** at `packages/application/src/services/ActivityFeedService.ts`
   - Unified service that aggregates activities across entities (leads, contacts, deals, tickets)
   - Must support both pull (query) and push (subscription) modes

2. **Create activity feed router** at `apps/api/src/modules/misc/activity-feed.router.ts`
   - New `activityFeed.subscribe` subscription procedure using tRPC subscriptions
   - Emits events when any entity is created/updated/deleted within tenant
   - Filter by activity type (lead, deal, task, etc.)

3. **Create shared component** at `apps/web/src/components/shared/activity-feed.tsx`
   - Reusable feed component used by both home page and entity detail pages
   - Accepts `mode: 'poll' | 'realtime'` prop
   - Graceful fallback to polling if WebSocket disconnects

4. **Update `AuthenticatedHomePage.tsx`** "Your Feed" section:
   - Replace `useQuery` with `useSubscription` for real-time
   - Keep `useQuery` as initial data loader, subscription for live updates
   - Animate new items sliding in from top

**Files to Create/Modify**:
```
packages/application/src/services/ActivityFeedService.ts  (NEW)
apps/api/src/modules/misc/activity-feed.router.ts         (NEW)
apps/web/src/components/shared/activity-feed.tsx           (NEW)
apps/web/src/components/home/AuthenticatedHomePage.tsx     (MODIFY - Your Feed section)
apps/api/src/modules/home/home.router.ts                  (MODIFY - delegate to service)
```

**Acceptance Criteria**:
- Feed loads < 500ms on initial query
- Real-time updates arrive via WebSocket within < 100ms of event
- Feed shows activities from all entity types (leads, contacts, deals, tickets)
- Graceful degradation to polling on WebSocket failure
- Test coverage >= 90%

---

### 9.2 Notifications Integration (IFC-183) — Sprint 13-14, High Priority

**Sprint Plan**: IFC-183 (Notifications tRPC Router)
**Dependencies**: IFC-003 (tRPC foundation)
**Owner**: Backend Dev (STOA-Domain)

**Current State**:
- No notifications router exists yet
- No `Notification` model in Prisma schema (needs to be added)
- The home page has no notifications bell/indicator
- The nav bar may have a bell icon placeholder but no functionality

**What Needs to Change**:

1. **Add Prisma model** in `packages/db/prisma/schema.prisma`:
   ```prisma
   model Notification {
     id        String   @id @default(cuid())
     userId    String
     tenantId  String
     type      String   // 'lead_assigned', 'task_due', 'deal_won', 'mention', etc.
     title     String
     body      String?
     read      Boolean  @default(false)
     actionUrl String?
     metadata  Json?
     createdAt DateTime @default(now())
     user      User     @relation(fields: [userId], references: [id])
     tenant    Tenant   @relation(fields: [tenantId], references: [id])
   }
   ```

2. **Create notifications router** at `apps/api/src/modules/notifications/notifications.router.ts`:
   - `notifications.list` — paginated, filtered by read/unread
   - `notifications.getUnreadCount` — badge count
   - `notifications.markAsRead` — single notification
   - `notifications.markAllAsRead` — batch mark
   - `notifications.delete` — remove notification
   - `notifications.getPreferences` — user notification settings
   - `notifications.updatePreferences` — toggle notification types
   - `notifications.onNew` — tRPC subscription for real-time

3. **Create validators** at `packages/validators/src/notifications.ts`

4. **Wire into home page** — add unread count badge to nav, optional notification dropdown

**Files to Create/Modify**:
```
packages/db/prisma/schema.prisma                                        (MODIFY - add Notification model)
apps/api/src/modules/notifications/notifications.router.ts              (NEW)
apps/api/src/modules/notifications/__tests__/notifications.router.test.ts (NEW)
packages/validators/src/notifications.ts                                (NEW)
apps/api/src/router.ts                                                  (MODIFY - add notifications router)
packages/validators/src/index.ts                                        (MODIFY - export notifications)
```

**Acceptance Criteria**:
- All endpoints < 200ms response time
- Real-time notification delivery < 100ms latency
- Test coverage >= 90%
- Unread count updates in real-time across browser tabs

---

### 9.3 Customizable Daily Goals — Sprint 15, Medium Priority

**Sprint Plan**: Part of PG-129 (Authenticated Home Page)
**Dependencies**: None (self-contained)

**Current State**:
- `home.getDailyGoal` in `home.router.ts:490-533` hardcodes `targetValue = 5000` (line 510)
- Goal type hardcoded to `revenue` (only tracks `opportunity.stage = 'CLOSED_WON'`)
- `DailyGoal` type supports `revenue | calls | meetings | tasks | custom` but only `revenue` is implemented
- Goal settings are NOT stored anywhere — no user preference for goal config

**What Needs to Change**:

1. **Add goal settings to user preferences** (stored in `User.preferences` JSON field):
   ```typescript
   preferences.dailyGoal = {
     type: 'revenue' | 'calls' | 'meetings' | 'tasks' | 'custom',
     targetValue: number,
     unit: string,
     label: string,
   }
   ```

2. **Update `home.getDailyGoal`** to read from user preferences and calculate based on goal type:
   - `revenue` → sum of `opportunity.value` where `stage = 'CLOSED_WON'` today
   - `calls` → count of `AuditLogEntry` where `eventType LIKE '%call%'` today
   - `meetings` → count of `Appointment` today
   - `tasks` → count of `Task` completed today
   - `custom` → user-defined metric

3. **Add goal settings endpoints**:
   - `home.updateDailyGoal` mutation — save goal config to preferences
   - Update validators in `packages/validators/src/home.ts`

4. **Add settings UI** in `AuthenticatedHomePage.tsx`:
   - Click on "Today's Focus" header or a settings icon
   - Modal/popover to select goal type and target value

**Files to Modify**:
```
apps/api/src/modules/home/home.router.ts            (MODIFY - read prefs, add mutation)
packages/validators/src/home.ts                     (MODIFY - add updateDailyGoal schema)
apps/web/src/components/home/AuthenticatedHomePage.tsx (MODIFY - add settings UI)
```

**Acceptance Criteria**:
- User can select from 5 goal types
- Target value persists across sessions (stored in preferences)
- Progress ring updates based on selected goal type
- Default remains $5,000 revenue for users who haven't customized

---

### 9.4 Drag & Drop Pinned Items Reorder — Sprint 15, Medium Priority

**Sprint Plan**: Part of PG-129 (Authenticated Home Page)
**Dependencies**: None (backend API already exists)

**Current State**:
- `home.reorderPinnedItems` mutation ALREADY EXISTS in `home.router.ts:663-699`
- Validator `reorderPinnedItemsInputSchema` ALREADY EXISTS in `packages/validators/src/home.ts`
- The frontend (`AuthenticatedHomePage.tsx`) renders pinned items as a static list
- No drag handle or sortable library is installed

**What Needs to Change**:

1. **Install `@dnd-kit/core` and `@dnd-kit/sortable`** (already used in deals kanban page — check `apps/web/src/app/deals/(list)/page.tsx`)

2. **Add `SortableContext` wrapper** around pinned items list in `AuthenticatedHomePage.tsx`:
   - Wrap items in `<DndContext>` + `<SortableContext>`
   - Each item gets `useSortable()` hook
   - Add drag handle icon (grip dots)
   - On `onDragEnd`, call `trpc.home.reorderPinnedItems.useMutation()`

3. **Add visual feedback**:
   - Drag overlay showing the item being moved
   - Drop placeholder indicator
   - Smooth CSS transitions

**Files to Modify**:
```
apps/web/src/components/home/AuthenticatedHomePage.tsx (MODIFY - add DnD to pinned section)
```

**Acceptance Criteria**:
- Items can be dragged and dropped to reorder
- New order persists after page refresh (API already handles storage)
- Touch-friendly on mobile (dnd-kit supports touch)
- Accessible: keyboard reorder with arrow keys

---

### 9.5 Filter Activity Feed by Type — Sprint 15, Medium Priority

**Sprint Plan**: Part of PG-129 (Authenticated Home Page)
**Dependencies**: None

**Current State**:
- The "Your Feed" section header shows a filter icon button (line ~446 in `AuthenticatedHomePage.tsx`)
- The filter button is decorative — it doesn't open a dropdown or filter anything
- `home.getActivityFeed` accepts `activityFeedQuerySchema` input but has no `type` filter
- Activity types are: `mention`, `call`, `email`, `task`, `deal`, `lead`, `ai`, `system`

**What Needs to Change**:

1. **Add `types` filter to `activityFeedQuerySchema`** in `packages/validators/src/home.ts`:
   ```typescript
   types: z.array(z.enum(['mention','call','email','task','deal','lead','ai','system'])).optional()
   ```

2. **Update `home.getActivityFeed`** in `home.router.ts` to filter `auditLogEntry` by event type when `types` is provided

3. **Add filter dropdown UI** in `AuthenticatedHomePage.tsx`:
   - Click filter icon → dropdown with checkboxes for each type
   - Active filters shown as chips/badges below header
   - "Clear all" button
   - Selected filters passed to `useQuery` input

**Files to Modify**:
```
packages/validators/src/home.ts                     (MODIFY - add types filter)
apps/api/src/modules/home/home.router.ts            (MODIFY - apply type filter)
apps/web/src/components/home/AuthenticatedHomePage.tsx (MODIFY - add filter UI)
```

**Acceptance Criteria**:
- Users can filter by one or more activity types
- Filter persists during pagination (Load More)
- Empty state shows "No [type] activity" when filter returns nothing
- Filter icon shows active indicator when filters are applied

---

### 9.6 AI Insights from ML Model — Sprint 16, High Priority

**Sprint Plan**: Depends on AI worker infrastructure (IFC-069, AI-SETUP tasks)
**Dependencies**: `apps/ai-worker/` must be operational

**Current State**:
- `home.getAIInsights` in `home.router.ts:285-401` uses rule-based logic:
  - Deals updated > 14 days ago → "Deal at Risk" warning
  - Leads with score >= 80 → "Hot Lead" opportunity
  - Overdue tasks → reminder
  - No items → "You're on track!" achievement
- No ML model, no LangChain, no AI worker integration
- Intelligence router exists at `apps/api/src/modules/intelligence/intelligence.router.ts`

**What Needs to Change**:

1. **Create AI insight generation chain** in `apps/ai-worker/src/chains/`:
   - LangChain chain that analyzes user's CRM data patterns
   - Input: recent leads, deals, tasks, emails for the user
   - Output: structured insights matching `AIInsight` schema
   - Confidence score for each insight

2. **Add caching layer** — AI insights should be generated periodically (e.g., hourly), not on every page load:
   - Store generated insights in DB or Redis
   - `home.getAIInsights` reads from cache
   - Background job regenerates insights

3. **Keep rule-based fallback** — if AI worker is unavailable, fall back to current rule-based logic

**Files to Create/Modify**:
```
apps/ai-worker/src/chains/insights.chain.ts         (NEW)
apps/api/src/modules/home/home.router.ts            (MODIFY - read from cache, fallback)
```

**Acceptance Criteria**:
- AI-generated insights are more contextual than rule-based
- Insights include confidence scores
- Fallback to rule-based when AI worker unavailable
- Insight generation < 2s (cached, not blocking page load)
- Human-in-the-loop: insights are reviewable via IFC-098

---

### 9.7 "View Schedule" Button — Sprint 14, Low Priority

**Current State**:
- Button exists in welcome banner, links to `/calendar`
- Calendar page may or may not exist at `apps/web/src/app/calendar/page.tsx`

**What Needs to Change**:
- Verify `/calendar` route exists; if not, create a minimal calendar page showing today's appointments
- Or redirect to `/tasks?view=calendar` if a task calendar view exists

**Files to Check/Create**:
```
apps/web/src/app/calendar/page.tsx    (CHECK if exists, CREATE if not)
```

---

### 9.8 "View All" Insights Page — Sprint 15, Low Priority

**Current State**:
- "View All" link exists in AI Daily Insights section header
- Currently links to `#` or no-op

**What Needs to Change**:
- Create `/insights` route showing full insight history
- Backend: add `home.getAllInsights` or `intelligence.getInsights` with pagination
- Show insight type filters, date range, and resolution status

**Files to Create**:
```
apps/web/src/app/insights/page.tsx                  (NEW)
apps/api/src/modules/home/home.router.ts            (MODIFY - add getAllInsights)
```

---

## 6. Testing Requirements

### 6.1 Unit Tests

| Test | Coverage Target |
|------|-----------------|
| home.router.ts | ≥ 90% |
| home.ts validators | ≥ 95% |
| Helper functions | ≥ 95% |

### 6.2 Integration Tests

| Test | Scope |
|------|-------|
| getWelcomeSummary | Returns correct stats for user |
| getAIInsights | Generates insights from real data |
| getActivityFeed | Pagination works correctly |
| pinItem / unpinItem | CRUD operations |

### 6.3 E2E Tests

| Test | Scenario |
|------|----------|
| Public home page | Visitor sees marketing content |
| Authenticated redirect | Logged in user sees dashboard |
| Insight card click | Navigates to entity |
| Quick action click | Navigates to creation form |
| Pin/unpin item | Item appears/disappears from sidebar |

---

## 7. Related Documents

| Document | Path |
|----------|------|
| Integration Backlog | `docs/design/integration-backlog.md` |
| Page Map & Flows | `docs/design/PAGE_MAP_AND_FLOWS.md` |
| Sitemap | `docs/design/sitemap.md` |
| Flow Index | `apps/project-tracker/docs/metrics/_global/flows/flow-index.md` |
| PRD Public Site Auth | `docs/planning/prd-public-site-auth.md` |
| ADR-020 | `docs/planning/adr/ADR-020-public-site-auth.md` |

---

## 8. Version History

| Date | Version | Changes |
|------|---------|---------|
| 2026-02-03 | 1.0.0 | Initial specification |
| 2026-02-05 | 1.1.0 | Added Section 9: detailed implementation context for all TODO items |
