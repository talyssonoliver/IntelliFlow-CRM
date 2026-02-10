# ADR-027: Authenticated Home Page Composition

**Status:** Accepted
**Date:** 2026-02-09
**Deciders:** Product Lead, Frontend Lead, Backend Lead
**Related Tasks:** PG-129, IFC-182, IFC-069, IFC-095

## Context and Problem Statement

The authenticated home page (`/`) is the daily start-of-work screen for all CRM users. It aggregates data from multiple bounded contexts (CRM, Intelligence, Platform) into a single personalized dashboard. We need to decide how to compose this cross-context view without violating hexagonal architecture boundaries, how to manage user preferences (pinned items, quick actions), and how the activity feed and AI insights integrate with their upstream services.

## Decision Drivers

- **Cross-Context Aggregation**: Home page reads from leads, deals, tasks, contacts, audit logs, and AI models.
- **Performance**: Dashboard must load in <1s P95 (TTI) despite multiple data sources.
- **Personalization**: Users customize quick actions, pin items, and set daily goals.
- **Extensibility**: Future widgets (notifications, calendar, AI chat) must integrate without rewriting the page.
- **Offline Resilience**: Sections should load independently; one failing service must not block the entire page.

## Considered Options

- **Option 1**: Single monolithic tRPC query returning all dashboard data in one response.
- **Option 2**: Parallel independent tRPC queries per section with client-side composition.
- **Option 3**: Backend-for-Frontend (BFF) aggregation layer that composes data server-side.

## Decision Outcome

Chosen option: **"Parallel independent tRPC queries per section with client-side composition"**, because it provides independent loading states per section, allows partial rendering when one service is slow or unavailable, keeps each endpoint simple and testable, and leverages React Query's built-in parallelism and caching.

### Positive Consequences

- **Independent loading**: Each section renders its own skeleton; no full-page blocking.
- **Fault isolation**: AI insights endpoint failing doesn't prevent stats or feed from loading.
- **Simple endpoints**: Each tRPC procedure is small, focused, and independently testable.
- **Cache granularity**: React Query caches each section independently with appropriate stale times.
- **Progressive enhancement**: Sections can be feature-flagged or A/B tested independently.

### Negative Consequences

- **Multiple round-trips**: 5-6 parallel requests instead of 1; mitigated by HTTP/2 multiplexing and tRPC batching.
- **Client coordination**: Loading state management is client-side responsibility.
- **Data consistency**: Slight timing differences between sections; acceptable for dashboard use case.

## Implementation Notes

### tRPC Endpoints (home router)

| Endpoint | Data | Stale Time | Error Handling |
|----------|------|------------|----------------|
| `home.getWelcomeSummary` | User name, greeting, task/lead/meeting counts | 30s | Show cached or "Welcome back" fallback |
| `home.getAIInsights` | Deals at risk, hot leads, overdue reminders | 5min | Hide section with "Insights unavailable" |
| `home.getActivityFeed` | Paginated audit log entries, cursor-based | 30s | Show empty state |
| `home.getDailyGoal` | Revenue target vs actual, progress % | 60s | Show "Goals loading" skeleton |
| `home.getPinnedItems` | User's pinned entities from preferences JSON | 5min | Show empty pinned area |

### User Preferences Storage

Pinned items and quick action configuration stored in `User.preferences` (JSON field in database). Schema:

```typescript
interface UserHomePreferences {
  pinnedItems: { entityType: string; entityId: string; title: string }[];
  enabledQuickActions: string[];  // Action IDs from ALL_QUICK_ACTIONS
  pinnedNavGroups: string[];      // Navigation group IDs
}
```

Chosen over a separate table because: preferences are user-scoped (no cross-user queries), the JSON is small (<1KB), and it avoids schema migration for preference changes.

### Activity Feed Architecture

Current implementation reads from `AuditLogEntry` table. IFC-069 will introduce a dedicated `ActivityFeed` model that aggregates events from leads, deals, contacts, tasks, and AI actions into a unified timeline. Until IFC-069 is complete, the feed falls back to audit log entries.

### AI Insights Source

Insights are computed on-demand from existing data (not a separate AI call):
- **Deals at risk**: Opportunities in pipeline where `daysInStage > 2 * avgDaysInStage`
- **Hot leads**: Leads with AI score > 80 created in last 7 days
- **Overdue reminders**: Tasks past due date assigned to current user
- **Achievements**: Daily goal milestones (computed from `getDailyGoal` data)

Future: IFC-095 will add ML-based predictive insights.

### Section Independence Pattern

```tsx
// Each section is a self-contained component with its own query
function AIInsightsSection() {
  const { data, isLoading, error } = trpc.home.getAIInsights.useQuery();
  if (error) return <InsightsUnavailable />;
  if (isLoading) return <InsightsSkeleton />;
  return <InsightsList insights={data} />;
}
```

## Verification

- Lighthouse TTI <1s on home route with all sections loaded.
- Each section renders independently within 500ms even when other endpoints are slow (tested with artificial 3s delay).
- Pinned items persist across sessions and respect entity deletion (stale pins show "Item unavailable").
- Activity feed filters work without re-fetching other sections.

## Links

- [FLOW-047: Authenticated Home Page](../../apps/project-tracker/docs/metrics/_global/flows/FLOW-047.md)
- [PRD: Home Page](../prd-home-page.md)
- Related: [ADR-001 Modern Stack](./ADR-001-modern-stack.md)
- Related: [ADR-004 Tenancy](./ADR-004-tenant-isolation.md)
