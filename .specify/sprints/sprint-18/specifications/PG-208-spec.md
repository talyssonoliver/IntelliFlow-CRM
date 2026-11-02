# Specification: PG-208 — Module Settings: Task Automation

**Status:** APPROVED — `/spec-consensus` 5/5 APPROVED in 1 round (2026-10-21; Round 4 modifications below are binding for the plan) · **Sprint:** 18 ·
**Branch:** `feat/pg-208-task-automation` · **Base:** origin/main `3d285c261` · **Persona:** frontend-lead +
backend-architect · **STOA:** foundation (row) + domain + security (new tables, tenant router, public webhook)

## Overview

Tenant admins get **task automation rules** at `/tasks/automation`: _when a trigger fires, create a task, optionally
assign it by round-robin, optionally notify people_. Three trigger types, all executed in this PR (owner ruling 1):

- **Entity event**: a lead, contact, deal (opportunity) or account event raised by the CRM services.
- **Schedule**: a cadence (daily / weekly / monthly / custom cron) in a timezone.
- **Webhook**: an external system POSTs a signed request to a per-rule URL.

Rules execute **inside the API process** (ADR-084, owner ruling 2). Every execution is a durable run row; the page shows
each rule's last run and its recent runs with a plain-language outcome.

### Owner rulings (binding, 2026-10-20)

`.specify/sprints/sprint-18/context/PG-208/PG-208-owner-ruling.md`:

1. **All three trigger types execute in this PR.** No trigger type may be saved without a runtime that acts on it.
2. **Event delivery inside the API**: subscribe to the API's in-process bus, write a durable run row, execute from a
   locked runner in the API process. No outbox switch, no worker deploy.
3. **Task owner = the trigger record's owner**; schedule and webhook rules use the rule's creator. An empty round-robin
   pool assigns to that owner and records why.
4. **No task-event triggers in v1.**
5. **Closed records**: `lead.converted` links the task to the new contact; deal won/lost creates the task unlinked with
   the deal named in the description.
6. **Assignees see their tasks**: task list and task detail show tasks the user owns OR is assigned to.
7. **Lead conversion fires `lead.converted` rules only**: contacts/accounts created by a conversion never fire
   `contact.created` / `account.created` rules (run recorded as skipped, "covered by lead conversion").

### Row reconciliation (row vs main)

| Row says | Reality on main / decision |
|---|---|
| `apps/web/src/app/tasks/(list)/automation/page.tsx` | Exists: 18-line `'use client'` "coming soon" stub (`page.tsx:1-18`), already linked from the Tasks sidebar (`sidebar/configs/tasks.ts:7`) and `TaskSettingsPanel.tsx:23-29`. Replaced in place; no second route. |
| `TaskAutomationContent.tsx`, `task-automation.router.ts`, `validators/src/task-automation.ts` | New files at exactly these paths. |
| "trigger types = entity event/schedule/webhook" | All three (ruling 1). Event list limited to events published through services in production (§Domain). |
| "actions = create task, assign by round-robin, notify" | Fixed order `CREATE_TASK` (required) → `ASSIGN_ROUND_ROBIN`? → `NOTIFY`?. |
| "Zod superRefine for duplicate (trigger, action) pairs" | (a) Validator `superRefine` on a rule: action types may not repeat or appear out of order ("actions N and M", path at the second). (b) The real cross-rule guard: a canonical `ruleKey` (trigger key + normalised actions) with a partial unique index `(tenantId, ruleKey) WHERE isActive`, and a pure `findDuplicateTriggerActionRules` used by the dialog for inline feedback; P2002 → CONFLICT. |
| "TagsTab via forwardRef" + "colorToken CHECK" | Tenant tag catalogue for rules (`task_automation_tags`, PG-201 `ReportScheduleTag` precedent) with the 18-token CHECK; rules store catalogue tag names. |
| "AI defaults FALSE" | No AI toggle exists or is added (nothing AI-driven runs). **N/A**, recorded in the PRD addendum and ADR-084. |
| "wire every Boolean toggle … OR category-2 under IFC-310/311/312" | Every Boolean is category 1 (wired now; §Boolean toggles). IFC-310/311/312 are Completed and contact/account-scoped, so no category-2 deferral is used. |
| KPI "phantom UI stub, no backend, no attestation; #615" | Confirmed (`attestations/PG-208/attestation.json` INCOMPLETE backfill). |
| No `DESIGN:` prefix on the row | No mockup; the playbook and PG-201 Scheduled Reports are the visual reference. |
| Owner "Frontend Dev (STOA-Foundation)" | Full-stack task: /stoa-foundation plus Domain and Security STOA. |

## Related Documents

| Type | Path | Status | Action |
|---|---|---|---|
| PRD | `docs/planning/prd-module-settings.md` (PG-208 Addendum) | Draft addendum | Updated (US-TA1..5, AC-TA-001..020) |
| ADR | `docs/architecture/adr/ADR-084-task-automation-engine.md` | Proposed → Accepted at exec | Created; updated with Round 3 decisions |
| ADR | ADR-069 (agent autonomy / migration risk classes) | Accepted | Referenced (Class A gates) |
| ADR | ADR-078 (report schedule contract) | Accepted | Referenced (cron helpers, min interval, `rolbypassrls` check) |
| ADR | ADR-079 (approval policies — sweep runner) | Accepted | Referenced (locked interval runner) |
| Playbook | `docs/planning/module-settings-playbook.md` | — | Followed (§1-§15) |
| Reference specs | PG-182 / PG-183 (playbook §14), PG-197 (round-robin), PG-201 (tags, cadence), PG-205 (latest shape) | — | Referenced |
| Dependency chain | `docs/architecture/diagrams/complete-dependency-chains.md` | — | New "Task Automation (PG-208 — ADR-084)" section |

## Dependencies Verified (Phase 0.95)

| Dependency | Claim | Verified | Method |
|---|---|---|---|
| PG-178 | module settings shell + per-module settings pages | TRUE | `apps/web/src/components/shared/module-settings-shell.tsx`; attestation COMPLETE (`sprint-16/attestations/PG-178`) |
| PG-191 | `taskSettings` router, `TaskSettings` model, task-settings page | TRUE | `apps/api/src/router.ts:22,158`; `schema.prisma:2466-2477`; `apps/web/src/app/tasks/(list)/task-settings/page.tsx` |
| PG-191 (side finding) | task settings consumed at runtime | **FALSE (pre-existing, out of scope)** | nothing outside `task-settings.router.ts` reads `dueDateOffsetDays` / `taskTemplates`. gh issue + debt ledger at exec; PG-208 does not depend on those values. |

## Exploration and challenge summary

Phase 0.75: five Explore agents; line-cited report `.specify/sprints/sprint-18/context/PG-208/PG-208-spec-exploration.md`
(E1-E10). Round 3: five persona agents challenged draft v1; every finding and its resolution is in
`.specify/sprints/sprint-18/specifications/PG-208-discussion.md` (R3-B*, R3-S*, R3-F*, R3-D*, R3-T*).

Key facts: events reach only the API's in-memory bus (`container.ts:376`, E1) and carry no tenant (E2); lead events are
published inside the lead transaction and handler errors propagate (`LeadService.ts:140-143, 761-765`, E3; the bus awaits
handlers with `Promise.all`, `InMemoryEventBus.ts:30-31`); `assigneeId` is never mapped by any of the 11
`Task.reconstitute` sites in `PrismaTaskRepository.ts` (E4, R3-B2); `TaskService.createTask` refuses closed/converted
links and past due dates (E5); no executor exists for any stored rule (E6).

## Technical Approach

### Data: one additive migration, Class A (ADR-069)

`packages/db/prisma/migrations/20261020120000_task_automation/migration.sql`. Header: Class A, additive only, no existing
table altered, no data copied or backfilled, forward-only recovery (drop the four new tables), prod only via
`prisma migrate deploy`, applied by the runner session after merge.

`task_automation_settings` — one row per tenant (absent row = defaults):
`id`, `tenantId` UNIQUE (FK tenants CASCADE), `automationEnabled BOOLEAN NOT NULL DEFAULT true`,
`maxRunsPerRulePerHour INT NOT NULL DEFAULT 60` CHECK 1..500, `notifyRuleOwnerOnFailure BOOLEAN NOT NULL DEFAULT false`,
`createdAt`, `updatedAt`.

