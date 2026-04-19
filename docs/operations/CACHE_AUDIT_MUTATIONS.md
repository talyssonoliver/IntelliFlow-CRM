# Mutation → revalidateTag Audit

Generated: 2026-04-12

---

## Cache Tags Currently Defined

Source: `apps/web/src/lib/cache-tags.ts`

| Constant                | Tag string             | Scope              |
| ----------------------- | ---------------------- | ------------------ |
| `LEADS_LIST`            | `leads:list`           | Entity list        |
| `LEADS_STATS`           | `leads:stats`          | Entity stats       |
| `CONTACTS_LIST`         | `contacts:list`        | Entity list        |
| `CONTACTS_STATS`        | `contacts:stats`       | Entity stats       |
| `ACCOUNTS_LIST`         | `accounts:list`        | Entity list        |
| `ACCOUNTS_STATS`        | `accounts:stats`       | Entity stats       |
| `TICKETS_LIST`          | `tickets:list`         | Entity list        |
| `TICKETS_STATS`         | `tickets:stats`        | Entity stats       |
| `TASKS_LIST`            | `tasks:list`           | Entity list        |
| `TASKS_STATS`           | `tasks:stats`          | Entity stats       |
| `DEALS_LIST`            | `deals:list`           | Entity list        |
| `DEALS_FORECAST`        | `deals:forecast`       | Derived aggregate  |
| `NOTIFICATIONS_UNREAD`  | `notifications:unread` | Per-user hot-path  |
| `MODULE_ACCESS`         | `module:access`        | Per-user/tenant    |
| `ACTIVITY_FEED`         | `activity:feed`        | Per-user hot-path  |
| `CALENDAR_EVENTS`       | `calendar:events`      | Per-user calendar  |
| `ANALYTICS_OVERVIEW`    | `analytics:overview`   | Per-user analytics |
| `HOME_AI_INSIGHTS`      | `home:ai-insights`     | Home AI panel      |
| `DASHBOARD`             | `dashboard`            | Composite tag      |
| `userTag(userId)`       | `user:{userId}`        | Per-user flush     |
| `entityTag(entity, id)` | `{entity}:{id}`        | Record-specific    |

---

## Existing revalidateTag Coverage ✅

Three Server Actions already exist and are called from mutation success
handlers:

| File                                                                        | Tags invalidated                               | Called from                                                            |
| --------------------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------- |
| `apps/web/src/app/leads/(list)/actions.ts` — `invalidateLeadsCache()`       | `leads:list`, `leads:stats`, `dashboard`       | `LeadsPageClient.tsx` (8 call sites), `leads/[id]/edit/page.tsx`       |
| `apps/web/src/app/contacts/(list)/actions.ts` — `invalidateContactsCache()` | `contacts:list`, `contacts:stats`, `dashboard` | `ContactsPageClient.tsx` (2 call sites), `contacts/[id]/edit/page.tsx` |
| `apps/web/src/app/accounts/(list)/actions.ts` — `invalidateAccountsCache()` | `accounts:list`, `accounts:stats`, `dashboard` | `AccountsPageClient.tsx` (1 call site)                                 |

Pattern confirmed: Server Actions with `'use server'` + `revalidateTag()` are
called inside tRPC mutation `onSuccess` handlers in Client Components. This is
the correct architecture (tRPC mutations run server-side; cache invalidation
must flow through a `'use server'` boundary).

---

## Mutations Missing Invalidation ❌

### Lead module — `apps/api/src/modules/lead/lead.router.ts`

