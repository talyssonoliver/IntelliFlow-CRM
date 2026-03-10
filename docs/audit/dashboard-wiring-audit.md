# Dashboard (`/dashboard`) — Wiring Audit

**Pages**: `apps/web/src/app/dashboard/DashboardClient.tsx`,
`apps/web/src/app/dashboard/customize/page.tsx`,
`apps/web/src/app/dashboard/new/page.tsx`
**Home Page**: `apps/web/src/components/home/AuthenticatedHomePage.tsx` (`/`)
**API**: `home.router.ts`, `analytics.router.ts`, `activity-feed.router.ts`,
`intelligence.router.ts`, `task.router.ts`, `ticket.router.ts`
**Date**: 2026-03-08

---

## Summary

| Category                     | Wired | Partially Wired | Not Wired |
| ---------------------------- | ----- | --------------- | --------- |
| Widget Data (18 widgets)     | 8     | 0               | 10        |
| Widget Actions/Controls      | 0     | 0               | 5         |
| Home Page Queries            | 5     | 0               | 0         |
| Home Page Mutations          | 3     | 0               | 0         |
| Home Page Actions            | 6     | 0               | 0         |
| Customize Page               | 2     | 1               | 2         |
| Add New Page Links (28)      | 4     | 0               | 24        |
| Layout Persistence           | 0     | 1               | 0         |
| Prisma Models (unused)       | 0     | 0               | 2         |
| **Total**                    | **28**| **2**           | **43**    |

---

## Root Causes

### A — Widgets using hardcoded/mock data instead of real API (10 widgets)

The widget grid renders 18 widget types. Only 7 query real backend data. The
remaining 10 display hardcoded static values. ~~1 had a broken import~~ (fixed
2026-03-09 — was a false alarm; file existed outside `src/`, now relocated).
The `RecentActivityWidget` still shows empty because it lacks an initial data
fetch. Backend procedures exist (analytics, ticket.stats) that could serve this
data but were never wired.

### B — Dead links on `/dashboard/new` (24 of 28 links)

The "Add New" record creation hub links to 28 routes. Only 4 exist as Next.js
pages. The remaining 24 navigate to 404 pages. No validation or route existence
check is performed.

### C — Layout persistence is localStorage-only

Widget layout customization is stored in `localStorage`. No server-side
persistence via the existing `DashboardConfig` Prisma model. Layout is lost on
browser/device switch or localStorage clear.

### D — Prisma models defined but never exposed via API

`DashboardConfig` and `KPIDefinition` models exist in the Prisma schema but
have zero tRPC procedures. The frontend customize page re-implements layout
storage in localStorage instead.

---

## Section 1: Widget Data Sources

### Live Data (7 widgets)

| Widget | Type Key | Data Source | Notes |
|--------|----------|-------------|-------|
| `TotalLeadsWidget` | `total-leads` | `trpc.lead.stats` | SSR prefetch via `'use cache'` + `cacheLife(DASHBOARD_STATS)` |
| `UpcomingTasksWidget` | `upcoming-tasks` | `api.task.list` | Sorted by dueDate, limit 3, PENDING+IN_PROGRESS |
| `DealsWonWidget` | `deals-won` | `trpc.analytics.dealsWonTrend` | Auth-gated; always `months: 6` (dropdown non-functional) |
| `PendingTasksWidget` | `pending-tasks` | `api.task.list` | Status PENDING, limit 3 |
| `UpcomingEventsWidget` | `upcoming-events` | `api.appointments.list` | Delegates to `UpcomingEventsCard` |
| `TrafficSourcesWidget` | `traffic-sources` | `trpc.analytics.trafficSources` | Auth-gated |
| `GrowthTrendsWidget` | `growth-trends` | `trpc.analytics.growthTrends` | Auth-gated; `metric: 'revenue', months: 12` |

### ~~Broken Import~~ Fixed (1 widget)

| Widget | Type Key | Status |
|--------|----------|--------|
| `RecentActivityWidget` | `recent-activity` | **FIXED** (2026-03-09). Originally imported from `../../../../hooks/use-subscription` which resolved to `apps/web/hooks/use-subscription.ts` (outside `src/`). File existed and exports were correct — audit finding was a false alarm (path mismatch in analysis). Relocated to `apps/web/src/hooks/use-subscription.ts` for code hygiene; import updated to `@/hooks/use-subscription`. **Remaining issue**: widget is subscription-only (no initial data fetch) — always shows "No recent activity yet" until a WebSocket event arrives. Needs a `useQuery` call to `analytics.recentActivity` or `activityFeed.getUnifiedFeed` to load historical data on mount. |

