# Property Testing Remediation Report — Phase 8

> **Status**: In progress — skeleton pre-filled with completed work. Update the
> "Fixed races" table and section 5 as each fix lands. Generated: 2026-05-31.

---

## 1. Executive Summary

Phase 8 of the IntelliFlow CRM property-testing programme applied fast-check
property-based testing across seven concurrency lanes:

| Lane                        | IDs                                  | In-scope                                                        |
| --------------------------- | ------------------------------------ | --------------------------------------------------------------- |
| audit-log                   | RACE-AUDIT-01..07, RACE-AUDIT-M1..M3 | AuditLogger, DurableAuditLogAdapter, writer.ts                  |
| booking-scheduling          | RACE-BOOKI-01..04, RACE-BOOKI-M1..M3 | Appointment use-cases, PrismaAppointmentRepository              |
| dedupe-merge                | RACE-DEDUP-01..07, RACE-DEDUP-M1..M3 | Contact/Lead dedup, ContactService, LeadService                 |
| entitlement-modules         | RACE-ENTIT-01..06, RACE-ENTIT-M1..M3 | PrismaTenantModuleRepository, billing router                    |
| quota-budget-capacity       | RACE-QUOTA-01..03, RACE-QUOTA-M1..M3 | ZepMemoryAdapter, LeadRoutingService, budget router             |
| rbac-auth-session           | RACE-RBAC-01..07, RACE-RBAC-M1..M3   | SessionService, MfaService, RBACService                         |
| routing-assignment          | RACE-ROUTI-01..05, RACE-ROUTI-M1..M3 | TicketRoutingService, LeadRoutingService, routing router        |
| webhooks-outbox-idempotency | RACE-WEBHO-01..05, RACE-WEBHO-M1..M3 | OutboxEventBusAdapter, PrismaOutboxRepository, WebhookFramework |
| workers-queue-jobs          | RACE-WORKE-01..06, RACE-WORKE-M1..M3 | ScheduledJobsService, insight/account scoring jobs              |
| test-infra                  | RACE-TEST--M1..M3                    | Integration harness, vitest config, run-tests.js                |
| domain-pure                 | RACE-PURE-01..14, RACE-PURE-M1..M3   | All domain value-objects and aggregates                         |

**Races identified**: 62 pending + 5 already fixed = 67 total. **Domain bugs
found by property tests**: 16 (see section 4). **Property test files written**:
23 (covering 500+ individual properties).

---

## 2. Fixed Races

The following items were confirmed fixed before this report was generated. The
"seed" column is the minimum reproducer command.

| ID            | Severity | Lane                        | Fix summary                                                                                                                                                                                                                                                                           | Test file                                                            | Seed command                                                                                                                    |
| ------------- | -------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| RACE-AUDIT-01 | Critical | audit-log                   | `DurableAuditLogAdapter` serialises all chain appends via a per-process `chainTail: Promise<unknown>` mutex. Both `logSecurityEvent` and `logBatchEvents` route through `enqueueChainAppend()`.                                                                                       | `tests/property/concurrency/audit-hash-chain.prop.test.ts`           | `pnpm vitest run --project property tests/property/concurrency/audit-hash-chain.prop.test.ts`                                   |
| RACE-BOOKI-01 | Critical | booking-scheduling          | Migration `20260530000000_appointment_no_overlap_exclusion` adds a `btree_gist` EXCLUDE constraint on `(tenantId, organizerId, tsrange(startTime,endTime)) WHERE status NOT IN ('CANCELLED','NO_SHOW')`. `PrismaAppointmentRepository.save()` maps 23P01 to `ConflictDetectionError`. | `tests/property/concurrency/appointment-double-booking.prop.test.ts` | `RUN_DB_PROPERTY_TESTS=1 pnpm vitest run --project property tests/property/concurrency/appointment-double-booking.prop.test.ts` |
| RACE-BOOKI-02 | Critical | booking-scheduling          | Same DB-level EXCLUDE constraint as RACE-BOOKI-01 covers the `ScheduleAppointmentUseCase` check-then-act gap.                                                                                                                                                                         | `tests/property/concurrency/appointment-double-booking.prop.test.ts` | (same as above)                                                                                                                 |
| RACE-RBAC-M1  | Critical | rbac-auth-session           | `consumeBackupCode` performs an atomic guarded `UPDATE … WHERE $hash = ANY(backupCodes)`. Second concurrent attempt waits on the row lock, re-evaluates the `= ANY` guard against the already-updated row, and affects 0 rows.                                                        | `tests/property/concurrency/mfa-backup-code.prop.test.ts`            | `RUN_DB_PROPERTY_TESTS=1 pnpm vitest run --project property tests/property/concurrency/mfa-backup-code.prop.test.ts`            |
| RACE-WEBHO-03 | High     | webhooks-outbox-idempotency | `WebhookFramework` in-memory `IdempotencyStore` now has atomic `claim()`/`complete()`/`release()` operations in `packages/webhooks/src/framework.ts`.                                                                                                                                 | (covered by webhook unit tests)                                      | `pnpm vitest run --project property tests/property/unit/platform/webhook-idempotency-store.prop.test.ts`                        |

