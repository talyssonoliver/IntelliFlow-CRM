# Hot-Path Query Cacheability Audit

Generated: 2026-04-12

## Summary

- **Total query procedures in app:** 110 (distinct named procedures across all routers; 233 raw `.query(` call-sites including chained inputs)
- **Already cached:** 19 (wrappers in `apps/web/src/lib/cached-queries/`)
- **High-priority to add:** 14
- **Medium-priority:** 11
- **Not recommended to cache:** 13

---

## Already Cached ✅

These procedures have a `'use cache'` wrapper in `apps/web/src/lib/cached-queries/`.

| Procedure | Cached at | cacheLife | Per-user tagged |
|---|---|---|---|
| `home.getWelcomeSummary` | `home-queries.ts → fetchWelcomeSummary` | `minutes` (60 s) | Yes |
| `home.getAIInsights` | `ai-insights-queries.ts → fetchAIInsights` | `minutes` (60 s) | Yes |
| `notifications.getUnreadCount` | `notifications-queries.ts → fetchUnreadCount` | `seconds` (30 s) | Yes |
| `activityFeed.getUnifiedFeed` | `activity-feed-queries.ts → fetchUnifiedFeed` | `seconds` (30 s) | Yes |
| `moduleAccess.getEnabledModules` | `module-access-queries.ts → fetchEnabledModules` | `hours` (1 h) | Yes |
| `lead.stats` | `lead-queries.ts → fetchLeadStats` | `minutes` (60 s) | Yes |
| `lead.list` (page 1) | `lead-queries.ts → fetchLeadsFirstPage` | `minutes` (60 s) | Yes |
| `contact.stats` | `contact-queries.ts → fetchContactStats` | `minutes` (60 s) | Yes |
| `contact.list` (page 1) | `contact-queries.ts → fetchContactsFirstPage` | `minutes` (60 s) | Yes |
| `account.stats` | `account-queries.ts → fetchAccountStats` | `minutes` (60 s) | Yes |
| `ticket.list` (page 1) | `ticket-queries.ts → fetchTicketsFirstPage` | `minutes` (60 s) | Yes |
| `ticket.stats` | `ticket-queries.ts → fetchTicketStats` | `minutes` (60 s) | Yes |
| `task.list` (page 1) | `task-queries.ts → fetchTasksFirstPage` | `minutes` (60 s) | Yes |
| `task.stats` | `task-queries.ts → fetchTaskStats` | `minutes` (60 s) | Yes |
| `opportunity.list` | `deal-queries.ts → fetchDeals` | `minutes` (60 s) | Yes |
| `opportunity.forecast` | `deal-queries.ts → fetchDealForecast` | `minutes` (60 s) | Yes |
| `appointments.list` | `calendar-queries.ts → fetchAppointmentsList` | `minutes` (60 s) | Yes |
| `appointments.stats` | `calendar-queries.ts → fetchAppointmentStats` | `minutes` (60 s) | Yes |
| `analytics.getOverview` | `analytics-queries.ts → fetchAnalyticsOverview` | `minutes` (60 s) | Yes |
| `analytics.getConversionFunnel` | `analytics-queries.ts → fetchConversionFunnel` | `hours` (1 h) | Yes |

**Adoption gap:** 10 of the 20 cached wrappers are exercised in SSR `page.tsx` files.
The remaining 10 exist in `cached-queries/` but are only called client-side via
`useQuery`. Until a Server Component calls the wrapper, the cache entry is never
pre-populated — each user's first render still hits the DB.

| Wrapper exists but NOT used in any page.tsx SSR path | Notes |
|---|---|
| `fetchUnreadCount` | Only called in `NotificationBell` (client component) |
| `fetchUnifiedFeed` | No server-side caller found |
| `fetchEnabledModules` | No server-side caller found |
| `fetchTicketsFirstPage` | Wrapper exists; no SSR call in `/tickets` page |
| `fetchTasksFirstPage` | Wrapper exists; no SSR call in `/tasks` page |
| `fetchDeals` | Wrapper exists; no SSR call in `/deals` page |
| `fetchDealForecast` | Wrapper exists; no SSR call in `/deals/forecast` page |
| `fetchAppointmentsList` | Wrapper exists; no SSR call in `/calendar` page |
| `fetchAppointmentStats` | Wrapper exists; no SSR call in `/calendar` page |
| `fetchAnalyticsOverview` | Wrapper exists; no SSR call in `/analytics` page |
| `fetchConversionFunnel` | Wrapper exists; no SSR call in `/analytics` page |

---

## High Priority to Cache 🔥

Called on page load (component mount), returns per-user data, has no cached wrapper.
These fire unconditionally on every navigation to the page.