### Hardcoded / Mock Data (10 widgets)

| # | Widget | Type Key | Hardcoded Value | Backend Procedure Available |
|---|--------|----------|----------------|---------------------------|
| 1 | `SalesRevenueWidget` | `sales-revenue` | `$45,200`, `"On track"` badge | `analytics.getSalesMetrics` → real revenue |
| 2 | `ActiveDealsWidget` | `active-deals` | `18` | `analytics.getOverview` → real opp count |
| 3 | `OpenTicketsWidget` | `open-tickets` | `{total: 42, urgent: 3, breached: 1}` via `useTicketMetrics` with `TODO: Replace with real API` | `ticket.stats` → real DB aggregation |
| 4 | `PipelineSummaryWidget` | `pipeline-summary` | Static array: `$12,400 / $34,200 / $120,000 / $40,000` | `analytics.getConversionFunnel` → real stage data |
| 5 | `RevenueWidget` | `revenue` | `$124,500 +12.5%`, static bar chart | `analytics.getSalesMetrics` → real revenue |
| 6 | `ActiveLeadsWidget` | `active-leads` | `1,240` | `analytics.getLeadMetrics` → real total |
| 7 | `ConversionRateWidget` | `conversion-rate` | `3.2%`, `65%` progress bar | `analytics.getConversionFunnel` → real rate |
| 8 | `PipelineWidget` | `pipeline` | Same static data as `PipelineSummaryWidget` | `analytics.getConversionFunnel` |
| 9 | `TopPerformersWidget` | `top-performers` | Static: Sarah Johnson, Mike Chen, Emily Davis, James Wilson | No procedure exists — would need new `analytics.getTopPerformers` |
| 10 | `TeamChatWidget` | `team-chat` | 3 fake messages; `<input>` has no handler | No chat procedure exists — would need `chat.getMessages` / `chat.sendMessage` |

---

## Section 2: Widget Action Handlers

| # | Widget | Control | Current State | Fix |
|---|--------|---------|---------------|-----|
| 1 | `DealsWonWidget` | `<select>` "Last 6 Months" / "Last 12 Months" | No `onChange` — query always uses `months: 6` | Wire `onChange` to update query param |
| 2 | `PipelineSummaryWidget` | "more_horiz" icon button | No `onClick` handler — dead button | Either add menu or remove button |
| 3 | `RevenueWidget` | "This Week" / "This Month" toggle buttons | No `onClick` handlers — purely decorative | Wire to filter query by time range |
| 4 | `TeamChatWidget` | `<input type="text" placeholder="Type a message...">` | No `onChange`, no `onSubmit` — completely non-functional | Wire to chat mutation or remove widget |
| 5 | `OpenTicketsWidget` | None (but TODO comment) | `useTicketMetrics` hook returns hardcoded values | Replace with `trpc.ticket.stats` call |

---

## Section 3: Home Page (`/`) — AuthenticatedHomePage

All wired to real API. This is the strongest surface.

### Queries (all live)

| Query | Procedure | Status |
|-------|-----------|--------|
| Welcome data | `trpc.home.getWelcomeSummary` | Live — parallel Prisma queries |
| AI Insights | `trpc.home.getAIInsights` | Live — cache-aside with heuristic fallback |
| Daily Goal | `trpc.home.getDailyGoal` | Live — user preferences + per-type aggregation |
| Pinned Items | `trpc.home.getPinnedItems` | Live — JSON in user preferences, entity existence verified |
| Activity Feed | `trpc.activityFeed.getUnifiedFeed` (infinite) | Live — cursor pagination, 60s poll, WebSocket invalidation |

### Mutations (all live)

| Mutation | Procedure | Status |
|----------|-----------|--------|
| Unpin item | `trpc.home.unpinItem` | Live — invalidates `getPinnedItems` |
| Reorder pins | `trpc.home.reorderPinnedItems` | Live — invalidates `getPinnedItems` |
| Update daily goal | `trpc.home.updateDailyGoal` | Live — read-merge-write on user preferences |

### Actions (all wired)