| Mutation                | Tags needed                                                                                                      | Priority     | Notes                                                                                   |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------ | --------------------------------------------------------------------------------------- |
| `lead.qualify`          | `leads:list`, `leads:stats`, `dashboard`, `user:${userId}`                                                       | High         | Changes lead status; affects stats counts and `LEADS_LIST` sort order by score          |
| `lead.convert`          | `leads:list`, `leads:stats`, `contacts:list`, `contacts:stats`, `dashboard`, `user:${userId}`                    | **Critical** | Moves record from leads to contacts; both entity caches stale without dual invalidation |
| `lead.convertToDeal`    | `leads:list`, `leads:stats`, `deals:list`, `deals:forecast`, `analytics:overview`, `dashboard`, `user:${userId}` | **Critical** | Cross-entity: lead removed, opportunity created; 3 caches go stale simultaneously       |
| `lead.scoreWithAI`      | `leads:list`, `leads:stats`, `user:${userId}`                                                                    | High         | Score change reorders list; stats include `hotLeads`/`warmLeads` counts                 |
| `lead.bulkScore`        | `leads:list`, `leads:stats`, `user:${userId}`                                                                    | High         | Same as `scoreWithAI` but for N leads at once                                           |
| `lead.bulkConvert`      | `leads:list`, `leads:stats`, `contacts:list`, `contacts:stats`, `dashboard`, `user:${userId}`                    | **Critical** | Batch version of `convert`; contacts cache never invalidated                            |
| `lead.bulkUpdateStatus` | `leads:list`, `leads:stats`, `dashboard`, `user:${userId}`                                                       | High         | Status changes alter list view and stats breakdown                                      |
| `lead.bulkArchive`      | `leads:list`, `leads:stats`, `dashboard`, `user:${userId}`                                                       | High         | Sets status to LOST; removes from active list                                           |
| `lead.bulkDelete`       | `leads:list`, `leads:stats`, `dashboard`, `user:${userId}`                                                       | High         | Deletes records; list and stats both stale                                              |
| `lead.addNote`          | `user:${userId}`                                                                                                 | Low          | Adds `LeadNote`; no list-level tag needed; `activity:feed` if feed shows lead notes     |
| `lead.logActivity`      | `activity:feed`, `user:${userId}`                                                                                | Medium       | Updates `lastContactedAt`; activity feed staleness                                      |

**Gap:** `lead.create`, `lead.update`, `lead.delete` already have
`invalidateLeadsCache()` called from the page components. The mutations listed
above have no corresponding Server Action call sites.

---

### Contact module — `apps/api/src/modules/contact/contact.router.ts`

| Mutation                    | Tags needed                                                                        | Priority | Notes                                                    |
| --------------------------- | ---------------------------------------------------------------------------------- | -------- | -------------------------------------------------------- |
| `contact.linkToAccount`     | `contacts:list`, `contacts:stats`, `accounts:stats`, `dashboard`, `user:${userId}` | Medium   | `withAccounts` counter in contact stats changes          |
| `contact.unlinkFromAccount` | `contacts:list`, `contacts:stats`, `accounts:stats`, `dashboard`, `user:${userId}` | Medium   | Same: `withAccounts` counter                             |
| `contact.linkToLead`        | `contacts:list`, `leads:list`, `user:${userId}`                                    | Medium   | Retroactive association; both lists' relation data stale |
| `contact.unlinkFromLead`    | `contacts:list`, `leads:list`, `user:${userId}`                                    | Medium   | Mirror of `linkToLead`                                   |
| `contact.bulkDelete`        | `contacts:list`, `contacts:stats`, `dashboard`, `user:${userId}`                   | High     | Batch deletes; no Server Action call site exists         |
| `contact.bulkEmail`         | _(none — read-only side-effect, returns mailto URL)_                               | None     | Not a data mutation; no cache impact                     |
| `contact.bulkExport`        | _(none — read-only side-effect)_                                                   | None     | No data mutation                                         |
| `contact.logActivity`       | `activity:feed`, `user:${userId}`                                                  | Medium   | Contact activity written; feed stale                     |
| `contact.addNote`           | `user:${userId}`                                                                   | Low      | Note added; feed may show it                             |
| `contact.updateTags`        | `contacts:list`, `user:${userId}`                                                  | Low      | Tag filters in list may be stale                         |

**Gap:** `contact.create`, `contact.update`, `contact.delete` are covered. The
bulk and linking mutations are not.

---

### Ticket module — `apps/api/src/modules/ticket/ticket.router.ts`

