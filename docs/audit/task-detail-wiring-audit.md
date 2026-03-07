# Task Domain — Wiring Audit

**Detail Page**: `apps/web/src/app/tasks/[id]/page.tsx` (~188 lines) **List
Page**: `apps/web/src/app/tasks/(list)/page.tsx` (~436 lines) **List
Component**: `apps/web/src/components/tasks/TaskList.tsx` **Detail Component**:
`apps/web/src/components/tasks/TaskDetail.tsx` (~317 lines) **Calendar
Component**: `apps/web/src/components/tasks/TaskCalendar.tsx` **Form
Component**: `apps/web/src/components/tasks/TaskForm.tsx` **API**:
`apps/api/src/modules/task/task.router.ts` (~668 lines, 12 procedures)
**Domain**: `packages/domain/src/crm/task/Task.ts` **Service**:
`packages/application/src/services/TaskService.ts` **Repository**:
`packages/adapters/src/repositories/PrismaTaskRepository.ts` **Date**:
2026-03-07 (created — comprehensive flow analysis)

---

## Summary

| Category               | Wired  | Partially Wired | Not Wired |
| ---------------------- | ------ | --------------- | --------- |
| Task Detail — Fields   | 10     | 1               | 2         |
| Task Detail — Actions  | 4      | 0               | 1         |
| Task List — Core       | 5      | 2               | 2         |
| Task List — Bulk Ops   | 2      | 1               | 0         |
| Task Calendar          | 0      | 0               | 1         |
| Task Create / Edit     | 1      | 1               | 0         |
| Entity Linking         | 1      | 0               | 1         |
| Reminders              | 0      | 1               | 0         |
| **Total**              | **23** | **6**           | **7**     |

### Comprehensive Flow Analysis

| Category                  | CRITICAL | HIGH   | MEDIUM | LOW    | Test Gaps |
| ------------------------- | -------- | ------ | ------ | ------ | --------- |
| Frontend — Detail Page    | 0        | 3      | 4      | 3      | —         |
| Frontend — List Page      | 0        | 3      | 4      | 2      | —         |
| Backend Security          | 0        | 1      | 2      | 0      | —         |
| Backend Logic             | 0        | 3      | 2      | 2      | —         |
| Events / Integration      | 2        | 1      | 1      | 0      | —         |
| Security / RBAC           | 1        | 0      | 0      | 0      | —         |
| Test Coverage             | —        | —      | —      | —      | 3         |
| **Total**                 | **3**    | **11** | **13** | **7**  | **3**     |

**Grand total: 37 findings** (3 CRITICAL, 11 HIGH, 13 MEDIUM, 7 LOW, 3 test
gaps)

The Task domain is **moderately wired** — significantly better than Deal (100%
hardcoded) but with meaningful gaps. Core CRUD works with real API data, all
mutations fire correctly, but the domain state machine is bypassed, event
handlers are missing (1/7), RBAC is defined but not enforced, and the
TaskCalendar component is built but never rendered.

---

## 1. Task Detail Page — Mostly Wired with Edit Gaps

### Finding F-01 (HIGH) — dueDate Cleared in Edit Form

```
tasks/[id]/page.tsx lines 161-165:
dueDate: typeof editingTask.dueDate === 'string'
  ? editingTask.dueDate
  : editingTask.dueDate instanceof Date
    ? editingTask.dueDate.toISOString().split('T')[0]
    : ''

tRPC returns Date objects, not strings. The `typeof` check evaluates
to 'object' for Date, falling through to instanceof which works.
However, if tRPC serialization returns an ISO string (common in
JSON transport), the string path is taken but only the date portion
is kept via split('T')[0]. The real issue: if dueDate is null/undefined,
the fallback is '' — the edit form shows an empty date field even when
the task has a due date set on the server but the response type is
ambiguous.
```

### Finding F-02 (HIGH) — calendarId and Entity Re-assignments Dropped

```
tasks/[id]/page.tsx lines 112-125 (handleEditSubmit):
updateMutation.mutate({
  taskId: id,
  title: data.title,
  description: data.description,
  dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
  priority: data.priority as TaskPriority,
  status: data.status as TaskStatus,
})

Missing from payload:
- calendarId (collected by TaskForm but not sent)
- leadId / contactId / opportunityId (entity re-assignment)

User edits entity links in form → submits → links unchanged.
Silently drops the user's edit without error or feedback.
```