`task_automation_rules`:
- `id`, `tenantId` (FK tenants CASCADE), `name VARCHAR(80)` (CHECK trimmed, non-empty), `description VARCHAR(500)` NULL,
  `isActive BOOLEAN DEFAULT true`, `sortOrder INT DEFAULT 0` CHECK ≥ 0, `tags TEXT[] DEFAULT '{}'` CHECK cardinality ≤ 10.
- `triggerType TEXT` CHECK IN (`ENTITY_EVENT`,`SCHEDULE`,`WEBHOOK`); `eventType TEXT` NULL CHECK IN (the nine v1 types);
  `eventFilter JSONB` NULL; `scheduleCadence TEXT` NULL CHECK IN (`daily`,`weekly`,`monthly`,`custom`),
  `scheduleCron VARCHAR(100)` NULL, `scheduleTimezone VARCHAR(64)` NULL, `nextRunAt TIMESTAMPTZ(3)` NULL;
  `webhookTokenHash CHAR(64)` NULL UNIQUE, `webhookTokenPrefix VARCHAR(12)` NULL, `webhookSecret TEXT` NULL,
  `webhookSecretPrevious TEXT` NULL, `webhookSecretPreviousExpiresAt TIMESTAMPTZ(3)` NULL.
- `actions JSONB NOT NULL`, `ruleKey CHAR(64)` NULL (SHA-256 of the canonical trigger key + normalised actions; NULL for
  webhook rules), `rrCursor INT NOT NULL DEFAULT 0`, `createdBy TEXT` NULL (FK users ON DELETE SET NULL),
  `lastRunAt`, `lastRunStatus` NULL CHECK IN (run statuses), `suppressedCount INT NOT NULL DEFAULT 0`,
  `lastSuppressedAt` NULL, `createdAt`, `updatedAt`.
- Trigger-consistency CHECK: `ENTITY_EVENT ⇒ eventType NOT NULL AND schedule* AND webhook* NULL`;
  `SCHEDULE ⇒ scheduleCadence, scheduleCron, scheduleTimezone, nextRunAt NOT NULL AND eventType, webhook* NULL`;
  `WEBHOOK ⇒ webhookTokenHash, webhookTokenPrefix, webhookSecret NOT NULL AND eventType, schedule* NULL AND ruleKey NULL`.
- Indexes: unique `(tenantId, id)`; SQL-only unique `(tenantId, lower(name))`; SQL-only partial unique
  `(tenantId, ruleKey) WHERE "isActive" AND "ruleKey" IS NOT NULL`; `(tenantId, isActive, triggerType, eventType)`;
  partial `(nextRunAt) WHERE "isActive" AND "triggerType" = 'SCHEDULE'`.

`task_automation_runs`:
- `id`, `tenantId` (FK tenants CASCADE), `ruleId`, composite FK `(tenantId, ruleId)` → `task_automation_rules(tenantId, id)`
  ON DELETE CASCADE, `triggerType`, `idempotencyKey VARCHAR(160)`, `payloadHash CHAR(64)` NULL (webhook body SHA-256),
  `status TEXT` CHECK IN (`PENDING`,`RUNNING`,`SUCCEEDED`,`FAILED`,`SKIPPED`), `context JSONB NOT NULL DEFAULT '{}'`
  (entity type/id/event type, slot, or **only the webhook variables the rule's templates reference**, ≤ 4 KB; never the
  raw body, headers or secrets), `taskId` NULL, `assigneeId` NULL, `outcome VARCHAR(60)` NULL, `errorCode VARCHAR(60)`
  NULL, `createdAt`, `startedAt` NULL, `finishedAt` NULL.
- Unique `(ruleId, idempotencyKey)`; indexes `(status, createdAt)`, `(tenantId, ruleId, createdAt DESC)`,
  `(ruleId, createdAt)` (cap counts).

`task_automation_tags`: copy of `report_schedule_tags` (PG-201): `id`, `tenantId`, `name VARCHAR(50)`, `colorToken
DEFAULT 'slate'` CHECK IN the 18 tokens (same list as `contact_tags_colorToken_check`), `description`, `sortOrder`,
`isActive`, timestamps; unique `(tenantId, name)`; SQL-only unique `(tenantId, lower(name))`.

RLS ENABLE + `<table>_tenant_isolation` policy (USING + WITH CHECK on `current_setting('app.current_tenant_id', true)`,
`DO $$ … duplicate_object`) on all four tables, copied from `20261017120000_contact_types:100-113`. Not FORCEd: explicit
`tenantId` in every query is the boundary (`tenant-context.ts:119-135`). The engine and webhook use the container's
`apiPrisma` (no tenant SET), which already reads RLS tables today because the API role bypasses non-forced RLS; ADR-084
records this dependency with ADR-078's `rolbypassrls` check, and every dropped/missing read is logged and counted.

Prisma: models `TaskAutomationSetting`, `TaskAutomationRule`, `TaskAutomationRun`, `TaskAutomationTag` (`@@map`), Tenant
back-relations `@ignore // PG-208`, a schema comment listing SQL-only objects. `packages/db/src/index.ts` exports the four
types (playbook §10). `ENCRYPTED_FIELDS.TaskAutomationRule = ['webhookSecret', 'webhookSecretPrevious']`
(`field-encryption.ts:33-36`; the `/// @encrypted` comment alone does nothing).

**Migration L13 (loud): one additive Class A migration must be applied to production (`prisma migrate deploy`, by the
runner) before the API is promoted.** No backfill.

### Task fixes required by the feature (no migration)

- `PrismaTaskRepository`: one `toDomain(record)` mapper used by **all 11** `Task.reconstitute` sites, mapping
  `assigneeId`; `save` writes `assigneeId` (R3-B2: fixing only `save`/`findById` would null assignees on
  `bulkComplete` → `findByIds` → `save`).
- `TaskService.createTask` already accepts `assigneeId` (`Task.ts:72, 188`). The engine passes the round-robin pick at
  create (atomic, no create-then-assign window). `TaskService.assignTask(taskId, assigneeId, assignedBy, tenantId)` is
  added only so `task.assigned` is emitted after create (AC-TA-008; consumed by `home.cache.ts:71`): it loads, compares
  `task.tenantId` to the supplied tenant (NotFound on mismatch; `TaskRepository.findById` has no tenant parameter), calls
  `Task.assignTo` with actor `system:task-automation`, saves, publishes.
- **Ruling 6**: `task.router.ts` `buildTaskListWhere` (:150-185) and `getById` (:279-286) let non-admins see tasks where
  `ownerId = user OR assigneeId = user` (tenant filter unchanged). Edit/delete rights are unchanged (owner/admin) —
  recorded as a known limit and filed as a follow-up issue.

### Domain: `packages/domain/src/crm/task/automation/task-automation-constants.ts` (new, zero infra deps, no Node imports)

- `TASK_AUTOMATION_TRIGGER_TYPES`, `TASK_AUTOMATION_ACTION_TYPES` (`CREATE_TASK`,`ASSIGN_ROUND_ROBIN`,`NOTIFY`, the
  canonical order), `TASK_AUTOMATION_RUN_STATUSES`, `TASK_AUTOMATION_OUTCOMES` (safe codes with plain-language labels).
- `TASK_AUTOMATION_EVENTS` (v1; events raised through services in production, R3-B1):

  | Event | Entity | id field (`toPayload`) | Postcondition at drain | Link (ruling 5 / record state) |
  |---|---|---|---|---|
  | `lead.created` | lead | `leadId` | lead exists | lead (unless converted by then → unlinked) |
  | `lead.qualified` | lead | `leadId` | status QUALIFIED or later | lead (unless converted → unlinked) |
  | `lead.converted` | lead | `leadId` (+ `contactId`) | status CONVERTED | contact loaded with `{id, tenantId}`; null/mismatch → unlinked |
  | `contact.created` | contact | `contactId` | contact exists; **skip if born of a conversion** (ruling 7) | contact |
  | `opportunity.created` | opportunity | `opportunityId` | exists, not deleted | deal (unless closed → unlinked) |
  | `opportunity.stage_changed` | opportunity | `opportunityId` (+ `newStage`) | stage = event `newStage` | deal; never fires for CLOSED_* targets (those map to won/lost) |
  | `opportunity.won` | opportunity | `opportunityId` | stage CLOSED_WON | unlinked, deal named |
  | `opportunity.lost` | opportunity | `opportunityId` | stage CLOSED_LOST | unlinked, deal named |
  | `account.created` | account | `accountId` | exists; **skip if born of a conversion** (ruling 7) | unlinked, account named |

  `opportunity.stage_changed` with `newStage` CLOSED_WON / CLOSED_LOST is treated as `opportunity.won` / `.lost`
  (`OpportunityService.changeStage` can close a deal without emitting won/lost, R3-D4). The validator refuses
  `toStage` CLOSED_*.
