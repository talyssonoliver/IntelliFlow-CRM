# Property-Based & Race-Condition Testing — Phase 0 Audit

> **Status**: Phase 0 complete — read-only fan-out audit across 11 lanes.
> **Phase 1 prerequisite**: install `fast-check` + `@fast-check/vitest`, create
> `tests/property/` scaffolding, wire smoke tier into PR CI.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Methodology](#2-methodology)
3. [Lane Findings](#3-lane-findings)
   - 3.1 [Booking / Scheduling](#31-booking--scheduling)
   - 3.2 [Routing / Assignment](#32-routing--assignment)
   - 3.3 [Duplicate Detection & Merge](#33-duplicate-detection--merge)
   - 3.4 [Webhooks / Outbox / Idempotency](#34-webhooks--outbox--idempotency)
   - 3.5 [Queue / Background Jobs](#35-queue--background-jobs)
   - 3.6 [RBAC / Auth / Session / MFA](#36-rbac--auth--session--mfa)
   - 3.7 [Quota / Budget / Capacity](#37-quota--budget--capacity)
   - 3.8 [Entitlement / Tenant Modules](#38-entitlement--tenant-modules)
   - 3.9 [Audit Log](#39-audit-log)
   - 3.10 [Pure Domain Invariants](#310-pure-domain-invariants)
   - 3.11 [Test Infrastructure](#311-test-infrastructure)
4. [Cross-Cutting Risk Patterns](#4-cross-cutting-risk-patterns)
5. [Test Infrastructure Gaps](#5-test-infrastructure-gaps)
6. [Appendix: Full Confirmed Findings](#6-appendix-full-confirmed-findings)

---

## 1. Executive Summary

This audit surveyed **11 lanes** covering the IntelliFlow CRM monorepo for
property-based testing gaps and concurrency race conditions. The audit was
conducted via read-only static analysis followed by adversarial verification of
every candidate finding.

### Finding Counts

| Disposition                |   Count |
| -------------------------- | ------: |
| Total candidates raised    |     111 |
| **Confirmed**              | **107** |
| Dismissed (false positive) |       4 |

### Confirmed by Severity

| Severity | Count |
| -------- | ----: |
| Critical |     6 |
| High     |    36 |
| Medium   |    40 |
| Low      |    25 |

### Property-Based Test Candidates Identified

**43** pure-function or state-machine objects were identified as suitable
property-test targets across all lanes (full list in the per-lane tables and
appendix).

### Headline Critical Races

The six Critical findings represent the highest-priority remediation targets.
All six have **no existing mitigation** and are confirmed exploitable in a
multi-process or concurrent-request production deployment:

| ID            | Title                                                                                                                 | Lane                |
| ------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------- |
| RACE-AUDIT-01 | Hash-chain `previousHash` mutated after transaction commit — concurrent calls produce broken chains                   | audit-log           |
| RACE-BOOKI-01 | Double-confirm: bare read-check-write on appointment status without transaction                                       | booking-scheduling  |
| RACE-BOOKI-02 | Slot double-booking: conflict-check and slot creation not in a single serialisable transaction                        | booking-scheduling  |
| RACE-ENTIT-03 | `handleSubscriptionWebhook` has no signature verification and no idempotency key                                      | entitlement-modules |
| RACE-ENTIT-04 | `ensureCustomer` read-check-write on `stripeCustomerId` — concurrent double-submit creates duplicate Stripe customers | entitlement-modules |
| RACE-RBAC-M1  | Consumed backup code never persisted to DB — same code reusable after cache eviction or process restart               | rbac-auth-session   |

---

## 2. Methodology

### Audit Approach

The audit used a read-only fan-out pattern across 11 functional lanes. For each
lane, a batch of source files was inspected (16–35 files per lane, 188 files in
total). Each candidate finding was subjected to adversarial verification: a
second-pass reviewer independently assessed evidence file paths, line numbers,
schema constraints, and existing mitigations before confirming or dismissing the
finding.

### Lane Inventory

| Lane                        | Batch | Files Inspected | Confirmed | Dismissed |
| --------------------------- | ----: | --------------: | --------: | --------: |
| booking-scheduling          |     2 |              16 |         7 |         2 |
| routing-assignment          |   1+2 |              13 |         8 |         0 |
| dedupe-merge                |     2 |              17 |        10 |         0 |
| webhooks-outbox-idempotency |     1 |              18 |         9 |         0 |
| workers-queue-jobs          |     3 |              17 |        11 |         0 |
| rbac-auth-session           |   1+2 |              11 |         9 |         1 |
| quota-budget-capacity       |     2 |              17 |         6 |         1 |
| entitlement-modules         |     3 |              15 |         9 |         0 |
| audit-log                   |     2 |              17 |        10 |         0 |
| pure-domain                 |     1 |              29 |        17 |         0 |
| test-infra                  |   0+1 |              35 |        11 |         0 |

### Severity Model

| Level        | Definition                                                                                                                  |
| ------------ | --------------------------------------------------------------------------------------------------------------------------- |
| **Critical** | Exploitable in production without special conditions; corrupts financial, auth, or compliance state; no existing mitigation |
| **High**     | Exploitable under concurrent load or horizontal scaling; directly affects data integrity, billing, or access control        |
| **Medium**   | Exploitable but requires specific timing or deployment configuration; recoverable or limited blast radius                   |
| **Low**      | Latent risk, test isolation issue, pure-domain logic gap, or missing property test coverage with no production exploit path |

### Race Pattern Taxonomy

| Pattern                   | Description                                                                                  |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| `read-check-write`        | Read a value, validate it, write — two transactions read the same value before either writes |
| `check-then-act`          | Guard condition evaluated outside the transaction that performs the action                   |
| `lost-update`             | Load-mutate-save across two separate DB calls; concurrent writes overwrite each other        |
| `non-atomic-decrement`    | Counter decremented without a WHERE guard or DB-level ceiling                                |
| `non-atomic-upsert`       | findFirst-then-create without transaction and without DB unique constraint                   |
| `missing-transaction`     | Two logically-coupled DB writes issued as separate awaits                                    |
| `missing-idempotency-key` | No unique constraint or idempotency token to deduplicate retried operations                  |
| `duplicate-event`         | Same domain event or job enqueued multiple times without dedup key                           |
| `tenancy-scope-leak`      | Query missing `tenantId` filter, allowing cross-tenant data access                           |
| `infra-gap`               | Missing test infrastructure, dependency, or CI wiring — no runtime race                      |

---

## 3. Lane Findings

---

### 3.1 Booking / Scheduling

**Posture summary**: The booking-scheduling lane has two Critical races
concentrated in the appointment confirmation and slot-booking flows. The Prisma
`Appointment` model carries no `@@unique` constraint on
`(organizerId, startTime, endTime)` and no status-transition guard at the DB
level, so the DB cannot backstop any of the top three findings. The load-mutate-
save pattern (`RescheduleAppointment`, `CompleteAppointment`) produces the same
lost-update vulnerability as a structural defect across all three scheduling use
cases. A single version-column migration on `Appointment` would fix all three
simultaneously. Zero property-based tests exist anywhere in the repository.

#### Confirmed Findings

| ID            | Severity     | Race Pattern            | Aggregate / Service                                                     | Current Coverage | Proposed Test Type | Batch |
| ------------- | ------------ | ----------------------- | ----------------------------------------------------------------------- | ---------------- | ------------------ | ----- |
| RACE-BOOKI-01 | **Critical** | read-check-write        | `apps/api/src/modules/legal/appointments.router.ts`                     | unit-mocked      | scheduler-race     | 2     |
| RACE-BOOKI-02 | **Critical** | check-then-act          | `packages/application/src/usecases/scheduling/ScheduleAppointment.ts`   | unit-mocked      | db-concurrency     | 2     |
| RACE-BOOKI-03 | **High**     | lost-update             | `packages/application/src/usecases/scheduling/RescheduleAppointment.ts` | unit-mocked      | db-concurrency     | 2     |
| RACE-BOOKI-M1 | **High**     | missing-idempotency-key | `apps/workers/events-worker/src/maintenance/scheduled-jobs.ts`          | none             | scheduler-race     | 2     |
| RACE-BOOKI-M2 | **High**     | lost-update             | `packages/application/src/usecases/scheduling/CompleteAppointment.ts`   | unit-mocked      | db-concurrency     | 2     |
| RACE-BOOKI-04 | **Medium**   | non-atomic-upsert       | `packages/adapters/src/repositories/PrismaAppointmentRepository.ts`     | unit-mocked      | pure-property      | 2     |
| RACE-BOOKI-M3 | **Medium**   | read-check-write        | `apps/api/src/modules/legal/appointments.router.ts`                     | unit-mocked      | scheduler-race     | 2     |

#### Already-Guarded / Dismissed

| ID            | Reason                                                                                                                                                                                                                                             |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RACE-BOOKI-05 | False positive. `calendar.router.ts` has no ownership-transfer endpoint; `updateCalendarSchema` accepts only `{ name?, color? }` — `ownerId` cannot be mutated via any tRPC mutation. The TOCTOU precondition cannot be triggered.                 |
| RACE-BOOKI-06 | False positive. `AppointmentAttendee.@@unique([appointmentId, userId])` (schema line 1669) and `AppointmentCase.@@unique([appointmentId, caseId])` (schema line 1685) fully backstop the check-then-create race; DB rejects duplicates with P2002. |

---

### 3.2 Routing / Assignment

**Posture summary**: The routing-assignment lane has one Critical race on the
`autoRoute` ticket path (all routing decisions made outside the `routeTicket`
transaction with no idempotency guard) and two High races (agent capacity
overrun with no `WHERE currentCapacity < maxCapacity` guard; stale
`previousOwnerId` in bulk reassign audit logs). The most severe structural
defect is `assignLead` (RACE-ROUTI-M1): manual assignments never increment
`agentAvailability.currentCapacity`, causing permanent capacity drift. Zero
concurrency tests exist for this lane.

#### Confirmed Findings

| ID            | Severity     | Race Pattern         | Aggregate / Service                                    | Current Coverage | Proposed Test Type | Batch |
| ------------- | ------------ | -------------------- | ------------------------------------------------------ | ---------------- | ------------------ | ----- |
| RACE-ROUTI-01 | **Critical** | read-check-write     | `apps/api/src/modules/ticket/ticket-routing.router.ts` | unit-mocked      | scheduler-race     | 1     |
| RACE-ROUTI-02 | **High**     | non-atomic-decrement | `apps/api/src/services/LeadRoutingService.ts`          | unit-mocked      | db-concurrency     | 1     |
| RACE-ROUTI-M1 | **High**     | missing-transaction  | `apps/api/src/modules/routing/routing.router.ts`       | unit-mocked      | db-concurrency     | 2     |
| RACE-ROUTI-03 | **Medium**   | read-check-write     | `apps/api/src/modules/account/account-reassign.ts`     | unit-mocked      | scheduler-race     | 1     |
| RACE-ROUTI-04 | **Medium**   | check-then-act       | `apps/api/src/modules/routing/routing.router.ts`       | none             | scheduler-race     | 1     |
| RACE-ROUTI-05 | **Medium**   | lost-update          | `apps/api/src/services/LeadRoutingService.ts`          | unit-mocked      | scheduler-race     | 1     |
| RACE-ROUTI-M2 | **Medium**   | check-then-act       | `apps/api/src/modules/routing/routing.router.ts`       | none             | scheduler-race     | 2     |
| RACE-ROUTI-M3 | **Medium**   | read-check-write     | `apps/api/src/modules/account/account.router.ts`       | unit-mocked      | scheduler-race     | 2     |

#### Already-Guarded / Dismissed

None dismissed in this lane.

---

### 3.3 Duplicate Detection & Merge

**Posture summary**: The dedupe-merge lane has strong transactional guards for
the core merge path (`PrismaContactRepository.mergeInTransaction` wraps all
child re-parenting in a single `$transaction` with an in-transaction tenant
re-verify). However five distinct High races remain: the contact/lead create
path has a check-then-act email uniqueness gap (DB constraint backstops it but
surfaces an opaque `PersistenceError`); the `findByEmail`/`existsByEmail`
methods lack `tenantId` scoping (RACE-DEDUP-05), causing cross-tenant false
positives that block legitimate creates; `updateContactEmail` inherits the same
cross-tenant scope leak; `convertLead` has a non-atomic two-step write with no
wrapping transaction; and inbound lead deduplication has no
`@@unique([tenantId, submissionId])` backstop.

#### Confirmed Findings

| ID            | Severity   | Race Pattern        | Aggregate / Service                                                   | Current Coverage | Proposed Test Type | Batch |
| ------------- | ---------- | ------------------- | --------------------------------------------------------------------- | ---------------- | ------------------ | ----- |
| RACE-DEDUP-01 | **High**   | check-then-act      | `packages/application/src/services/ContactService.ts`                 | unit-mocked      | db-concurrency     | 2     |
| RACE-DEDUP-02 | **High**   | read-check-write    | `packages/application/src/services/ContactService.ts`                 | unit-mocked      | scheduler-race     | 2     |
| RACE-DEDUP-03 | **High**   | check-then-act      | `apps/api/src/modules/inbound/inbound.router.ts`                      | none             | scheduler-race     | 2     |
| RACE-DEDUP-05 | **High**   | tenancy-scope-leak  | `packages/adapters/src/repositories/PrismaContactRepository.ts`       | unit-mocked      | pure-property      | 2     |
| RACE-DEDUP-M1 | **High**   | missing-transaction | `packages/application/src/services/LeadService.ts`                    | unit-mocked      | db-concurrency     | 2     |
| RACE-DEDUP-M3 | **High**   | check-then-act      | `packages/application/src/services/ContactService.ts`                 | unit-mocked      | db-concurrency     | 2     |
| RACE-DEDUP-04 | **Medium** | non-atomic-upsert   | `apps/api/src/modules/contact/contact.router.ts`                      | unit-mocked      | scheduler-race     | 2     |
| RACE-DEDUP-06 | **Medium** | missing-transaction | `apps/api/src/modules/account/account-duplicate-detection.service.ts` | unit-mocked      | db-concurrency     | 2     |
| RACE-DEDUP-M2 | **Medium** | duplicate-event     | `apps/workers/events-worker/src/outbox/pollOutbox.ts`                 | unit-mocked      | db-concurrency     | 2     |
| RACE-DEDUP-07 | **Low**    | infra-gap           | `apps/api/src/shared/duplicate-rule-evaluator.ts`                     | unit-mocked      | pure-property      | 2     |

#### Already-Guarded / Dismissed

None dismissed in this lane. Note that `RACE-DEDUP-02` (bidirectional merge) was
downgraded to Medium from High because
`PrismaContactRepository.mergeInTransaction` re-verifies both IDs inside the
`$transaction`; the `CrossTenantOrNotFoundError` path prevents data corruption,
though duplicate `ContactMergedEvent` publication remains a real residual risk.

---

### 3.4 Webhooks / Outbox / Idempotency

**Posture summary**: The outbox dispatch path has a genuine but bounded
concurrency posture. The strongest guard — `SELECT ... FOR UPDATE SKIP LOCKED`
in `PrismaOutboxRepository.fetchPendingEvents` — is real but its lock is held
only for the duration of the raw SQL statement (autocommit), not through the
application-level dispatch. Three races remain unmitigated: the
`OutboxEventBusAdapter.publish` findFirst-then-create gap (no `@@unique` on
`DomainEvent.idempotencyKey`); the dispatch-then-markAsPublished non-atomic
sequence; and the in-memory `IdempotencyStore` check-then-set across an async
yield point. The `publishAll` path uses `withTransaction` but the underlying
`withTransaction` helper references the module-level singleton `prisma` rather
than `this.prisma`, silently bypassing injected tenant clients.

#### Confirmed Findings

| ID            | Severity   | Race Pattern            | Aggregate / Service                                            | Current Coverage | Proposed Test Type | Batch |
| ------------- | ---------- | ----------------------- | -------------------------------------------------------------- | ---------------- | ------------------ | ----- |
| RACE-WEBHO-01 | **High**   | read-check-write        | `packages/adapters/src/events/OutboxEventBusAdapter.ts`        | unit-mocked      | db-concurrency     | 1     |
| RACE-WEBHO-02 | **High**   | missing-transaction     | `apps/workers/events-worker/src/outbox/pollOutbox.ts`          | unit-mocked      | model-based        | 1     |
| RACE-WEBHO-M1 | **High**   | read-check-write        | `packages/adapters/src/events/OutboxEventBusAdapter.ts`        | unit-mocked      | db-concurrency     | 1     |
| RACE-WEBHO-M3 | **High**   | missing-transaction     | `packages/adapters/src/repositories/PrismaOutboxRepository.ts` | unit-mocked      | db-concurrency     | 1     |
| RACE-WEBHO-03 | **Medium** | check-then-act          | `packages/webhooks/src/framework.ts`                           | unit-mocked      | scheduler-race     | 1     |
| RACE-WEBHO-04 | **Medium** | infra-gap               | `packages/adapters/src/events/OutboxEventBusAdapter.ts`        | unit-mocked      | pure-property      | 1     |
| RACE-WEBHO-05 | **Medium** | missing-idempotency-key | `packages/webhooks/src/framework.ts`                           | unit-mocked      | scheduler-race     | 1     |
| RACE-WEBHO-M2 | **Medium** | check-then-act          | `packages/webhooks/src/framework.ts`                           | unit-mocked      | scheduler-race     | 1     |
| RACE-WEBHO-06 | **Low**    | missing-transaction     | `packages/adapters/src/events/OutboxEventBusAdapter.ts`        | unit-mocked      | pure-property      | 1     |

#### Already-Guarded / Dismissed

None dismissed in this lane.

---

### 3.5 Queue / Background Jobs

**Posture summary**: The workers-queue-jobs lane has a solid foundation: BullMQ
provides native at-most-once delivery via Redis-backed job locking; the outbox
poller uses `FOR UPDATE SKIP LOCKED`; all three AI insight upserts land on
Prisma `upsert` backed by `@@unique([leadId, tenantId])`. The primary risk
concentration is in the `MaintenanceScheduler`: five `setInterval` jobs each use
a findFirst-then-create deduplication pattern with no transaction or unique
constraint, making duplicate notifications the dominant failure mode under
horizontal scaling. A secondary defect — `enqueueAIScoring` calls `canRetry()`
but never `consumeRetry()` (RACE-WORKE-04) — renders burst-protection
permanently inoperative.

#### Confirmed Findings

| ID            | Severity   | Race Pattern            | Aggregate / Service                                            | Current Coverage | Proposed Test Type | Batch |
| ------------- | ---------- | ----------------------- | -------------------------------------------------------------- | ---------------- | ------------------ | ----- |
| RACE-WORKE-04 | **High**   | check-then-act          | `packages/platform/src/queues/queue-factory.ts`                | unit-mocked      | pure-property      | 3     |
| RACE-WORKE-M3 | **High**   | missing-idempotency-key | `packages/adapters/src/repositories/PrismaOutboxRepository.ts` | unit-mocked      | db-concurrency     | 3     |
| RACE-WORKE-01 | **High**   | check-then-act          | `apps/workers/events-worker/src/maintenance/scheduled-jobs.ts` | none             | scheduler-race     | 3     |
| RACE-WORKE-02 | **Medium** | check-then-act          | `apps/workers/events-worker/src/maintenance/scheduled-jobs.ts` | none             | scheduler-race     | 3     |
| RACE-WORKE-03 | **Medium** | check-then-act          | `apps/ai-worker/src/jobs/insight-generation.job.ts`            | unit-mocked      | db-concurrency     | 3     |
| RACE-WORKE-06 | **Medium** | lost-update             | `apps/ai-worker/src/account-scoring.chain.ts`                  | none             | db-concurrency     | 3     |
| RACE-WORKE-M1 | **Medium** | check-then-act          | `apps/ai-worker/src/jobs/insight-generation.job.ts`            | unit-mocked      | db-concurrency     | 3     |
| RACE-WORKE-M2 | **Medium** | duplicate-event         | `apps/ai-worker/src/jobs/account-scoring.job.ts`               | none             | scheduler-race     | 3     |
| RACE-WORKE-05 | **Low**    | duplicate-event         | `apps/ai-worker/src/jobs/scoring.job.ts`                       | none             | scheduler-race     | 3     |
| RACE-WORKE-07 | **Low**    | check-then-act          | `apps/ai-worker/src/jobs/insight-generation.job.ts`            | unit-mocked      | db-concurrency     | 3     |
| RACE-WORKE-08 | **Low**    | non-atomic-upsert       | `packages/platform/src/queues/retry-strategy.ts`               | unit-mocked      | pure-property      | 3     |

#### Already-Guarded / Dismissed

None dismissed in this lane. Note: RACE-WORKE-05 was downgraded from Medium to
Low because `scoring.job.ts:399` uses `prisma.leadAIInsight.upsert` keyed on
`@@unique([leadId, tenantId])` (schema line 2707), making the final stored
result idempotent even if the sentinel job re-fires; impact is redundant LLM
calls and queue bloat, not data corruption.

---

### 3.6 RBAC / Auth / Session / MFA

**Posture summary**: The RBAC/auth/session lane has moderate-to-critical
concurrency posture issues concentrated on three axes: (1) module-level
JavaScript `Map` stores (`sessionsByUser`, `sessionStore`, `challengeStore`,
`mfaSettingsCache`) shared across all concurrent requests; (2) two-step
findUnique-then-upsert in `assignRole`/`setUserPermission` without a wrapping
`$transaction`; (3) in-process permission cache that is not coherent across
replicas. The most severe finding (RACE-RBAC-M1) is that a consumed backup code
is **never** written back to the DB — the same backup code is reusable after
process restart or cache eviction.

One finding (RACE-RBAC-02) was dismissed as a false positive: the entire
`verifyChallenge` critical section contains zero `await` expressions, so the
Node.js single-threaded event loop provides atomicity.

#### Confirmed Findings

| ID           | Severity     | Race Pattern            | Aggregate / Service                        | Current Coverage | Proposed Test Type | Batch |
| ------------ | ------------ | ----------------------- | ------------------------------------------ | ---------------- | ------------------ | ----- |
| RACE-RBAC-M1 | **Critical** | missing-idempotency-key | `apps/api/src/services/mfa.service.ts`     | unit-mocked      | scheduler-race     | 2     |
| RACE-RBAC-01 | **High**     | read-check-write        | `apps/api/src/services/session.service.ts` | unit-mocked      | scheduler-race     | 1     |
| RACE-RBAC-03 | **High**     | lost-update             | `apps/api/src/modules/auth/auth.router.ts` | unit-mocked      | db-concurrency     | 1     |
| RACE-RBAC-06 | **High**     | tenancy-scope-leak      | `apps/api/src/security/rbac.ts`            | unit-mocked      | pure-property      | 1     |
| RACE-RBAC-07 | **High**     | read-check-write        | `apps/api/src/services/mfa.service.ts`     | unit-mocked      | scheduler-race     | 1     |
| RACE-RBAC-M2 | **High**     | infra-gap               | `apps/api/src/services/session.service.ts` | unit-mocked      | db-concurrency     | 2     |
| RACE-RBAC-04 | **Medium**   | check-then-act          | `apps/api/src/security/rbac.ts`            | unit-mocked      | db-concurrency     | 1     |
| RACE-RBAC-05 | **Medium**   | lost-update             | `apps/api/src/security/rbac.ts`            | unit-mocked      | pure-property      | 1     |
| RACE-RBAC-M3 | **Medium**   | lost-update             | `apps/api/src/services/mfa.service.ts`     | unit-mocked      | pure-property      | 2     |

#### Already-Guarded / Dismissed

| ID           | Reason                                                                                                                                                                                                                                                                                                     |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RACE-RBAC-02 | False positive. `mfa.service.ts` `verifyChallenge` critical section (lines 492–518) contains zero `await` expressions; `validateChallengeCode` and `verifyTotp` are both synchronous. Node.js single-threaded execution guarantees atomicity of the entire check-increment-delete sequence without a lock. |

---

### 3.7 Quota / Budget / Capacity

**Posture summary**: The quota/budget/capacity lane has three meaningful
concurrency risks. The most critical is in `ZepMemoryAdapter`: episode counting
is maintained as in-process integer state and written back to the DB as an
absolute overwrite (not an atomic increment), so two concurrent adapter
instances can silently under-count or over-count. The agent capacity ceiling is
shared with the routing lane (RACE-QUOTA-03 / RACE-ROUTI-02): `updateMany`
increments unconditionally with no `WHERE currentCapacity < maxCapacity` guard
and no DB `CHECK` constraint. The query-budget detector (ADR-053) is correctly
scoped to `AsyncLocalStorage` per-request stores and was confirmed not
vulnerable.

#### Confirmed Findings

| ID            | Severity   | Race Pattern         | Aggregate / Service                              | Current Coverage | Proposed Test Type | Batch |
| ------------- | ---------- | -------------------- | ------------------------------------------------ | ---------------- | ------------------ | ----- |
| RACE-QUOTA-01 | **High**   | non-atomic-decrement | `packages/adapters/src/memory/zep/zep-client.ts` | unit-mocked      | scheduler-race     | 2     |
| RACE-QUOTA-03 | **High**   | check-then-act       | `apps/api/src/services/LeadRoutingService.ts`    | unit-mocked      | db-concurrency     | 2     |
| RACE-QUOTA-M1 | **High**   | missing-transaction  | `apps/api/src/services/LeadRoutingService.ts`    | none             | db-concurrency     | 2     |
| RACE-QUOTA-02 | **Medium** | read-check-write     | `apps/api/src/modules/zep/zep-budget.router.ts`  | unit-mocked      | scheduler-race     | 2     |
| RACE-QUOTA-M2 | **Medium** | check-then-act       | `packages/adapters/src/memory/zep/zep-client.ts` | unit-mocked      | scheduler-race     | 2     |
| RACE-QUOTA-M3 | **Medium** | non-atomic-upsert    | `apps/api/src/modules/zep/zep-budget.router.ts`  | unit-mocked      | scheduler-race     | 2     |

#### Already-Guarded / Dismissed

| ID            | Reason                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RACE-QUOTA-04 | False positive. `packages/db/src/query-budget/extension.ts` lines 99–101: the `store.reported = true` assignment and the `if (!store.reported)` guard are fully synchronous — no `await` exists between them. Node.js single-threaded execution makes the check-then-set atomic in practice. The `AsyncLocalStorage` boundary at `context.ts:78` further isolates stores per async context. |

---

### 3.8 Entitlement / Tenant Modules

**Posture summary**: The entitlement/tenant-module lane has no `$transaction`
anywhere in `PrismaTenantModuleRepository`. The `@@unique([tenantId, moduleId])`
constraint on `TenantModule` prevents duplicate rows and makes individual
`upsert` calls idempotent, which mitigates the most obvious duplicate-row race,
but five real concurrency exposures remain. The two Critical findings
(`handleSubscriptionWebhook` lacking Stripe-signature verification and
`ensureCustomer` creating duplicate Stripe customers) have no existing
mitigations and are immediately exploitable. `syncModulesToPlan` is additive-
only: plan downgrades never disable above-plan module override rows
(RACE-ENTIT-M1), meaning a cancelled subscription can silently retain full
enterprise module access indefinitely.

#### Confirmed Findings

| ID            | Severity     | Race Pattern            | Aggregate / Service                                                  | Current Coverage | Proposed Test Type | Batch |
| ------------- | ------------ | ----------------------- | -------------------------------------------------------------------- | ---------------- | ------------------ | ----- |
| RACE-ENTIT-03 | **Critical** | missing-idempotency-key | `apps/api/src/modules/billing/billing.router.ts`                     | none             | model-based        | 3     |
| RACE-ENTIT-04 | **Critical** | check-then-act          | `apps/api/src/modules/billing/billing.router.ts`                     | none             | scheduler-race     | 3     |
| RACE-ENTIT-02 | **High**     | read-check-write        | `packages/adapters/src/repositories/PrismaTenantModuleRepository.ts` | none             | db-concurrency     | 3     |
| RACE-ENTIT-05 | **High**     | lost-update             | `apps/api/src/modules/billing/billing.router.ts`                     | none             | pure-property      | 3     |
| RACE-ENTIT-M1 | **High**     | lost-update             | `packages/adapters/src/repositories/PrismaTenantModuleRepository.ts` | none             | pure-property      | 3     |
| RACE-ENTIT-01 | **Medium**   | missing-transaction     | `packages/adapters/src/repositories/PrismaTenantModuleRepository.ts` | none             | db-concurrency     | 3     |
| RACE-ENTIT-06 | **Medium**   | infra-gap               | `apps/api/src/modules/billing/billing.router.ts`                     | none             | pure-property      | 3     |
| RACE-ENTIT-M2 | **Medium**   | read-check-write        | `apps/api/src/modules/subscription/subscription.router.ts`           | none             | db-concurrency     | 3     |
| RACE-ENTIT-M3 | **Medium**   | check-then-act          | `packages/adapters/src/repositories/PrismaTenantModuleRepository.ts` | none             | db-concurrency     | 3     |

#### Already-Guarded / Dismissed

None dismissed in this lane. Note: RACE-ENTIT-01 was downgraded from High to
Medium because the torn-read affects only the `syncModulesToPlan` return value;
the underlying DB rows are correct after the fan-out completes, and the billing
router caller discards the return value immediately.

---

### 3.9 Audit Log

**Posture summary**: The audit-log lane has the most severe single finding in
the entire audit: RACE-AUDIT-01. The `DurableAuditLogAdapter` maintains
`this.previousHash` as a shared mutable field that is read before the
`$transaction` and written after it resolves. Two concurrent `logSecurityEvent`
calls will both read the same `previousHash` value, silently breaking the
tamper-detection chain across all subsequent entries. The `verifyLogIntegrity`
method (RACE-AUDIT-05) queries by `eventId` — a field that does not exist on the
production `SecurityEvent` model — and silently always returns
`EVENT_NOT_FOUND`, making tamper detection completely inoperative in production.
A secondary structural defect is the `AuditLogger` singleton capturing the first
`PrismaClient` passed to it, bypassing tenant-scoped connection extensions for
all subsequent audit writes.

#### Confirmed Findings

| ID            | Severity     | Race Pattern            | Aggregate / Service                                            | Current Coverage | Proposed Test Type | Batch |
| ------------- | ------------ | ----------------------- | -------------------------------------------------------------- | ---------------- | ------------------ | ----- |
| RACE-AUDIT-01 | **Critical** | read-check-write        | `packages/adapters/src/audit/DurableAuditLogAdapter.ts`        | unit-mocked      | scheduler-race     | 2     |
| RACE-AUDIT-02 | **High**     | missing-transaction     | `apps/api/src/security/audit/audit-logger.ts`                  | unit-mocked      | db-concurrency     | 2     |
| RACE-AUDIT-05 | **High**     | infra-gap               | `packages/adapters/src/audit/DurableAuditLogAdapter.ts`        | unit-mocked      | db-concurrency     | 2     |
| RACE-AUDIT-M1 | **High**     | check-then-act          | `packages/adapters/src/events/OutboxEventBusAdapter.ts`        | unit-mocked      | db-concurrency     | 2     |
| RACE-AUDIT-M2 | **High**     | missing-idempotency-key | `apps/api/src/security/audit/writer.ts`                        | unit-mocked      | db-concurrency     | 2     |
| RACE-AUDIT-03 | **Medium**   | tenancy-scope-leak      | `apps/api/src/security/audit/index.ts`                         | unit-mocked      | db-concurrency     | 2     |
| RACE-AUDIT-04 | **Medium**   | non-atomic-upsert       | `apps/api/src/security/audit/audit-logger.ts`                  | unit-mocked      | scheduler-race     | 2     |
| RACE-AUDIT-06 | **Medium**   | missing-idempotency-key | `packages/adapters/src/audit/DurableAuditLogAdapter.ts`        | unit-mocked      | pure-property      | 2     |
| RACE-AUDIT-07 | **Medium**   | non-atomic-upsert       | `packages/adapters/src/repositories/PrismaOutboxRepository.ts` | unit-mocked      | db-concurrency     | 2     |
| RACE-AUDIT-M3 | **Medium**   | check-then-act          | `apps/api/src/security/audit/writer.ts`                        | unit-mocked      | db-concurrency     | 2     |

#### Already-Guarded / Dismissed

None dismissed in this lane.

---

### 3.10 Pure Domain Invariants

**Posture summary**: The pure-domain layer is well-structured around immutable
value objects and aggregate roots using the Result monad pattern. There are no
infrastructure dependencies and no concurrency risks at this layer — all
aggregates are single-threaded in-memory objects. The findings here are
exclusively property-test coverage gaps and logic defects discoverable by
property testing. The most severe (RACE-PURE-04 and RACE-PURE-06) are classified
High because `Invoice.recalculateTotals` silently swallows arithmetic failures,
leaving billing totals stale in a way that is invisible to the domain caller.

Notable defect: `Money.SUPPORTED_CURRENCIES` (RACE-PURE-01) contains a duplicate
`'GBP'` entry and omits `'USD'` — `Money.create(10, 'USD')` always returns
failure. The existing test suite uses `'GBP'` exclusively, so this has never
been caught.

#### Confirmed Findings

| ID           | Severity   | Race Pattern      | Aggregate / Service                                     | Proposed Test Type | Batch |
| ------------ | ---------- | ----------------- | ------------------------------------------------------- | ------------------ | ----- |
| RACE-PURE-04 | **High**   | lost-update       | `packages/domain/src/crm/billing/Invoice.ts`            | pure-property      | 1     |
| RACE-PURE-06 | **High**   | infra-gap         | `packages/domain/src/crm/billing/Invoice.ts`            | model-based        | 1     |
| RACE-PURE-01 | **Medium** | infra-gap         | `packages/domain/src/shared/Money.ts`                   | pure-property      | 1     |
| RACE-PURE-02 | **Medium** | infra-gap         | `packages/domain/src/shared/Money.ts`                   | pure-property      | 1     |
| RACE-PURE-03 | **Medium** | infra-gap         | `packages/domain/src/crm/opportunity/Opportunity.ts`    | pure-property      | 1     |
| RACE-PURE-05 | **Low**    | infra-gap         | `packages/domain/src/crm/billing/TaxRate.ts`            | pure-property      | 1     |
| RACE-PURE-07 | **Low**    | non-atomic-upsert | `packages/domain/src/crm/billing/Invoice.ts`            | pure-property      | 1     |
| RACE-PURE-08 | **Low**    | infra-gap         | `packages/domain/src/crm/lead/Lead.ts`                  | pure-property      | 1     |
| RACE-PURE-09 | **Low**    | infra-gap         | `packages/domain/src/crm/task/Task.ts`                  | pure-property      | 1     |
| RACE-PURE-10 | **Low**    | infra-gap         | `packages/domain/src/crm/ticket/Ticket.ts`              | pure-property      | 1     |
| RACE-PURE-11 | **Low**    | infra-gap         | `packages/domain/src/crm/ticket/Ticket.ts`              | pure-property      | 1     |
| RACE-PURE-12 | **Low**    | infra-gap         | `packages/domain/src/shared/ValueObject.ts`             | pure-property      | 1     |
| RACE-PURE-13 | **Low**    | infra-gap         | `packages/domain/src/crm/billing/PaymentTerms.ts`       | pure-property      | 1     |
| RACE-PURE-14 | **Low**    | infra-gap         | `packages/domain/src/legal/appointments/Appointment.ts` | pure-property      | 1     |
| RACE-PURE-M1 | **Low**    | infra-gap         | `packages/domain/src/crm/ticket/Ticket.ts`              | pure-property      | 1     |
| RACE-PURE-M2 | **Low**    | infra-gap         | `packages/domain/src/crm/task/Task.ts`                  | pure-property      | 1     |
| RACE-PURE-M3 | **Low**    | model-based       | `packages/domain/src/crm/billing/Invoice.ts`            | model-based        | 1     |

#### Already-Guarded / Dismissed

None dismissed in this lane (pure-domain has no concurrency risks and no
dismissed candidates).

---

### 3.11 Test Infrastructure

**Posture summary**: The monorepo has a substantial Vitest 4.x infrastructure
(30 000+ tests, 16+ projects, Istanbul coverage) but has **zero** property-based
testing capability. `fast-check` is entirely absent as a direct dependency;
`@fast-check/vitest` is not installed; no `test.prop` or `fc.assert` calls exist
anywhere in the codebase. The integration test harness supports
`testcontainers`/pgvector with graceful-skip, but `getTestPrismaClient()`
returns a singleton — preventing genuine concurrent-connection race tests.

A High-severity finding (RACE-TEST--M1) was added by the adversarial reviewer:
`tests/integration/setup.ts` and
`tests/integration/ingestion/file-ingestion.e2e.test.ts` both construct
`PrismaClient` using the Prisma 5/6 `datasources.db.url` API, which is
incompatible with Prisma 7's `engineType = 'client'` mode. This will throw a
`PrismaClientInitializationError` the moment integration tests run against a
real DB, masked today only by the graceful Docker-skip guard.

#### Confirmed Findings

| ID            | Severity   | Race Pattern | Aggregate / Service                 | Proposed Test Type | Batch |
| ------------- | ---------- | ------------ | ----------------------------------- | ------------------ | ----- |
| RACE-TEST--M1 | **High**   | infra-gap    | `tests/integration/setup.ts`        | db-concurrency     | 1     |
| RACE-TEST--M2 | **Medium** | infra-gap    | `tests/integration/setup.ts`        | db-concurrency     | 1     |
| RACE-TEST--M3 | **Medium** | infra-gap    | `scripts/run-tests.js`              | pure-property      | 1     |
| RACE-TEST--01 | **Low**    | infra-gap    | `package.json`                      | pure-property      | 0     |
| RACE-TEST--02 | **Low**    | infra-gap    | `tests/property/`                   | pure-property      | 0     |
| RACE-TEST--03 | **Low**    | infra-gap    | `tests/integration/setup.ts`        | db-concurrency     | 0     |
| RACE-TEST--04 | **Low**    | infra-gap    | `tests/utils/db.ts`                 | db-concurrency     | 0     |
| RACE-TEST--05 | **Low**    | infra-gap    | `package.json`                      | pure-property      | 0     |
| RACE-TEST--06 | **Low**    | infra-gap    | `.github/workflows/ci.yml`          | pure-property      | 0     |
| RACE-TEST--07 | **Low**    | infra-gap    | `packages/test-fixtures/src/ids.ts` | pure-property      | 0     |
| RACE-TEST--08 | **Low**    | infra-gap    | `vitest.config.ts`                  | pure-property      | 0     |

#### Already-Guarded / Dismissed

None dismissed in this lane.

---

## 4. Cross-Cutting Risk Patterns

### 4.1 Read-Check-Write (20 confirmed instances)

The most prevalent pattern in the codebase. Occurs in every lane. The canonical
form is:

```typescript
// Outside any transaction:
const existing = await prisma.foo.findFirst({ where: { ... } });
if (existing) return; // guard passes
await prisma.foo.create({ data: { ... } }); // second write races
```

Affected files include: `appointments.router.ts`, `ContactService.ts`,
`LeadService.ts`, `OutboxEventBusAdapter.ts`, `session.service.ts`, `rbac.ts`,
`mfa.service.ts`, `DurableAuditLogAdapter.ts`, `zep-budget.router.ts`,
`billing.router.ts`.

**Recommended uniform fix**: wherever the guard is critical, either (a) wrap
`findFirst` + `create`/`update` in a `$transaction`, or (b) rely exclusively on
a DB-level `@@unique` constraint and catch `P2002` with a typed domain error.
Option (b) is preferred for high-throughput paths.

### 4.2 Non-Atomic Increment / Decrement (7 confirmed instances)

Found in the routing capacity (`LeadRoutingService`, `TicketRoutingService`) and
memory episode counting (`ZepMemoryAdapter`). All share the defect that
`updateMany({ data: { field: { increment: 1 } } })` is issued without a
`WHERE field < maxField` guard and without a DB-level `CHECK` constraint.

**Recommended uniform fix**:

1. Add `WHERE currentCapacity < maxCapacity` to every
   `agentAvailability.updateMany`.
2. Add a PostgreSQL
   `CHECK (currentCapacity >= 0 AND currentCapacity <= maxCapacity)` via a
   Prisma migration for `AgentAvailability`.
3. Replace the absolute-overwrite in `ZepMemoryAdapter.incrementEpisodeCount`
   with an atomic
   `UPDATE WHERE episodesUsed < maxEpisodes ... episodesUsed + 1`.

### 4.3 Missing `$transaction` Wrapping (12 confirmed instances)

The pattern of two logically-coupled `await prisma.*` calls with no wrapping
transaction is found in `logLoginSuccess`/`logLoginFailure` (`audit-logger.ts`),
`convertLead` (`LeadService.ts`), `syncModulesToPlan`
(`PrismaTenantModuleRepository.ts`), and the zep budget reset
(`zep-budget.router.ts`), among others.

**Recommended uniform fix**: wherever two DB writes must succeed or fail
together, use `prisma.$transaction([write1, write2])` or the interactive
`$transaction(async (tx) => { ... })` form.

### 4.4 Single-Shared-PrismaClient Masking Races in Tests

All existing concurrency tests use a single `PrismaClient` mock or a single
shared `getTestPrismaClient()` singleton. This means:

- `FOR UPDATE SKIP LOCKED` semantics cannot be verified — all operations are
  serialised through the same connection pool.
- Two "concurrent" operations in a test are actually sequential.
- RACE-TEST--M1 shows the integration test `PrismaClient` constructor is
  incompatible with Prisma 7 `engineType = 'client'`, masked by the graceful
  Docker-skip guard.

**Required fix**: add `createIsolatedPrismaClient(url?)` factory in
`tests/property/support/database.ts` using `new PrismaPg({ connectionString })`

- `new PrismaClient({ adapter })` to create independent connections for each
  concurrent actor.

### 4.5 Duplicate-Event / Missing Idempotency Key (8 confirmed instances)

The pattern of not providing a stable idempotency key to prevent re-delivery
appears across the outbox (`DomainEvent` has no `@@unique` on idempotency
fields), the `MaintenanceScheduler` (no
`@@unique([sourceId, sourceType, recipientId])` on `Notification`),
`AuditLogEntry` (no `@@unique([eventId])`), and the `handleSubscriptionWebhook`
endpoint (no processed-event table for Stripe event IDs).

**Recommended uniform fix**: for every "at most once" invariant, add a DB-level
unique constraint on the natural idempotency key and switch from
`findFirst`+`create` to `upsert`/`createMany({ skipDuplicates: true })`.

### 4.6 Tenancy-Scope Leaks (3 confirmed instances)

`PrismaContactRepository.existsByEmail` and `findByEmail` query without a
`tenantId` filter (RACE-DEDUP-05). `getUserRBACRoles` and
`applyUserPermissionOverrides` in `rbac.ts` query `userRoleAssignment` and
`userPermission` without `tenantId` (RACE-RBAC-06). `AuditLogger` singleton
captures the first caller's `prisma` client, potentially bypassing tenant
middleware for all subsequent audit writes (RACE-AUDIT-03).

**Recommended uniform fix**: add `tenantId` to all repository port signatures
that omit it; propagate from service/use-case callers; enforce with a lint rule
that flags `findFirst`/`findMany` calls on tenant-scoped models missing a
`where: { tenantId }` clause.

---

## 5. Test Infrastructure Gaps

### Phase 1 Must-Fill Items (Priority Order)

| Priority | Gap                                                       | Action                                                                                                                                                                           | Effort |
| -------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 1        | `fast-check` absent as direct dep                         | `pnpm add -D fast-check @fast-check/vitest` at workspace root                                                                                                                    | XS     |
| 2        | Prisma 7 constructor incompatibility in integration tests | Replace `datasources.db.url` with `{ adapter: new PrismaPg({ connectionString }) }` in `tests/integration/setup.ts` and `tests/integration/ingestion/file-ingestion.e2e.test.ts` | S      |
| 3        | `tests/property/` scaffolding absent                      | Create `support/arbitraries.ts`, `support/commands.ts`, `support/model.ts`, `support/scheduler.ts`, `support/database.ts`, `support/assertions.ts`                               | M      |
| 4        | Vitest project for property tests missing                 | Add `property` project to root `vitest.config.ts` with `globalSetup` reading `FC_SEED` env var                                                                                   | S      |
| 5        | `createIsolatedPrismaClient()` absent                     | Add factory in `tests/property/support/database.ts`; wire `withConcurrentClients(n, fn)` helper                                                                                  | M      |
| 6        | npm scripts absent                                        | Add `test:property`, `test:property:smoke`, `test:property:stress`, `test:concurrency` to `package.json`                                                                         | XS     |
| 7        | CI wiring absent                                          | Add `property-smoke` job (needs: test) to `ci.yml`; add `property-stress` to `system-audit-nightly.yml`                                                                          | S      |
| 8        | Seed reporter absent                                      | `globalSetup` that logs seed to `GITHUB_STEP_SUMMARY`; `FC_SEED=${{ github.run_id }}` in CI                                                                                      | S      |
| 9        | `DatabaseTestHelper` stubs                                | Wire `tests/utils/db.ts` to real Prisma client                                                                                                                                   | S      |
| 10       | Domain builders / arbitraries absent                      | Create `fc.Arbitrary<CreateLeadProps>` etc. in `tests/property/support/arbitraries.ts`                                                                                           | M      |
| 11       | Integration test workers share one DB container           | Set `maxWorkers: 1` for integration project, or use `testcontainers` per-worker schema isolation                                                                                 | M      |
| 12       | `run-tests.js` count accumulation bug                     | Change `=` to `+=` for `testsPassedCount` and `testsFailedCount` in `scripts/run-tests.js`                                                                                       | XS     |
| 13       | Replay docs absent                                        | Create `docs/claude-refs/property-test-replay.md`                                                                                                                                | S      |

### Existing Infrastructure (Available Immediately)

- **Vitest 4.x** with forks pool, 30 000+ tests, Istanbul coverage (statements
  90 / branches 80 / functions 90 / lines 90).
- **`testcontainers` integration harness** (`tests/integration/setup.ts`) with
  graceful Docker-skip, real Prisma migrations, `TRUNCATE CASCADE` reset.
- **`tests/mocks/prisma.mock.ts`**: complete Prisma mock scaffold for 17 models.
- **`tests/utils/mocks.ts`**: `vi.fn()`-based service mock factories.
- **`tests/utils/test-helpers.ts`**: `TestDataFactory`, `AsyncTestUtils`,
  `DateTestUtils`.
- **`packages/test-fixtures/src/ids.ts`**: static UUID constants (usable as
  `fc.constant(TEST_TENANT_ID)` anchors once fast-check is installed).

### CI Tier Coverage After Phase 1

| Tier      | Workflow                   | Property Tests (current) | Property Tests (after Phase 1)               |
| --------- | -------------------------- | ------------------------ | -------------------------------------------- |
| PR        | `pr-checks.yml` + `ci.yml` | None                     | `test:property:smoke` (50 runs, seed pinned) |
| main push | `ci.yml`                   | None                     | `test:property` (default runs)               |
| nightly   | `system-audit-nightly.yml` | None                     | `test:property:stress` (5 000 runs)          |

---

## 6. Appendix: Full Confirmed Findings

### Booking / Scheduling

**RACE-BOOKI-01** — Critical

- `apps/api/src/modules/legal/appointments.router.ts` lines 720–748: bare
  `findUnique` then `update` with no `$transaction` and no
  `WHERE status='SCHEDULED'` conditional.
- `packages/db/prisma/schema.prisma` lines 1602–1657: `Appointment` model has no
  `@@unique` on status-transition guard.
- `packages/db/src/client.ts` lines 173–179: `withTransaction` not used in the
  confirm handler.

**RACE-BOOKI-02** — Critical

- `packages/application/src/usecases/scheduling/ScheduleAppointment.ts` lines
  107–115: `fetchConflictCandidates` (plain `SELECT`) runs outside any
  transaction; `appointmentRepository.save` at line 115 wraps only the write
  side.
- `packages/adapters/src/repositories/PrismaAppointmentRepository.ts` lines
  229–244: `findOverlapping` is a plain `SELECT` with no
  `FOR SHARE`/`FOR UPDATE` hint.
- `packages/db/prisma/schema.prisma` lines 1602–1657: no
  `@@unique([tenantId, organizerId, startTime, endTime])` and no exclusion
  constraint.

**RACE-BOOKI-03** — High

- `packages/application/src/usecases/scheduling/RescheduleAppointment.ts` lines
  110–171: `findById` (line 112) loads entity, `save()` (line 171) issues an
  unconditional `upsert`.
- `packages/adapters/src/repositories/PrismaAppointmentRepository.ts` lines
  496–500: `upsert` with `WHERE { id }` only — no version/`updatedAt`
  precondition.
- `packages/application/src/usecases/scheduling/CancelAppointment.ts` lines
  40–57: identical load-mutate-save pattern.
- `packages/db/prisma/schema.prisma` lines 1602–1610: no version column;
  `updatedAt` is `@updatedAt` (server-assigned, not used as a precondition).

**RACE-BOOKI-04** — Medium

- `packages/adapters/src/repositories/PrismaAppointmentRepository.ts` lines
  607–629: `batchUpdateStatus` issues `updateMany` with
  `WHERE { id: { in: ids }, tenantId }` — no status precondition.
- `packages/domain/src/legal/appointments/Appointment.ts` lines 393–414: domain
  `confirm()` guard is bypassed entirely.
- Note: downgraded to Medium because `batchUpdateStatus` has zero production
  callers; risk is latent.

**RACE-BOOKI-M1** — High

- `apps/workers/events-worker/src/maintenance/scheduled-jobs.ts` lines 489–525:
  `findFirst` check + `create` with no transaction; 5-minute interval makes
  overlap likely.
- `packages/db/prisma/schema.prisma` lines 4598–4650: `Notification` model has
  no `@@unique` on `(sourceId, sourceType)`.

**RACE-BOOKI-M2** — High

- `packages/application/src/usecases/scheduling/CompleteAppointment.ts` lines
  41–54: identical structural pattern to RACE-BOOKI-03.
- `packages/adapters/src/repositories/PrismaAppointmentRepository.ts` lines
  494–531: unconditional `upsert`.
- `packages/db/prisma/schema.prisma` lines 1602–1657: no version column.

**RACE-BOOKI-M3** — Medium

- `apps/api/src/modules/legal/appointments.router.ts` lines 719–748: confirm
  mutation calls raw Prisma directly, bypassing the domain use-case layer.
- `apps/api/src/modules/legal/appointments.router.ts` lines 754–763: `complete`
  uses `container.completeAppointmentUseCase.execute()` — proving hexagonal
  migration is in progress but `confirm` was left behind.

---

### Routing / Assignment

**RACE-ROUTI-01** — Critical

- `apps/api/src/modules/ticket/ticket-routing.router.ts` lines 43–63:
  `ticket.findFirst`, `checkSlaEscalation`, `findMatchingRule`,
  `suggestAssignees` all outside any transaction.
- `apps/api/src/modules/ticket/ticket-routing.router.ts` lines 101–115:
  `routeTicket()` called with stale reads.
- `apps/api/src/services/TicketRoutingService.ts` lines 142–193: inner
  `$transaction` has no already-assigned guard.
- `packages/db/prisma/schema.prisma` line 2027: `Ticket.assigneeId` is nullable
  `String` with no `@unique`.

**RACE-ROUTI-02** — High

- `apps/api/src/services/LeadRoutingService.ts` lines 345–349:
  `updateMany({ data: { currentCapacity: { increment: 1 } } })` — no
  `WHERE currentCapacity < maxCapacity`.
- `apps/api/src/services/TicketRoutingService.ts` lines 163–173: same bare
  increment pattern.
- `packages/db/prisma/schema.prisma` lines 3755–3756: `AgentAvailability` has no
  `CHECK` constraint.

**RACE-ROUTI-03** — Medium

- `apps/api/src/modules/account/account-reassign.ts` lines 48–52:
  `existing.ownerId` captured outside `$transaction`.
- `apps/api/src/modules/account/account-reassign.ts` lines 73–92: inner
  `$transaction` never re-reads `ownerId`.
- Same pattern confirmed in `contact-reassign.ts` lines 35–77 and
  `deal-reassign.ts` lines 36–77.
- Note: downgraded to Medium because ownership write itself is correctly
  serialised; only audit `previousOwnerId` fidelity is at risk.

**RACE-ROUTI-04** — Medium

- `apps/api/src/modules/routing/routing.router.ts` lines 162–166:
  `routingRule.count` runs outside `$transaction`.
- `apps/api/src/modules/routing/routing.router.ts` lines 173–180: inner
  `$transaction` uses `update({ where: { id } })` with no `tenantId` guard.
- `packages/db/prisma/schema.prisma` line 3796: `@@unique([tenantId, name])` on
  `RoutingRule` does not prevent this TOCTOU.

**RACE-ROUTI-05** — Medium

- `apps/api/src/services/LeadRoutingService.ts` lines 336–349: `forceReroute`
  path increments new agent capacity but never decrements previous agent
  capacity.
- `apps/api/src/services/LeadRoutingService.ts` lines 253–258: idempotency guard
  bypassed for `forceReroute`.

**RACE-ROUTI-M1** — High

- `apps/api/src/modules/routing/routing.router.ts` lines 315–355: `assignLead`
  `$transaction` updates `lead.ownerId` and creates `RoutingAudit` row but
  contains zero `agentAvailability.updateMany` calls.
- `apps/api/src/services/LeadRoutingService.ts` lines 346–349: automated path
  does increment — confirming the intent; manual path omits it entirely.

**RACE-ROUTI-M2** — Medium

- `apps/api/src/modules/routing/routing.router.ts` lines 190–200: `toggle`:
  `findFirst` with `tenantId`, then `update({ where: { id } })` without
  `tenantId`.
- `apps/api/src/modules/routing/routing.router.ts` lines 138–147: `delete`: same
  pattern — concurrent double-delete throws `P2025` unhandled.
- `apps/api/src/security/tenant-context.ts` lines 114–117: RLS via session
  variable not guaranteed under PgBouncer connection reuse.

**RACE-ROUTI-M3** — Medium

- `apps/api/src/modules/account/account.router.ts` lines 1066–1108:
  `bulkReassign` iterates account IDs in a sequential for-loop, each calling
  `performAccountReassign` with the same stale-previousOwnerId gap as
  RACE-ROUTI-03 repeated N times.

---

### Duplicate Detection & Merge

**RACE-DEDUP-01** — High

- `packages/application/src/services/ContactService.ts` lines 75–78:
  `existsByEmail` check runs outside any transaction; `save` in a separate call.
- `packages/adapters/src/repositories/PrismaContactRepository.ts` lines 78–82:
  `save()` uses `upsert({ where: { id } })` — new `cuid()` so always creates.
- `packages/db/prisma/schema.prisma` line 643: `@@unique([tenantId, email])`
  will reject the second insert with `P2002`, but the service at
  `ContactService.ts` lines 103–106 catches ALL errors and re-throws as opaque
  `PersistenceError`.

**RACE-DEDUP-02** — Medium (downgraded from High)

- `packages/application/src/services/ContactService.ts` lines 478–481:
  `mergeContacts` reads both contacts via `Promise.all` outside any transaction.
- `packages/adapters/src/repositories/PrismaContactRepository.ts` lines 263–271:
  `mergeInTransaction` re-verifies both IDs inside `$transaction`;
  `CrossTenantOrNotFoundError` aborts the second concurrent merge.
- Residual risk: duplicate `ContactMergedEvent` publication (fire-and-forget, no
  idempotency key on `DomainEvent`).

**RACE-DEDUP-03** — High

- `apps/api/src/modules/inbound/inbound.router.ts` lines 152–167:
  `findFirst({ where: { tenantId, email, tags: { has: submissionTag } } })` runs
  outside any transaction.
- `apps/api/src/modules/inbound/inbound.router.ts` lines 176–188:
  `leadService.createLead` called separately.
- `packages/db/prisma/schema.prisma` line 472: `@@unique([email, tenantId])` on
  `Lead` backstops same-email duplicates but not
  same-`submissionId`-different-email case.

**RACE-DEDUP-04** — Medium

- `apps/api/src/modules/contact/contact.router.ts` lines 585–617:
  `checkForCreate` → `createContact` (commits) → `applyAutoMerge` (separate
  call).
- `apps/api/src/modules/contact/contact.router.ts` lines 620–622:
  `applyAutoMerge` failure swallowed with `console.warn`.

**RACE-DEDUP-05** — High

- `packages/adapters/src/repositories/PrismaContactRepository.ts` lines 209–213:
  `existsByEmail` queries `contact.count({ where: { email: email.value } })` —
  no `tenantId` filter.
- `packages/adapters/src/repositories/PrismaContactRepository.ts` lines 170–173:
  `findByEmail` queries `contact.findFirst({ where: { email: email.value } })` —
  no `tenantId` filter.
- Same defect confirmed in `PrismaLeadRepository.ts` lines 223–228.
- Port interface `ContactRepository.ts` lines 27 and 52 have no `tenantId`
  parameter, making this structural across port, implementation, and in-memory
  adapters.

**RACE-DEDUP-06** — Medium

- `packages/db/prisma/schema.prisma` lines 660–710: `Account` model has no
  `@@unique([tenantId, name])` or `@@unique([tenantId, website])`.
- `apps/api/src/modules/account/account-duplicate-detection.service.ts` lines
  243–268: entire check runs outside any transaction.
- `docs/architecture/adr/ADR-050-duplicate-detection-runtime.md` lines 6–7:
  advisory-only by documented design.

**RACE-DEDUP-07** — Low

- `apps/api/src/shared/duplicate-rule-evaluator.ts` lines 159–167:
  `resolveFloor()` uses `threshold || 100`, so `threshold=0` silently becomes
  floor 100 (falsy JS behaviour).
- `apps/api/src/shared/duplicate-rule-evaluator.ts` lines 114–131:
  `levenshtein()` uses bracket indexing (UTF-16 code units, not codepoints) —
  emoji inputs produce incorrect distances.

**RACE-DEDUP-M1** — High

- `packages/application/src/services/LeadService.ts` lines 382–388:
  `contactRepository.save(contact)` and `leadRepository.save(lead)` called
  sequentially with no wrapping `$transaction`.
- `packages/domain/src/crm/lead/Lead.ts` lines 317–321: in-memory `isConverted`
  guard does not protect concurrent DB reads.
- `packages/adapters/src/repositories/PrismaLeadRepository.ts` lines 387–428:
  `bulkConvert` correctly wraps in `$transaction`; single-lead path does not.

**RACE-DEDUP-M2** — Medium

- `packages/db/prisma/schema.prisma` lines 1560–1586: `DomainEvent` has no
  `@@unique` on `(aggregateId, eventType)`.
- `packages/application/src/services/ContactService.ts` lines 534–548:
  `ContactMergedEvent` published post-commit as fire-and-forget.

**RACE-DEDUP-M3** — High

- `packages/application/src/services/ContactService.ts` lines 184–188:
  `updateContactEmail` calls `findByEmail(newEmail)` with no `tenantId`.
- `packages/adapters/src/repositories/PrismaContactRepository.ts` lines 170–173:
  same scope-leak confirmed.
- `packages/application/src/services/ContactService.ts` lines 196–199:
  `contactRepository.save(contact)` after the check with no transaction.

---

### Webhooks / Outbox / Idempotency

**RACE-WEBHO-01** — High

- `packages/adapters/src/events/OutboxEventBusAdapter.ts` lines 66–102:
  `findFirst` then `create` as two independent calls with no `$transaction`.
- `packages/db/prisma/schema.prisma` lines 1560–1586: `DomainEvent` has no
  `@@unique` on idempotency fields.
- `packages/adapters/src/events/__tests__/OutboxEventBusAdapter.impl.test.ts`
  lines 249–256: duplicate-skip test is entirely mock-based.

**RACE-WEBHO-02** — High

- `apps/workers/events-worker/src/outbox/pollOutbox.ts` lines 194–212:
  `dispatcher.dispatch(event)` then `repository.markAsPublished(event.id)` as
  sequential `await`s with no wrapping transaction.
- `packages/adapters/src/repositories/PrismaOutboxRepository.ts` lines 132–175:
  `FOR UPDATE SKIP LOCKED` holds only through the SQL statement — not through
  application-level dispatch.

**RACE-WEBHO-03** — Medium

- `packages/webhooks/src/framework.ts` lines 611–619: `idempotency.has(key)`
  check at line 612; key written at line 659 after `await executeWithMiddleware`
  — full handler execution duration is the race window.
- `packages/webhooks/src/framework.ts` lines 256–293: `IdempotencyStore` is a
  plain `Map` with no mutex.

**RACE-WEBHO-04** — Medium

- `packages/adapters/src/events/OutboxEventBusAdapter.ts` line 13:
  `withTransaction` imported from `@intelliflow/db`.
- `packages/db/src/client.ts` lines 173–179: `withTransaction` is hardcoded to
  module-level singleton `prisma` — not the injected `this.prisma`.
- `packages/adapters/src/events/__tests__/OutboxEventBusAdapter.impl.test.ts`
  lines 15–35: test mocks `@intelliflow/db` entirely, making the connection
  mismatch invisible in tests.

**RACE-WEBHO-05** — Medium

- `packages/webhooks/src/framework.ts` lines 798–817: `reprocessDeadLetter`
  removes from DLQ then calls `Promise.all(handlers)` but never calls
  `idempotency.set()`.
- `packages/webhooks/src/framework.ts` lines 799–803: DLQ entry removed before
  handlers succeed; concurrent second call can find the entry and also execute
  handlers.

**RACE-WEBHO-06** — Low

- `packages/adapters/src/events/OutboxEventBusAdapter.ts` lines 62–103:
  `publish()` has no internal `$transaction`; `publishAll` at line 110–158 does.
  Risk largely captured by RACE-WEBHO-01.

**RACE-WEBHO-M1** — High

- `packages/adapters/src/events/OutboxEventBusAdapter.ts` lines 115–158:
  `publishAll` wraps in `withTransaction` but `withTransaction` defaults to
  `READ COMMITTED` (no `isolationLevel` option passed).
- `packages/db/src/client.ts` lines 178–184: `(prisma as any).$transaction(fn)`
  with no `isolationLevel` argument.

**RACE-WEBHO-M2** — Medium

- `packages/webhooks/src/framework.ts` lines 753–758: `processRetries()` calls
  `executeWithMiddleware` on success and calls `idempotency.set()` but never
  calls `idempotency.has()` before executing handlers.

**RACE-WEBHO-M3** — High

- `packages/adapters/src/repositories/PrismaOutboxRepository.ts` lines 132–175:
  `fetchPendingEvents` issues `FOR UPDATE SKIP LOCKED` via `$queryRaw` inside an
  implicit autocommit transaction; lock released immediately after statement.
- `apps/workers/events-worker/src/outbox/pollOutbox.ts` lines 194–213: no
  `PROCESSING` status written before releasing lock.

---

### Queue / Background Jobs

**RACE-WORKE-01** — High

- `apps/workers/events-worker/src/maintenance/scheduled-jobs.ts` lines 125–184:
  `ticket.update` + `notification.create` as separate `await`s outside
  `$transaction`.
- `packages/db/prisma/schema.prisma` lines 4598–4649: `Notification` model has
  no `@@unique` on `(tenantId, sourceId, sourceType)`.

**RACE-WORKE-02** — Medium

- `apps/workers/events-worker/src/maintenance/scheduled-jobs.ts` lines 273–302,
  334–363, 399–431, 493–524: all four dedup paths (stale-lead, overdue-task,
  stale-deal, appointment-reminder) follow the same non-atomic
  `notification.findFirst` + `notification.create` pattern.

**RACE-WORKE-03** — Medium

- `apps/ai-worker/src/jobs/insight-generation.job.ts` lines 742–750:
  `prisma.aIInsight.findFirst` then `prisma.aIInsight.create` — no transaction;
  no `@@unique` on `AIInsight`.

**RACE-WORKE-04** — High

- `packages/platform/src/queues/queue-factory.ts` lines 226–230:
  `globalRetryBudget.canRetry(QUEUE_NAMES.AI_SCORING)` called; `consumeRetry`
  never called.
- `packages/platform/src/queues/retry-strategy.ts` lines 187–203: `canRetry`
  reads; `consumeRetry` decrements — only the first is called.
- Upgraded to High: thundering-herd on deployment restart can saturate Redis
  scoring queue with no backpressure.

**RACE-WORKE-05** — Low

- `apps/ai-worker/src/jobs/scoring.job.ts` lines 250–382: fan-out
  `queue.add('score-lead', ...)` without deterministic `jobId`.
- Note: downgraded to Low because `scoring.job.ts:399` uses
  `prisma.leadAIInsight.upsert` with `@@unique([leadId, tenantId])` — DB absorbs
  duplicate writes idempotently.

**RACE-WORKE-06** — Medium

- `apps/ai-worker/src/account-scoring.chain.ts` lines 120–128: unconditional
  `prisma.account.update` — no `scoredAt`-based conditional.
- `apps/ai-worker/src/jobs/account-scoring.job.ts` lines 56–75: fan-out without
  `jobId` dedup key.

**RACE-WORKE-07** — Low

- `apps/ai-worker/src/jobs/insight-generation.job.ts` lines 693–728:
  `leadActivity.findFirst` + `leadActivity.create` outside transaction.
- `packages/db/prisma/schema.prisma` lines 488–508 and 1239–1272: `LeadActivity`
  and `ContactActivity` have no `@@unique` on `(leadId, title, tenantId)`.

**RACE-WORKE-08** — Low

- `packages/platform/src/queues/retry-strategy.ts` lines 187–203: `canRetry` and
  `consumeRetry` are both synchronous but an `await` between them in the calling
  code creates a TOCTOU window. Moot until RACE-WORKE-04 is fixed.

**RACE-WORKE-M1** — Medium

- `apps/ai-worker/src/jobs/insight-generation.job.ts` lines 611–666:
  `notification.findFirst` with fuzzy `OR` predicate then `notification.create`
  — no transaction; no `@@unique`.

**RACE-WORKE-M2** — Medium

- `apps/ai-worker/src/jobs/account-scoring.job.ts` lines 56–75: same fan-out
  without `jobId` as RACE-WORKE-M2, feeding directly into the lost-update race
  in RACE-WORKE-06.

**RACE-WORKE-M3** — High

- `packages/adapters/src/repositories/PrismaOutboxRepository.ts` lines 129–171:
  `markAsPublished` uses a plain `update` with no status pre-check.
- `apps/workers/events-worker/src/outbox/pollOutbox.ts` lines 178–212:
  dispatch-then-mark sequence not atomic.

---

### RBAC / Auth / Session / MFA

**RACE-RBAC-01** — High

- `apps/api/src/services/session.service.ts` lines 247–295:
  `enforceSessionLimit` reads `sessionsByUser` (line 272), then calls
  `await this.revokeSession()` — yields event loop.
- `apps/api/src/services/session.service.ts` lines 120–123: `sessionsByUser` and
  `sessionStore` are module-level `Map`s.

**RACE-RBAC-03** — High

- `apps/api/src/modules/auth/auth.router.ts` lines 942–951: `getUserMfaSettings`
  (DB round-trip) then generate codes then `saveUserMfaSettings` (DB `upsert`) —
  no transaction.
- `apps/api/src/modules/auth/auth.router.ts` lines 1087–1113:
  `regenerateBackupCodes` — same pattern.
- `apps/api/src/services/mfa.service.ts` line 683: `saveUserMfaSettings` writes
  to `mfaSettingsCache` before the DB `upsert`.

**RACE-RBAC-04** — Medium

- `apps/api/src/security/rbac.ts` lines 571–598: `assignRole` — `findUnique`
  (line 571) then `userRoleAssignment.upsert` (line 579); no `$transaction`.
- `apps/api/src/security/rbac.ts` lines 604–621: `removeRole` — symmetric race.
- `packages/db/prisma/schema.prisma` line 2623: `@@unique([userId, roleId])`
  prevents duplicate rows but not reassign-after-revoke reactivation.

**RACE-RBAC-05** — Medium

- `apps/api/src/security/rbac.ts` lines 179–181: `permissionCache` is a `Map`
  with 60-second TTL on the `RBACService` instance.
- `apps/api/src/security/rbac.ts` lines 720–726: module-level singleton;
  `clearCache(userId)` only evicts from local process instance.

**RACE-RBAC-06** — High

- `apps/api/src/security/rbac.ts` lines 436–444: `getUserRBACRoles` queries
  `userRoleAssignment` with only `{ userId, expiresAt }` — no `tenantId`.
- `apps/api/src/security/rbac.ts` lines 540–546: `applyUserPermissionOverrides`
  queries `userPermission` with only `{ userId, expiresAt }` — no `tenantId`.
- `packages/db/prisma/schema.prisma` lines 2609–2628:
  `UserRoleAssignment.tenantId` exists and is indexed but never used in reads.

**RACE-RBAC-07** — High

- `apps/api/src/services/mfa.service.ts` lines 682–724: `saveUserMfaSettings`
  sets `mfaSettingsCache` at line 683 before the `await upsert` at line 689.
- `apps/api/src/services/mfa.service.ts` lines 720–723: DB failure swallowed
  with `console.error` — cache and DB permanently diverge.

**RACE-RBAC-M1** — Critical

- `apps/api/src/services/mfa.service.ts` lines 466–472: `validateChallengeCode`
  for `method='backup'` mutates `userMfaSettings.backupCodes` in-memory only.
- `apps/api/src/services/mfa.service.ts` lines 516–518: `verifyChallenge`
  returns `{ success: true }` with no call to `saveUserMfaSettings`.
- `apps/api/src/services/__tests__/mfa.service.additional.test.ts` lines
  319–323: test verifies in-memory array length but never asserts
  `saveUserMfaSettings` was called.

**RACE-RBAC-M2** — High

- `apps/api/src/services/session.service.ts` lines 272–273:
  `enforceSessionLimit` immediately returns if `sessionsByUser.get(userId)` is
  `undefined` — in-memory `Map` starts empty on every process start.
- `apps/api/src/services/session.service.ts` lines 385–399:
  `populateUserSessionsFromDb` exists but is only called from `getUserSessions`,
  not from `enforceSessionLimit`.

**RACE-RBAC-M3** — Medium

- `apps/api/src/services/mfa.service.ts` lines 221–224: `mfaSettingsCache` is a
  module-level `Map` with no TTL, no LRU eviction.
- `apps/api/src/services/mfa.service.ts` lines 645–648: returns cached entry
  unconditionally if present.

---

### Quota / Budget / Capacity

**RACE-QUOTA-01** — High

- `packages/adapters/src/memory/zep/zep-client.ts` line 144: `episodeCount` is
  in-process instance state.
- `packages/adapters/src/memory/zep/zep-client.ts` lines 280–284:
  `createSession` does `this.episodeCount++` then
  `incrementEpisodeCount(previousCount)`.
- `packages/adapters/src/memory/zep/zep-client.ts` lines 522–526:
  `incrementEpisodeCount` writes
  `prisma.zepEpisodeUsage.update({ data: { episodesUsed: this.episodeCount } })`
  — absolute overwrite.
- `packages/db/prisma/schema.prisma` lines 4864–4879: `ZepEpisodeUsage` has
  `@@unique([tenantId])` but no `CHECK` constraint.

**RACE-QUOTA-02** — Medium

- `apps/api/src/modules/zep/zep-budget.router.ts` lines 172–176: `findUnique`
  outside transaction.
- `apps/api/src/modules/zep/zep-budget.router.ts` lines 179–191: unconditional
  `upsert` in a separate round-trip.
- `apps/api/src/modules/zep/zep-budget.router.ts` lines 194–208:
  `zepEpisodeAudit.create` uses `previousCount` from the earlier outer read.

**RACE-QUOTA-03** — High

- `apps/api/src/services/LeadRoutingService.ts` line 113: `getEligibleAgents`
  filters `currentCapacity < maxCapacity` in application code outside the
  routing transaction.
- `apps/api/src/services/LeadRoutingService.ts` lines 346–349: bare increment
  inside `$transaction` with no ceiling guard.
- `apps/api/src/services/TicketRoutingService.ts` lines 165–173: same pattern.
- `packages/db/prisma/migrations/20260317000000_baseline/migration.sql` lines
  1678–1679: `agent_availability` table definition has no
  `CHECK (currentCapacity <= maxCapacity)`.

**RACE-QUOTA-M1** — High

- `apps/api/src/services/LeadRoutingService.ts` lines 346–349: increment on
  routing; no corresponding decrement anywhere in the codebase on lead/ticket
  resolution.
- `apps/api/src/services/TicketRoutingService.ts` lines 165–173: same.
- `packages/db/prisma/schema.prisma` lines 3755–3756:
  `AgentAvailability.currentCapacity` has no relation to lifecycle events that
  would trigger a decrement.

**RACE-QUOTA-M2** — Medium

- `packages/adapters/src/memory/zep/zep-client.ts` lines 188–189: `initialize()`
  guard `if (this.isInitializedFlag) return` — flag not set until lines 231/251,
  leaving a window where two concurrent callers both pass.
- `packages/adapters/src/memory/zep/zep-client.ts` line 206:
  `this.episodeCount = record.episodesUsed` — last writer wins.

**RACE-QUOTA-M3** — Medium

- `apps/api/src/modules/zep/zep-budget.router.ts` lines 179–191: `upsert` create
  block hardcodes `maxEpisodes: 1000` regardless of tenant config; existing
  `maxEpisodes` from `findUnique` result is never carried into the create block.

---

### Entitlement / Tenant Modules

**RACE-ENTIT-01** — Medium (downgraded from High)

- `packages/adapters/src/repositories/PrismaTenantModuleRepository.ts` lines
  155–172: `Promise.all` fan-out upserts with no wrapping `$transaction`.
- `packages/adapters/src/repositories/PrismaTenantModuleRepository.ts` lines
  174–176: `getEnabledModules()` read after fan-out is not inside a transaction.
- Note: severity Medium because the caller in `billing.router.ts` line 711
  discards the return value.

**RACE-ENTIT-02** — High

- `packages/adapters/src/repositories/PrismaTenantModuleRepository.ts` lines
  24–25: `getTenantPlan()` issues a separate query for `Workspace.plan`.
- `packages/adapters/src/repositories/PrismaTenantModuleRepository.ts` lines
  28–31: second independent `findMany` for overrides.
- `apps/api/src/modules/subscription/subscription.router.ts` lines 56–59:
  `getEnabledModules` and `getTenantPlan` called via `Promise.all`, amplifying
  the window.

**RACE-ENTIT-03** — Critical

- `apps/api/src/modules/billing/billing.router.ts` line 1469: Stripe-signature
  verification explicitly omitted ("In production, this would verify the Stripe
  signature").
- `apps/api/src/modules/billing/billing.router.ts` line 1473: procedure is
  `publicProcedure` — no auth, no rate limit.
- `packages/db/prisma/schema.prisma` lines 292–305: no `processed_stripe_events`
  or `webhook_idempotency` table.

**RACE-ENTIT-04** — High (downgraded from Critical)

- `apps/api/src/modules/billing/billing.router.ts` lines 902–908: reads
  `user.stripeCustomerId` from request context snapshot; two concurrent requests
  both see `null`.
- `apps/api/src/modules/billing/billing.router.ts` lines 910–918: both callers
  proceed to `stripe.createCustomer()`.
- `packages/db/prisma/schema.prisma` line 319:
  `stripeCustomerId String? @unique` — DB prevents duplicate ID persistence but
  orphan Stripe customer remains.

**RACE-ENTIT-05** — High

- `apps/api/src/modules/billing/billing.router.ts` lines 708–712:
  `getTenantPlan()` reads `Workspace.plan` from DB after Stripe confirms;
  `Workspace.plan` is never updated in `updateSubscription`.
- `packages/db/prisma/schema.prisma` lines 3196–3197: `Workspace.plan` is the
  authoritative field; no write exists in `updateSubscription` path.

**RACE-ENTIT-06** — Medium

- `apps/api/src/modules/billing/billing.router.ts` line 255: `billingCache` is a
  module-level `Map`.
- `apps/api/src/modules/billing/billing.router.ts` line 253:
  `CACHE_TTL_MS = 5 * 60 * 1000`.
- `apps/api/src/modules/billing/billing.router.ts` lines 275–280:
  `invalidateBillingCache` iterates local `Map` only.

**RACE-ENTIT-M1** — High

- `packages/adapters/src/repositories/PrismaTenantModuleRepository.ts` lines
  150–172: `syncModulesToPlan` only upserts `planModules` as `enabled: true`; no
  `UPDATE ... enabled: false` for above-plan modules not in new plan.
- After `ENTERPRISE → STARTER` downgrade: rows for `LEGAL`, `ANALYTICS`,
  `AI_INTELLIGENCE` remain `enabled: true` indefinitely.

**RACE-ENTIT-M2** — Medium

- `apps/api/src/modules/subscription/subscription.router.ts` lines 106–114:
  `enableModule`/`disableModule` at line 107/109, then `getEnabledModules` and
  `getTenantPlan` as separate sequential reads outside any transaction.

**RACE-ENTIT-M3** — Medium

- `packages/adapters/src/repositories/PrismaTenantModuleRepository.ts` lines
  54–65: `findUnique` for override returns `null`; between the two reads a
  concurrent `syncModulesToPlan` creates the override row; `getTenantPlan` at
  line 64 reads stale plan.

---

### Audit Log

**RACE-AUDIT-01** — Critical

- `packages/adapters/src/audit/DurableAuditLogAdapter.ts` line 66:
  `private previousHash: string = 'GENESIS'` — single shared mutable field.
- `packages/adapters/src/audit/DurableAuditLogAdapter.ts` line 110:
  `previousHash: this.previousHash` read before `$transaction`.
- `packages/adapters/src/audit/DurableAuditLogAdapter.ts` lines 147–148:
  `this.previousHash = integrityHash` written after
  `await this.prisma.$transaction` resolves.
- `packages/adapters/src/audit/__tests__/DurableAuditLogAdapter.test.ts` lines
  421–493: "Concurrent safety" block runs against a synchronous mock — cannot
  detect this race.

**RACE-AUDIT-02** — High

- `apps/api/src/security/audit/audit-logger.ts` lines 136–139:
  `await this.log(createLoginSuccessEntry(...))` then
  `await this.logSecurityEvent(...)` — two independent `await`s.
- `apps/api/src/security/audit/writer.ts` lines 87–118:
  `prisma.auditLogEntry.create` — no transaction.
- `apps/api/src/security/audit/handlers/security-handler.ts` lines 34–82:
  `prisma.securityEvent.create` — no shared transaction.

**RACE-AUDIT-03** — Medium (downgraded from High)

- `apps/api/src/security/audit/index.ts` lines 69–73:
  `auditLoggerInstance ??= new AuditLogger(prisma, config)` — first caller's
  `prisma` captured forever.
- `apps/api/src/modules/opportunity/opportunity.router.ts` line 724: passes
  `ctx.prisma` (not `ctx.prismaWithTenant`).
- Note: downgraded to Medium because `AuditLogger` passes explicit `tenantId` in
  every row and Prisma FK constraint provides safety net.

**RACE-AUDIT-04** — Medium

- `apps/api/src/security/audit/audit-logger.ts` lines 244–255: `scheduleFlush()`
  — `if (this.flushTimer) return` guard prevents double-scheduling via timer
  path but not batchSize-overflow path.
- `apps/api/src/security/audit/audit-logger.ts` lines 218–228: `flush()` —
  `splice` + `Promise.all` + `unshift` on catch; only activates when
  `config.async` is explicitly enabled (default `false`).

**RACE-AUDIT-05** — High

- `packages/adapters/src/audit/DurableAuditLogAdapter.ts` lines 48–57:
  `AuditPrismaClient` interface declares
  `securityEvent.findUnique({ where: { eventId: string } })`.
- `packages/db/prisma/schema.prisma` lines 1939–1978: production `SecurityEvent`
  model has no `eventId` field — `id` is the `@id` field.
- `packages/adapters/src/audit/__tests__/DurableAuditLogAdapter.test.ts` lines
  21–36: hand-rolled mock hides the schema mismatch.

**RACE-AUDIT-06** — Medium

- `packages/adapters/src/audit/DurableAuditLogAdapter.ts` lines 169–236:
  `logBatchEvents` wraps loop in `$transaction` but individual event failures
  caught at lines 227–233 without re-throwing — partial success committed.
- `packages/adapters/src/audit/DurableAuditLogAdapter.ts` lines 229–232: failure
  result uses a new `randomUUID()` not the original event's identifier.

**RACE-AUDIT-07** — Medium

- `packages/adapters/src/repositories/PrismaOutboxRepository.ts` lines 132–175:
  `fetchPendingEvents` uses `$queryRaw` `FOR UPDATE SKIP LOCKED` in implicit
  autocommit — lock released after statement; no `PROCESSING` status flip.
- `packages/adapters/src/repositories/PrismaOutboxRepository.ts` lines 68–78:
  `mapPrismaStatus` maps `PROCESSING → 'pending'` — dead code as `PROCESSING` is
  never written.

**RACE-AUDIT-M1** — High

- `packages/adapters/src/events/OutboxEventBusAdapter.ts` lines 66–79:
  `findFirst` then `create` — classic read-check-write with no transaction.
- `packages/db/prisma/schema.prisma` lines 1560–1586: `DomainEvent` model has no
  `@unique` on any idempotency field.

**RACE-AUDIT-M2** — High

- `apps/api/src/security/audit/writer.ts` lines 87–118:
  `prisma.auditLogEntry.create` — no `upsert`, no `ON CONFLICT`, no idempotency
  check.
- `packages/db/prisma/schema.prisma` lines 2345–2408: `AuditLogEntry.eventId` at
  line 2355 is a plain non-unique `String` column.

**RACE-AUDIT-M3** — Medium

- `apps/api/src/security/audit/writer.ts` lines 10–25: `validateTenant` runs
  `prisma.tenant.findUnique` outside any transaction.
- `apps/api/src/security/audit/writer.ts` lines 121–124: error IS re-thrown, but
  call sites in `opportunity.router.ts` line 733 use fire-and-forget
  `.catch(err => console.error(...))`.

---

### Pure Domain Invariants

**RACE-PURE-01** — Medium

- `packages/domain/src/shared/Money.ts` line 33:
  `SUPPORTED_CURRENCIES = ['GBP','EUR','GBP','CAD','AUD','JPY']` — duplicate
  `'GBP'`, missing `'USD'`.
- `packages/domain/src/shared/__tests__/Money.test.ts` lines 24–29: test
  description says "should default to USD" but asserts `currency === 'GBP'`.

**RACE-PURE-02** — Medium

- `packages/domain/src/shared/Money.ts` lines 83–88: `Money.create(decimal)`
  uses `Math.round(amount*100)` — IEEE-754 float risk.
- `packages/domain/src/shared/Money.ts` lines 128–134: `add()` — no property
  test for commutativity or associativity.
- `packages/domain/src/shared/Money.ts` lines 160–175: `multiply()` uses
  `Math.round(cents * factor)`.

**RACE-PURE-03** — Medium

- `packages/domain/src/crm/opportunity/Opportunity.ts` lines 178–183:
  `weightedValue` uses `value.amount` (float) × `probability.asDecimal` (float)
  then `Money.create(weightedAmount)` — re-enters float rounding path.

**RACE-PURE-04** — High

- `packages/domain/src/crm/billing/Invoice.ts` lines 656–680:
  `recalculateTotals` uses `if (addResult.isSuccess)` guards — failures silently
  ignored; `subtotal` stays at `Money.zero`.
- `packages/domain/src/crm/billing/Invoice.ts` lines 619–636: `addLineItem`
  returns `Result<void>` but calls `recalculateTotals` which returns `void` —
  partial failure invisible.

**RACE-PURE-05** — Low

- `packages/domain/src/crm/billing/TaxRate.ts` lines 46–55: `calculate()`
  returns `Money.zero` on `multiply` failure — silent zero tax.
- Note: reachable path is essentially unreachable under normal business
  constraints (rate in [0,100], normal subtotals). Downgraded to Low.

**RACE-PURE-06** — High

- `packages/domain/src/crm/billing/Invoice.ts` lines 454–466: `recordPayment`
  and lines 547–557: `processRefund` — accounting invariant
  `amountPaid + amountDue - amountRefunded === totalAmount` is maintained by
  specific operations but never asserted in any test across interleaved
  sequences.

**RACE-PURE-07** — Low

- `packages/domain/src/crm/billing/Invoice.ts` lines 91–97:
  `let invoiceSequence = 0` — module-level singleton.
- `packages/domain/src/crm/billing/Receipt.ts` lines 34–39:
  `let receiptSequence = 0`.
- `packages/domain/src/crm/ticket/Ticket.ts` lines 111–115:
  `let ticketCounter = 0`.
- Note: downgraded to Low; Vitest forks pool isolates module state across
  workers; production uses DB sequences.

**RACE-PURE-08** through **RACE-PURE-14** and **RACE-PURE-M1** through
**RACE-PURE-M3** — All Low severity; detailed evidence references available in
the per-lane section above. These findings cover state-machine gaps
(`Task.complete`, `Ticket.changePriority`, `Lead.changeStatus`), ValueObject
equality edge cases (`ValueObject.equals` using `JSON.stringify`),
date-calculation testability gaps (`Appointment.create` lacking injectable
`now`), and `Invoice.paymentStatus` derivation across multi-step pay/refund
cycles.

---

### Test Infrastructure

**RACE-TEST--M1** — High

- `tests/integration/setup.ts` lines 237–245:
  `new PrismaClient({ datasources: { db: { url: databaseUrl } } })` — Prisma 5/6
  API incompatible with Prisma 7 `engineType = 'client'`.
- `tests/integration/ingestion/file-ingestion.e2e.test.ts` lines 125–131: same
  incompatible constructor.
- `packages/db/prisma/schema.prisma` lines 4–8: `engineType = 'client'`
  confirmed.
- `packages/db/CLAUDE.md` lines 18–21: "Every `new PrismaClient()` MUST include
  `{ adapter: new PrismaPg({ connectionString: ... }) }`."
- `packages/db/src/client.ts` lines 104–119: production `createPrismaClient()`
  correctly uses `PrismaPg` adapter.

**RACE-TEST--M2** — Medium

- `vitest.config.ts` lines 143–148: integration project: `pool='forks'`,
  `maxWorkers=4`.
- `tests/integration/setup.ts` lines 100–118: single PostgreSQL container;
  `databaseUrl` set once globally — all 4 fork workers share the same database.
- `tests/integration/setup.ts` lines 253–275: `resetDatabaseState()` uses
  `TRUNCATE CASCADE` — concurrent `beforeEach` calls across workers can race.

**RACE-TEST--M3** — Medium

- `scripts/run-tests.js` lines 44–65: `stdout` handler assigns
  `testsPassedCount = parseInt(...)` and `testsFailedCount = parseInt(...)` on
  each chunk — last `'Tests X passed'` line overwrites counts from earlier
  projects in a 17-project run.

**RACE-TEST--01 through RACE-TEST--08** — All Low severity; detailed evidence in
the per-lane section above.

---

_Document generated by Phase 0 audit — 107 confirmed findings across 11 lanes._