### Finding F-03 (HIGH) — Complete Button Shown for PENDING Tasks

```
TaskDetail.tsx line 236-252:
Complete button renders when status !== 'COMPLETED' && status !== 'CANCELLED'
This includes PENDING tasks. But the domain Task entity has
VALID_TASK_TRANSITIONS map that may not allow PENDING → COMPLETED
directly (should go PENDING → IN_PROGRESS → COMPLETED).

The router's complete procedure delegates to taskService.completeTask()
which calls Task.complete(). If the domain rejects it, the user sees
a generic error instead of a guided "Start task first" message.
```

### Finding F-04 (MEDIUM) — No "Start Task" Button

```
TaskDetail.tsx:
No button or action to transition PENDING → IN_PROGRESS.
The TaskService has a method for this, but no router procedure
exposes it. Users must manually edit status via the edit form
or cannot start tasks at all from the detail view.
```

### Finding F-05 (MEDIUM) — RelatedTasksCard Ignores Account Entity

```
components/tasks/RelatedTasksCard.tsx:
Entity types handled: lead, contact, opportunity
Entity type 'account' silently produces an empty query —
no error shown, no tasks returned. Account detail pages
linking to tasks would see an empty related tasks section.
```

### Finding F-06 (MEDIUM) — Entity Re-assignment Not Possible

```
tasks/[id]/page.tsx lines 112-125:
The edit form allows changing entityType and entityId fields,
but handleEditSubmit only sends title, description, dueDate,
priority, and status. The old entity links persist regardless
of what the user selects in the edit form.

Furthermore, when changing from lead to contact, the old
leadId is never nulled — both links would coexist.
```

### Finding F-07 (MEDIUM) — No Activity Timeline

```
tasks/[id]/page.tsx:
No ActivityFeed component rendered on task detail page.
Lead, Contact, and Deal detail pages all include ActivityFeed
with entityId prop. Tasks have no activity history visible
to users — status changes, assignment changes, and notes
leave no visible trail.
```

### Finding F-08 (LOW) — completedAt Never Rendered

```
TaskDetail.tsx line 21:
interface TaskDetailData {
  completedAt?: Date | string | null;
  ...
}

completedAt exists in the type but is never displayed in the
JSX. When a task is completed, the user cannot see when it
was completed without checking the raw API response.
```

### Finding F-09 (LOW) — Entity Navigation Uses `<a>` Not `<Link>`

```
TaskDetail.tsx lines 209-224:
<a href={`/leads/${task.leadId}`}>{getEntityName(task)}</a>

Uses plain <a> tag instead of Next.js <Link>.
Causes full page reload on entity navigation.
```

### Finding F-10 (LOW) — No Action Button Loading States

```
TaskDetail.tsx lines 236-287:
Complete, Delete, Archive buttons have no pending/loading
indicator. No disabled state during mutation execution.
Double-click will fire duplicate mutations.
```

---

## 2. Task Detail Data Wiring

| Field         | Source                                       | Real? |
| ------------- | -------------------------------------------- | ----- |
| Title         | `api.task.getById` → `task.title`            | YES   |
| Description   | `api.task.getById` → `task.description`      | YES   |
| Status        | `api.task.getById` → `task.status`           | YES   |
| Priority      | `api.task.getById` → `task.priority`         | YES   |
| Due Date      | `api.task.getById` → `task.dueDate`          | YES   |
| Created At    | `api.task.getById` → `task.createdAt`        | YES   |
| Updated At    | `api.task.getById` → `task.updatedAt`        | YES   |
| Owner         | `api.task.getById` → includes `owner`        | YES   |
| Entity Link   | `api.task.getById` → lead/contact/opp data   | YES   |
| Completed At  | In type but never rendered                   | NO    |
| Related Tasks | `RelatedTasksCard` with `entityId`           | YES   |
| Activity Feed | Not rendered                                 | NO    |
| Calendar Link | `calendarId` in type but not displayed       | NO    |

---