- Templates: tokens `{{record.name}}`, `{{record.type}}` (Lead / Contact / Deal / Account), `{{record.owner}}`,
  `{{record.url}}` (path only, e.g. `/leads/<id>`), `{{rule.name}}`, `{{event.label}}`, `{{stage.new}}`,
  `{{schedule.date}}` (slot date in the rule's timezone), `{{webhook.<key>}}` (`^[a-zA-Z][a-zA-Z0-9_]{0,39}$`).
  `renderTaskTemplate(template, vars)`: pure, plain text, variables held in a `Map` (no prototype keys such as
  `constructor`), unknown tokens → empty, control characters stripped, truncated to the field limit; an empty rendered
  title falls back to `<event label> – <record type>`. Display names: lead `firstName lastName` → `company` → "Lead";
  contact full name; deal and account `name`. Email is never a default.
- `computeAutomationDueDate(now, dueInDays)`: end of the UTC day of `now + N days`; never earlier than `now + 15 min`
  (R3-B1/D12: `TaskService` rejects past due dates at save time). `null` → no due date.
- `pickRoundRobinAssignee(eligibleIdsInPoolOrder, cursor)`: copy of `territory-matching.ts:242-250`. **The stored pool
  order (the order the admin picked) is the rotation order**; ineligible members are skipped in place (R3-F2).
- `TASK_AUTOMATION_LIMITS`: `maxRulesPerTenant 50`, `maxPoolSize 25`, `maxNotifyRecipients 10`, `titleMax 200`,
  `descriptionMax 2000`, `messageMax 500`, `maxDueInDays 365`, `webhookBodyMaxBytes 65536`, `webhookSkewSeconds 300`,
  `webhookSecretGraceHours 24`, `webhookVarsMax 20`, `runBatchSize 50`, `drainBatchSize 500`,
  `eventBufferCap 5000`, `missingRecordGraceMs 30000`, `conversionCorrelationMs 600000`, `staleRunMinutes 10`,
  `runRetentionDays 30`, `maxRunsPerTenantPerHour 1000`.
- `TASK_AUTOMATION_ADMIN_ROLES = ['ADMIN','MANAGER','OWNER','SUPER_ADMIN']` (rule CRUD for event/schedule rules, tags,
  settings); `TASK_AUTOMATION_WEBHOOK_ADMIN_ROLES = ['ADMIN','OWNER','SUPER_ADMIN']` (webhook create, rotate,
  regenerate, R3-S16).
- `canonicalRuleKey(trigger, actions)`: stable JSON of trigger key (event type + filter, or cadence/cron + timezone) and
  normalised actions (templates trimmed, pool order, recipients sorted); `null` for webhook. The API hashes it.

### Validators: `packages/validators/src/task-automation.ts` (new)

- `taskAutomationTriggerSchema` discriminated union on `type`:
  `ENTITY_EVENT {eventType, filter?: {toStage?: open OpportunityStage}}` (`toStage` only with `opportunity.stage_changed`);
  `SCHEDULE {cadence, dayOfWeek?, dayOfMonth?, timeOfDay?, cronExpression?, timezone}` (PG-201 `scheduled-reports`
  cadence shapes; min interval checked server-side with `isIntervalAllowed`, `scheduled-reports.schedule.ts:84`);
  `WEBHOOK {}`.
- `taskAutomationActionSchema` discriminated union:
  `CREATE_TASK {titleTemplate 1..200, descriptionTemplate ≤2000, priority, dueInDays 0..365 | null, linkToRecord}`;
  `ASSIGN_ROUND_ROBIN {userIds 1..25, deduped, order kept}`;
  `NOTIFY {recipients: {assignee: boolean, owner: boolean, userIds ≤10}, message ≤500}` (at least one recipient).
- `createTaskAutomationRuleSchema` / `updateTaskAutomationRuleSchema` (`.strict()`; never `tenantId`, `createdBy`, token,
  secret, cursor, ruleKey): name trim 1..80, description, isActive, tags ≤10, trigger, actions 1..3. **`.superRefine`
  (DoD item 9)**: `actions[0]` is CREATE_TASK; an action type may not repeat — "actions N and M" with the path on the
  second offender; order must follow the canonical order. Update omits `trigger.type` changes (trigger type immutable).
- `findDuplicateTriggerActionRules(rules)`: pure helper over normalised rules (same `canonicalRuleKey` among active rules)
  for inline dialog feedback; the DB partial unique index is the authority.
- `updateTaskAutomationSettingsSchema`; tag schemas copied from PG-201 `scheduled-report-tags`; `tagColorTokenSchema`
  re-used from `contact-settings.ts:78,99`.
- Output DTOs never contain `webhookSecret*`, `webhookTokenHash` or `ruleKey`; they carry `webhookTokenPrefix`.

### API: `apps/api/src/modules/task/task-automation.router.ts`

Registered as `taskAutomation: taskAutomationRouter,` (single line) in `apps/api/src/router.ts` next to `taskSettings`
(:158). Plain `tenantProcedure` (tasks are CORE_CRM). Writes gated by `assertTaskAutomationAdmin(ctx, roles)`, which
throws FORBIDDEN **and** logs the denial with `getAuditLogger(ctx.prisma).logPermissionDenied(...).catch(logAuditFailure)`
(`account-reassign.ts:161-165` pattern; `assertTerritoryAdmin` writes no audit, R3-S15). Not `adminTenantProcedure`
(no CSRF/rate limit, `trpc.ts:567-571`). Every query passes `tenantId`; reads use Prisma `select` allow-lists (secret
columns never loaded except by the webhook verifier); explicit `.output()` schemas without passthrough; data built field
by field. A strict per-user limiter (10/min, `createDistributedRateLimitMiddleware`) wraps `create`,
`rotateWebhookSecret`, `regenerateWebhookUrl`, `runNow`.

| Procedure | Who | Behaviour |
|---|---|---|
| `list` | any tenant user | rules (sortOrder, name) with trigger/action summary, owner rule text, last run, suppressed count; settings; tags; limits; `canEdit`, `canManageWebhooks`; event catalogue |
| `listRuns` | admins | last 20 runs of one rule (`{id, tenantId}` lookup first → NOT_FOUND), outcome labels, task link |
| `create` | admins (webhook: webhook admins) | strict input; inside `$transaction` with the tenant's settings row locked (`SELECT … FOR UPDATE` via upsert-then-lock, R3-S19): cap 50; pool and notify users checked with `tenantUserWhere`; tags must exist in the catalogue (stored with catalogue casing); schedule → `isIntervalAllowed` + `nextRunAt = computeNextRun(now)`; `ruleKey` hash; webhook → token `tat_` + 32 random bytes base64url (43 chars) and secret (32 random bytes hex), stores hash + prefix + secret (model API, encrypted); P2002 → CONFLICT ("an active rule already does this" / name taken); returns the rule and, for webhook, `{webhookUrl, signingSecret}` **from the locally generated plaintext** (create returns ciphertext, `field-encryption.ts:245-248`) |
| `update` | admins | `{id, tenantId}` lookup; trigger type immutable; recompute `nextRunAt` on schedule change, `ruleKey`; `$transaction` |
| `delete` | admins | `deleteMany {id, tenantId}` in `$transaction` (runs cascade); count 0 → NOT_FOUND |
| `setActive` | admins | activating recomputes `nextRunAt` from now (no catch-up); P2002 on `ruleKey` → CONFLICT |
| `reorder` | admins | `{ids}` must equal the tenant's rule set; `$transaction` of `updateMany {id, tenantId}` |
| `rotateWebhookSecret` | webhook admins | new secret; previous kept 24 h unless `revokePrevious: true`; returns the new secret once |
| `regenerateWebhookUrl` | webhook admins | new token, old URL dead immediately |
| `runNow` ("Test Rule") | admins | SCHEDULE and WEBHOOK rules only; refused (PRECONDITION_FAILED) when the rule is inactive or automation disabled; counts toward caps; enqueues `manual:<uuid>` |
| `settings.get` / `settings.update` | all / admins | upsert by `tenantId` |
| `tags.list/create/update/delete` | all / admins | PG-201 tag procedures; **rename and delete rewrite rules' `tags` in the same `$transaction`** |
| `resetToDefaults` | admins | `$transaction`: settings → defaults; rules, runs and tags preserved (dialog enumerates both) |

Audit (values never included): rule create/update/delete/activate, webhook secret issue/rotate/regenerate, `runNow`,
settings update, tag changes, every denial.

### Runtime (ADR-084): `apps/api/src/modules/task/automation/`

- `task-automation-store.ts` — the only DB seam for the engine: `findActiveRulesFor`, `insertRunIfAbsent` (`create`,
  P2002 → duplicate), `countRecentRuns`, `claimDueSchedule` (`updateMany({where:{id, tenantId, nextRunAt: old}})`,
  `count === 1` wins), `claimPendingRuns` (candidates then per-run `updateMany({where:{id, status:'PENDING'}})`),
  `incrementRrCursor` (`update … data:{rrCursor:{increment:1}}`), `finishRun`, `reapStaleRuns`, `purgeRunsBefore`,
  `loadRecord`, `loadWebhookRule` (`findUnique` by `webhookTokenHash`, so the encryption extension decrypts). Model API
  only — no raw SQL, so no advisory lock is needed for correctness; secrets are never read through raw queries.
- `task-automation-event-intake.ts` — `registerTaskAutomationEventIntake(eventBus, buffer, isWatched)` subscribes each v1
  event type. The handler never throws and never awaits I/O: if `isWatched(eventType)` (in-memory set of event types with
  ≥ 1 active rule in any tenant, refreshed each tick) it pushes `{eventId, eventType, ids from toPayload(), occurredAt}`
  into a bounded buffer (cap 5000, drop-oldest, drop count exposed as a metric and on the settings card). It records
  `lead.converted` `contactId`/`accountId` into a conversion-correlation set (10 min TTL).
- `task-automation-engine.ts` (deps: store, clock, TaskService, notification sender, logger):
  - `drainEvents(now)` ≤ 500 events per tick: `loadRecord(entity, id)` (no tenant filter; selects `tenantId`, `ownerId`,
    status/stage, display fields); missing → retried until 30 s old, then dropped with `console.warn` + metric;
    postcondition per the event table (rolled-back qualify/convert never fire, R3-B7); conversion-born
    `contact.created` (contact `leadId` not null or id in the correlation set) and `account.created` (id in the set) →
    one SKIPPED run per matching rule with outcome `covered_by_lead_conversion` (ruling 7). For each active rule in the
    record's tenant matching the event (and `automationEnabled`): **cap check at insert** (per-rule hourly cap from the
    tenant setting, per-tenant 1000/h): over cap → no row, `suppressedCount++`; else `insertRunIfAbsent`
    (`event:<eventId>`).
  - `enqueueDueSchedules(now)`: due rules → `claimDueSchedule(next = computeNextRun(cron, tz, now))` (one slot even if
    many were missed), cap check, insert `schedule:<slotISO>`. `InvalidCronError` on one rule → rule deactivated with
    `lastRunStatus FAILED`/`errorCode invalid_schedule`, tick continues.
  - `executePendingRuns(now)` ≤ 50: per run re-load the rule `{id, tenantId}` (missing/inactive/automation off →
    SKIPPED); resolve owner: record owner if live (`tenantUserWhere(tenantId)`), else rule creator if live, else SKIPPED
    `no_eligible_owner`; round-robin: eligible = pool ∩ live tenant users in pool order; empty → assignee = owner,
    outcome `pool_empty_fallback_owner` (with dropped count); else `incrementRrCursor` (incremented even if the later
    write fails) → pick; due date via `computeAutomationDueDate`; link per the event table — the link target is loaded
    with `{id, tenantId}` and an invalid/closed target falls back to unlinked with outcome `link_fallback_unlinked`;
    `TaskService.createTask({…, tenantId, ownerId, assigneeId})` then `assignTask` when assigned; NOTIFY via
    `createNotification(apiPrisma, {tenantId, type: 'task_automation', title, body, entityType:'task', entityId,
    actionUrl: '/tasks/<id>'}, notificationOrchestrator)` to de-duplicated live recipients (orchestrator `filtered` =
    success); a notify failure leaves the run SUCCEEDED with outcome `notify_failed`. Failures → FAILED with a safe
    `errorCode`; with `notifyRuleOwnerOnFailure` the live rule creator gets a `task_automation` notification. Each run
    updates the rule's `lastRunAt/lastRunStatus`. No automatic retry (task creation is not idempotent).
  - `reapStaleRuns(now)`: RUNNING older than 10 min → FAILED `interrupted`. `purgeRunsBefore(now − 30 d)`, hourly,
    bounded batch. All time comparisons take `now` from the injected clock (no SQL `now()`).
