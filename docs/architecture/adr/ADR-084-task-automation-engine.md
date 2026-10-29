# ADR-084: Task Automation Rules Executed Inside the API Process

**Status:** Accepted (2026-10-21, PG-208 exec: implemented and validated; see
"Implementation outcome" below. Proposed 2026-10-20 in the PG-208 spec session.)

**Date:** 2026-10-20

**Deciders:** Talysson Oliveira (owner rulings 2026-10-20: all three trigger
types execute in PG-208; event triggers delivered inside the API; automation
tasks owned by the trigger record's owner; no task-event triggers in v1; closed
records linked to the related record or left unlinked); PG-208 spec session

**Technical Story:** PG-208 — Module Settings: Task Automation
(`.specify/sprints/sprint-18/context/PG-208/PG-208-owner-ruling.md`)

## Context and Problem Statement

PG-208 adds tenant-defined task automation rules: _when a trigger fires, create
a task, optionally assign it by round-robin, optionally notify people_. The
owner ruled that all three trigger types (entity event, schedule, webhook) must
actually execute in this PR: no rule may be saved that nothing acts on
(module-settings playbook §8).

Nothing in the repo executes stored rules today:

- `WorkflowDefinition`, `BusinessRule` and `RoutingRule` are stored but have no
  executor (`apps/api/src/modules/workflow/workflow.router.ts` is CRUD; the
  platform rules engine's `create_task` is a stub,
  `packages/platform/src/workflow/rules-engine.ts:537-559`).
- Domain events are published on an **in-memory** bus in the API
  (`apps/api/src/container.ts:376`). `OutboxEventBusAdapter` is never
  constructed in production; the only outbox writer is
  `apps/api/src/modules/billing/subscription-sync.ts:102`.
- The events-worker is not deployed
  (`.github/workflows/deploy-workers.yml:8-14`, "GATED + DORMANT BY DESIGN") and
  its scheduled jobs have no multi-instance lock.
- Domain events carry no `tenantId`
  (`packages/domain/src/shared/DomainEvent.ts`). `LeadService` publishes inside
  its database transaction and lets handler errors propagate
  (`LeadService.ts:140-143, 758-761`).
- The only inbound webhook framework keeps its sources and idempotency keys in
  per-request memory (`apps/api/src/modules/webhooks/webhooks.router.ts:57-74`).

Where should the rule engine run, and how does each trigger reach it reliably?

## Decision Drivers

- Works in production on merge, with no new deployed service (owner ruling 2).
- Never slows down, fails or rolls back the business write that raised the
  event.
- Tenant isolation without relying on RLS (`tenant-context.ts:119-135`: explicit
  `tenantId` is the boundary).
- Safe with several API replicas (no double execution).
- Idempotent per trigger occurrence; bounded fan-out per rule and tenant.
- The public webhook must be safe to expose (signature, replay window,
  idempotency, size and rate limits, constant-time compares, opaque URL).

## Considered Options

1. **In-API engine**: subscribe to the API's in-process event bus, buffer, write
   durable run rows, and execute them from a locked interval runner in the API
   process (the `approval-sweep-scheduler.ts` pattern). Schedules and webhooks
   enqueue run rows into the same table.
2. **Outbox + events-worker**: switch the container to `OutboxEventBusAdapter`,
   deploy the events-worker, run rules in an outbox handler.
3. **Reuse `WorkflowDefinition` + build a general workflow executor**.

## Decision Outcome

Chosen option: **1, in-API engine**. The owner chose it (ruling 2) and it is the
only option that runs in production without changing event publishing for every
service or provisioning a new service.

### Design

- **Tables (Class A, additive; one migration):** `task_automation_rules`,
  `task_automation_runs` (unique `(ruleId, idempotencyKey)`),
  `task_automation_settings` (one row per tenant), `task_automation_tags`
  (colour-token CHECK). RLS enabled on all four; every query passes `tenantId`
  explicitly.
- **Event intake:** a subscriber on the API's event bus for the v1 event list
  (lead, contact, opportunity, account events). The handler never throws and
  never touches the database: it pushes
  `{eventId, eventType, entityId, occurredAt}` into a bounded in-process buffer.
  A drain step on the runner tick loads the record by id (which yields
  `tenantId` and `ownerId`), retries a missing record for a short grace period
  (the lead transaction may not have committed yet), drops it after the grace
  period (the write rolled back), and inserts one `PENDING` run per matching
  active rule with idempotency key `event:<eventId>`.