| Procedure | Called from | Recommended cacheLife | Estimated data size | Notes |
|---|---|---|---|---|
| `home.getDailyGoal` | `AuthenticatedHomePage.tsx:432` — fires on every home visit | `minutes` (60 s) | ~200 B | Reads user preferences + today's goal count; changes at most once/day per user. High-frequency home page hit. |
| `home.getPinnedItems` | `AuthenticatedHomePage.tsx:439` — fires on every home visit | `minutes` (60 s) | ~1–2 KB | Pinned entity list; changes only on explicit pin/unpin action. Already has mutation path for invalidation. |
| `notifications.list` | `NotificationsSummaryWidget.tsx:22`, `NotificationBell.tsx:56` — renders in header on every page | `seconds` (30 s) | ~5 KB | Appears in global header. Every page navigation triggers a fresh fetch. High-impact: pair with `getUnreadCount` which is already cached. |
| `opportunity.getPipeline` | `PipelineSummaryWidget.tsx:16` — dashboard widget, loads on every dashboard visit | `minutes` (60 s) | ~3–8 KB | Aggregated stage values; changes on deal stage mutations. Dashboard is the most-visited page. |
| `analytics.getLeadMetrics` | `ConversionRateWidget.tsx:15` — dashboard widget | `minutes` (60 s) | ~2 KB | Fires with a date range; moderately expensive aggregation. Consider tagging with `analytics:overview`. |
| `analytics.growthTrends` | `GrowthTrendsWidget.tsx:15`, `SavedReportView.tsx:157` | `hours` (1 h) | ~4 KB | Historical aggregation; rarely changes intra-session. Same tag namespace as `analytics:overview`. |
| `analytics.trafficSources` | `TrafficSourcesWidget.tsx:15`, `SavedReportView.tsx:162` | `hours` (1 h) | ~2 KB | Lead-source distribution; computed from all-time data. Very stable. |
| `analytics.topPerformers` | `TopPerformersWidget.tsx:8` — dashboard widget | `hours` (1 h) | ~3 KB | Leaderboard ranked by closed-won value; changes on deal close only. |
| `analytics.dealsWonTrend` | `DealsWonWidget.tsx:15` — dashboard widget | `minutes` (60 s) | ~3 KB | Time-series chart; moderate update frequency. |
| `analytics.leadStats` | `analytics/(list)/page.tsx:42` — fires on analytics page load | `minutes` (60 s) | ~1 KB | Already backed by `lead.stats` cached; duplication of aggregation work. |
| `analytics.getSalesMetrics` | `SavedReportView.tsx:147` — on analytics save/view | `minutes` (60 s) | ~3 KB | Sales funnel aggregation per date range; expensive query. |
| `moduleAccess.getPlans` | `upgrade/page.tsx:122`, `ModulePaywall.tsx:44` — plan comparison panel | `hours` (1 h) | ~5 KB | **Fully static** — returns in-memory `PLAN_TIERS` constants; no DB access at all. Zero cost to cache, but currently un-cached and called on every plan/paywall render. |
| `user.getProfile` | `components/billing/billing-settings.tsx:23` (via `getBillingInformation` which calls profile internally); also any user-settings page | `hours` (1 h) | ~1 KB | User profile changes infrequently. Tag with `user:{userId}` for logout/update invalidation. |
| `billing.getSubscription` | `billing-portal.tsx:60`, `subscription-manager.tsx:699`, `upgrade-flow.tsx:404`, `cancel-flow.tsx:489`, `plan-comparison.tsx:37` — 5 separate components all fire independently | `minutes` (60 s) | ~2 KB | Called from 5 different billing components without deduplication. A single cached wrapper would collapse all 5 into one upstream call per minute. |

---

## Medium Priority 🟡

Called on page load but with lower traffic, or partially mitigated by React Query deduplication.

| Procedure | Called from | Recommended cacheLife | Estimated data size | Notes |
|---|---|---|---|---|
| `billing.getPaymentMethods` | `billing-portal.tsx:196`, `payment-methods.tsx:541` | `minutes` (60 s) | ~2 KB | Two callers; changes only on card add/remove. Stripe API call on each miss. |
| `billing.getBillingInformation` | `billing-settings.tsx:23`, `billing-portal.tsx:287` | `minutes` (60 s) | ~1 KB | Two callers on billing pages. Contact/address data rarely changes. |
| `billing.listInvoices` | `billing/invoices/page.tsx:31`, `billing/receipts/page.tsx:60`, `billing-portal.tsx:414` | `minutes` (60 s) | ~10 KB | Three callers; Stripe API call. Invoices list is append-only — safe to cache for 60 s. |
| `analytics.recentActivity` | `governance/page.tsx:67`, `governance/compliance/page.tsx:230` — both fire `{ limit: 10 }` | `seconds` (30 s) | ~5 KB | Same params from two pages; a cached wrapper would share the entry. |
| `agent.getPendingCount` | `agent-approvals/page.tsx:823`, `agent-approvals/preview/page.tsx:660`, `agent-approvals/tools/page.tsx:292` — 3 pages | `seconds` (30 s) | ~100 B | Badge count; fires on 3 separate pages. Short TTL is fine; collapses concurrent hits. |
| `ticket.filterOptions` | `tickets/(list)/page.tsx:52`, `support/tickets/(list)/page.tsx:74` | `hours` (1 h) | ~2 KB | Filter option lists (status enums, categories); essentially static reference data. |
| `cases.filterOptions` | `cases/(list)/page.tsx:44` | `hours` (1 h) | ~2 KB | Same pattern as ticket.filterOptions. |
| `cases.stats` | `cases/(list)/page.tsx:39` | `minutes` (60 s) | ~1 KB | Case counts per status. Mirrors existing ticket.stats pattern — a wrapper already exists for tickets. |
| `cases.assignees` | `cases/(list)/page.tsx` (via `CaseForm`), `CaseForm.tsx:126` | `hours` (1 h) | ~3 KB | User list for assignee select; changes only when users are added/removed. |
| `ticket.assignees` | `agent-approvals/page.tsx:854`, `tickets/[id]/page.tsx:51`, `support/tickets/[id]/page.tsx:38` | `hours` (1 h) | ~3 KB | Same assignee list called from 3 pages. High de-dup value. |
| `workflow.list` | `WorkflowList.tsx:73` — rendered in workflow pages | `minutes` (60 s) | ~5 KB | Workflow definitions change infrequently; list on settings-style page. |

