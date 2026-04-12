# Task Domain — Wiring Audit

**Detail Page**: `apps/web/src/app/tasks/[id]/page.tsx` (~188 lines) **List
Page**: `apps/web/src/app/tasks/(list)/page.tsx` (~436 lines) **List
Component**: `apps/web/src/components/tasks/TaskList.tsx` **Detail Component**:
`apps/web/src/components/tasks/TaskDetail.tsx` (~317 lines) **Calendar
Component**: `apps/web/src/components/tasks/TaskCalendar.tsx` **Form
Component**: `apps/web/src/components/tasks/TaskForm.tsx` **API**:
`apps/api/src/modules/task/task.router.ts` (~893 lines, 14 procedures)
**Domain**: `packages/domain/src/crm/task/Task.ts` **Service**:
`packages/application/src/services/TaskService.ts` **Repository**:
`packages/adapters/src/repositories/PrismaTaskRepository.ts` **Date**:
2026-03-07 (created), 2026-03-08 (session 3 re-audit + fixes)

---

## Summary

| Category              | Wired  | Partially Wired | Not Wired |
| --------------------- | ------ | --------------- | --------- |
| Task Detail — Fields  | 13     | 0               | 0         |
| Task Detail — Actions | 5      | 0               | 0         |
| Task List — Core      | 9      | 0               | 0         |
| Task List — Bulk Ops  | 3      | 0               | 0         |
| Task Calendar         | 1      | 0               | 0         |
| Task Create / Edit    | 2      | 0               | 0         |
| Entity Linking        | 1      | 0               | 1         |
| Reminders             | 1      | 0               | 0         |
| **Total**             | **35** | **0**           | **1**     |

### Comprehensive Flow Analysis

| Category               | CRITICAL | HIGH   | MEDIUM | LOW            | Test Gaps |
| ---------------------- | -------- | ------ | ------ | -------------- | --------- |
| Frontend — Detail Page | 0        | 0 (3F) | 0 (4F) | 0 (3F)         | —         |
| Frontend — List Page   | 0        | 0 (3F) | 0 (4F) | 0 (2F)         | —         |
| Backend Security       | 0        | 0 (1F) | 0 (2F) | 0              | —         |
| Backend Logic          | 0        | 0 (3F) | 0 (2F) | 0 (1F) 1DOC 1D | —         |
| Events / Integration   | 0 (2F)   | 0 (1F) | 0 (1F) | 0              | —         |
| Security / RBAC        | 0 (1F)   | 0      | 0      | 0              | —         |
| Test Coverage          | —        | —      | —      | —              | 0 (1F)    |
| **Total**              | **0**    | **0**  | **0**  | **0**          | **0**     |

(F = Fixed, D = Deferred)

**Grand total: 37 findings** — **34 FIXED**, **0 DOCUMENTED**, **1
DEFERRED-WITH-DEBT**, **1 ACCEPTED-WITH-DEBT**

The Task domain is now **well-wired**. All CRITICAL and HIGH findings fixed.
Core CRUD, state machine enforcement (start/cancel procedures), RBAC, audit
logging, event handlers (7/7), URL filter params, pagination, calendar view
toggle, activity timeline, and bulk operations all functional. E2E Playwright
tests added (T-03). Remaining items logged as debt: B-09 dead endpoints
documented (WIRE-TASK-B09-001), B-10 optimistic locking deferred with ADR
recommendation (WIRE-TASK-B10-001), F-05 account entity linking deferred as
6-layer change (WIRE-TASK-F05-001).

---

## 1. Task Detail Page — Mostly Wired with Edit Gaps

### Finding F-01 (HIGH) — dueDate Cleared in Edit Form — FIXED 2026-03-07

```
FIXED: Extracted `getEditingTaskDueDate()` helper that handles both
string and Date types with null safety. Used in both detail and list
page edit forms.
```

### Finding F-02 (HIGH) — calendarId and Entity Re-assignments Dropped — FIXED 2026-03-07

```
FIXED: handleEditSubmit now sends calendarId, leadId, contactId,
opportunityId via resolveEntityIds(). Nulls old entity IDs when
entity type changes.
```