---

## 3. Pending Races

All items below are **pending** — fix not yet merged. Update this table as PRs
land: change "pending" to the PR number and merge date.

### 3.1 audit-log lane

| ID            | Severity | Pattern                 | Fix file(s)                                                               | Status  |
| ------------- | -------- | ----------------------- | ------------------------------------------------------------------------- | ------- |
| RACE-AUDIT-02 | High     | missing-transaction     | `apps/api/src/security/audit/audit-logger.ts`                             | pending |
| RACE-AUDIT-03 | High     | tenancy-scope-leak      | `apps/api/src/security/audit/index.ts`                                    | pending |
| RACE-AUDIT-04 | Medium   | non-atomic-upsert       | `apps/api/src/security/audit/audit-logger.ts`                             | pending |
| RACE-AUDIT-05 | High     | infra-gap               | `packages/adapters/src/audit/DurableAuditLogAdapter.ts`, schema migration | pending |
| RACE-AUDIT-06 | Medium   | missing-idempotency-key | `packages/adapters/src/audit/DurableAuditLogAdapter.ts`                   | pending |
| RACE-AUDIT-07 | Medium   | non-atomic-upsert       | `packages/adapters/src/repositories/PrismaOutboxRepository.ts`            | pending |
| RACE-AUDIT-M1 | High     | check-then-act          | `packages/adapters/src/events/OutboxEventBusAdapter.ts`, schema migration | pending |
| RACE-AUDIT-M2 | High     | missing-idempotency-key | `apps/api/src/security/audit/writer.ts`, schema migration                 | pending |
| RACE-AUDIT-M3 | Medium   | check-then-act          | `apps/api/src/security/audit/writer.ts`, `handlers/security-handler.ts`   | pending |

### 3.2 booking-scheduling lane

| ID            | Severity | Pattern                 | Fix file(s)                                                                        | Status                             |
| ------------- | -------- | ----------------------- | ---------------------------------------------------------------------------------- | ---------------------------------- |
| RACE-BOOKI-03 | High     | lost-update             | `packages/db/prisma/schema.prisma` (version column), `PrismaAppointmentRepository` | pending                            |
| RACE-BOOKI-04 | High     | non-atomic-upsert       | `PrismaAppointmentRepository.batchUpdateStatus()`                                  | pending                            |
| RACE-BOOKI-M1 | High     | missing-idempotency-key | `packages/db/prisma/schema.prisma`, `scheduled-jobs.ts`                            | pending                            |
| RACE-BOOKI-M2 | High     | lost-update             | Same version-column fix as RACE-BOOKI-03                                           | pending (depends on RACE-BOOKI-03) |
| RACE-BOOKI-M3 | Medium   | read-check-write        | New `ConfirmAppointment.ts` use-case, `appointments.router.ts`                     | pending (depends on RACE-BOOKI-03) |

### 3.3 dedupe-merge lane