| Action | Target | Status |
|--------|--------|--------|
| View Schedule | `<Link href="/calendar">` | Page exists |
| Go to Dashboard | `<Link href="/dashboard">` | Page exists |
| AI Insights "View All" | `<Link href="/agent-approvals/insights">` | Page exists |
| Quick Actions settings | Opens `EditQuickActionsSheet` | Functional |
| Today's Focus settings | Opens `GoalSettingsModal` | Functional |
| Pinned edit button | Opens `EditPinnedNavigationSheet` | Functional |

### Loading/Error/Empty States (all present)

| State | Implementation |
|-------|----------------|
| Welcome banner | Inline shimmer pulse |
| AI Insights | `InsightsSkeleton` (2 pulse rows); "No insights at this time." empty |
| Today's Focus | `GoalSkeleton` (circular placeholder) |
| Pinned section | `PinnedSkeleton` (2 rows); "No pinned items" empty |
| Activity Feed | 4-row skeleton; error icon state; "No recent activity" empty; "Load More" / "You're all caught up" footer |
| Global auth | Spinner + "Loading..." centered |

---

## Section 4: Customize Page (`/dashboard/customize`)

| Feature | Status | Details |
|---------|--------|---------|
| Load layout from localStorage | **Wired** | Falls back to `defaultWidgets` |
| Save layout to localStorage | **Wired** | `handleSave()` → `localStorage.setItem` → navigate |
| Drag-and-drop reorder | **Wired** | `@dnd-kit/core` with `handleDragEnd` → `arrayMove` |
| Add widget from library | **Wired** | `handleAddWidget(template)` → `crypto.randomUUID()` |
| Delete widget | **Wired** | `handleDeleteWidget(id)` |
| Resize widget | **Wired** | `handleResizeWidget(id, colSpan, rowSpan)` |
| Widget settings gear | **Stub** | `console.log('Settings for widget:', widget)` — no modal |
| WidgetDropZone click | **Dead** | `onClick={() => {}}` — empty handler |
| Dashboard sidebar switching | **Partial** | `useState('overview')` — local state only, no persistence, switching dashboards has no effect on widget grid |
| Server-side persistence | **Not wired** | `DashboardConfig` Prisma model unused |
| Per-widget config editing | **Not wired** | No UI for widget-specific settings |

---

## Section 5: Add New Page (`/dashboard/new`) — Dead Links

**4 live, 24 dead.** All content is static — no API calls, no auth guard.

### Record Type Cards (primary section)

| # | Label | href | Exists? |
|---|-------|------|---------|
| 1 | New Lead | `/leads/new` | YES |
| 2 | New Contact | `/contacts/new` | YES |
| 3 | New Account | `/accounts/new` | **NO** — no `accounts/new/` page |
| 4 | New Deal | `/deals/new` | **NO** — no `deals/new/` page |
| 5 | New Ticket | `/tickets/new` | YES |
| 6 | New Task | `/tasks/new` | **NO** — no `tasks/new/` page |
| 7 | New Campaign | `/campaigns/new` | **NO** — no `campaigns/` directory |
| 8 | New Document | `/documents/upload` | **NO** — actual page is `documents/(list)/new/` (path mismatch) |

### Other Actions (secondary section)

| # | Label | href | Exists? | Nearest Real Route |
|---|-------|------|---------|--------------------|
| 1 | Send Email | `/emails/compose` | **NO** | `/email` (singular, no `/compose`) |
| 2 | Log Call | `/calls/new` | **NO** | — |
| 3 | Schedule Meeting | `/calendar/new` | YES | — |
| 4 | Start Chat | `/chats/new` | **NO** | — |
| 5 | Add Note | `/notes/new` | **NO** | — |
| 6 | AI Insights | `/ai/insights` | **NO** | `/agent-approvals/insights` |
| 7 | Create Quote | `/quotes/new` | **NO** | — |
| 8 | Send Survey | `/surveys/new` | **NO** | — |
| 9 | Create Report | `/reports/builder` | **NO** | — |
| 10 | Convert Lead | `/leads/convert` | **NO** | — |
| 11 | New Workflow | `/automation/workflows/new` | **NO** | — |
| 12 | New Product | `/products/new` | **NO** | — |
| 13 | New Template | `/templates/new` | **NO** | — |
| 14 | Invite User | `/admin/users/new` | **NO** | — |
| 15 | Sign Document | `/documents/sign` | **NO** | — |
| 16 | New Integration | `/admin/integrations` | **NO** | `/settings/integrations` |
| 17 | Knowledge Article | `/support/kb/new` | **NO** | — |
| 18 | Request Approval | `/approvals/new` | **NO** | `/agent-approvals` |
| 19 | Import Records | `/import` | **NO** | — |
| 20 | Export Records | `/export` | **NO** | — |