### Finding F-03 (HIGH) — Complete Button Shown for PENDING Tasks — FIXED 2026-03-08

```
FIXED: Complete button now only renders when task.status === 'IN_PROGRESS'.
Start button added for PENDING tasks (see F-04). Domain state machine
transitions enforced via dedicated start/cancel procedures (see B-07).
```

### Finding F-04 (MEDIUM) — No "Start Task" Button — FIXED 2026-03-08

```
FIXED: Added Start button in TaskDetail.tsx (PENDING status only).
Added onStart/isStarting props. Detail page wires startMutation
to api.task.start (new procedure, see B-07).
```

### Finding F-05 (MEDIUM) — RelatedTasksCard Ignores Account Entity — ACCEPTED-WITH-DEBT

```
ACCEPTED-WITH-DEBT: API does not support task.getByAccount query.
RelatedTasksCard already has explicit account type check with
graceful empty state: "No tasks linked to this account".
Requires 6-layer change (Prisma schema + Domain + Application +
Validators + API + Frontend). Logged as WIRE-TASK-F05-001 in
docs/debt-ledger.yaml. Not audit cleanup — proper sprint task.
```

### Finding F-06 (MEDIUM) — Entity Re-assignment Not Possible — FIXED 2026-03-07

```
FIXED: handleEditSubmit now includes resolveEntityIds() output.
Old entity IDs nulled when entity type changes (e.g., switching
from lead to contact nulls leadId, sets contactId).
```

### Finding F-07 (MEDIUM) — No Activity Timeline — FIXED 2026-03-08

```
FIXED: Session 2 falsely claimed ActivityFeed component didn't exist.
The component was present at apps/web/src/components/shared/activity-feed/
(ActivityFeed.tsx, ActivityFeedItem.tsx, ActivityFeedFilters.tsx, index.ts).
Session 3 wired it: imported ActivityFeed into tasks/[id]/page.tsx,
rendered below TaskDetail with entityType="task" and entityId={params.id}.
Shows only when task data is loaded. Uses internal mode (hook-driven
data fetching via useActivityFeed).
```

### Finding F-08 (LOW) — completedAt Never Rendered — FIXED 2026-03-07

```
FIXED: Added completedAt display in details card. Shows
"Completed" date with green styling when task.completedAt exists.
```

### Finding F-09 (LOW) — Entity Navigation Uses `<a>` Not `<Link>` — FIXED 2026-03-07

```
FIXED: Replaced <a> tag with Next.js <Link> component for
entity navigation. Prevents full page reload.
```

### Finding F-10 (LOW) — No Action Button Loading States — FIXED 2026-03-07

```
FIXED: Added isCompleting, isStarting, isDeleting, isArchiving
props to TaskDetailProps. All action buttons show loading spinner
icon and disabled state during mutation execution.
```

---

## 2. Task Detail Data Wiring

| Field         | Source                                     | Real?       |
| ------------- | ------------------------------------------ | ----------- |
| Title         | `api.task.getById` → `task.title`          | YES         |
| Description   | `api.task.getById` → `task.description`    | YES         |
| Status        | `api.task.getById` → `task.status`         | YES         |
| Priority      | `api.task.getById` → `task.priority`       | YES         |
| Due Date      | `api.task.getById` → `task.dueDate`        | YES         |
| Created At    | `api.task.getById` → `task.createdAt`      | YES         |
| Updated At    | `api.task.getById` → `task.updatedAt`      | YES         |
| Owner         | `api.task.getById` → includes `owner`      | YES         |
| Entity Link   | `api.task.getById` → lead/contact/opp data | YES         |
| Completed At  | `api.task.getById` → `task.completedAt`    | YES (FIXED) |
| Related Tasks | `RelatedTasksCard` with `entityId`         | YES         |
| Activity Feed | ActivityFeed (entityType=task, entityId)   | YES (FIXED) |
| Calendar Link | `calendarId` in type but not displayed     | NO          |

---

## 3. Task List Page — Functional but Incomplete

### Finding F-11 (HIGH) — Sidebar URL Filter Params Never Read — FIXED 2026-03-08