- `task-automation-runner.ts` — copy of `approval-sweep-scheduler.ts`: `taskAutomationRunnerIntervalFromEnv(env)`
  (0 under test, serverless or `TASK_AUTOMATION_INTERVAL_MS=0`; default 15 000), `startTaskAutomationRunner`,
  `stopTaskAutomationRunner`, skip-if-running, a thrown tick never kills the interval. Started from `startApiServer`
  after `containerReady`, **which is also where the intake is registered — only when the interval > 0** (so a disabled
  runner never buffers, R3-B11). `main.ts` SIGTERM calls `stopTaskAutomationRunner()`. No `container.ts` change.
- `task-automation-webhook.ts` + route in `http-server.ts`. `handleRequest` matches the webhook path **before** the
  global body read (`http-server.ts:495`) and branches; the route sets no CORS headers and is not added to
  `CORS_ALLOWED_HEADERS`. Pipeline (R3-S2):
  1. method guard → 405 `Allow: POST`;
  2. per-IP failure limiter (in-memory, `pickTrustedForwardedIp` from `security/client-ip.ts:20-27`, counts only
     failures; Redis `RedisRateLimiter` when distributed limiting is configured) → 429;
  3. declared `Content-Length` > 64 KB → 413; read with a byte counter and 10 s deadline, overflow → 413 +
     `req.destroy()` (`readRequestBody(req, maxBytes)` — other routes call it unchanged);
  4. token format `^tat_[A-Za-z0-9_-]{43}$` else 404 (no DB hit); `loadWebhookRule(sha256(token))`; missing, inactive,
     non-webhook or tenant automation disabled → **404 `{error:'not_found'}`**;
  5. secret readable and encrypted (`isEncrypted`) outside test, else 503 `{error:'unavailable'}`;
  6. signature header `^t=\d{10},v1=[0-9a-f]{64}$` (exactly one each); |now − t| ≤ 300 s; HMAC-SHA256 over
     **`${t}.${idempotencyKey}.${rawBody}`** on the raw Buffer, hex-decoded, length-checked, `timingSafeEqual`, against
     the current secret and (before expiry) the previous one → else **401 `{error:'invalid_signature'}`**
     (Idempotency-Key must match `^[A-Za-z0-9._:-]{1,128}$`; missing/malformed → 401 too, since it is signed);
  7. per-rule cap (runs in the last minute ≥ 60, or hourly cap) → 429;
  8. `JSON.parse` must give an object → 400 `{error:'invalid_payload'}`; variables = own top-level scalar keys only
     (strings ≤ 500, numbers, booleans; ≤ 20 keys); only keys the rule's templates reference are stored;
  9. `insertRunIfAbsent(webhook:<key>, payloadHash)`: new → **202 `{accepted:true, duplicate:false}`**; same key and
     same hash → 202 `duplicate:true`; same key, different hash → 409 `{error:'idempotency_conflict'}`.
  The handler catches everything and returns 500 `{error:'internal'}`; it never reaches `sendInternalError`
  (`http-server.ts:284-288`), never logs token, secret, signature, headers, URL or body (logs `{ruleId, tenantId,
  code}` only). The displayed webhook URL is built from `API_PUBLIC_URL` config, never the request `Host`. Sentry
  `beforeSend` scrubs `/webhooks/task-automation/<token>` (`tracing/sentry.ts:179-209`).