| Mutation                  | Tags needed                                                                     | Priority     | Notes                                                                     |
| ------------------------- | ------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------- |
| `ticket.create`           | `tickets:list`, `tickets:stats`, `dashboard`, `activity:feed`, `user:${userId}` | **Critical** | No Server Action exists; `tickets:list` cache never cleared on new ticket |
| `ticket.update`           | `tickets:list`, `tickets:stats`, `dashboard`, `user:${userId}`                  | **Critical** | Status/priority changes affect stats counts                               |
| `ticket.delete`           | `tickets:list`, `tickets:stats`, `dashboard`, `user:${userId}`                  | High         | Removes record; list stale                                                |
| `ticket.archive`          | `tickets:list`, `tickets:stats`, `dashboard`, `user:${userId}`                  | High         | Removes from active view                                                  |
| `ticket.addResponse`      | `user:${userId}`                                                                | Low          | Does not change list-level fields                                         |
| `ticket.addAttachment`    | `user:${userId}`                                                                | Low          | Attachment-only; no list/stats impact                                     |
| `ticket.bulkAssign`       | `tickets:list`, `tickets:stats`, `dashboard`, `user:${userId}`                  | High         | Assignee change affects filtered views                                    |
| `ticket.bulkUpdateStatus` | `tickets:list`, `tickets:stats`, `dashboard`, `user:${userId}`                  | High         | Status changes affect stats breakdown                                     |
| `ticket.bulkResolve`      | `tickets:list`, `tickets:stats`, `dashboard`, `user:${userId}`                  | High         | Resolves N tickets; stats open/closed counts stale                        |
| `ticket.bulkEscalate`     | `tickets:list`, `tickets:stats`, `dashboard`, `user:${userId}`                  | High         | Priority changes affect stats                                             |
| `ticket.bulkClose`        | `tickets:list`, `tickets:stats`, `dashboard`, `user:${userId}`                  | High         | Closed count in stats stale                                               |

**Gap:** No Server Action exists for any ticket mutation. All 11 mutations serve
stale cache until TTL.

---

### Task module — `apps/api/src/modules/task/task.router.ts`

| Mutation          | Tags needed                                                                 | Priority     | Notes                                                                                              |
| ----------------- | --------------------------------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------- |
| `task.create`     | `tasks:list`, `tasks:stats`, `dashboard`, `activity:feed`, `user:${userId}` | **Critical** | No Server Action exists; newly created tasks invisible until TTL                                   |
| `task.update`     | `tasks:list`, `tasks:stats`, `dashboard`, `user:${userId}`                  | **Critical** | Status/priority/due date changes affect stats (`overdue`, `dueToday`)                              |
| `task.delete`     | `tasks:list`, `tasks:stats`, `dashboard`, `user:${userId}`                  | High         | Record removed; list stale                                                                         |
| `task.archive`    | `tasks:list`, `tasks:stats`, `dashboard`, `user:${userId}`                  | High         | Removes from active list                                                                           |
| `task.complete`   | `tasks:list`, `tasks:stats`, `dashboard`, `activity:feed`, `user:${userId}` | **Critical** | Status→COMPLETED; `dueToday`/`overdue` stats change; activity feed receives `task_completed` event |
| `task.start`      | `tasks:list`, `tasks:stats`, `user:${userId}`                               | High         | Status→IN_PROGRESS changes list ordering                                                           |
| `task.cancel`     | `tasks:list`, `tasks:stats`, `dashboard`, `user:${userId}`                  | High         | Status→CANCELLED; stats change                                                                     |
| `task.assign`     | `tasks:list`, `user:${userId}`                                              | Medium       | Entity assignment changes filtered views                                                           |
| `task.reschedule` | `tasks:list`, `tasks:stats`, `user:${userId}`                               | Medium       | Due date change affects `overdue`/`dueToday` counts                                                |

**Gap:** No Server Action exists for any task mutation. All 9 mutations serve
stale cache.

---

### Opportunity / Deal module — `apps/api/src/modules/opportunity/opportunity.router.ts`