## 3. Task List Page — Functional but Incomplete

### Finding F-11 (HIGH) — Sidebar URL Filter Params Never Read

```
tasks/(list)/page.tsx:
Sidebar navigation links generate URLs like:
  /tasks?view=my
  /tasks?priority=URGENT
  /tasks?status=OVERDUE

But the page component never calls useSearchParams().
URL query parameters are completely ignored — clicking
sidebar filter links navigates to the page but the filter
state doesn't change. Users see all tasks regardless of
the sidebar selection.
```

### Finding F-12 (HIGH) — No Server-Side Pagination

```
tasks/(list)/page.tsx:
api.task.list.useQuery returns { tasks, total, hasMore }
but the page has no pagination controls.

The query limits to 20 tasks. If a user has >20 tasks,
they cannot see the rest. The `total` and `hasMore` fields
from the API response are received but unused.
```

### Finding F-13 (HIGH) — TaskCalendar Component Never Rendered

```
components/tasks/TaskCalendar.tsx exists (tested in TaskCalendar.test.tsx)
but is never imported or rendered from the task list page.

The "Calendar" tab/view in the sidebar links to /calendar, not
/tasks?view=calendar. The TaskCalendar component is orphaned —
built and tested but with no route to display it.
```

### Finding F-14 (MEDIUM) — handleReminderFilter Ignores Filter Argument

```
tasks/(list)/page.tsx lines 284-287:
const handleReminderFilter = (filter: string) => {
  setStatusFilter('')
  setSortOrder('dueDate-asc')
}

The `filter` parameter (e.g. 'overdue', 'due-today') is accepted
but never used. Clicking "Show overdue" in the reminder banner
just re-sorts by date — it does not actually filter to overdue
tasks. All tasks remain visible.
```

### Finding F-15 (MEDIUM) — calendarId Dropped in Create

```
tasks/(list)/page.tsx lines 250-267 (handleCreateSubmit):
TaskForm collects calendarId but handleCreateSubmit passes:
  title, description, dueDate, priority, leadId, contactId, opportunityId

calendarId is not in the create mutation payload. Tasks created
from the list page never get calendar associations.
```

### Finding F-16 (MEDIUM) — Bulk Operations Fire Serial Mutations

```
tasks/(list)/page.tsx:
Bulk complete, delete, archive use forEach loop:
  selectedTasks.forEach(taskId => completeMutation.mutate({ taskId }))

This fires N individual mutations with no Promise.all, no error
aggregation, and no rollback. If mutation 3 of 5 fails, mutations
1-2 succeed and 4-5 continue — partial completion with no user
feedback on which tasks failed.
```

### Finding F-17 (MEDIUM) — getReminders Query Called But Response Discarded

```
tasks/(list)/page.tsx lines 92-94:
api.task.getReminders.useQuery(undefined, { enabled: isAuthenticated })

The query fires on page load but its return value is never destructured
or used. The overdueCount and dueTodayCount shown in the banner are
computed client-side from the main task list. The getReminders
network request is wasted bandwidth.
```

### Finding F-18 (LOW) — No Pagination Controls

```
tasks/(list)/page.tsx:
api.task.list returns { total, hasMore } but no "Load more" button
or page selector is rendered. Users are limited to the first 20
tasks with no way to navigate to older tasks.
```

### Finding F-19 (LOW) — createDefaultDate Setter Never Called

```
tasks/(list)/page.tsx line 71:
const [createDefaultDate, setCreateDefaultDate] = useState('')
setCreateDefaultDate is never invoked outside initialization.
The initialData.dueDate passed to the create form is always ''.
```

---

## 4. Backend — Router Security

### Finding B-01 (HIGH) — update Prisma Write Lacks Tenant Where Clause

```
task.router.ts lines 350-362:
// Complex update path
await ctx.prisma.task.update({
  where: { id: existingTask.id },
  data: { ... }
})

The where clause uses { id } only — no tenantId filter.
The preceding getTaskById check (line 313) validates tenant
ownership through the service, but the subsequent Prisma write
does not re-apply the tenant filter. A race condition between
the check and the write could theoretically allow cross-tenant
updates.
```

### Finding B-02 (MEDIUM) — calendarId Raw Prisma Update Bypasses Tenant