### Web: `apps/web/src/app/tasks/(list)/automation/`

- `page.tsx` — server component (no `'use client'`), exports `metadata`, renders `TaskAutomationContent` in `Suspense`
  with `TaskAutomationLoading`. `loading.tsx` renders `TaskAutomationLoading` (the `(list)` group's task-list skeleton
  otherwise flashes, R3-F14).
- `TaskAutomationContent.tsx` — `PageHeader` (breadcrumbs Tasks › Automation, no page actions) + bento
  `grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5`:
  - **Rules** `lg:col-span-8`: shared `SectionHeader` with `action` = `<Button size="sm">New Rule</Button>` when `canEdit`
    + `AutomationRuleList` (forwardRef `{openCreate}`). PG-201 `ScheduleList` row pattern (`ul.divide-y`,
    `flex-col sm:flex-row`): name, trigger and action summary, "Tasks are created for: <owner rule>", tag chips,
    last-run badge, suppressed count; `Switch aria-label="Active: <name>"` as a sibling of the buttons (disabled while
    pending); inline `Button size="sm" variant="ghost"` Edit, Runs, Test Rule (`aria-disabled` + description for
    entity-event rules), Move Up / Move Down (keyboard reorder with a live announcement), Delete. Empty:
    `<EmptyState entity="rules" phase="passive" size="sm" className="py-4 px-3 gap-2" />`, no CTA inside.
  - Right column `lg:col-span-4` stack: **Settings** card (automation enabled, notify rule owner on failure, max runs
    per rule per hour, dropped-events note) with card-local Save (disabled `!isDirty || isSaving`) inside its own
    `<fieldset disabled={isSaving}>`, state seeded from `data.settings` only and never re-seeded while dirty (except
    after save/reset), number kept as a string and parsed on save; Reset to Defaults → `ConfirmationDialog`
    enumerating reset vs preserved, awaiting `resetToDefaults` (toast; on error keep the dialog open). **Tags** card
    with `TagsTab` forwardRef + `useImperativeHandle({openCreate})`, "New Tag" in the SectionHeader action slot,
    `swatchClass` fallback (copy of PG-201 `TagsTab`; Sonar duplication checked locally, a shared extraction filed as a
    follow-up issue). `ModuleSettingsShell` is not used: it would lock the rules list while settings save
    (`module-settings-shell.tsx:153`).
- `components/AutomationRuleDialog.tsx` — name, description, tags; **Trigger** fieldset (type radio group; event select
  + optional "to stage"; `ScheduleCadenceFields` + `TimezoneSelector`; webhook explanation); **Actions** fieldset in the
  fixed order (Create Task: title/description via extended `VariablePicker`, `PrioritySelect`, due in days with "0 = end
  of today", link to record; Assign Round-Robin: shared `MemberMultiSelect` with `legend="Assign in turn to"`, help text
  "in the order picked"; Notify: assignee/owner checkboxes + users + message). Inline errors with `aria-invalid` /
  `aria-describedby`, including the duplicate-rule warning from `findDuplicateTriggerActionRules`. Help text: rules apply
  to events after saving; caps skip excess runs.
- `components/WebhookSecretDialog.tsx` — after create/rotate/regenerate: URL and secret in `CopyField`s, signing
  instructions with `<secret>` / `<unix>` / `<hex>` placeholders. URL and secret live only in component state (never
  `mutation.data` after `onSuccess`); the three mutations use `gcTime: 0` and `reset()` on close; never toasted or cached.
  Closing by outside click is prevented; Esc and the close button work; copy explains rotation.
- `components/RecentRunsDialog.tsx` (`listRuns`), `components/DeleteAutomationRuleDialog.tsx` (wraps `DeleteTypeDialog`;
  after delete focus moves to the Rules heading via `focusableTitle`).
- `TaskAutomationLoading.tsx` — skeleton mirroring 8 / 4 (Settings + Tags).
- Read-only users: no CTAs, `aria-describedby` read-only note; `<output aria-live="polite">` announcements; Material
  Symbols only; web imports only constants/types from domain and validators (L11).

Shared component reuse (Phase 0.76, corrected in Round 3):