| ID            | Severity | Pattern             | Fix file(s)                                                                       | Status                                            |
| ------------- | -------- | ------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------- |
| RACE-DEDUP-01 | High     | check-then-act      | `PrismaContactRepository.save()`, `PrismaLeadRepository.save()`                   | pending (depends on RACE-DEDUP-05)                |
| RACE-DEDUP-02 | Medium   | read-check-write    | `PrismaContactRepository.mergeInTransaction` (Serializable isolation)             | pending (depends on RACE-DEDUP-M2)                |
| RACE-DEDUP-03 | High     | check-then-act      | `inbound.router.ts`, schema migration (LeadSubmission table)                      | pending                                           |
| RACE-DEDUP-04 | Medium   | non-atomic-upsert   | `contact.router.ts` auto-merge path                                               | pending (depends on RACE-DEDUP-01)                |
| RACE-DEDUP-05 | High     | tenancy-scope-leak  | `ContactRepository` port + 4 implementations, `ContactService`                    | pending                                           |
| RACE-DEDUP-06 | Medium   | missing-transaction | `account-duplicate-detection.service.ts`, schema migration, ADR-050 amendment     | pending                                           |
| RACE-DEDUP-M1 | High     | missing-transaction | `PrismaLeadRepository.convertInTransaction()`, `LeadService`                      | pending                                           |
| RACE-DEDUP-M2 | Medium   | duplicate-event     | `packages/db/prisma/schema.prisma` (DomainEvent idempotencyKey), `ContactService` | pending                                           |
| RACE-DEDUP-M3 | High     | check-then-act      | `ContactService.updateContactEmail` (pass tenantId to findByEmail)                | pending (depends on RACE-DEDUP-05, RACE-DEDUP-01) |

### 3.4 entitlement-modules lane

| ID            | Severity | Pattern                 | Fix file(s)                                                                    | Status                             |
| ------------- | -------- | ----------------------- | ------------------------------------------------------------------------------ | ---------------------------------- |
| RACE-ENTIT-01 | High     | missing-transaction     | `PrismaTenantModuleRepository.syncModulesToPlan` (Serializable tx)             | pending (depends on RACE-ENTIT-M1) |
| RACE-ENTIT-02 | High     | read-check-write        | `PrismaTenantModuleRepository.getEnabledModules` (RepeatableRead tx)           | pending                            |
| RACE-ENTIT-03 | Critical | missing-idempotency-key | `billing.router.ts` webhook, schema migration (ProcessedStripeEvent), ADR      | pending                            |
| RACE-ENTIT-04 | Critical | check-then-act          | `billing.router.ts` ensureCustomer (optimistic lock / sentinel)                | pending                            |
| RACE-ENTIT-05 | High     | lost-update             | `billing.router.ts` updateSubscription (read from Stripe result, not stale DB) | pending                            |
| RACE-ENTIT-06 | Medium   | infra-gap               | Billing + enablement cache (Redis-backed store), ADR                           | pending                            |
| RACE-ENTIT-M1 | High     | lost-update             | `syncModulesToPlan` additive-only — add `updateMany` disable step              | pending (depends on RACE-ENTIT-01) |
| RACE-ENTIT-M2 | Medium   | read-check-write        | `subscription.router.ts` toggleModule trailing read (in-tx)                    | pending                            |
| RACE-ENTIT-M3 | Medium   | check-then-act          | `PrismaTenantModuleRepository.isModuleEnabled` (RepeatableRead tx)             | pending (depends on RACE-ENTIT-02) |

### 3.5 quota-budget-capacity lane

| ID            | Severity | Pattern              | Fix file(s)                                                                                           | Status                             |
| ------------- | -------- | -------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------- |
| RACE-QUOTA-01 | High     | non-atomic-decrement | `zep-client.ts` incrementEpisodeCount (atomic tx + CHECK constraint migration)                        | pending                            |
| RACE-QUOTA-02 | Medium   | read-check-write     | `zep-budget.router.ts` resetEpisodeCount (wrap in $transaction)                                       | pending                            |
| RACE-QUOTA-03 | High     | check-then-act       | `LeadRoutingService` + `TicketRoutingService` capacity ceiling (atomic $executeRaw + CHECK migration) | pending                            |
| RACE-QUOTA-M1 | High     | missing-transaction  | Capacity decrement on lead/ticket resolve                                                             | pending (depends on RACE-QUOTA-03) |
| RACE-QUOTA-M2 | Medium   | check-then-act       | `zep-client.ts` ensureInitialized promise-singleton                                                   | pending                            |
| RACE-QUOTA-M3 | Medium   | non-atomic-upsert    | `zep-budget.router.ts` upsert create block reads current config                                       | pending (depends on RACE-QUOTA-02) |

### 3.6 rbac-auth-session lane