- **Schedule:** rules store `cron`, `timezone` and `nextRunAt`. The tick claims
  due rules with a compare-and-set update on `nextRunAt` and inserts a run with
  key `schedule:<slot ISO>`. Cron helpers are reused from
  `apps/api/src/modules/analytics/scheduled-reports.schedule.ts`.
- **Webhook:** raw-body route `POST /api/webhooks/task-automation/<token>` in
  `apps/api/src/http-server.ts`, before tRPC. The URL token is random, stored
  only as a SHA-256 hash; the signing secret is separate and stored encrypted
  (`packages/db/src/field-encryption.ts`). Stripe-style signature
  `t=<unix>,v1=<hmac-sha256(secret, t + "." + idempotencyKey + "." + rawBody)>`,
  ±300 s window, constant-time compare, required `Idempotency-Key`, 64 KB body
  cap, per-rule and per-IP limits, identical response for every failure. A valid
  call inserts a run with key `webhook:<Idempotency-Key>` and returns 202.
- **Runner:** `startTaskAutomationRunner` from `startApiServer` only (never
  under test or serverless). Each tick drains the event buffer, enqueues due
  schedules, claims a bounded batch of `PENDING` runs and executes them: create
  the task through `TaskService`, assign by round-robin (atomic `rrCursor`
  increment, PG-197 pattern, members filtered by `tenantUserWhere`), notify
  through `createNotification`. Per-run failures are recorded on the run row and
  never stop the batch.
- **Loop prevention:** task events are not triggers in v1 (owner ruling 4), so a
  task created by automation cannot fire a rule.

### Round 3 refinements (spec v2, 2026-10-21)

- The webhook signature covers `${t}.${idempotencyKey}.${rawBody}`, so a
  captured request cannot be replayed under a new key; a key reused with a
  different body is refused (409).
- The intake is registered only when the runner runs, and buffers only event
  types that have at least one active rule; caps are enforced before a run row
  is written.
- The store uses the Prisma model API only (conditional `updateMany` for the
  schedule and run claims, `create` + P2002 for idempotency), so no advisory
  lock is needed and the field-encryption extension always applies to secrets.
- Owner chain: record owner if still a tenant user, else the rule creator if
  still a tenant user, else the run is skipped (`no_eligible_owner`). Lead
  conversions fire `lead.converted` rules only (owner ruling 7). Assignees see
  assigned tasks (owner ruling 6).

### Implementation outcome (PG-208 exec, 2026-10-21)

Changes made during validation (security and a11y reviews, 11 Codex review
rounds, owner rulings 8 and 9) that supersede parts of the text above:

- **One locked run admission** (owner ruling 8, supersedes spec M8's accepted
  cross-replica overshoot and the "no advisory lock is needed" note above):
  every path that writes a run (event drain, schedule slot, webhook, Test Rule)
  checks the idempotency key, counts the caps and inserts under one per-tenant
  `pg_advisory_xact_lock` transaction (`TaskAutomationStore.admitRun`). A
  schedule slot's compare-and-set and its run insert share one transaction
  (`claimSlotAndAdmit`), so a crash can never consume a slot without a run.
- **Rules apply to later events only:** `task_automation_rules.effectiveFrom`
  (set on create, edit and reactivation) bounds which events a rule runs for;
  each run stores an `actions` snapshot taken at admission and executes it, and
  a schedule run also stores the schedule's timezone with its slot, so an edit
  never changes an accepted run (owner ruling 9).
- **Automation off means off:** `task_automation_settings.automationEnabledAt`
  records when automation was turned back on; events and schedule slots from the
  off period never run.
- **Postconditions:** lead events (published inside `LeadService`'s transaction)
  keep their state postconditions and are retried within the 30 s grace before
  being dropped; deal events are published after `OpportunityService` saves, so
  they need no postcondition (a later stage change or a reopen does not cancel
  them). A transient error while draining an event requeues it within the same
  grace.
- **Event delivery today:** the container wires `InMemoryEventBus`
  (`apps/api/src/container.ts:376`) and every service publishes to that
  instance; the intake subscribes to it, so event triggers work in production
  in-process, independent of the outbox (#966, #889). The at-most-once window
  below stands.
- **Secrets out of telemetry:** the webhook path gets no Sentry transaction and
  no OTel HTTP span; transactions, span attributes, breadcrumbs and the
  signature / Idempotency-Key headers are scrubbed.
- **Tracked, not fixed (owner ruling 9):** #968 (a lead converted into an
  existing account suppresses its `account.created` rules) and #969 (run
  retention purge throughput).