| Need | Component | Decision |
|---|---|---|
| Page header | `components/shared/page-header.tsx` | REUSES |
| Section header with action | `components/shared/section-header.tsx:27-59` | REUSES (not the page-local copies) |
| Empty state | `@intelliflow/ui` EmptyState `entity="rules"` | REUSES |
| Confirm reset | `ConfirmationDialog` | REUSES |
| Delete confirm | `components/settings/DeleteTypeDialog.tsx` | REUSES |
| Priority | `components/shared/priority-select.tsx` | REUSES |
| Timezone | `components/settings/TimezoneSelector.tsx` | REUSES |
| Template variables | `components/shared/variable-picker.tsx` | EXTENDS: optional `id`, `maxLength`, `disabled`, `invalid`, `describedBy`, `helpText`, `emptyText` (defaults = today's strings; 3 workflow consumers unchanged) |
| Cadence fields | private `CadenceFields` + cadence Select in PG-201 `ScheduleDialog.tsx:294-382, 582-602` | EXTENDS: pure extraction (own first commit) to `components/shared/schedule-cadence-fields.tsx` with `idPrefix` (default `"schedule"`, DOM ids byte-identical) and `cronHint`; `ScheduleDialog.test.tsx` and `ScheduledReportsContent.test.tsx` pass unmodified |
| Member multi-select | `territory-mapping/components/MemberMultiSelect.tsx` | EXTENDS: move to `components/shared/member-multi-select.tsx` with a `legend` prop; **move** its test (legend "Territory members"); update `TerritoryDialog.tsx:38`, `TerritoryList.tsx:32` |
| Tags card | PG-201 `TagsTab` | COMPOSES (copy, own router) |
| Copy URL / secret | none shared | NEW (justified): `components/shared/copy-field.tsx` (try/catch clipboard, select-and-hint fallback, live "Copied" announcement, timers cleared on unmount) |
| Rule builder | ticket `AutomationRuleBuilder.tsx` is ticket-routing-specific | NEW (justified): `AutomationRuleDialog` |

## Runtime Wiring & Replacement Paths

| Surface | Must Be Called By | Replaces / Blocks | Notes |
|---|---|---|---|
| `taskAutomation.*` router | `TaskAutomationContent` + dialogs | the stub page | `router.ts` single line |
| `registerTaskAutomationEventIntake` | `startApiServer` after `containerReady`, interval > 0 | — | buffer only, never throws |
| `startTaskAutomationRunner` / `stop…` | `startApiServer` / `main.ts` SIGTERM | — | not in `createApiServer` |
| webhook route | `http-server.ts` `handleRequest`, before the global body read | — | raw body, no CORS |
| `TaskService.assignTask` | engine | — | first production caller of `Task.assignTo` |
| `PrismaTaskRepository.toDomain` | all 11 reconstitute sites | silently dropped `assigneeId` | behaviour fix |
| task list/detail assignee visibility | `task.router.ts` list + getById | owner-only visibility | ruling 6 |
| shared `MemberMultiSelect`, `ScheduleCadenceFields` | PG-208 dialog + territory / scheduled reports | page-local copies | move, no behaviour change |

## Navigation & Reachability

| Route | Sidebar Entry | Parent Link | Breadcrumb | Reachable? |
|---|---|---|---|---|
| `/tasks/automation` | `sidebar/configs/tasks.ts:7` (existing) | `TaskSettingsPanel.tsx:23-29` (existing) | PageHeader Tasks › Automation | YES |

Registries (PG-208 lines only): `docs/design/PAGE_MAP_AND_FLOWS.md:215` and `sitemap.md:198` (**rewrite** "triggered on
task status/priority changes", which contradicts ruling 4), `sitemap.md:445`, `navigation-reachability-audit.md:367`,
`page-registry.md` (new Tasks block), `ui-flow-mapping.md` (router row + header router/procedure counts + summary total),
`information-architecture.md` (router count), `apps/web/src/lib/shared/settings-search.ts` (new `task-automation` item,
added to the ai-automation `itemIds`; `settings-search.test.ts` 13 → 14), WCAG conformance statement changelog and
`vpat-2.5.md` changelog, `TaskSettingsPanel.tsx:26` copy. No total-pages change.

## Acceptance Criteria

- **AC-TA-001** Page follows the playbook: PageHeader + 12-col bento (8 / 4), shared SectionHeader with action slot,
  passive EmptyState without inner CTA, `Button size="sm"` Title Case without icons, skeleton matching the grid, route
  `loading.tsx`, no "coming soon" text.
- **AC-TA-002** Admin roles create, edit, activate/deactivate, reorder (keyboard Move Up/Down), test and delete rules
  (≤ 50 per tenant, enforced under a tenant lock); webhook secrets only by ADMIN/OWNER/SUPER_ADMIN; other users read
  only; every write checked server-side, every denial audit-logged.
- **AC-TA-003** A rule has one trigger and 1..3 actions in the fixed order (Create Task first); repeated action types are
  rejected by the validator superRefine ("actions N and M", path at the second); an active rule identical to another
  active rule (same trigger key and normalised actions) is refused with CONFLICT by the database.
- **AC-TA-004** Entity-event rules fire for the nine v1 events raised through services (bulk paths that bypass services,
  `opportunity.router.ts:1613-1617`, `lead.router.ts:1584-1589`, publish nothing and are filed as an issue); a deal
  closed through a stage change fires won/lost rules; postconditions stop rolled-back changes from firing; firing never
  slows, fails or rolls back the business write.
- **AC-TA-005** Schedule rules fire at their cadence in their timezone, at most once per slot across replicas, one run
  after downtime or reactivation (no catch-up burst); cadences below the scheduled-reports minimum are refused; a broken
  schedule deactivates only its rule.
- **AC-TA-006** Webhook rules get a URL and signing secret shown once; a request is accepted only with a valid
  timestamped HMAC over timestamp, Idempotency-Key and body (±300 s), a body ≤ 64 KB, within limits. Unknown, inactive,
  disabled and malformed tokens get one identical 404; every signature or key failure gets one identical 401; nothing is
  written for any rejected request; a replay with the same key creates nothing (same body) or 409 (different body);
  secrets rotate with a 24 h grace or immediate revoke; the URL can be regenerated.
- **AC-TA-007** Create Task renders templates as plain text (allow-listed tokens, unknown → empty, control characters
  stripped, truncated, non-empty title fallback), sets priority and a due date that is never in the past, owner per
  ruling 3 with the live-user fallback chain, link per ruling 5 and the record's state (closed/converted/foreign →
  unlinked with the record named).
- **AC-TA-008** Assign Round-Robin rotates over live tenant users in the pool order using an atomic cursor; an empty or
  all-ineligible pool assigns to the owner with outcome `pool_empty_fallback_owner`; `assigneeId` persists through every
  task read/save path and `task.assigned` is emitted.
- **AC-TA-009** Assignees see tasks assigned to them in the task list and task detail (ruling 6).
- **AC-TA-010** Notify sends a `task_automation` in-app notification to de-duplicated live recipients through the
  orchestrator (preferences honoured); a notify failure never undoes the task.
- **AC-TA-011** Lead conversion fires `lead.converted` rules only; `contact.created` / `account.created` rules record a
  skipped run "covered by lead conversion" (ruling 7). Task events are never triggers (ruling 4).
- **AC-TA-012** Every execution is a run row with status and plain-language outcome; admins see each rule's 20 most
  recent runs; stuck runs are marked interrupted after 10 min; runs older than 30 days are purged.
- **AC-TA-013** Guardrails enforced before a run row is written: per-rule hourly cap (tenant setting, default 60),
  per-tenant 1000/h, suppressed count shown on the rule; drain ≤ 500 events and execution ≤ 50 runs per tick; only watched
  event types are buffered; inactive rules and disabled automation never run (including Test Rule).
- **AC-TA-014** Settings card: automation enabled, notify rule owner on failure (default off), max runs per rule per hour;
  Reset to Defaults resets settings only and says rules, runs and tags are kept; unsaved edits survive rule/tag updates.
- **AC-TA-015** Tags: tenant catalogue with 18-token colours (DB CHECK), TagsTab via forwardRef, case-insensitive unique
  names; rename and delete update rules in the same transaction; rules may only use catalogue tags.
- **AC-TA-016** Tenant isolation: every query tenant-scoped; foreign ids → NOT_FOUND with no write; the engine takes the
  tenant only from the record, schedule or token row; link targets, pool and recipients are verified in the rule's tenant.
- **AC-TA-017** Secrets: token stored only as SHA-256; signing secrets encrypted (and refused when not encrypted outside
  test); neither appears in outputs, logs, audit entries, run rows, toasts, the React Query cache after the dialog
  closes, or Sentry events.
- **AC-TA-018** Destructive and multi-row writes in `$transaction`; no `skipDuplicates`; P2002 → CONFLICT; P2025 →
  NOT_FOUND.
- **AC-TA-019** WCAG 2.1 AA (axe on `document.body` incl. dialogs, keyboard reorder, labelled fieldsets, live region);
  Lighthouse ≥ 90 on `/tasks/automation` via `pnpm --filter @intelliflow/web run lighthouse:auth` (production build, local
  API + Supabase + Postgres with the migration applied, a test admin, at least one real rule, Node 22), or NEEDS_HUMAN
  naming the paths tried.
- **AC-TA-020** Registries, PRD addendum, ADR-084, dependency chain, Sprint_plan + splits updated; one Class A migration
  declared loudly.

## Boolean toggles (playbook §8)

| Toggle | Category | Runtime consumer |
|---|---|---|
| `TaskAutomationRule.isActive` | 1, wired | watched-type set, drain, schedule claim, execution, Test Rule |
| `TaskAutomationSetting.automationEnabled` | 1, wired | drain + webhook (404) + execution + Test Rule |
| `TaskAutomationSetting.notifyRuleOwnerOnFailure` | 1, wired | engine notifies the live rule creator on FAILED |
| `TaskAutomationTag.isActive` | 1, wired | inactive tags hidden from the rule dialog picker |
| `CREATE_TASK.linkToRecord` (JSON) | 1, wired | engine link decision |
| `NOTIFY.recipients.assignee/owner` (JSON) | 1, wired | engine recipient resolution |
| `rotateWebhookSecret.revokePrevious` (input) | 1, wired | previous secret cleared |

AI toggles: none (N/A).

## Test Requirements

Clock rule: every time-dependent test uses `vi.useFakeTimers({ toFake: ['Date'] })` + `vi.setSystemTime(NOW)` around the
call and `vi.useRealTimers()` in `afterEach`; fixtures are relative to `NOW` (`NOW − 31 d`, `NOW + 24 h ± 1 s`, `t` from
the pinned `Date.now()`), never literal calendar dates. Secret rule: tokens, secrets and signatures are built at runtime
(`randomBytes(32)`, `'x'.repeat(43)`), URLs use `https://crm.example.invalid/...`; no `Bearer …`, `whsec_`, `sk-` or
`secret_…` shapes in tests, docs, ADR or PRD; the repo secret scan runs on the staged diff before each commit.

Unit (under coverage):
- `packages/domain/src/crm/task/automation/__tests__/task-automation-constants.test.ts` — `renderTaskTemplate`
  (unknown token, `{{webhook.constructor}}`, control chars, truncation, empty-title fallback), `computeAutomationDueDate`
  (0, 1, 365, late-UTC boundary ≥ now + 15 min, null), `pickRoundRobinAssignee` (wrap, negative cursor, skipped members),
  `canonicalRuleKey` stability; **contract test**: every `TASK_AUTOMATION_EVENTS` type and id field equals what the domain
  event class emits (`new LeadCreatedEvent(...).toPayload()` etc.).
- `packages/validators/src/__tests__/task-automation.test.ts` — each trigger; first action CREATE_TASK; repeat "actions 1
  and 3" path `['actions',2]`; out of order; `toStage` only on stage_changed and never CLOSED_*; bounds; recipients ≥ 1;
  `.strict()` rejects `tenantId`/token/secret/ruleKey; tag colours; `findDuplicateTriggerActionRules`.
- `apps/api/src/modules/task/__tests__/task-automation.router.test.ts` — per procedure: USER → FORBIDDEN, no writes,
  `logPermissionDenied` called; MANAGER cannot create/rotate/regenerate webhook rules; **cross-tenant negative on every
  mutation** (lookup-first NOT_FOUND asserting `where:{id:FOREIGN, tenantId}` and write `not.toHaveBeenCalled()`, and P2025
  inside `$transaction` → NOT_FOUND); P2002 → CONFLICT for name and `ruleKey`; cap 50; foreign pool/recipient → BAD_REQUEST;
  unknown tag → BAD_REQUEST; cadence below minimum refused; `setActive` recomputes `nextRunAt` from now; webhook create
  returns URL + secret from plaintext and `list` output has no secret/hash/ruleKey; rotate grace and `revokePrevious`;
  regenerate; `runNow` refused for entity-event, inactive and disabled; `reorder` with a foreign id refused; reset touches
  settings only; tag rename/delete rewrite rules in the same transaction; `listRuns` admin-only.
- `apps/api/src/modules/task/automation/__tests__/task-automation-event-intake.test.ts` — never throws (buffer full,
  malformed event, unwatched type), maps each v1 event via `toPayload`, ignores task events, records conversion
  correlation; **a business write survives**: real `InMemoryEventBus`, a failing buffer, publish inside a transaction-like
  callback → the publish resolves.
- `apps/api/src/modules/task/automation/__tests__/task-automation-engine.test.ts` (in-memory fake store) — drain: tenant
  from the record, missing record retried then dropped (clock advanced), postconditions (qualify rolled back, converted,
  won/lost), stage_changed → won/lost mapping, conversion-born contact/account → SKIPPED `covered_by_lead_conversion`,
  tenant B rule never matched for tenant A record, cap at insert → no row + `suppressedCount`, drain batch ≤ 500, duplicate
  insert idempotent; schedule: due / not due / boundary / behind-by-many → one run, DST (Europe/London), invalid cron
  deactivates one rule only; execute: owner fallback chain (record owner → creator → `no_eligible_owner`), round-robin
  rotation in pool order, foreign/ineligible member skipped, empty pool fallback, cursor incremented on later failure,
  link fallback (converted lead, closed deal, foreign contact id), due date never past, notify recipients de-duplicated and
  filtered, `filtered` = success, notify failure → SUCCEEDED `notify_failed`, action failure → FAILED safe code, failure
  notification only when the toggle is on, batch ≤ 50, per-tenant cap, stale RUNNING → `interrupted`, purge boundary.
- `apps/api/src/modules/task/automation/__tests__/task-automation-store.test.ts` (prismaMock) — every store function's
  branches (`count` 0 vs 1, P2002 → duplicate, select allow-lists, `findUnique` used for webhook rules).
- `apps/api/src/modules/task/automation/__tests__/task-automation-webhook.test.ts` — 202 + run; duplicate same body →
  `duplicate:true`; same key different body → 409; changed Idempotency-Key with the old signature → 401; missing,
  malformed, non-numeric `t`, duplicate `v1`, uppercase hex, short signature, stale (299/300/301 s) → 401, nothing written;
  unknown, inactive, disabled, malformed token → identical 404 (status, body, headers); previous secret valid before expiry,
  invalid after, invalid after `revokePrevious`; unencrypted secret → 503; non-object JSON → 400; per-rule cap and IP
  failure limiter → 429; variables are own keys only, only referenced keys stored; real `encryptField`/`decryptField`
  round-trip with a runtime key; console/logger spy over 202, 401 and a thrown error finds no token, secret or signature.
- `apps/api/src/__tests__/http-server.task-automation-webhook.test.ts` — real server: route mounted, GET → 405 with
  `Allow`, streamed body > 64 KB → 413 without reading it all, no CORS headers, OPTIONS not answered with CORS for this
  path; other routes' bodies unchanged.
- `apps/api/src/__tests__/http-server.task-automation-runner.test.ts` — clone of `http-server.approval-sweep.test.ts`:
  `startApiServer` starts the runner and registers the intake; `createApiServer` does neither.
- `apps/api/src/modules/task/automation/__tests__/task-automation-runner.test.ts` — interval from an explicit env object
  (test / VERCEL / Lambda / `0` / invalid → defaults), skip-if-running, thrown tick keeps the interval,
  `stopTaskAutomationRunner` in `afterEach`.
- `apps/api/src/__tests__/main.test.ts` (extend) — SIGTERM calls `stopTaskAutomationRunner`.
- `packages/adapters/src/repositories/__tests__/PrismaTaskRepository.test.ts` (extend) — real repository over mocked
  Prisma: `assigneeId` in `save` args and in tasks returned by `findById`, `findByIds`, `findByOwnerId` and each other
  reader.
- `packages/application/src/services/__tests__/TaskService.test.ts` (extend, relative dates only) — `createTask` with
  `assigneeId`; `assignTask` emits `task.assigned`, foreign tenant → NotFound.
- `apps/api/src/modules/task/__tests__/task.router.test.ts` (extend) — non-admin sees owned and assigned tasks in `list`
  and `getById`; a task neither owned nor assigned stays hidden; another tenant's assigned task stays hidden.
- `packages/db/src/__tests__/field-encryption-extension.test.ts` / `field-encryption.test.ts` (extend) —
  `TaskAutomationRule` fields encrypt on create/update, decrypt on find, null passthrough; the map lists both fields.
- `packages/validators/src/__tests__/notifications.test.ts` — `task_automation` added (55 → 56).
- Web: `automation/__tests__/page.test.tsx` (metadata, Suspense, no `'use client'`); `TaskAutomationContent.test.tsx`
  (hoisted tRPC mock PG-205 style: loading, error + retry, passive empty state without action, read-only, create / update
  / delete / toggle invalidation, CONFLICT inline, Settings not re-seeded while dirty, **handleReset awaits
  `resetToDefaults`**, Move Up/Down announcements, axe on `document.body`); `TaskAutomationLoading.test.tsx`;
  `components/__tests__/AutomationRuleDialog.test.tsx` (trigger switching, fixed action order, duplicate-action and
  duplicate-rule inline errors, keyboard), `WebhookSecretDialog.test.tsx` (stubbed clipboard, copy failure fallback,
  outside click ignored, secret gone after close), `RecentRunsDialog.test.tsx`, `TagsTab.test.tsx` (forwardRef
  `openCreate`); `components/shared/__tests__/{copy-field,schedule-cadence-fields,variable-picker}.test.tsx`; moved
  `member-multi-select.test.tsx`.

Integration (`tests/integration/task-automation.test.ts`, local test DB, Node 22, slot wrapper with
`--exclusive intelliflow-db`): `ensureMigrationSql` keyed on `task_automation_tags_colorToken_check`, rebuilding all four
tables children-first under `applySchemaSql` (CI uses `db push`, L14). Assertions: colour CHECK (`it.each`, token list =
validator constant); trigger-consistency CHECK (one valid + one invalid row per trigger type); case-insensitive unique
names on rules and tags; partial unique `ruleKey` among active rules only; unique `(ruleId, idempotencyKey)`; composite
FK rejects a run whose tenant differs from its rule's; RLS enabled; cascade on rule delete; **store behaviour on the
real DB**: two concurrent `claimDueSchedule` on one slot → exactly one wins; two concurrent `claimPendingRuns` → disjoint;
`insertRunIfAbsent` duplicate → duplicate; N concurrent `incrementRrCursor` → N distinct values; `purgeRunsBefore` removes
only older rows; with a runtime encryption key, a stored `webhookSecret` starts with `v1:`.

Existing suites to rerun: the touched packages' full suites (`apps/api`, `packages/validators`, `packages/domain`,
`packages/application`, `packages/adapters`, `packages/db`, `apps/web`); `app-router.smoke.test.ts` (new `taskAutomation`
block naming every procedure); `tests/architecture/tenant-procedure-enforcement.test.ts`;
`packages/db/src/__tests__/rls-migrations.test.ts`; `apps/web/src/app/__tests__/{ui-flow-mapping,ia,sitemap}-reconciliation.test.ts`;
`tools/scripts/route-total-consistency.test.ts`, `a11y-route-reconcile.test.ts`, `__tests__/content-audit.test.ts`,
`docs-integrity-audit.test.ts`; `settings-search.test.ts`; territory-mapping (`TerritoryDialog`, `TerritoryList`) and
scheduled-reports (`ScheduleDialog`, `ScheduledReportsContent`, `TimezoneSelector`) suites unmodified.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Event lost between buffer and drain on a crash (ADR-084) | 15 s ticks; documented at-most-once window; schedule/webhook durable; outbox path left open |
| Lead handler runs inside the lead transaction | buffers only, never throws, never awaits I/O (test with a real bus) |
| Uncommitted or rolled-back records | 30 s missing-record grace; postconditions per event |
| Double execution across replicas | unique `(ruleId, idempotencyKey)`; compare-and-set schedule claim; per-run conditional claim (integration-tested) |
| Mass task creation / notification spam | caps before insert, suppressed counter, batch bounds, watched-type buffering, 50-rule cap, webhook limits |
| Public webhook abuse | opaque token + format pre-check, signed key + body + timestamp, idempotency with body hash, bounded read before routing, identical 404/401, failure-only IP limiter, no CORS, no `error.message` |
| Encryption silently off | 503 when the stored secret is not encrypted outside test; model-API-only secret reads; key-change runbook in ADR-084 |
| Template injection | plain text, Map-based variables, allow-listed tokens, caps; task UI renders text only (no `dangerouslySetInnerHTML` in task components) |
| Record names shown to pool members without record access | admin-authored rules; documented accepted risk in ADR-084 |
| `assigneeId` fix changes task reads; assignees gain agent access (`authorization.ts:292`) | single mapper + reader tests; recorded in ADR-084 |
| Assignees can view but not edit assigned tasks | ruling 6 scope; follow-up issue filed |
| Shared-component moves regress PG-197 / PG-201 | pure moves in their own commits, tests moved not duplicated, suites unmodified |
| Registry counts collide with sibling lanes | change only PG-208's own lines; rebase before ship |
| Lighthouse on an authenticated page | `lighthouse:auth` recipe (PG-198); NEEDS_HUMAN with the paths tried |