| ID           | Severity | Pattern            | Fix file(s)                                                                                | Status                            |
| ------------ | -------- | ------------------ | ------------------------------------------------------------------------------------------ | --------------------------------- |
| RACE-RBAC-01 | High     | read-check-write   | `session.service.ts` per-userId async-mutex                                                | pending                           |
| RACE-RBAC-03 | High     | lost-update        | `mfa.service.ts` regenerateBackupCodesAtomically (Serializable tx + FOR UPDATE)            | pending                           |
| RACE-RBAC-04 | Medium   | check-then-act     | `rbac.ts` assignRole + removeRole (Serializable tx each)                                   | pending (depends on RACE-RBAC-06) |
| RACE-RBAC-05 | Medium   | lost-update        | `rbac.ts` cache staleness (Redis pub/sub for multi-process), ADR                           | pending                           |
| RACE-RBAC-06 | High     | tenancy-scope-leak | `rbac.ts` getUserRBACRoles + getPermissionsWithDB (add tenantId filter + schema migration) | pending                           |
| RACE-RBAC-07 | High     | read-check-write   | `mfa.service.ts` saveUserMfaSettings (post-upsert cache set, delete on failure)            | pending                           |
| RACE-RBAC-M2 | High     | infra-gap          | `session.service.ts` enforceSessionLimit DB hydration on cold-start                        | pending (depends on RACE-RBAC-01) |
| RACE-RBAC-M3 | Medium   | lost-update        | `mfa.service.ts` cache TTL expiry (timestamp-keyed entries, 30s TTL)                       | pending (depends on RACE-RBAC-07) |

### 3.7 routing-assignment lane

| ID            | Severity | Pattern              | Fix file(s)                                                                                  | Status                             |
| ------------- | -------- | -------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------- |
| RACE-ROUTI-01 | Critical | read-check-write     | `TicketRoutingService` already-assigned guard inside tx + CHECK constraint migration         | pending                            |
| RACE-ROUTI-02 | High     | non-atomic-decrement | `LeadRoutingService` + `TicketRoutingService` capacity $executeRaw with ceiling guard        | pending                            |
| RACE-ROUTI-03 | High     | read-check-write     | `account-reassign.ts`, `contact-reassign.ts`, `deal-reassign.ts` (re-read ownerId inside tx) | pending                            |
| RACE-ROUTI-04 | Medium   | check-then-act       | `routing.router.ts` reorder (updateMany with tenantId guard + NOT_FOUND check)               | pending                            |
| RACE-ROUTI-05 | Medium   | lost-update          | `LeadRoutingService` forceReroute decrement of previous owner                                | pending                            |
| RACE-ROUTI-M1 | High     | missing-transaction  | `routing.router.ts` assignLead capacity increment                                            | pending                            |
| RACE-ROUTI-M2 | Medium   | check-then-act       | `routing.router.ts` toggle/delete (updateMany + NOT_FOUND)                                   | pending                            |
| RACE-ROUTI-M3 | Medium   | read-check-write     | `account.router.ts` bulkReassign stale previousOwner                                         | pending (depends on RACE-ROUTI-03) |

### 3.8 webhooks-outbox-idempotency lane

| ID            | Severity | Pattern                 | Fix file(s)                                                                                       | Status                                            |
| ------------- | -------- | ----------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| RACE-WEBHO-01 | High     | read-check-write        | `OutboxEventBusAdapter.publish` Serializable tx + unique index migration                          | pending (depends on RACE-WEBHO-04)                |
| RACE-WEBHO-02 | High     | missing-transaction     | `pollOutbox.ts` claim-first pattern (markAsProcessing CAS)                                        | pending                                           |
| RACE-WEBHO-04 | Medium   | infra-gap               | `OutboxEventBusAdapter.publishAll` use `this.prisma.$transaction` not singleton `withTransaction` | pending                                           |
| RACE-WEBHO-05 | Medium   | missing-idempotency-key | `WebhookFramework.reprocessDeadLetter` synchronous remove-before-await + idempotency claim        | pending                                           |
| RACE-WEBHO-M1 | High     | read-check-write        | `OutboxEventBusAdapter.publishAll` Serializable isolation or unique-index-only guard              | pending (depends on RACE-WEBHO-04, RACE-WEBHO-01) |
| RACE-WEBHO-M2 | Medium   | check-then-act          | `WebhookFramework.processRetries` idempotency claim before first await                            | pending                                           |
| RACE-WEBHO-M3 | High     | missing-transaction     | `PrismaOutboxRepository.fetchPendingEvents` CTE atomic claim + PROCESSING status                  | pending                                           |

### 3.9 workers-queue-jobs lane