| Mutation                      | Tags needed                                                                         | Priority     | Notes                                                                                                  |
| ----------------------------- | ----------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------ |
| `opportunity.create`          | `deals:list`, `deals:forecast`, `analytics:overview`, `dashboard`, `user:${userId}` | **Critical** | New deal not visible in pipeline; forecast totals wrong                                                |
| `opportunity.update`          | `deals:list`, `deals:forecast`, `analytics:overview`, `dashboard`, `user:${userId}` | **Critical** | Value/probability change affects weighted forecast                                                     |
| `opportunity.delete`          | `deals:list`, `deals:forecast`, `analytics:overview`, `dashboard`, `user:${userId}` | High         | Soft-delete removes from list; forecast stale                                                          |
| `opportunity.restore`         | `deals:list`, `deals:forecast`, `analytics:overview`, `dashboard`, `user:${userId}` | High         | Restores trashed deal; list and forecast stale                                                         |
| `opportunity.permanentDelete` | `deals:list`, `deals:forecast`, `analytics:overview`, `dashboard`, `user:${userId}` | High         | Hard delete                                                                                            |
| `opportunity.moveStage`       | `deals:list`, `deals:forecast`, `analytics:overview`, `dashboard`, `user:${userId}` | **Critical** | Stage move changes pipeline view and forecast aggregate; CLOSED_WON/LOST changes win-rate in analytics |

**Gap:** No Server Action exists for any opportunity mutation. `deals:forecast`
and `analytics:overview` are aggregates that go stale on every stage move.

---

### Calendar / Appointment module — `apps/api/src/modules/legal/appointments.router.ts`

| Mutation                      | Tags needed                         | Priority     | Notes                                   |
| ----------------------------- | ----------------------------------- | ------------ | --------------------------------------- |
| `appointments.create`         | `calendar:events`, `user:${userId}` | **Critical** | New appointment invisible until TTL     |
| `appointments.update`         | `calendar:events`, `user:${userId}` | High         | Changed fields not reflected            |
| `appointments.reschedule`     | `calendar:events`, `user:${userId}` | High         | Time/date change; list ordering changes |
| `appointments.confirm`        | `calendar:events`, `user:${userId}` | Medium       | Status change only                      |
| `appointments.complete`       | `calendar:events`, `user:${userId}` | Medium       | Status→COMPLETED                        |
| `appointments.cancel`         | `calendar:events`, `user:${userId}` | High         | Removes from active calendar view       |
| `appointments.markNoShow`     | `calendar:events`, `user:${userId}` | Medium       | Status change                           |
| `appointments.delete`         | `calendar:events`, `user:${userId}` | High         | Record removed                          |
| `appointments.linkToCase`     | `calendar:events`, `user:${userId}` | Low          | Relation-only; minimal display impact   |
| `appointments.unlinkFromCase` | `calendar:events`, `user:${userId}` | Low          | Mirror                                  |
| `appointments.addAttendee`    | `calendar:events`, `user:${userId}` | Low          | Attendee list change                    |
| `appointments.removeAttendee` | `calendar:events`, `user:${userId}` | Low          | Mirror                                  |

**Gap:** No Server Action exists for any appointment mutation.

---

### Notification module — `apps/api/src/modules/notifications/notifications.router.ts`

| Mutation                            | Tags needed                                               | Priority     | Notes                                                                             |
| ----------------------------------- | --------------------------------------------------------- | ------------ | --------------------------------------------------------------------------------- |
| `notifications.markAsRead`          | `notifications:unread`, `user:${userId}`                  | **Critical** | Unread count must drop immediately after mark-as-read                             |
| `notifications.markAllAsRead`       | `notifications:unread`, `user:${userId}`                  | **Critical** | Clears all; count goes to 0                                                       |
| `notifications.delete` (deleteMany) | `notifications:unread`, `user:${userId}`                  | High         | Deletion may change unread count                                                  |
| `notifications.create` (internal)   | `notifications:unread`, `activity:feed`, `user:${userId}` | Medium       | Used by server-side helpers; may need invalidation when triggered via user action |
| `notifications.bulkCreate`          | `notifications:unread`, `user:${userId}`                  | Medium       | Batch creation inflates unread count                                              |

**Gap:** `notifications:unread` has a 30-second TTL (`REALTIME` profile).
Without `revalidateTag`, a mark-as-read action leaves the badge showing the old
count for up to 30 seconds — highly visible to users.

---

### Account module — `apps/api/src/modules/account/account.router.ts`