Pre-existing issues to file (not fixed here): unbounded `readRequestBody` for other routes (`http-server.ts:72-84`);
`sendInternalError` echoes `error.message` (`http-server.ts:284-288`); non-constant-time compare
(`process-pm-event.ts:50`); `stripeVerify` NaN timestamp (`framework.ts:172`); webhooks dead-letter procedures open to any
user (`webhooks.router.ts:206,244,272`); `assertTerritoryAdmin` denials not audited (`account-territories.router.ts:32-38`);
`redactSensitiveData` case bug (`logging.ts:494-516`); bulk paths publish no events (`opportunity.router.ts:1613-1617`,
`lead.router.ts:1584-1589`); `changeStage` closes deals without won/lost events; PG-191 task settings unread; assignee
edit rights; `MemberMultiSelect` label-in-name (WCAG 2.5.3); TagsTab shared extraction.

## Round 4 modifications (non-blocking, binding for /plan-session)

- **M1 Ruling 6 query shape** (Backend): `buildTaskListWhere` already uses `where.OR` for search
  (`task.router.ts:171-176`), so the visibility clause goes in `AND: [{ OR: [{ownerId}, {assigneeId}] }]`; `getById`
  spreads `createTenantWhereClause` (`tenant-context.ts:371-375`), drops its `ownerId` and adds the OR. Tests: search +
  assignee, manager `ownerId: {in}`. `getOverdue` / `getDueSoon` / stats stay owner-scoped (ruling 6 names list and detail
  only) — noted in the follow-up issue.