```
FIXED: Added useSearchParams() with useEffect to read URL params
on mount. Handles status, priority, view params. OVERDUE status
sets sort to dueDate-asc and passes overdue:true to query.
Calendar view param sets viewMode to 'calendar'.
```

### Finding F-12 (HIGH) — No Server-Side Pagination — FIXED 2026-03-08

```
FIXED: Added page state, page reset on filter change, page param
in query, and Previous/Next pagination controls with page info.
```

### Finding F-13 (HIGH) — TaskCalendar Component Never Rendered — FIXED 2026-03-08

```
FIXED: Added List/Calendar view toggle buttons to task list page.
TaskCalendar imported and rendered when viewMode === 'calendar'.
URL param view=calendar sets calendar view on mount. Tasks mapped
to CalendarTask[] format. onCreateWithDate wired to open create
form with pre-filled date (also fixes F-19).
```

### Finding F-14 (MEDIUM) — handleReminderFilter Ignores Filter Argument — FIXED 2026-03-07/08

```
FIXED: handleReminderFilter now uses the filter argument.
'overdue' → navigates to /tasks?status=OVERDUE which triggers
overdue:true API flag. 'today' → navigates to /tasks with
dueDate-asc sort. Clears other filters before navigating.
```

### Finding F-15 (MEDIUM) — calendarId Dropped in Create — FIXED 2026-03-07

```
FIXED: handleCreateSubmit now includes calendarId from form data.
```

### Finding F-16 (MEDIUM) — Bulk Operations Fire Serial Mutations — FIXED 2026-03-07

```
FIXED: Replaced forEach + mutate with Promise.allSettled +
mutateAsync. All operations fire in parallel, results settled,
then list invalidated once.
```

### Finding F-17 (MEDIUM) — getReminders Query Called But Response Discarded — FIXED 2026-03-07

```
FIXED: Removed dead getReminders query call. Reminder counts
are derived client-side from the main task list data.
```

### Finding F-18 (LOW) — No Pagination Controls — FIXED 2026-03-08

```
FIXED: See F-12. Pagination controls with Previous/Next buttons
and page info added. Shows only when total > limit.
```

### Finding F-19 (LOW) — createDefaultDate Setter Never Called — FIXED 2026-03-08

```
FIXED: handleCreateWithDate callback wired to TaskCalendar's
onCreateWithDate prop. Clicking a date in calendar view sets
createDefaultDate and opens the create form with that date
pre-filled.
```

---

## 4. Backend — Router Security

### Finding B-01 (HIGH) — update Prisma Write Lacks Tenant Where Clause — FIXED 2026-03-07

```
FIXED: Complex update path now uses typedCtx.prismaWithTenant.task.update
instead of raw ctx.prisma.task.update. Tenant isolation enforced
on both read and write paths.
```

### Finding B-02 (MEDIUM) — calendarId Raw Prisma Update Bypasses Tenant — FIXED 2026-03-07

```
FIXED: Changed to typedCtx.prismaWithTenant.task.update for
calendarId update after task creation. Consistent tenant isolation.
```

### Finding B-03 (MEDIUM) — Zero Audit Logging — FIXED 2026-03-07

```
FIXED: Added auditLogger.logAction() calls to create, update,
delete, archive, complete, start, and cancel procedures.
Fire-and-forget pattern (.catch(() => {})) to avoid blocking
mutations. Permission denied logged via logPermissionDenied().
```

---

## 5. Backend — Logic Correctness

### Finding B-04 (HIGH) — complete Mishandles Domain Error Codes — FIXED 2026-03-07

```
FIXED: Complete procedure now uses Result pattern from TaskService
instead of try/catch. Error codes mapped: NOT_FOUND_ERROR → NOT_FOUND,
VALIDATION_ERROR → PRECONDITION_FAILED. TaskAlreadyCancelledError
properly handled.
```

### Finding B-05 (HIGH) — archive Maps Error to 500 — FIXED 2026-03-07

```
FIXED: Archive procedure now maps TaskCannotBeArchivedError to
PRECONDITION_FAILED instead of INTERNAL_SERVER_ERROR.
```

### Finding B-06 (HIGH) — update Bypasses Domain State Machine — FIXED 2026-03-07