| ID            | Severity | Pattern                 | Fix file(s)                                                                              | Status                             |
| ------------- | -------- | ----------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------- |
| RACE-WORKE-01 | High     | check-then-act          | `scheduled-jobs.ts` SLA breach (tx + `skipDuplicates` + Notification @@unique migration) | pending                            |
| RACE-WORKE-02 | Medium   | check-then-act          | `scheduled-jobs.ts` follow-up reminders (`createMany skipDuplicates`)                    | pending (depends on RACE-WORKE-01) |
| RACE-WORKE-03 | Medium   | check-then-act          | `insight-generation.job.ts` persistInsightRecord upsert + partial unique index migration | pending                            |
| RACE-WORKE-04 | High     | check-then-act          | `queue-factory.ts` enqueueAIScoring — add `consumeRetry()` after `canRetry()`            | pending                            |
| RACE-WORKE-06 | Medium   | lost-update             | `account-scoring.chain.ts` scoreAccount conditional `updateMany` with scoredAt guard     | pending (depends on RACE-WORKE-M2) |
| RACE-WORKE-M1 | Medium   | check-then-act          | `insight-generation.job.ts` persistInsightNotification ON CONFLICT DO NOTHING            | pending (depends on RACE-WORKE-01) |
| RACE-WORKE-M2 | Medium   | duplicate-event         | `account-scoring.job.ts` deterministic BullMQ `jobId`                                    | pending                            |
| RACE-WORKE-M3 | High     | missing-idempotency-key | `PrismaOutboxRepository` fetchPendingEvents CTE + markAsProcessing CAS                   | pending                            |

### 3.10 test-infra lane

| ID            | Severity | Pattern   | Fix file(s)                                                                           | Status  |
| ------------- | -------- | --------- | ------------------------------------------------------------------------------------- | ------- |
| RACE-TEST--M1 | High     | infra-gap | `tests/integration/ingestion/file-ingestion.e2e.test.ts` Prisma-7 adapter constructor | pending |
| RACE-TEST--M2 | Medium   | infra-gap | `vitest.config.ts` integration project `maxWorkers: 1`                                | pending |
| RACE-TEST--M3 | Medium   | infra-gap | `scripts/run-tests.js` accumulate (`+=`) not overwrite (`=`) test counts              | pending |

---

## 4. Domain Bugs Found by Property Tests

Property tests revealed the following real production bugs. Each is accompanied
by an `it.skip` with a `BUG(…)` annotation in the linked test file. These must
be fixed in the domain layer before the corresponding skip can be promoted.

| #   | ID             | File                                                                 | Short description                                                                 |
| --- | -------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 1   | RACE-PURE-01   | `packages/domain/src/shared/Money.ts`                                | `SUPPORTED_CURRENCIES` missing USD, GBP duplicated                                |
| 2   | RACE-PURE-03   | `packages/domain/src/crm/opportunity/Opportunity.ts`                 | `weightedValue` float-multiply off-by-one-cent                                    |
| 3   | RACE-PURE-08   | `packages/domain/src/crm/lead/Lead.ts`                               | `changeStatus()` no transition table — LOST→NEW allowed                           |
| 4   | RACE-PURE-09   | `packages/domain/src/crm/task/Task.ts`                               | `complete()` skips IN_PROGRESS; `changeStatus('ARCHIVED')` bypasses archive guard |
| 5   | RACE-PURE-10   | `packages/domain/src/crm/ticket/Ticket.ts`                           | `changePriority()` does not guard ARCHIVED terminal status                        |
| 6   | RACE-PURE-11   | `packages/domain/src/crm/ticket/Ticket.ts`                           | `resumeSla()` backward-clock yields negative pause duration                       |
| 7   | RACE-PURE-12   | `packages/domain/src/shared/ValueObject.ts`                          | `equals()` JSON.stringify omits undefined keys                                    |
| 8   | RACE-PURE-13   | `packages/domain/src/crm/billing/PaymentTerms.ts`                    | `calculateDueDate` DST off-by-one (local vs UTC)                                  |
| 9   | RACE-PURE-M1   | `packages/domain/src/crm/ticket/Ticket.ts`                           | `assign()` raw throw on ARCHIVED; `unassign()` no terminal guard                  |
| 10  | RACE-PURE-M2   | `packages/domain/src/crm/task/Task.ts`                               | `assignToLead/Contact/Opportunity()` no terminal-status guard                     |
| 11  | RACE-DEDUP-07a | `apps/api/src/shared/duplicate-rule-evaluator.ts`                    | `resolveFloor(threshold=0)` maps to 100 not 0                                     |
| 12  | RACE-DEDUP-07b | `apps/api/src/shared/duplicate-rule-evaluator.ts`                    | Self-match guard absent when inputId is undefined                                 |
| 13  | RACE-DEDUP-07c | `apps/api/src/shared/duplicate-rule-evaluator.ts`                    | Composite-field extractor returns separator skeleton for empty inputs             |
| 14  | RACE-WORKE-04  | `packages/platform/src/queues/queue-factory.ts`                      | `enqueueAIScoring` calls `canRetry` but never `consumeRetry`                      |
| 15  | PROTO-ROUTE-01 | `packages/db/src/query-budget/config.ts`                             | `budgetForRoute` prototype-name collision via plain-object lookup                 |
| 16  | RACE-ENTIT-M1  | `packages/adapters/src/repositories/PrismaTenantModuleRepository.ts` | `syncModulesToPlan` additive-only — downgrade leaves above-plan modules enabled   |