- **M2 `lead.qualified` postcondition**: status IN {QUALIFIED, NEGOTIATING, CONVERTED}.
- **M3 413**: write the 413 with `Connection: close`, then destroy the request.
- **M4 Notification type**: add `task_automation` to `NOTIFICATION_TYPES` (`validators/src/notifications.ts:32`) and check
  the web notification-type mapping handles it.
- **M5 Due date timezone**: end of day in the rule's `scheduleTimezone` for schedule rules, otherwise the tenant timezone
  when one is stored, else UTC (help text says which); 15-minute floor kept.
- **M6 Conversion correlation**: contacts use `contacts.leadId` (`LeadService.ts:383-391`; a manually created contact
  with `leadId` is deliberately treated the same, with a test); accounts rely on the 10-minute in-memory correlation set,
  lost on restart — accepted, documented in ADR-084 with the at-most-once window.
- **M7 Watched set**: primed synchronously before the intake registers; a new rule may miss events for up to one tick
  (≤ 15 s) — help text "rules apply to events after saving" and ADR-084.
- **M8 Cap counting**: count recent runs once per rule per tick and increment in memory within the tick (cross-replica
  overshoot accepted).
- **M9 IP failure limiter**: counts malformed-token 404s, unknown-token 404s and 401s; key = rightmost forwarded hop →
  `x-real-ip` → `'unknown'`; single-trusted-proxy assumption in ADR-084; test that many valid signed requests from one IP
  are never 429'd by it.
- **M10 `API_PUBLIC_URL`**: webhook create / rotate / regenerate fail with PRECONDITION_FAILED when unset; never the
  `Host` header.
- **M11 Encryption helpers**: export `isEncrypted`, `encryptField`, `decryptField` from `@intelliflow/db`
  (`packages/db/src/index.ts`), rebuild the db dist; integration case proving the 503 guard on a plaintext secret.
- **M12 Sentry scrub**: scrub `event.request.url`, `event.transaction`, span descriptions and `breadcrumb.data.url` /
  `data.to` for `/webhooks/task-automation/<token>`; extend `apps/api/src/tracing/sentry.test.ts` per field.
- **M13 UI**: Test Rule covers SCHEDULE and WEBHOOK rules (webhook test run has no variables); Move Up/Down keeps focus on
  the moved row's button and announces "Moved to position N of M"; test that a rule toggle invalidating `list` keeps
  unsaved Settings edits; run the full `ScheduleDialog` / `ScheduledReportsContent` suites right after the cadence
  extraction; rule row shows a `no_eligible_owner` last run prominently; dialog help says system-owned leads produce
  system-owned tasks (a `lead.created` source filter is a follow-up issue).

## Agent Sign-offs

| Agent | Round 3 | Round 4 | Files verified (Round 4) |
|---|---|---|---|
| Backend-Architect | APPROVE WITH CHANGES (2 blockers) | **APPROVED** | spec v2, discussion, rulings 6-7, `task.router.ts`, `tenant-context.ts`, `http-server.ts`, `notifications.router.ts`, `notifications.ts`, `schema.prisma`, `Task.ts`, `TaskService.ts`, `PrismaTaskRepository.ts`, `container.ts` |
| Security-Lead | APPROVE WITH CHANGES (2 blockers) | **APPROVED** | spec v2, discussion, rulings, ADR-084, `http-server.ts`, `tracing/sentry.ts`, `rate-limit.ts`, `client-ip.ts`, `field-encryption.ts`, `client.ts`, `membership.ts`, `framework.ts`, `TaskService.ts`, `PrismaTaskRepository.ts`, `account-reassign.ts`, `account-territories.router.ts` |
| Frontend-Lead | APPROVE WITH CHANGES | **APPROVED** | spec v2 (Web, reuse table, registries, ACs, tests), discussion, `TerritoryList.tsx:32` |
| Domain-Expert | APPROVE WITH CHANGES (3 blockers) | **APPROVED** | spec v2, discussion, rulings 6-7, `LeadService.ts`, `Contact.ts`, `Opportunity.ts`, `TaskService.ts`, `inbound.router.ts` |
| Test-Engineer | APPROVE WITH CHANGES (1 blocker) | **APPROVED** | spec v2, discussion, `db/src/index.ts`, `field-encryption.ts`, `sentry.ts`, `client-ip.ts`, `http-server.ts`, `http-server.approval-sweep.test.ts`, `contact-types.test.ts`, `schema-lock.ts`, `sonar-project.properties`, `.gitleaks/shared.toml`, `LeadEvents.ts` |

Consensus: 5/5 (100% ≥ 66%), no unresolved critical issue.