```
task.router.ts line 127-132 (create procedure):
if (input.calendarId) {
  await ctx.prisma.task.update({
    where: { id: created.id },
    data: { calendarId: input.calendarId },
  })
}

Uses raw ctx.prisma (not prismaWithTenant). The task was just
created by this user so the risk is low, but the pattern is
inconsistent with tenant isolation best practices.
```

### Finding B-03 (MEDIUM) — Zero Audit Logging

```
task.router.ts:
No auditLogger.log() or createAuditEvent() calls in any of
the 12 procedures. Task creation, completion, deletion, and
archival leave no audit trail. The audit infrastructure
(apps/api/src/security/audit/) exists but is not wired into
the task router.

Contrast with lead router which has audit logging on create,
update, and delete.
```

---

## 5. Backend — Logic Correctness

### Finding B-04 (HIGH) — complete Mishandles Domain Error Codes

```
task.router.ts lines 377-395 (complete procedure):
catch (error) {
  if (error instanceof TaskNotInProgressError) {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', ... })
  }
  if (error instanceof TaskAlreadyCompletedError) {
    throw new TRPCError({ code: 'CONFLICT', ... })
  }
  throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', ... })
}

But domain Task.complete() may throw TaskAlreadyCancelledError
which is NOT caught — falls through to INTERNAL_SERVER_ERROR (500).
Frontend receives a generic error instead of actionable feedback.
```

### Finding B-05 (HIGH) — archive Maps Error to 500

```
task.router.ts archive procedure:
catch (error) {
  if (error instanceof TaskCannotBeArchivedError) {
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', ... })
  }
}

TaskCannotBeArchivedError is a domain validation error — should
map to BAD_REQUEST or PRECONDITION_FAILED, not 500. Monitoring
systems will flag these as server errors when they are user errors.
```

### Finding B-06 (HIGH) — update Bypasses Domain State Machine

```
task.router.ts lines 350-362 (update complex path):
await ctx.prisma.task.update({
  where: { id: existingTask.id },
  data: {
    status: input.status,  // Direct write, no domain validation
    ...
  }
})

The domain Task entity has VALID_TASK_TRANSITIONS map defining
allowed transitions (e.g. PENDING → IN_PROGRESS → COMPLETED).
But the update procedure writes status directly via Prisma,
completely bypassing the domain state machine. Any status
transition is possible: COMPLETED → PENDING, CANCELLED → IN_PROGRESS.
```

### Finding B-07 (MEDIUM) — Missing start and cancel Procedures

```
TaskService has startTask() and cancelTask() methods.
Domain Task has VALID_TASK_TRANSITIONS for these transitions.
But task.router.ts has no 'start' or 'cancel' procedures.

Users must use the generic 'update' procedure to change status,
which bypasses the domain state machine (B-06). The dedicated
service methods — which DO enforce transitions — are unreachable.
```

### Finding B-08 (MEDIUM) — stats Procedure Tenant Filter

```
task.router.ts stats procedure:
Uses prismaWithTenant for count queries — tenant-scoped.
However, the overdue and dueToday date range calculations
use separate new Date() calls:

const now = new Date()
const endOfDay = new Date()
endOfDay.setHours(23, 59, 59, 999)

If midnight boundary is crossed between the two Date()
calls, the range could span two different days. Minor
correctness issue.
```

### Finding B-09 (LOW) — 3 Dead Endpoints Not in Dead Endpoints CSV

```
task.router.ts:
Three procedures have zero frontend callers:
- task.stats — no dashboard widget uses it
- task.assign — no UI button calls it
- task.reschedule — no UI button calls it

These are NOT listed in artifacts/reports/dead-endpoints-audit.csv.
Should be added.
```

### Finding B-10 (LOW) — No Optimistic Locking

```
Task entity has no version field. PrismaTaskRepository has no
concurrency control. Concurrent updates to the same task
(e.g. two users editing simultaneously) will last-write-wins
with no conflict detection or user warning.
```

---

## 6. Events Worker — Critically Under-Wired

### Finding E-01 (CRITICAL) — 6/7 Event Types Defined, Only 1 Handler