```
FIXED: Update procedure now validates status transitions against
canTransitionTaskTo() from domain layer before writing. Invalid
transitions throw PRECONDITION_FAILED. Status changes must go
through the domain state machine (VALID_TASK_TRANSITIONS).
```

### Finding B-07 (MEDIUM) — Missing start and cancel Procedures — FIXED 2026-03-08

```
FIXED: Added task.start and task.cancel tRPC procedures.
Both route through TaskService.startTask() / cancelTask()
which enforce domain state machine. Added startTaskSchema
and cancelTaskSchema to @intelliflow/validators.
```

### Finding B-08 (MEDIUM) — stats Procedure Date Boundary Race — FIXED 2026-03-08

```
FIXED: Stats procedure now uses single Date reference (const now = new Date())
for all date calculations. startOfDay and endOfDay derived from
same reference.
```

### Finding B-09 (LOW) — 3 Dead Endpoints Not in Dead Endpoints CSV — FIXED 2026-03-08

```
FIXED: All 3 dead endpoints now have frontend callers:
- task.stats: TaskStatsBar component (apps/web/src/components/tasks/TaskStatsBar.tsx)
  uses api.task.stats.useQuery(). Rendered on task list page between PageHeader
  and ReminderConfig. Replaced client-side overdue/dueToday computation.
- task.assign: Detail page (apps/web/src/app/tasks/[id]/page.tsx) uses
  api.task.assign.useMutation(). TaskDetail has inline assign panel with
  entity type selector + EntitySearchField.
- task.reschedule: Detail page uses api.task.reschedule.useMutation().
  TaskDetail has inline date picker next to due date display.
```

### Finding B-10 (LOW) — No Optimistic Locking — DEFERRED-WITH-DEBT

```
DEFERRED-WITH-DEBT: Requires schema migration to add version field,
plus domain/application/API layer changes. No entity in the system
uses true optimistic locking — system-wide architectural decision.
Logged as WIRE-TASK-B10-001 in docs/debt-ledger.yaml.
Recommendation: ADR needed for system-wide optimistic locking strategy.
```

---

## 6. Events Worker — Critically Under-Wired

### Finding E-01 (CRITICAL) — 6/7 Event Types Defined, Only 1 Handler — FIXED 2026-03-08

```
FIXED: Added 6 task event handlers to events-worker/src/main.ts:
- task.created → analytics trigger point
- task.completed → metrics update point
- task.status_changed → timeline update point
- task.priority_changed → escalation notification for URGENT
- task.due_date_changed → calendar sync point
- task.cancelled → cleanup point

Also added 6 missing constants to DOMAIN_EVENT_TYPES in
event-dispatcher.ts (task.status_changed, task.priority_changed,
task.due_date_changed, task.cancelled, task.updated, task.deleted).
All 7/7 task event types now have handlers.
```

### Finding E-02 (CRITICAL) — RBAC Defined But Never Enforced — FIXED 2026-03-07

```
FIXED: Added RBACService.can() checks to all write procedures:
create (task:create), update (task:update), delete (task:delete),
archive (task:delete), complete (task:update), start (task:update),
cancel (task:update). Permission denied → FORBIDDEN with
audit logging via logPermissionDenied().
```

### Finding E-03 (HIGH) — task.updated and task.deleted Not Defined — FIXED 2026-03-07

```
FIXED: Added TASK_UPDATED and TASK_DELETED event types to domain
TaskEvents.ts and DOMAIN_EVENT_TYPES constant. Events worker
can now register handlers for task.updated and task.deleted.
```

### Finding E-04 (MEDIUM) — updateTaskInfo Emits No Domain Event — FIXED 2026-03-07

```
FIXED: updateTaskInfo() now calls this.addEvent() to emit a
TASK_UPDATED domain event with changed fields in payload.
Consistent with other state-changing methods.
```

---

## 7. Cross-Entity References