---

## Section 6: Backend Procedures — Unused by Dashboard

These procedures exist and return real data but are not consumed by any
dashboard widget or page:

| Procedure | What it returns | Potential widget |
|-----------|----------------|-----------------|
| `analytics.getOverview` | Totals + MoM deltas for leads, revenue, opps, contacts, winRate | `SalesRevenueWidget`, `ActiveDealsWidget`, `ConversionRateWidget` |
| `analytics.getSalesMetrics` | Pipeline value, win rate, avg deal size, avg cycle days, revenue | `RevenueWidget`, `SalesRevenueWidget` |
| `analytics.getLeadMetrics` | Total + bySource + byStatus + conversionRate | `ActiveLeadsWidget`, `ConversionRateWidget` |
| `analytics.getConversionFunnel` | 7-stage funnel with per-stage metrics | `PipelineSummaryWidget`, `PipelineWidget` |
| `analytics.getTimeSeriesData` | Time-bucketed data points (day/week/month) | `RevenueWidget` time-range toggle |
| `analytics.recentActivity` | Audit log entries with user join | `RecentActivityWidget` (currently broken) |
| `ticket.stats` | Ticket counts by status, priority, SLA | `OpenTicketsWidget` |
| `intelligence.getSentimentDashboard` | Sentiment stats + distribution + trends | Could power a sentiment widget |
| `system.metrics` | Process metrics (note: request/latency fields are placeholder zeros) | Could power a system health widget |
| `integrations.getDashboardConfig` | Widget/panel config (note: **hardcoded** inline, not from DB) | Could drive customizable widget definitions |

---

## Section 7: Prisma Models Without API Exposure

| Model | Table | Fields | Status |
|-------|-------|--------|--------|
| `DashboardConfig` | `dashboard_configs` | `userId`, `tenantId`, `name`, `widgets` (JSON), `filters` (JSON), `isDefault`, `layout` | **Never exposed** — no tRPC procedure reads/writes this model. Frontend uses localStorage instead. |
| `KPIDefinition` | `kpi_definitions` | `tenantId`, `name`, `description`, `calculationType`, `targetValue`, `unit`, `dataSource` | **Never exposed** — no tRPC procedure. Could power configurable KPI widgets. |

---

## Section 8: ~~Broken Import~~ Relocated — `RecentActivityWidget`

**File**: `apps/web/src/components/dashboard/widgets/RecentActivityWidget.tsx`

**Status: FIXED (2026-03-09)**

The original audit incorrectly identified this as a broken import. The file
`apps/web/hooks/use-subscription.ts` existed outside `src/` and the relative
import `../../../../hooks/use-subscription` resolved correctly to it. Both
`useActivitySubscription` and `useRealtimeHealth` were exported from that file.
TypeScript compilation passed clean.

**What was done:**
- Relocated `apps/web/hooks/use-subscription.ts` →
  `apps/web/src/hooks/use-subscription.ts` (canonical location)
- Updated component import to `@/hooks/use-subscription`
- Updated test mock paths across 5 test files
- Deleted old files at `apps/web/hooks/`
- All 67 tests pass

**Remaining issue — empty state**: The widget uses subscription-only data
(`useActivitySubscription` listens for WebSocket push events). There is no
`useQuery` call to load historical activities on mount, so the widget always
shows "No recent activity yet" until a real-time event arrives. Fix: add an
initial data fetch from `analytics.recentActivity` or
`activityFeed.getUnifiedFeed`.

---

## Section 9: localStorage-Only Persistence

| What is persisted | Storage | Risk |
|-------------------|---------|------|
| Widget layout (type, position, colSpan, rowSpan) | `localStorage('dashboard-layout')` | Lost on device switch, incognito, or clear |
| Quick action preferences | `localStorage('intelliflow:quick-actions')` | Same |
| Pinned navigation groups | `localStorage('intelliflow:pinned-groups')` | Same |
| Active dashboard selection | `useState('overview')` — component state | Lost on every navigation |

**Note**: Pinned **items** (the entity pins on the home page) ARE server-side
persisted in `User.preferences` JSON. Only the pinned **navigation group
visibility** preferences are localStorage.

---

## Fix Strategy

### Phase 1 — ~~Critical~~ DONE: Fix broken widget (1 widget)