```
packages/domain/src/events/TaskEvents.ts defines 7 event types:
- task.created
- task.completed
- task.assigned
- task.status_changed
- task.priority_changed
- task.due_date_changed
- task.cancelled

events-worker/src/main.ts:
Only task.assigned has a registered handler (notification dispatch).
The other 6 event types are defined but have NO handlers.

task.created → no handler (no onboarding trigger, no analytics)
task.completed → no handler (no metrics update, no celebration)
task.status_changed → no handler (no timeline update)
task.priority_changed → no handler (no escalation)
task.due_date_changed → no handler (no calendar sync)
task.cancelled → no handler (no cleanup)

Global wildcard (*) catches for audit logging only.
```

### Finding E-02 (CRITICAL) — RBAC Defined But Never Enforced

```
security/rbac.ts defines 4 task permissions:
- TASKS_READ
- TASKS_WRITE
- TASKS_DELETE
- TASKS_MANAGE

task.router.ts:
All 12 procedures use tenantProcedure (authenticated) but NONE
check RBAC permissions. Any authenticated user can create, read,
update, delete, archive, and complete any task in their tenant.

A "viewer" role user (TASKS_READ only) can delete tasks.
A user without TASKS_MANAGE can reassign tasks.
The RBAC infrastructure exists but is never consulted.
```

### Finding E-03 (HIGH) — task.updated and task.deleted Not Defined

```
packages/domain/src/events/TaskEvents.ts:
7 granular events defined (status_changed, priority_changed, etc.)
but no generic task.updated or task.deleted event type.

The router's update procedure fires NO domain event at all.
The delete procedure fires NO domain event.
If an events-worker handler needed to react to deletions
(e.g. cascade cleanup, notification), there is no event to listen for.
```

### Finding E-04 (MEDIUM) — updateTaskInfo Emits No Domain Event

```
packages/domain/src/crm/task/Task.ts lines 328-336:
updateTaskInfo(params: { title?: string; description?: string }) {
  if (params.title) this._title = params.title;
  if (params.description) this._description = params.description;
  // No this.addEvent() call — no domain event emitted
}

All other state-changing methods (complete(), cancel(), etc.)
emit domain events. updateTaskInfo is the only mutation method
that silently modifies state without recording an event.
```

---

## 7. Cross-Entity References

| From Entity    | To Tasks                     | Status              |
| -------------- | ---------------------------- | ------------------- |
| Lead detail    | RelatedTasksCard             | Wired               |
| Contact detail | RelatedTasksCard             | Wired               |
| Deal detail    | RelatedTasksCard             | Wired               |
| Account detail | RelatedTasksCard             | **Not Wired** (F-05)|
| Task → Lead    | Entity link with name        | Wired (but `<a>`)   |
| Task → Contact | Entity link with name        | Wired (but `<a>`)   |
| Task → Deal    | Entity link with name        | Wired (but `<a>`)   |

---

## 8. Test Coverage Analysis

### Test Files

| File                                         | Lines | Coverage                                     |
| -------------------------------------------- | ----- | -------------------------------------------- |
| **API Router**                               |       |                                              |
| `task.router.test.ts`                        | ~580  | create, getById, list, update, delete, archive, complete |
| **Contract**                                 |       |                                              |
| `task.contract.test.ts`                      | ~420  | Input/output schemas for all procedures      |
| **Components**                               |       |                                              |
| `TaskCalendar.test.tsx`                      | ~147  | Calendar rendering, month navigation         |
| `TaskForm.test.tsx`                          | ~210  | Form validation, entity selection            |
| `TaskDetail.test.tsx` (if exists)            | —     | Not found — detail component untested        |
| **Pages**                                    |       |                                              |
| `tasks/(list)/__tests__/page.test.tsx` (if)  | —     | Not found — list page untested               |

**Total: ~4 test files, ~1,357 lines** — router and contract well covered,
component coverage moderate, page-level coverage absent.

### Test Gaps

| Gap                               | Finding ID | Notes                                                               |
| --------------------------------- | ---------- | ------------------------------------------------------------------- |
| No task detail page test          | T-01       | `tasks/[id]/page.tsx` has no `__tests__/page.test.tsx`              |
| No task list page test            | T-02       | `tasks/(list)/page.tsx` has no `__tests__/page.test.tsx`            |
| No E2E Playwright tests           | T-03       | No `tests/e2e/tasks.spec.ts` — zero E2E coverage for task flows    |