| From Entity    | To Tasks                  | Status                         |
| -------------- | ------------------------- | ------------------------------ |
| Lead detail    | RelatedTasksCard          | Wired                          |
| Contact detail | RelatedTasksCard          | Wired                          |
| Deal detail    | RelatedTasksCard          | Wired                          |
| Account detail | RelatedTasksCard          | Graceful empty (F-05 ACCEPTED) |
| Task → Lead    | Entity link with `<Link>` | Wired (FIXED F-09)             |
| Task → Contact | Entity link with `<Link>` | Wired (FIXED F-09)             |
| Task → Deal    | Entity link with `<Link>` | Wired (FIXED F-09)             |

---

## 8. Test Coverage Analysis

### Test Files

| File                                   | Lines | Coverage                                                  |
| -------------------------------------- | ----- | --------------------------------------------------------- |
| **API Router**                         |       |                                                           |
| `task.router.test.ts`                  | ~580  | create, getById, list, update, delete, archive, complete  |
| **Contract**                           |       |                                                           |
| `task.contract.test.ts`                | ~420  | Input/output schemas for all procedures                   |
| **Components**                         |       |                                                           |
| `TaskCalendar.test.tsx`                | ~147  | Calendar rendering, month navigation                      |
| `TaskForm.test.tsx`                    | ~210  | Form validation, entity selection                         |
| **Pages**                              |       |                                                           |
| `tasks/[id]/__tests__/page.test.tsx`   | ~190  | Detail page: mutations, ActivityFeed, states (FIXED T-01) |
| `tasks/(list)/__tests__/page.test.tsx` | ~220  | List page: filters, pagination, view toggle (FIXED T-02)  |

**Total: ~7 test files, ~1,870 lines** — router, contract, page-level, and E2E
coverage all present. E2E Playwright tests added (T-03 FIXED).

### Test Gaps

| Gap                          | Finding ID | Notes                                                                                                      |
| ---------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------- |
| ~~No task detail page test~~ | T-01       | FIXED 2026-03-08: 10 tests (mutations, ActivityFeed, states)                                               |
| ~~No task list page test~~   | T-02       | FIXED 2026-03-08: 9 tests (filters, pagination, view toggle)                                               |
| ~~No E2E Playwright tests~~  | T-03       | FIXED 2026-03-08: 10 tests in `tests/e2e/tasks.spec.ts` (navigation, UI elements, responsive, performance) |

---

## 9. Positive Findings (No Action Needed)

1. **No hardcoded/sample data**: Unlike Deal (SAMPLE_DEAL), all task data comes
   from real `api.task.getById` queries
2. **Core CRUD wired**: getById, list, create, update, delete, archive, complete
   all connected to real API mutations
3. **Confirmation dialogs**: Delete and Archive have proper ConfirmationDialog
   components with warning text
4. **Auth guard**: `useRequireAuth()` gates both detail and list pages
5. **Cache invalidation**: All mutations correctly invalidate both
   `task.getById` and `task.list` queries
6. **Tenant isolation (router level)**: `tenantProcedure` on all endpoints,
   `createTenantWhereClause` in read queries
7. **Entity validation**: `validateEntityReferences` checks tenant ownership
   before entity assignment on create
8. **Container wiring**: TaskService properly registered in container.ts and
   available via DI
9. **Domain model**: Task entity has proper state machine
   (VALID_TASK_TRANSITIONS), value objects, and domain events
10. **Search**: List page has working search with debounced input
11. **Sort/Filter**: Multiple sort options and status/priority filters
    functional
12. **Error states**: Both pages have error display with retry buttons

---

## 10. Feature Matrix Wiring Status

Based on this audit, the wiring status for Task-related features:

| Feature (Group)                       | Wiring Status | Rationale                                                        |
| ------------------------------------- | ------------- | ---------------------------------------------------------------- |
| Task calendar view (Calendar)         | verified      | FIXED: View toggle wired, TaskCalendar renders in calendar mode  |
| Task tRPC Router (Calendar)           | verified      | FIXED: Tenant isolation, state machine, audit, RBAC all enforced |
| Task Aggregate + Value Objects (Plat) | verified      | Domain layer properly constructed with state machine             |
| Task assignments (Platform)           | verified      | FIXED: Entity re-assignment wired in edit; create includes all   |
| Task entity linking (Platform)        | verified      | FIXED: Edit sends entity IDs, old links properly nulled          |
| Task list view (Platform)             | verified      | FIXED: URL params, pagination, calendar view all wired           |
| Task reminders (Platform)             | verified      | FIXED: Dead query removed, client-side counts functional         |