---

## Not Recommended to Cache ⚪

These are either inherently dynamic (search/filter input), keyed by volatile inputs, or small enough that caching adds complexity without benefit.

| Procedure | Why |
|---|---|
| `globalSearch.query` | Full-text search with user-typed query string; result changes per keystroke. Too dynamic. |
| `contact.search` | User-typed search in `RecipientPicker` / `EmailCompose`; volatile input. |
| `email.searchContacts` | Same as above — debounced search. |
| `email.listEmails` | Inbox; changes on every email receive/read/archive. Real-time nature precludes caching. |
| `email.getThread` | Single thread selected by user; enabled only when `threadId` is set. Interactive. |
| `opportunity.dealForecast` | Keyed by specific deal ID on a detail page; too narrow for shared cache benefit. |
| `account.getById` | Detail record; loaded on single-entity pages keyed by ID. Use React Query staleTime. |
| `contact.getById` | Same as above. |
| `lead.getById` | Same as above. |
| `ticket.getById` | Same as above. |
| `task.getById` | Same as above. |
| `cases.getById` | Same as above. |
| `timeline.getEvents` | Infinite scroll with cursor pagination; dynamic cursor makes cache impractical. |

---

## Implementation Notes

### Pattern to Follow

All existing cached wrappers follow the same pattern (example: `notifications-queries.ts`):

```ts
'use cache';
import { cacheLife, cacheTag } from 'next/cache';
import { createCallerFromToken } from '@/lib/trpc-server';
import { SOME_TAG, userTag } from '@/lib/cache-tags';
import { MINUTES } from '@/lib/cache-profiles';

export async function fetchXxx(token: string | null, userId: string | null) {
  cacheLife(DASHBOARD_STATS);
  cacheTag(SOME_TAG);
  if (userId) cacheTag(userTag(userId));

  const caller = await createCallerFromToken(token);
  return caller.module.procedure();
}
```

Then in the Server Component page:
```ts
// apps/web/src/app/some/page.tsx (Server Component)
const data = await fetchXxx(token, userId);
```

### Highest-Impact Quick Wins (Top 3)

1. **`billing.getSubscription`** — 5 separate client components each call this independently.
   A single `fetchSubscription` wrapper with `minutes` TTL and `user:{userId}` tag would
   collapse ~5× redundant Stripe API calls per billing page visit into one.

2. **`analytics.getOverview` adoption** — The SSR wrapper (`fetchAnalyticsOverview`) already
   exists in `analytics-queries.ts` but is **never called from any page.tsx**. The
   `/analytics` page only calls it via `useQuery`. Wiring the existing wrapper into
   `apps/web/src/app/analytics/(list)/page.tsx` is a zero-new-code change.

3. **`moduleAccess.getPlans`** — Returns pure in-memory constants (no DB query, no Stripe
   call). Currently un-cached and called from `upgrade/page.tsx` and `ModulePaywall` on
   every paywall render. A wrapper with `days` TTL would make this free after the first hit.

### Tag Addition Needed

The following tags are missing from `apps/web/src/lib/cache-tags.ts` and should be added
when implementing new wrappers:

| Missing tag | For procedure |
|---|---|
| `home:daily-goal` | `home.getDailyGoal` |
| `home:pinned-items` | `home.getPinnedItems` |
| `notifications:list` | `notifications.list` |
| `pipeline:summary` | `opportunity.getPipeline` |
| `analytics:trends` | `analytics.growthTrends`, `analytics.trafficSources`, `analytics.topPerformers` |
| `billing:subscription` | `billing.getSubscription` |
| `billing:invoices` | `billing.listInvoices` |
| `cases:stats` | `cases.stats` |
| `agent:pending-count` | `agent.getPendingCount` |