---

## 9. Positive Findings (No Action Needed)

1. **No hardcoded/sample data**: Unlike Deal (SAMPLE_DEAL), all task data comes
   from real `api.task.getById` queries
2. **Core CRUD wired**: getById, list, create, update, delete, archive, complete
   all connected to real API mutations
3. **Confirmation dialogs**: Delete and Archive have proper ConfirmationDialog
   components with warning text
4. **Auth guard**: `useRequireAuth()` gates both detail and list pages
5. **Cache invalidation**: All mutations correctly invalidate both `task.getById`
   and `task.list` queries
6. **Tenant isolation (router level)**: `tenantProcedure` on all endpoints,
   `createTenantWhereClause` in read queries
7. **Entity validation**: `validateEntityReferences` checks tenant ownership
   before entity assignment on create
8. **Container wiring**: TaskService properly registered in container.ts and
   available via DI
9. **Domain model**: Task entity has proper state machine
   (VALID_TASK_TRANSITIONS), value objects, and domain events
10. **Search**: List page has working search with debounced input
11. **Sort/Filter**: Multiple sort options and status/priority filters functional
12. **Error states**: Both pages have error display with retry buttons

---

## 10. Feature Matrix Wiring Status

Based on this audit, the wiring status for Task-related features:

| Feature (Group)                       | Wiring Status | Rationale                                                     |
| ------------------------------------- | ------------- | ------------------------------------------------------------- |
| Task calendar view (Calendar)         | issues        | Component built + tested but never rendered from any page     |
| Task tRPC Router (Calendar)           | issues        | Functional but: 2 tenant gaps, state machine bypass, no audit |
| Task Aggregate + Value Objects (Plat) | verified      | Domain layer properly constructed with state machine          |
| Task assignments (Platform)           | issues        | Works on create; assign endpoint dead; edit drops changes     |
| Task entity linking (Platform)        | issues        | Works on create; edit silently drops entity re-assignments    |
| Task list view (Platform)             | issues        | Real data, filters work; URL params ignored, no pagination    |
| Task reminders (Platform)             | issues        | Endpoint called but response discarded; client-side fallback  |

Events: partial (1/7 handlers)
Security: issues (RBAC not enforced, no audit logging)

---

## Priority Fixes

| Priority | Finding IDs                  | Description                                                          |
| -------- | ---------------------------- | -------------------------------------------------------------------- |
| P0       | E-01, E-02                   | Wire 6 missing event handlers; enforce RBAC in task router           |
| P0       | B-06, B-07                   | Route status changes through domain state machine; add start/cancel  |
| P1       | B-01, B-02, B-03             | Fix tenant where clause in update; add audit logging                 |
| P1       | F-01, F-02, F-06             | Fix dueDate edit bug; wire calendarId + entity re-assignment         |
| P1       | F-11, F-12, F-13             | Wire sidebar URL params; add pagination; render TaskCalendar         |
| P1       | B-04, B-05                   | Fix error code mapping (complete → 409, archive → 400)              |
| P2       | F-03, F-04, F-07             | Guard Complete for PENDING; add Start button; add activity timeline  |
| P2       | F-14, F-15, F-16, F-17       | Fix reminder filter; wire calendarId; batch ops; remove dead query   |
| P2       | E-03, E-04                   | Define task.updated/deleted events; emit event in updateTaskInfo     |
| P3       | F-05, F-08, F-09, F-10       | Account entity; completedAt display; `<Link>`; button loading        |
| P3       | B-09, B-10, F-18, F-19       | Add 3 dead endpoints to CSV; optimistic locking; pagination UI      |
| P3       | T-01, T-02, T-03             | Detail page test, list page test, E2E Playwright tests              |

---

## Changes Log

| Date       | Change                                                                       |
| ---------- | ---------------------------------------------------------------------------- |
| 2026-03-07 | Created — 37 findings (3 CRITICAL, 11 HIGH, 13 MEDIUM, 7 LOW, 3 test gaps)  |