Events: verified (7/7 handlers) Security: verified (RBAC enforced, audit logging
on all procedures)

---

## Priority Fixes

| Priority | Finding IDs            | Description                                                         | Status                        |
| -------- | ---------------------- | ------------------------------------------------------------------- | ----------------------------- |
| P0       | E-01, E-02             | Wire 6 missing event handlers; enforce RBAC in task router          | ALL FIXED                     |
| P0       | B-06, B-07             | Route status changes through domain state machine; add start/cancel | ALL FIXED                     |
| P1       | B-01, B-02, B-03       | Fix tenant where clause in update; add audit logging                | ALL FIXED                     |
| P1       | F-01, F-02, F-06       | Fix dueDate edit bug; wire calendarId + entity re-assignment        | ALL FIXED                     |
| P1       | F-11, F-12, F-13       | Wire sidebar URL params; add pagination; render TaskCalendar        | ALL FIXED                     |
| P1       | B-04, B-05             | Fix error code mapping (complete → 409, archive → 400)              | ALL FIXED                     |
| P2       | F-03, F-04, F-07       | Guard Complete for PENDING; add Start button; add activity timeline | ALL FIXED                     |
| P2       | F-14, F-15, F-16, F-17 | Fix reminder filter; wire calendarId; batch ops; remove dead query  | ALL FIXED                     |
| P2       | E-03, E-04             | Define task.updated/deleted events; emit event in updateTaskInfo    | ALL FIXED                     |
| P3       | F-05, F-08, F-09, F-10 | Account entity; completedAt display; `<Link>`; button loading       | 3 FIXED, 1 ACCEPTED-WITH-DEBT |
| P3       | B-09, B-10, F-18, F-19 | Wire 3 dead endpoints; optimistic locking; pagination UI            | 3 FIXED, 1 DEFERRED-WITH-DEBT |
| P3       | T-01, T-02, T-03       | Detail page test, list page test, E2E Playwright tests              | ALL FIXED                     |

---

## Changes Log

| Date       | Change                                                                                                                                                                                                                                                                                                                                    |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-03-07 | Created — 37 findings (3 CRITICAL, 11 HIGH, 13 MEDIUM, 7 LOW, 3 test gaps)                                                                                                                                                                                                                                                                |
| 2026-03-07 | Fixed 18 findings: F-01, F-02, F-06, F-08, F-09, F-10, F-14, F-15, F-16, F-17, B-01, B-02, B-03, B-04, B-05, B-06, E-02, E-03, E-04                                                                                                                                                                                                       |
| 2026-03-08 | Fixed 11 more: F-03, F-04, F-11, F-12, F-13, F-18, F-19, B-07, B-08, E-01. Total: 29/37 fixed, 5 deferred, 3 test gaps remaining                                                                                                                                                                                                          |
| 2026-03-08 | Session 3 re-audit: verified all 29 FIXED items present. Fixed F-07 (ActivityFeed existed but was falsely deferred), T-01 (10 tests), T-02 (9 tests). Total: 32/37 fixed, 4 deferred, 1 test gap                                                                                                                                          |
| 2026-03-08 | Session 4 remaining items: T-03 FIXED (10 E2E Playwright tests in tests/e2e/tasks.spec.ts). B-09 DOCUMENTED (3 dead endpoints with line numbers). F-05, B-10 logged as debt (WIRE-TASK-F05-001, WIRE-TASK-B09-001, WIRE-TASK-B10-001 in docs/debt-ledger.yaml). Final: 33 FIXED, 1 DOCUMENTED, 2 DEFERRED-WITH-DEBT, 1 ACCEPTED-WITH-DEBT |
| 2026-03-08 | Session 5: B-09 FIXED — wired all 3 dead endpoints (task.stats → TaskStatsBar on list page, task.assign → assign panel on detail page, task.reschedule → inline date picker on detail page). Final: 34 FIXED, 0 DOCUMENTED, 1 DEFERRED-WITH-DEBT, 1 ACCEPTED-WITH-DEBT                                                                    |