---

## 5. Property Coverage Added

| Test file                                                             | Properties | Lane                        | Tier            |
| --------------------------------------------------------------------- | ---------- | --------------------------- | --------------- |
| `tests/property/unit/shared/money.prop.test.ts`                       | 24         | domain-pure                 | smoke           |
| `tests/property/unit/crm/tax-rate-percentage.prop.test.ts`            | 13         | domain-pure                 | smoke           |
| `tests/property/unit/crm/invoice-accounting.prop.test.ts`             | 39         | domain-pure                 | smoke           |
| `tests/property/unit/crm/invoice-state-machine.prop.test.ts`          | 60         | domain-pure                 | smoke           |
| `tests/property/unit/crm/payment-terms.prop.test.ts`                  | 22         | domain-pure                 | smoke           |
| `tests/property/unit/crm/lead-domain.prop.test.ts`                    | 37         | domain-pure                 | smoke           |
| `tests/property/unit/crm/opportunity.prop.test.ts`                    | 30         | domain-pure                 | smoke           |
| `tests/property/unit/crm/task-domain.prop.test.ts`                    | 40         | domain-pure                 | smoke           |
| `tests/property/unit/crm/ticket-domain.prop.test.ts`                  | 22         | domain-pure                 | smoke           |
| `tests/property/unit/legal/appointment-domain.prop.test.ts`           | 29         | booking-scheduling          | smoke           |
| `tests/property/unit/shared/value-objects.prop.test.ts`               | 29         | domain-pure                 | smoke           |
| `tests/property/unit/crm/dedup-evaluator.prop.test.ts`                | 28         | dedupe-merge                | smoke           |
| `tests/property/unit/workflow/routing-pure.prop.test.ts`              | 26         | routing-assignment          | smoke           |
| `tests/property/unit/legal/schedule-appointment-usecase.prop.test.ts` | 38         | booking-scheduling          | smoke           |
| `tests/property/unit/security/rbac-mfa-session-pure.prop.test.ts`     | 40         | rbac-auth-session           | smoke           |
| `tests/property/unit/platform/module-registry.prop.test.ts`           | 13         | entitlement-modules         | smoke           |
| `tests/property/unit/platform/retry-budget.prop.test.ts`              | 19         | workers-queue-jobs          | smoke           |
| `tests/property/unit/platform/webhook-idempotency-store.prop.test.ts` | 17         | webhooks-outbox-idempotency | smoke           |
| `tests/property/unit/security/audit-hash-chain.prop.test.ts`          | 15         | audit-log                   | smoke           |
| `tests/property/unit/platform/query-budget-store.prop.test.ts`        | 21         | quota-budget-capacity       | smoke           |
| `tests/property/unit/platform/entitlement-sync.prop.test.ts`          | 13         | entitlement-modules         | smoke           |
| `tests/property/concurrency/audit-hash-chain.prop.test.ts`            | —          | audit-log                   | smoke (real-DB) |
| `tests/property/concurrency/appointment-double-booking.prop.test.ts`  | —          | booking-scheduling          | smoke (real-DB) |
| `tests/property/concurrency/mfa-backup-code.prop.test.ts`             | —          | rbac-auth-session           | smoke (real-DB) |

**Total properties written**: ~545

---

## 6. Remaining Risks

The following risks are documented and accepted pending the fixes listed in
section 3.