| Mutation              | Tags needed                                                      | Priority | Notes                          |
| --------------------- | ---------------------------------------------------------------- | -------- | ------------------------------ |
| `account.setParent`   | `accounts:list`, `accounts:stats`, `dashboard`, `user:${userId}` | Medium   | Hierarchy change; list display |
| `account.assignOwner` | `accounts:list`, `user:${userId}`                                | Medium   | Owner field change in list     |

**Gap:** `account.create`, `account.update`, `account.delete` are covered by
`invalidateAccountsCache()`. `setParent` and `assignOwner` have no coverage.

---

### User module — `apps/api/src/modules/user/user.router.ts`

| Mutation              | Tags needed      | Priority | Notes                                                                                      |
| --------------------- | ---------------- | -------- | ------------------------------------------------------------------------------------------ |
| `user.updateTimezone` | `user:${userId}` | High     | Timezone affects all time-based displays cached under `user:{userId}`                      |
| `user.updateProfile`  | `user:${userId}` | Medium   | Name/avatar displayed in lists; `user:{userId}` flush refreshes all per-user cache entries |

**Gap:** Both user mutations affect fields rendered inside cached list
components (e.g., owner name). Flushing `user:${userId}` is the correct granular
invalidation.

---

### Activity Feed module — `apps/api/src/modules/misc/activity-feed.router.ts`

| Mutation                      | Tags needed                       | Priority | Notes                             |
| ----------------------------- | --------------------------------- | -------- | --------------------------------- |
| `activityFeed.toggleReaction` | `activity:feed`, `user:${userId}` | Low      | Reaction count changes in feed    |
| `activityFeed.addComment`     | `activity:feed`, `user:${userId}` | Low      | New comment appended to feed item |

---

## Cross-Entity Effects ⚠️

| Mutation                                         | Tags needed                                                                                                      | Why                                                                                                               |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `lead.convert`                                   | `leads:list`, `leads:stats`, `contacts:list`, `contacts:stats`, `dashboard`, `user:${userId}`                    | Lead removed from leads, contact record created — both caches go stale                                            |
| `lead.convertToDeal`                             | `leads:list`, `leads:stats`, `deals:list`, `deals:forecast`, `analytics:overview`, `dashboard`, `user:${userId}` | Lead removed, opportunity created, analytics aggregate changes — three caches go stale                            |
| `lead.bulkConvert`                               | Same as `lead.convert` × N                                                                                       | Batch version of the same cross-entity flow                                                                       |
| `opportunity.moveStage` (CLOSED_WON/CLOSED_LOST) | `deals:list`, `deals:forecast`, `analytics:overview`, `dashboard`, `user:${userId}`                              | Stage close changes win-rate metric read by `analytics:overview`                                                  |
| `ticket.create` (with `contactEmail`)            | `tickets:list`, `tickets:stats`, `activity:feed`, `user:${userId}`                                               | Side-effect writes to `ContactActivity` — activity feed for that contact is stale                                 |
| `task.assign` (to lead/contact/opportunity)      | `tasks:list`, `leads:list` or `contacts:list` or `deals:list`, `user:${userId}`                                  | Entity's task panel embedded in its detail page may be cached; entity list's task counts stale                    |
| `contact.linkToAccount` / `unlinkFromAccount`    | `contacts:list`, `contacts:stats`, `accounts:stats`                                                              | `withAccounts` counter in contact stats changes; account may show contact count                                   |
| `user.updateTimezone`                            | All per-user entity caches                                                                                       | Timezone used in `task.stats` `overdue`/`dueToday` calculations; flushing `user:${userId}` is the correct scalpel |

---

## Summary Counts

| Module                | Total mutations | Missing coverage ❌ | Already covered ✅         |
| --------------------- | --------------- | ------------------- | -------------------------- |
| Lead                  | 14              | 11                  | 3 (create, update, delete) |
| Contact               | 13              | 10                  | 3 (create, update, delete) |
| Ticket                | 11              | 11                  | 0                          |
| Task                  | 9               | 9                   | 0                          |
| Opportunity           | 6               | 6                   | 0                          |
| Calendar/Appointments | 12              | 12                  | 0                          |
| Notifications         | 5               | 5                   | 0                          |
| Account               | 5               | 2                   | 3 (create, update, delete) |
| User                  | 2               | 2                   | 0                          |
| Activity Feed         | 2               | 2                   | 0                          |
| **Total**             | **79**          | **70**              | **9**                      |