~~Fix `RecentActivityWidget` broken import.~~ **DONE (2026-03-09)** — import
was not actually broken (false alarm). File relocated from
`apps/web/hooks/use-subscription.ts` to `apps/web/src/hooks/use-subscription.ts`
for code hygiene. Import updated to `@/hooks/use-subscription`.

**Still needed**: Add initial data fetch to `RecentActivityWidget` so it
doesn't show empty on mount. Wire `analytics.recentActivity` or
`activityFeed.getUnifiedFeed` as the initial query, then overlay real-time
subscription events on top.

### Phase 2 — High: Wire 10 hardcoded widgets to real APIs (~2 hours)

Each widget needs its hardcoded values replaced with a `trpc.*.useQuery` call.
Backend procedures already exist for 8 of 10.

| Widget | Wire to |
|--------|---------|
| `SalesRevenueWidget` | `analytics.getSalesMetrics` → `.revenue` |
| `ActiveDealsWidget` | `analytics.getOverview` → `.opportunities.total` |
| `OpenTicketsWidget` | `ticket.stats` → `.total`, `.urgent`, `.breached` |
| `PipelineSummaryWidget` | `analytics.getConversionFunnel` → stage data |
| `PipelineWidget` | Same as above |
| `RevenueWidget` | `analytics.getTimeSeriesData` → bar chart data |
| `ActiveLeadsWidget` | `analytics.getLeadMetrics` → `.total` |
| `ConversionRateWidget` | `analytics.getConversionFunnel` → `.conversionRate` |
| `TopPerformersWidget` | **Needs new procedure** — `analytics.getTopPerformers` |
| `TeamChatWidget` | **Needs new procedure** — or remove widget entirely |

### Phase 3 — Medium: Wire widget action handlers (~30 min)

| Widget | Fix |
|--------|-----|
| `DealsWonWidget` `<select>` | Add `onChange` → update `months` query param |
| `PipelineSummaryWidget` menu button | Add dropdown menu or remove button |
| `RevenueWidget` time toggles | Wire to `getTimeSeriesData` with date range |
| `TeamChatWidget` input | Wire to chat mutation or remove widget |
| `OpenTicketsWidget` | Replace `useTicketMetrics` mock with `trpc.ticket.stats` |

### Phase 4 — Medium: Fix `/dashboard/new` dead links (~1 hour)

Options per link:
1. **Fix href** to point to existing route (4 links have near-matches)
2. **Hide links** for routes that don't exist yet (show only when route exists)
3. **Add `disabled` state** with tooltip "Coming soon" for planned features

Quick wins (fix href only):
| Current href | Fix to |
|-------------|--------|
| `/documents/upload` | `/documents/new` |
| `/emails/compose` | `/email` |
| `/ai/insights` | `/agent-approvals/insights` |
| `/admin/integrations` | `/settings/integrations` |

### Phase 5 — Low: Server-side layout persistence (~2 hours)

Wire `DashboardConfig` Prisma model to new tRPC procedures:
- `dashboard.getLayout` — read user's saved layout
- `dashboard.saveLayout` — upsert layout
- `dashboard.resetLayout` — delete custom layout, fall back to default

Replace `localStorage` calls in `DashboardClient.tsx` and `customize/page.tsx`.

### Phase 6 — Low: Customize page polish (~1 hour)

- Implement widget settings modal (currently `console.log` stub)
- Wire `WidgetDropZone` click to add widget
- Persist active dashboard selection (sidebar switching)
- Wire `KPIDefinition` model for user-configurable KPI widgets

---

## Cross-Reference: Existing Tasks

| Gap | Related Task | Sprint | Status | Notes |
|-----|-------------|--------|--------|-------|
| Dead sidebar links (overlaps `/dashboard/new`) | IFC-232 | 16 | Backlog | 23 sidebar links → 404. Many overlap with `/dashboard/new` dead links. |
| Unused backend endpoints | IFC-233 | 20 | Backlog | ~20 unused tRPC procedures — several are the analytics endpoints that should power dashboard widgets. |
| Settings pages hardcoded | IFC-234 | 18 | Backlog | Dashboard customize settings stub is part of this pattern. |

---

## Verification

After all fixes:
1. All 18 widgets should display real data (zero hardcoded values)
2. All widget action controls should be functional or removed
3. `RecentActivityWidget` should render without import errors
4. `/dashboard/new` should have zero 404 links
5. Widget layout should persist server-side via `DashboardConfig`
6. Customize page settings gear should open a configuration modal