Validation evidence: `.specify/sprints/sprint-18/attestations/PG-208/`
(red-green logs, attestation) and the integration suite
`tests/integration/task-automation.test.ts` (46 tests on a freshly migrated DB).

### Dependencies and accepted risks

- **RLS bypass.** The engine and webhook read with the container's `apiPrisma`,
  which sets no tenant; this works because the API role bypasses non-forced RLS
  (same dependency as ADR-078, which records the `rolbypassrls` check). Every
  query still filters by `tenantId`.
- **Encryption key.** Signing secrets use `PRISMA_FIELD_ENCRYPTION_KEY`. The key
  has no versioning: changing it makes stored secrets unreadable, and the
  runbook is to rotate every webhook rule's secret (the verifier answers 503 for
  an unreadable or unencrypted secret outside test). Idempotency keys are scoped
  per rule and kept 30 days; a key reused after the purge creates a new run.
- **Token in the URL path** may appear in edge/proxy access logs; the HMAC
  secret is the real credential, and Sentry events are scrubbed.
- **Assignee access.** Persisting `assigneeId` means assignees gain the access
  the agent authorization already grants to assignees
  (`apps/api/src/agent/authorization.ts:292`).
- **Record names in tasks and notifications** can reach pool members who cannot
  open the record. Rules are admin-authored; accepted.
- **Small windows (accepted):** a rule saved now may miss events for up to one
  runner tick (the watched-type set refreshes per tick); the conversion
  correlation set for `account.created` is in memory, so a restart between
  buffering and drain can let a conversion-born account fire (contacts are
  checked through `contacts.leadId` and are not affected).
- **Webhook IP limiter** keys on the rightmost forwarded hop, then `x-real-ip`,
  assuming one trusted proxy in front of the API; it counts failures only, so a
  shared edge IP can never block valid signed calls.
- **AI toggles:** none exist on these models; the playbook's "AI defaults FALSE"
  item is N/A.

### Positive Consequences

- Runs in production on merge; no new service, no change to how any service
  publishes events.
- Every execution is a durable, inspectable run row with a unique idempotency
  key; replicas cannot double-execute.
- The business write that raised an event is never slowed or rolled back by
  automation.

### Negative Consequences

- **Event intake is at-most-once between the event and the drain**: if the API
  process dies in the seconds between an event being buffered and the drain
  writing its run row, that occurrence is lost. Schedule and webhook triggers
  are durable from the moment their run row is written. Moving event intake to
  the outbox (option 2) removes this window and stays possible later; the rule
  and run tables do not change.
- Each replica only sees events raised by its own requests (correct, no
  duplication) but the runner itself executes runs for every tenant, so it must
  stay bounded (batch size, per-rule hourly cap, per-tenant cap).
- A new public endpoint on the API server, with its own threat model (spec
  "Security" section).

## Pros and Cons of the Options

### Option 2 — outbox + events-worker

- Good: durable from the business transaction onwards.
- Bad: changes event publishing for every service (`container.ts:376`), and
  needs the worker provisioned on Railway (a deploy and a cost the owner must
  approve). Rejected by owner ruling 2.

### Option 3 — reuse `WorkflowDefinition`

- Good: one automation model.
- Bad: a general workflow executor is far larger than this task; the table is
  owned by the workflow builder UI (`/cases/case-workflows`) and has a different
  shape (`steps` graph, soft delete, versioning). Task automation stays a simple
  per-module rule list; compiling it into workflow definitions later stays
  possible.

## Links

- Spec: `.specify/sprints/sprint-18/specifications/PG-208-spec.md`
- Owner rulings:
  `.specify/sprints/sprint-18/context/PG-208/PG-208-owner-ruling.md`
- ADR-069 (migration risk classes), ADR-078 (report schedule contract — cron
  helpers), ADR-079 (approval sweep runner pattern)