---

## Top 5 Most Critical Mutations to Wire First

1. **`ticket.create` / `ticket.update`** — No Server Action exists at all. Every
   ticket write serves stale cache until TTL (60s list, 60s stats). Highest
   user-facing impact since tickets are agent-facing real-time workflows.

2. **`notifications.markAsRead` / `notifications.markAllAsRead`** — `REALTIME`
   profile means 30s TTL. The unread badge stays wrong for 30s after click —
   extremely visible to users.

3. **`opportunity.moveStage`** — The pipeline board is the primary
   deal-management UI. Stage moves in Kanban must immediately reflect in list
   and forecast. `deals:forecast` is a derived aggregate that is expensive to
   recompute and must not drift.

4. **`lead.convertToDeal`** — Three caches go stale simultaneously
   (`leads:list`, `deals:list`, `deals:forecast`). The converted lead stays in
   the leads list and the new deal is invisible until TTL.

5. **`task.complete`** — Completing a task fires a notification, updates
   `activity:feed`, and changes `dueToday`/`overdue` counts in `tasks:stats`.
   All three destinations go stale. Task completion is the highest-frequency
   task mutation.

---

## Recommended Implementation Pattern

### Why Server Actions (not the tRPC mutation handler)

`revalidateTag()` is a Next.js server-side API from `next/cache`. It can only be
called inside a `'use server'` context. The tRPC routers run on the API server
(a separate Node.js process in this monorepo), which has no access to Next.js's
cache infrastructure. The `'use cache'` wrappers in
`apps/web/src/lib/cached-queries/` are Next.js-side only.

### Confirmed Working Pattern (from leads/contacts/accounts)

```
apps/web/src/app/<entity>/(list)/actions.ts    ← 'use server' file
    └── export async function invalidate<Entity>Cache()
            revalidateTag(ENTITY_LIST, 'default')
            revalidateTag(ENTITY_STATS, 'default')
            revalidateTag(DASHBOARD, 'default')

apps/web/src/app/<entity>/(list)/<Entity>PageClient.tsx  ← Client Component
    └── trpc.<entity>.create.useMutation({
            onSuccess: () => {
                invalidate<Entity>Cache()  // fire-and-forget — no await needed
            }
        })
```

### Extension for Missing Modules

1. **Create a Server Action file** (or add to existing) e.g.
   `apps/web/src/app/tickets/(list)/actions.ts`:

   ```ts
   'use server';
   import { revalidateTag } from 'next/cache';
   import {
     TICKETS_LIST,
     TICKETS_STATS,
     DASHBOARD,
     ACTIVITY_FEED,
   } from '@/lib/cache-tags';

   export async function invalidateTicketsCache() {
     revalidateTag(TICKETS_LIST, 'default');
     revalidateTag(TICKETS_STATS, 'default');
     revalidateTag(DASHBOARD, 'default');
   }
   ```

2. **For cross-entity mutations** (e.g. `lead.convertToDeal`), call multiple
   invalidation functions or create a combined action:

   ```ts
   export async function invalidateLeadToDealtConversionCache() {
     revalidateTag(LEADS_LIST, 'default');
     revalidateTag(LEADS_STATS, 'default');
     revalidateTag(DEALS_LIST, 'default');
     revalidateTag(DEALS_FORECAST, 'default');
     revalidateTag(ANALYTICS_OVERVIEW, 'default');
     revalidateTag(DASHBOARD, 'default');
   }
   ```

3. **For per-user tags** (notifications, activity feed, user profile), pass
   `userId` into the Server Action and call
   `revalidateTag(userTag(userId), 'default')`.

4. **Wire from mutation `onSuccess`** in Client Components — never `await` the
   Server Action call; use `.catch(() => {})` to avoid blocking UI
   responsiveness (same pattern as existing call sites in
   `LeadsPageClient.tsx`).

5. **Do NOT call `revalidateTag` inside the tRPC router** — it will throw at
   runtime because the router has no Next.js cache context.