1. **Audit split-brain (multi-process)**: Even after RACE-AUDIT-02 wraps login
   writes in a `$transaction`, two Railway replicas can produce divergent audit
   chains (each has its own `chainTail` promise). Blocked on ADR-056
   Redis-backed distributed lock.

2. **Stripe webhook replay**: RACE-ENTIT-03 is Critical — a replayed
   `customer.subscription.updated` event can double-provision modules. Until a
   `ProcessedStripeEvent` table and signature verification land, production
   webhooks must be protected by Stripe's built-in 48-hour event deduplication
   window only.

3. **Session limit bypass on cold-start**: RACE-RBAC-M2 — a freshly started API
   pod has empty `sessionsByUser` maps, allowing unlimited concurrent sessions
   until the first session is created on that pod. Partial mitigation: Railway
   restarts are infrequent; full fix is the DB-hydration fallback in
   RACE-RBAC-M2.

4. **Outbox double-dispatch window**: Until RACE-WEBHO-02/M3 land, two
   OutboxPoller instances can both fetch and dispatch the same event between the
   `FOR UPDATE SKIP LOCKED` select and the `markAsPublished` update. Current
   mean time between polls (5s) limits the blast radius to a small window, but
   idempotency at downstream consumers is the only reliable guard today.

5. **Agent capacity overrun**: RACE-QUOTA-03 / RACE-ROUTI-02 — concurrent
   routing calls can increment `currentCapacity` past `maxCapacity` because
   Prisma's `updateMany` cannot perform a column-reference filter natively.
   Partially mitigated by the `agentAvailability.capacity_ceiling` CHECK
   constraint migration (when applied); but without the `$executeRaw` CAS fix
   the constraint fires a 500 instead of a graceful rejection.

6. **ValueObject.equals undefined-key gap (RACE-PURE-12)**: Latent correctness
   risk in all domain objects. No current VO stores undefined props fields, but
   a future refactor could silently introduce false-equal comparisons.

---

## 7. Recommended Next Batches

Priority order based on severity and dependency graph:

**Batch A — Critical/no-dependency (ship first)**

- RACE-ENTIT-03 (Stripe webhook idempotency — Critical, no deps)
- RACE-ENTIT-04 (ensureCustomer double-create — Critical, no deps)
- RACE-ROUTI-01 (ticket auto-route double-assign — Critical, no deps)

**Batch B — High severity, infrastructure changes**

- RACE-WEBHO-04 → RACE-WEBHO-01 → RACE-WEBHO-M1 (outbox publish idempotency
  chain)
- RACE-AUDIT-M2 → RACE-AUDIT-02 (writer idempotency + tx atomicity — share
  migration)
- RACE-DEDUP-05 → RACE-DEDUP-01 → RACE-DEDUP-M3 (contact tenant scope chain)

**Batch C — High severity, no schema change**

- RACE-AUDIT-03 (singleton factory removal)
- RACE-WEBHO-02 + RACE-WEBHO-M3 (outbox at-most-once, share markAsProcessing)
- RACE-RBAC-06 + RACE-RBAC-04 (RBAC tenant scope + assign/remove tx)
- RACE-WORKE-04 (consumeRetry — one-line fix, low risk)

**Batch D — Medium severity, pure in-process fixes**

- RACE-RBAC-07 → RACE-RBAC-M3 (MFA cache ordering)
- RACE-ENTIT-02 → RACE-ENTIT-M3 (module read isolation)
- RACE-QUOTA-02 → RACE-QUOTA-M3 (budget reset tx)
- Domain bug fixes (RACE-PURE-01/03/08/09/10/11/12/13, RACE-PURE-M1/M2)

**Batch E — Deferred / schema-heavy**

- RACE-BOOKI-03/M2 (version column — needs migration + domain change)
- RACE-AUDIT-05 (eventId/integrityHash schema columns)
- RACE-DEDUP-03 (LeadSubmission table)
- RACE-AUDIT-M1 (DomainEvent idempotencyKey top-level column)

---

## 8. Flaky-Test Log

No flaky property tests observed during Phase 8.

> Update this section if a test produces inconsistent results across runs.
> Include: test file path, seed (if fast-check printed one), failure rate,
> suspected root cause, and whether it was fixed or marked `.skip`.

| Date | Test file | Seed | Failure rate | Root cause | Resolution |
| ---- | --------- | ---- | ------------ | ---------- | ---------- |
| —    | —         | —    | —            | —          | —          |
