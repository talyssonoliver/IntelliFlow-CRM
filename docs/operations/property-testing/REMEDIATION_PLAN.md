# Property-Testing Race-Condition Remediation Plan

Generated: 2026-05-31

---

## Summary

| Metric                              | Count  |
| ----------------------------------- | ------ |
| Pending fixes — Critical            | 4      |
| Pending fixes — High                | 30     |
| Pending fixes — Medium              | 20     |
| **Total pending fixes**             | **54** |
| Already fixed (alreadyFixed=true)   | 5      |
| Property-test suites added          | 21     |
| Properties written (across suites)  | 556    |
| Domain bugs found by property tests | 16     |

### Domain bugs by file

| File                                                                 | Bugs found    |
| -------------------------------------------------------------------- | ------------- |
| `packages/domain/src/crm/task/Task.ts`                               | 3             |
| `packages/domain/src/crm/ticket/Ticket.ts`                           | 3             |
| `apps/api/src/shared/duplicate-rule-evaluator.ts`                    | 3             |
| `packages/domain/src/shared/Money.ts`                                | 1             |
| `packages/domain/src/crm/billing/PaymentTerms.ts`                    | 1             |
| `packages/domain/src/crm/lead/Lead.ts`                               | 1             |
| `packages/domain/src/crm/opportunity/Opportunity.ts`                 | 1             |
| `packages/domain/src/shared/ValueObject.ts`                          | 1             |
| `packages/platform/src/queues/queue-factory.ts`                      | 1             |
| `packages/db/src/query-budget/config.ts`                             | 1             |
| `packages/adapters/src/repositories/PrismaTenantModuleRepository.ts` | 1 (test-skip) |

---

## Shared-File Hotspot Map

Files touched by multiple pending fixes MUST be serialized. Do not batch any two
fixes that share a cell in this table.

| Hot file / alias                                                     | Fixes that touch it                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/db/prisma/schema.prisma`                                   | RACE-AUDIT-05, RACE-AUDIT-M2, RACE-AUDIT-M1 (AuditLogEntry), RACE-BOOKI-03, RACE-BOOKI-M2, RACE-BOOKI-M1, RACE-DEDUP-03, RACE-DEDUP-M2, RACE-ENTIT-03, RACE-ENTIT-06 (ProcessedStripeEvent), RACE-AUDIT-07 (outbox), RACE-AUDIT-M1 (DomainEvent idempotencyKey), RACE-WEBHO-01, RACE-WORKE-01, RACE-WORKE-02, RACE-WORKE-M1, RACE-RBAC-06 |
| `apps/api/src/security/audit/audit-logger.ts`                        | RACE-AUDIT-02, RACE-AUDIT-04, RACE-AUDIT-M2                                                                                                                                                                                                                                                                                               |
| `apps/api/src/security/audit/writer.ts`                              | RACE-AUDIT-M2, RACE-AUDIT-M3                                                                                                                                                                                                                                                                                                              |
| `packages/adapters/src/repositories/PrismaOutboxRepository.ts`       | RACE-AUDIT-07, RACE-WEBHO-M3, RACE-WORKE-M3                                                                                                                                                                                                                                                                                               |
| `apps/workers/events-worker/src/outbox/pollOutbox.ts`                | RACE-AUDIT-07, RACE-WEBHO-02, RACE-WEBHO-M3, RACE-WORKE-M3                                                                                                                                                                                                                                                                                |
| `packages/adapters/src/repositories/PrismaTenantModuleRepository.ts` | RACE-ENTIT-01, RACE-ENTIT-02, RACE-ENTIT-M1, RACE-ENTIT-M3                                                                                                                                                                                                                                                                                |
| `packages/adapters/src/events/OutboxEventBusAdapter.ts`              | RACE-WEBHO-01, RACE-WEBHO-04, RACE-WEBHO-M1, RACE-AUDIT-M1                                                                                                                                                                                                                                                                                |
| `apps/api/src/modules/billing/billing.router.ts`                     | RACE-ENTIT-03, RACE-ENTIT-04, RACE-ENTIT-05, RACE-ENTIT-06                                                                                                                                                                                                                                                                                |
| `apps/api/src/services/mfa.service.ts`                               | RACE-RBAC-03, RACE-RBAC-07, RACE-RBAC-M3                                                                                                                                                                                                                                                                                                  |
| `packages/webhooks/src/framework.ts`                                 | RACE-WEBHO-05, RACE-WEBHO-M2                                                                                                                                                                                                                                                                                                              |
| `apps/api/src/services/LeadRoutingService.ts`                        | RACE-QUOTA-03, RACE-QUOTA-M1, RACE-ROUTI-02, RACE-ROUTI-05                                                                                                                                                                                                                                                                                |
| `apps/api/src/services/TicketRoutingService.ts`                      | RACE-QUOTA-03 (shared), RACE-ROUTI-02 (shared)                                                                                                                                                                                                                                                                                            |
| `apps/api/src/security/rbac.ts`                                      | RACE-RBAC-04, RACE-RBAC-05, RACE-RBAC-06                                                                                                                                                                                                                                                                                                  |
| `apps/api/src/services/session.service.ts`                           | RACE-RBAC-01, RACE-RBAC-M2                                                                                                                                                                                                                                                                                                                |
| `apps/api/src/modules/routing/routing.router.ts`                     | RACE-ROUTI-04, RACE-ROUTI-M1, RACE-ROUTI-M2                                                                                                                                                                                                                                                                                               |
| `packages/adapters/src/repositories/PrismaAppointmentRepository.ts`  | RACE-BOOKI-03, RACE-BOOKI-04, RACE-BOOKI-M2                                                                                                                                                                                                                                                                                               |
| `apps/workers/events-worker/src/maintenance/scheduled-jobs.ts`       | RACE-BOOKI-M1, RACE-WORKE-01, RACE-WORKE-02                                                                                                                                                                                                                                                                                               |
| `packages/adapters/src/memory/zep/zep-client.ts`                     | RACE-QUOTA-01, RACE-QUOTA-M2                                                                                                                                                                                                                                                                                                              |
| `apps/api/src/modules/zep/zep-budget.router.ts`                      | RACE-QUOTA-02, RACE-QUOTA-M3                                                                                                                                                                                                                                                                                                              |
| `apps/api/src/modules/account/account-reassign.ts`                   | RACE-ROUTI-03, RACE-ROUTI-M3                                                                                                                                                                                                                                                                                                              |

---

## Sequenced Execution Backlog

Fixes are ordered by severity (Critical → High → Medium) and grouped into
execution batches. **All fixes in the same batch touch disjoint files and may be
worked in parallel.** A horizontal rule `---` separates serial dependencies or
shared-file conflicts.

---

### BATCH 1 — Critical, no shared-file conflicts, no DB migrations

| ID            | Sev      | Primary File                                     | Migration | ADR | Red test (1 line)                                                                                                                        | Fix (1 line)                                                                                                                  | Complexity |
| ------------- | -------- | ------------------------------------------------ | --------- | --- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------- |
| RACE-ENTIT-03 | Critical | `apps/api/src/modules/billing/billing.router.ts` | yes       | yes | `webhook-stripe-idempotency.prop.test.ts` — mock syncModulesToPlan spy; N concurrent same-event-id calls; assert spy called exactly once | Wrap handleSubscriptionWebhook in Prisma $transaction with ProcessedStripeEvent.create; catch P2002 as idempotent             | high       |
| RACE-ENTIT-04 | Critical | `apps/api/src/modules/billing/billing.router.ts` | no        | no  | `ensure-customer-double-create.prop.test.ts` — fc.scheduler; mock stripe.createCustomer returns distinct ids; assert called exactly once | Replace read-then-create with atomic updateMany WHERE stripeCustomerId=null; second concurrent caller fetches the winner's id | medium     |

> RACE-ENTIT-03 and RACE-ENTIT-04 both touch `billing.router.ts` — serialize
> them (RACE-ENTIT-03 first).

---

### BATCH 2 — Critical, disjoint files

| ID            | Sev      | Primary File                                           | Migration | ADR | Red test (1 line)                                                                                                           | Fix (1 line)                                                                                                           | Complexity |
| ------------- | -------- | ------------------------------------------------------ | --------- | --- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------- |
| RACE-ROUTI-01 | Critical | `apps/api/src/modules/ticket/ticket-routing.router.ts` | yes       | no  | `ticket-autoroute-double-assign.prop.test.ts` — real-DB; two concurrent autoRoute calls for same ticket; assert 1 audit row | Re-read assigneeId inside $transaction; add WHERE currentCapacity < maxCapacity to updateMany; add DB CHECK constraint | medium     |

---

### BATCH 3 — High, no schema conflicts (pure application-layer, disjoint files)

Fixes in this batch may be worked in parallel across teams.

| ID            | Sev  | Primary File                                                                        | Migration | ADR | Red test (1 line)                                                                                                                               | Fix (1 line)                                                                                                                                             | Complexity |
| ------------- | ---- | ----------------------------------------------------------------------------------- | --------- | --- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| RACE-AUDIT-03 | High | `apps/api/src/security/audit/index.ts`                                              | no        | no  | `audit-logger-singleton.prop.test.ts` — two fake prisma clients; reset; assert second getAuditLogger uses prismaB not prismaA                   | Remove singleton; return `new AuditLogger(prisma, config)` on every call; verify callers pass prismaWithTenant                                           | low        |
| RACE-RBAC-01  | High | `apps/api/src/services/session.service.ts`                                          | no        | no  | `session-limit.prop.test.ts` — fc.scheduler; 4 concurrent createSession same userId; assert sessionsByUser.size <= 3                            | Add per-userId async-mutex around enforceSessionLimit+add block                                                                                          | medium     |
| RACE-RBAC-06  | High | `apps/api/src/security/rbac.ts`                                                     | yes       | no  | `rbac-tenant-scope.prop.test.ts` — mock Prisma returns rows for tenantA+B same userId; assert VIEWER tenantB gets no ADMIN-only permissions     | Add tenantId param to getUserRBACRoles + getPermissionsWithDB + applyUserPermissionOverrides; add to WHERE clauses; migrate @@unique to include tenantId | medium     |
| RACE-RBAC-07  | High | `apps/api/src/services/mfa.service.ts`                                              | no        | no  | `mfa-cache-ordering.prop.test.ts` — mock prisma throws on upsert; assert isUserMfaEnabled returns false after failed save                       | Remove optimistic cache.set before upsert; set cache only after successful await; delete cache in catch                                                  | low        |
| RACE-RBAC-03  | High | `apps/api/src/services/mfa.service.ts` + `apps/api/src/modules/auth/auth.router.ts` | no        | no  | `backup-code-regen.prop.test.ts` — real-DB; two concurrent regenerateBackupCodes; assert backupCodes.length===8 and caller1's codes overwritten | Wrap regenerateBackupCodes in FOR UPDATE $transaction(Serializable); invalidate cache after commit                                                       | medium     |

> RACE-RBAC-07 must precede RACE-RBAC-03 (same mfa.service.ts file).

---

### BATCH 4 — High, schema migrations for appointment versioning (serialize with each other)

| ID            | Sev  | Primary File                                                            | Migration    | ADR | Red test (1 line)                                                                                                        | Fix (1 line)                                                                                                                                 | Complexity |
| ------------- | ---- | ----------------------------------------------------------------------- | ------------ | --- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| RACE-BOOKI-03 | High | `packages/application/src/usecases/scheduling/RescheduleAppointment.ts` | yes          | no  | `appointment-lost-update.prop.test.ts` — real-DB; cancel from B between A's load and save; assert final status=CANCELLED | Add version INT column; PrismaAppointmentRepository.save uses updateMany WHERE version=$n; throws AppointmentVersionConflictError on count=0 | high       |
| RACE-BOOKI-M2 | High | `packages/application/src/usecases/scheduling/CompleteAppointment.ts`   | yes (shared) | no  | Covered by same test file — second itDb block seeds CONFIRMED; B cancels; A completes; assert CANCELLED wins             | Same version-column fix as RACE-BOOKI-03; no extra code change to CompleteAppointment itself                                                 | high       |

> RACE-BOOKI-03 and RACE-BOOKI-M2 share schema + repository; ship in the same
> PR.

---

### BATCH 5 — High, schema migrations for audit idempotency (serialize within batch)

| ID            | Sev  | Primary File                                  | Migration | ADR | Red test (1 line)                                                                                                                        | Fix (1 line)                                                                                                     | Complexity |
| ------------- | ---- | --------------------------------------------- | --------- | --- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------- |
| RACE-AUDIT-M2 | High | `apps/api/src/security/audit/writer.ts`       | yes       | no  | `audit-entry-idempotent-write.prop.test.ts` — real-DB; parallel writeEntry with same eventId; assert count===1                           | Add @unique to AuditLogEntry.eventId; replace create with upsert WHERE eventId; emit eventId in async flush path | medium     |
| RACE-AUDIT-02 | High | `apps/api/src/security/audit/audit-logger.ts` | no        | no  | `audit-login-atomicity.prop.test.ts` — mock; inject rejection in logSecurityEventToDb; assert auditLogEntry written without paired event | Wrap logLoginSuccess/logLoginFailure in prisma.$transaction; pass tx to writeEntry + logSecurityEventToDb        | low        |

> RACE-AUDIT-M2 first (adds @unique); RACE-AUDIT-02 depends on same file but no
> schema conflict — can follow immediately. RACE-AUDIT-02 conflictsWith
> RACE-AUDIT-04 — serialize: RACE-AUDIT-02 before RACE-AUDIT-04.

---

### BATCH 6 — High, schema migration for DomainEvent idempotencyKey

| ID            | Sev  | Primary File                                                                                      | Migration | ADR | Red test (1 line)                                                                                                                           | Fix (1 line)                                                                                                                                 | Complexity |
| ------------- | ---- | ------------------------------------------------------------------------------------------------- | --------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| RACE-AUDIT-M1 | High | `apps/api/src/security/audit/writer.ts` + `packages/adapters/src/events/OutboxEventBusAdapter.ts` | yes       | no  | `audit-entry-idempotent-write.prop.test.ts` (shared) + `outbox-idempotent-publish.prop.test.ts` — real-DB duplicate write; assert count===1 | Add idempotencyKey @unique to DomainEvent; add @unique to AuditLogEntry.eventId; replace create with upsert in OutboxEventBusAdapter.publish | medium     |

> RACE-AUDIT-M1 touches the same schema fields as RACE-AUDIT-M2 and
> RACE-WEBHO-01 — must be coordinated into one migration PR or sequenced:
> RACE-AUDIT-M2 → RACE-AUDIT-M1 → RACE-WEBHO-01.

---

### BATCH 7 — High, outbox at-most-once (serialize within)

| ID            | Sev    | Primary File                                                   | Migration | ADR | Red test (1 line)                                                                                                           | Fix (1 line)                                                                                                                | Complexity |
| ------------- | ------ | -------------------------------------------------------------- | --------- | --- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------- |
| RACE-WEBHO-04 | Medium | `packages/adapters/src/events/OutboxEventBusAdapter.ts`        | no        | no  | `outbox-adapter-transaction-client.prop.test.ts` — spy injected client; assert singleton $transaction NOT called            | Replace withTransaction import with this.prisma.$transaction in publishAll                                                  | low        |
| RACE-WEBHO-01 | High   | `packages/adapters/src/events/OutboxEventBusAdapter.ts`        | yes       | no  | `outbox-publish-idempotency.prop.test.ts` — real-DB; two concurrent publish same eventId; assert row count===1              | Add functional unique index on metadata->>'idempotencyKey'; wrap findFirst+create in Serializable $transaction; catch P2002 | medium     |
| RACE-WEBHO-M1 | High   | `packages/adapters/src/events/OutboxEventBusAdapter.ts`        | no        | no  | `outbox-publish-all-idempotency.prop.test.ts` — real-DB; two adapters publishAll same batch; assert 1 row per key           | Upgrade publishAll $transaction to Serializable; catch P2002/40001 as idempotent; drop pre-insert findFirst                 | low        |
| RACE-WEBHO-02 | High   | `apps/workers/events-worker/src/outbox/pollOutbox.ts`          | no        | no  | `outbox-poller-at-most-once.prop.test.ts` — model-based; markThrows=true; assert row not PENDING after dispatch             | Add markAsProcessing CAS UPDATE WHERE status=PENDING; claim before dispatch; mark FAILED not PENDING on crash               | medium     |
| RACE-WEBHO-M3 | High   | `packages/adapters/src/repositories/PrismaOutboxRepository.ts` | no        | no  | `outbox-fetch-exclusive.prop.test.ts` — real-DB; two pollers fetchPendingEvents; markAsProcessing; assert 3 distinct claims | Add markAsProcessing(eventId): UPDATE WHERE status=PENDING; implement fetch-then-claim pattern                              | medium     |

> Sequence within batch: RACE-WEBHO-04 → RACE-WEBHO-01 → RACE-WEBHO-M1 →
> RACE-WEBHO-02 → RACE-WEBHO-M3. RACE-WEBHO-M3 and RACE-AUDIT-07 both modify
> PrismaOutboxRepository — serialize: RACE-WEBHO-M3 before RACE-AUDIT-07 (or
> same PR).

---

### BATCH 8 — High, outbox SKIP LOCKED CTE

| ID            | Sev  | Primary File                                                   | Migration | ADR | Red test (1 line)                                                                                                             | Fix (1 line)                                                                                                                  | Complexity |
| ------------- | ---- | -------------------------------------------------------------- | --------- | --- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------- |
| RACE-AUDIT-07 | High | `packages/adapters/src/repositories/PrismaOutboxRepository.ts` | no        | no  | `outbox-processing-flip.prop.test.ts` — real-DB; second fetchPendingEvents without markAsPublished; assert second fetch empty | Replace $queryRaw SELECT with CTE that atomically UPDATEs status=PROCESSING; update scheduleRetry to reset PROCESSING→PENDING | medium     |

---

### BATCH 9 — High, agent capacity ceiling (serialize within)

| ID            | Sev  | Primary File                                  | Migration    | ADR | Red test (1 line)                                                                                                       | Fix (1 line)                                                                                            | Complexity |
| ------------- | ---- | --------------------------------------------- | ------------ | --- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------- |
| RACE-QUOTA-03 | High | `apps/api/src/services/LeadRoutingService.ts` | yes          | no  | `agent-capacity-ceiling.prop.test.ts` — real-DB; N concurrent routes same agent; assert currentCapacity<=maxCapacity    | Use $executeRaw UPDATE WHERE currentCapacity < maxCapacity; throw if rows=0; add DB CHECK constraint    | medium     |
| RACE-QUOTA-M1 | High | `apps/api/src/services/LeadRoutingService.ts` | no           | no  | `agent-capacity-decrement.prop.test.ts` — real-DB; route+resolve cycle; assert capacity freed and second route succeeds | Add decrementAgentCapacity helper; wire into lead/ticket CONVERTED/CLOSED status transitions atomically | high       |
| RACE-ROUTI-02 | High | `apps/api/src/services/LeadRoutingService.ts` | yes (shared) | no  | `agent-capacity-overrun.prop.test.ts` — real-DB; 3 concurrent routes same agent capacity=9/10; assert <=10              | Same $executeRaw WHERE currentCapacity < maxCapacity; add shared CHECK migration with RACE-ROUTI-01     | medium     |

> RACE-QUOTA-03 must precede RACE-QUOTA-M1. RACE-ROUTI-02 shares the CHECK
> migration with RACE-ROUTI-01 (BATCH 2) — ship in same migration PR.

---

### BATCH 10 — High, DurableAuditLogAdapter schema (serialize within)

| ID            | Sev  | Primary File                                            | Migration | ADR | Red test (1 line)                                                                                                                                  | Fix (1 line)                                                                                                                  | Complexity |
| ------------- | ---- | ------------------------------------------------------- | --------- | --- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------- |
| RACE-AUDIT-05 | High | `packages/adapters/src/audit/DurableAuditLogAdapter.ts` | yes       | no  | `audit-verify-roundtrip.prop.test.ts` — real-DB; logSecurityEvent then verifyLogIntegrity(eventId); assert valid===true; tamper hash returns false | Add eventId @unique + integrityHash + signature + previousHash to SecurityEvent; align findUnique where-clause to use eventId | high       |

---

### BATCH 11 — High, contact/lead deduplication (serialize within)

| ID            | Sev  | Primary File                                                    | Migration | ADR | Red test (1 line)                                                                                                                          | Fix (1 line)                                                                                                        | Complexity |
| ------------- | ---- | --------------------------------------------------------------- | --------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | ---------- |
| RACE-DEDUP-05 | High | `packages/domain/src/crm/contact/ContactRepository.ts`          | no        | no  | `contact-tenant-scope.prop.test.ts` — two InMemoryContactRepository instances; assert existsByEmail cross-tenant returns false             | Add tenantId param to existsByEmail/findByEmail port; update Prisma + InMemory impls + ContactService callers       | medium     |
| RACE-DEDUP-01 | High | `packages/adapters/src/repositories/PrismaContactRepository.ts` | no        | no  | `contact-create-dedup.prop.test.ts` — real-DB; two concurrent save same (tenantId,email); assert 1 row + DuplicateEmailError               | Catch P2002 in PrismaContactRepository.save as DuplicateEmailError; same for PrismaLeadRepository                   | low        |
| RACE-DEDUP-M3 | High | `packages/application/src/services/ContactService.ts`           | no        | no  | `update-contact-email-race.prop.test.ts` — cross-tenant false-positive + same-tenant race; assert DuplicateEmailError not PersistenceError | Pass tenantId to findByEmail in updateContactEmail; concurrent same-tenant race handled by P2002 from RACE-DEDUP-01 | low        |

> Sequence: RACE-DEDUP-05 → RACE-DEDUP-01 → RACE-DEDUP-M3.

---

### BATCH 12 — High, lead conversion atomicity

| ID            | Sev  | Primary File                                       | Migration | ADR | Red test (1 line)                                                                                                 | Fix (1 line)                                                                                                                  | Complexity |
| ------------- | ---- | -------------------------------------------------- | --------- | --- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------- |
| RACE-DEDUP-M1 | High | `packages/application/src/services/LeadService.ts` | no        | no  | `lead-convert-atomic.prop.test.ts` — real-DB; two concurrent convertLead; assert 1 Contact row + 1 CONVERTED lead | Add convertInTransaction to LeadRepository port + PrismaLeadRepository; replace sequential save pair with single $transaction | medium     |

---

### BATCH 13 — High, inbound submission idempotency

| ID            | Sev  | Primary File                                     | Migration | ADR | Red test (1 line)                                                                                              | Fix (1 line)                                                                                                               | Complexity |
| ------------- | ---- | ------------------------------------------------ | --------- | --- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------- |
| RACE-DEDUP-03 | High | `apps/api/src/modules/inbound/inbound.router.ts` | yes       | no  | `inbound-submission-dedup.prop.test.ts` — real-DB; same submissionId two concurrent creates; assert 1 Lead row | Add LeadSubmission table @@unique([tenantId,submissionId]); replace findFirst check with atomic $transaction create+update | medium     |

---

### BATCH 14 — High, module sync tear + outbox idempotency migration

| ID            | Sev  | Primary File                                                         | Migration | ADR | Red test (1 line)                                                                                                                                  | Fix (1 line)                                                                                          | Complexity |
| ------------- | ---- | -------------------------------------------------------------------- | --------- | --- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------- |
| RACE-ENTIT-01 | High | `packages/adapters/src/repositories/PrismaTenantModuleRepository.ts` | no        | no  | `module-sync-torn-read.prop.test.ts` — real-DB 3 clients; syncModulesToPlan result must include every plan module regardless of concurrent disable | Wrap syncModulesToPlan fan-out + trailing read in single Serializable $transaction                    | medium     |
| RACE-ENTIT-M1 | High | `packages/adapters/src/repositories/PrismaTenantModuleRepository.ts` | no        | no  | `module-sync-downgrade.prop.test.ts` — real-DB; ENTERPRISE→STARTER; assert LEGAL+COMMERCE rows have enabled=false                                  | Add updateMany(notIn planModules → disabled) BEFORE upserts inside same $transaction as RACE-ENTIT-01 | low        |
| RACE-ENTIT-02 | High | `packages/adapters/src/repositories/PrismaTenantModuleRepository.ts` | no        | no  | `get-enabled-modules-torn-read.prop.test.ts` — real-DB 3 clients; result must be STARTER-only or PROFESSIONAL-only, never mixed                    | Wrap getTenantPlan + findMany in RepeatableRead $transaction                                          | medium     |

> Sequence within this file: RACE-ENTIT-01 → RACE-ENTIT-M1 → RACE-ENTIT-02 →
> RACE-ENTIT-M3 (BATCH 20).

---

### BATCH 15 — High, session cold-start DB hydration

| ID           | Sev  | Primary File                               | Migration | ADR | Red test (1 line)                                                                                                         | Fix (1 line)                                                                                                    | Complexity |
| ------------ | ---- | ------------------------------------------ | --------- | --- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------- |
| RACE-RBAC-M2 | High | `apps/api/src/services/session.service.ts` | no        | no  | `session-limit-cold-start.prop.test.ts` — real-DB; cold SessionService; 3 concurrent creates; assert count<=maxConcurrent | Inside per-userId mutex from RACE-RBAC-01, hydrate sessionsByUser from DB when empty before enforceSessionLimit | medium     |

> Depends on RACE-RBAC-01 (BATCH 3).

---

### BATCH 16 — High, notification deduplication schema (workers batch)

| ID            | Sev  | Primary File                                                   | Migration    | ADR | Red test (1 line)                                                                                                                 | Fix (1 line)                                                                                                                      | Complexity |
| ------------- | ---- | -------------------------------------------------------------- | ------------ | --- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| RACE-BOOKI-M1 | High | `apps/workers/events-worker/src/maintenance/scheduled-jobs.ts` | yes          | no  | `appointment-reminder-dedup.prop.test.ts` — real-DB 2 workers; same appointment in reminder window; assert notification count===1 | Add @@unique([sourceId,sourceType,recipientId]) to Notification; use createMany(skipDuplicates:true)                              | medium     |
| RACE-WORKE-01 | High | `apps/workers/events-worker/src/maintenance/scheduled-jobs.ts` | yes (shared) | no  | `sla-breach-dedup.prop.test.ts` — real-DB 2 workers; one breached ticket; assert notification count===1                           | Wrap updateMany+createMany in $transaction; add skipDuplicates:true; add @@unique([tenantId,sourceId,sourceType]) to Notification | medium     |
| RACE-WORKE-M3 | High | `packages/adapters/src/repositories/PrismaOutboxRepository.ts` | no           | no  | `outbox-at-most-once.prop.test.ts` — real-DB 2 pollers; assert dispatch count===event count                                       | Replace fetchPendingEvents with CTE UPDATE RETURNING; conditional markAsPublished WHERE status=PROCESSING                         | high       |
| RACE-WORKE-04 | High | `packages/platform/src/queues/queue-factory.ts`                | no           | no  | `retry-budget.prop.test.ts` — in-process; N>100 concurrent enqueueAIScoring; assert fulfilled<=100                                | Add globalRetryBudget.consumeRetry() immediately after canRetry guard; expose tryConsume()                                        | low        |

> RACE-BOOKI-M1 and RACE-WORKE-01 share the Notification schema migration — same
> PR.

---

### BATCH 17 — Medium, audit flush guard

| ID            | Sev    | Primary File                                  | Migration | ADR | Red test (1 line)                                                                                                                                      | Fix (1 line)                                                                                               | Complexity |
| ------------- | ------ | --------------------------------------------- | --------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | ---------- |
| RACE-AUDIT-04 | Medium | `apps/api/src/security/audit/audit-logger.ts` | no        | no  | `audit-flush-concurrent.prop.test.ts` — fc.scheduler; async mode batchSize=3; inject rejection at 4th write; assert total writeEntry calls===7 no dups | Add flushInFlight guard: if (this.flushInFlight) return this.flushInFlight; wrap \_doFlush().finally(null) | medium     |

> Depends on RACE-AUDIT-02 (same file); place after BATCH 5.

---

### BATCH 18 — Medium, ZEP quota fixes (serialize within)

| ID            | Sev    | Primary File                                     | Migration | ADR | Red test (1 line)                                                                                                      | Fix (1 line)                                                                                                   | Complexity |
| ------------- | ------ | ------------------------------------------------ | --------- | --- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------- |
| RACE-QUOTA-M2 | Medium | `packages/adapters/src/memory/zep/zep-client.ts` | no        | no  | `zep-initialize-idempotency.prop.test.ts` — fc.scheduler; two concurrent createSession; assert upsert spy called once  | Add \_initPromise singleton pattern: share single in-flight \_doInitialize() promise across concurrent callers | low        |
| RACE-QUOTA-01 | High   | `packages/adapters/src/memory/zep/zep-client.ts` | yes       | no  | `zep-episode-budget.prop.test.ts` — fc.scheduler; two adapters same prisma stub; assert no lost update on episodesUsed | Replace absolute write with $transaction updateMany WHERE lt maxEpisodes {increment:1}; add CHECK constraint   | medium     |

> Sequence: RACE-QUOTA-M2 → RACE-QUOTA-01 (same file).

---

### BATCH 19 — Medium, ZEP budget router (serialize within)

| ID            | Sev    | Primary File                                    | Migration | ADR | Red test (1 line)                                                                                                                         | Fix (1 line)                                                                                                    | Complexity |
| ------------- | ------ | ----------------------------------------------- | --------- | --- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------- |
| RACE-QUOTA-02 | Medium | `apps/api/src/modules/zep/zep-budget.router.ts` | no        | no  | `zep-budget-reset.prop.test.ts` — fc.scheduler; two concurrent resets; assert audit previousCount consistent                              | Wrap findUnique+upsert+audit.create in single $transaction                                                      | low        |
| RACE-QUOTA-M3 | Medium | `apps/api/src/modules/zep/zep-budget.router.ts` | no        | no  | `zep-budget-reset-preserves-config.prop.test.ts` — stub prisma; assert upsert create block uses findUnique maxEpisodes not hardcoded 1000 | Change create block to read current?.maxEpisodes ?? 1000 etc; apply inside same $transaction from RACE-QUOTA-02 | low        |

> Sequence: RACE-QUOTA-02 → RACE-QUOTA-M3 (same file, same PR).

---

### BATCH 20 — Medium, remaining entitlement fixes (serialize after BATCH 14)

| ID            | Sev    | Primary File                                                         | Migration | ADR | Red test (1 line)                                                                                                                                    | Fix (1 line)                                                                                                                    | Complexity |
| ------------- | ------ | -------------------------------------------------------------------- | --------- | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| RACE-ENTIT-M3 | Medium | `packages/adapters/src/repositories/PrismaTenantModuleRepository.ts` | no        | no  | `is-module-enabled-torn-read.prop.test.ts` — real-DB 2 clients; syncModulesToPlan PROFESSIONAL between isModuleEnabled reads; assert returns true    | Wrap findUnique + getTenantPlan fallback in RepeatableRead $transaction; reuse \_getTenantPlanInTx helper                       | low        |
| RACE-ENTIT-M2 | Medium | `apps/api/src/modules/subscription/subscription.router.ts`           | no        | no  | `toggle-module-trailing-read.prop.test.ts` — fc.scheduler; concurrent syncModulesToPlan re-enables just-disabled module; assert response excludes it | Wrap disableModule/enableModule + trailing reads in RepeatableRead $transaction                                                 | medium     |
| RACE-ENTIT-05 | High   | `apps/api/src/modules/billing/billing.router.ts`                     | no        | no  | `update-subscription-stale-plan.prop.test.ts` — mock getTenantPlan returns old plan; spy syncModulesToPlan; assert called with toPlan not fromPlan   | Derive new tier from Stripe priceId metadata after update; do NOT call getTenantPlan; wrap plan+module update in $transaction   | medium     |
| RACE-ENTIT-06 | Medium | `apps/api/src/modules/billing/billing.router.ts`                     | no        | yes | `billing-cache-replica-staleness.prop.test.ts` — N replica Maps; invalidate one; assert others stale                                                 | Replace module-level Map with BillingCacheStore interface; provide Redis impl gated by REDIS_URL; short-term: reduce TTL to 30s | high       |

> RACE-ENTIT-M3 depends on RACE-ENTIT-02 (BATCH 14). RACE-ENTIT-05 and
> RACE-ENTIT-06 touch billing.router.ts — sequence after BATCH 1
> (RACE-ENTIT-03/04).

---

### BATCH 21 — Medium, duplicate detection + contact auto-merge

| ID            | Sev    | Primary File                                                          | Migration | ADR | Red test (1 line)                                                                                                       | Fix (1 line)                                                                                                                           | Complexity |
| ------------- | ------ | --------------------------------------------------------------------- | --------- | --- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| RACE-DEDUP-04 | Medium | `apps/api/src/modules/contact/contact.router.ts`                      | no        | no  | `contact-auto-merge-failure.prop.test.ts` — mock applyAutoMerge rejects; assert TRPCError propagated not swallowed      | Skip createContact when action=auto-merge; return existing primary directly; replace console.warn catch with TRPCError throw           | low        |
| RACE-DEDUP-02 | Medium | `packages/adapters/src/repositories/PrismaContactRepository.ts`       | no        | no  | `bidirectional-merge.prop.test.ts` — fc.scheduler; merge(A,B) and merge(B,A) concurrently; assert 1 survivor row        | Add isolationLevel:'Serializable' to mergeInTransaction $transaction options                                                           | low        |
| RACE-DEDUP-M2 | Medium | `packages/db/prisma/schema.prisma`                                    | yes       | no  | `domain-event-dedup.prop.test.ts` — real-DB 2 clients; same idempotencyKey; assert P2002 + count===1                    | Add idempotencyKey String? @unique to DomainEvent; createMany with skipDuplicates in ContactService ContactMergedEvent                 | medium     |
| RACE-DEDUP-06 | Medium | `apps/api/src/modules/account/account-duplicate-detection.service.ts` | yes       | yes | `account-concurrent-create.prop.test.ts` — real-DB 2 clients; same (tenantId,name); assert 1 row or 2+notification each | Track A: add @@unique([tenantId,name]) to Account; catch P2002 as DuplicateAccountNameError. Track B: pg_advisory_xact_lock per-tenant | high       |

---

### BATCH 22 — Medium, routing assignment fixes

| ID            | Sev    | Primary File                                       | Migration | ADR | Red test (1 line)                                                                                                                                                           | Fix (1 line)                                                                                                    | Complexity |
| ------------- | ------ | -------------------------------------------------- | --------- | --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------- |
| RACE-ROUTI-03 | Medium | `apps/api/src/modules/account/account-reassign.ts` | no        | no  | `reassign-stale-previous-owner.prop.test.ts` — fc.scheduler; T2 writes ownerB before T1's $transaction; assert T1 previousOwnerId===B not A                                 | Re-read current.ownerId inside $transaction before updateMany; use re-read value for audit not outer closure    | low        |
| RACE-ROUTI-04 | Medium | `apps/api/src/modules/routing/routing.router.ts`   | no        | no  | `routing-reorder-toctou.prop.test.ts` — fc.scheduler; T2 deletes ruleId between T1 count and update; assert NOT_FOUND not 500                                               | Switch update to updateMany with tenantId guard; check count==1; throw TRPCError NOT_FOUND if 0                 | low        |
| RACE-ROUTI-05 | Medium | `apps/api/src/services/LeadRoutingService.ts`      | no        | no  | `forcereroute-capacity-drift.prop.test.ts` — fc.scheduler; T1 routes lead2 to agentA; T2 force-reroutes lead1 from agentA; assert agentA capacity correctly net-decremented | Before incrementing new agent, decrement lead.ownerId capacity (gt:0 guard) when forceReroute=true              | low        |
| RACE-ROUTI-M1 | High   | `apps/api/src/modules/routing/routing.router.ts`   | no        | no  | `assignlead-capacity-increment.prop.test.ts` — in-process mock; N manual assigns same agent; assert updateMany called N times                                               | Add agentAvailability.updateMany(increment:1) + decrement previous owner inside assignLead $transaction         | low        |
| RACE-ROUTI-M2 | Medium | `apps/api/src/modules/routing/routing.router.ts`   | no        | no  | `routing-toggle-delete-p2025.prop.test.ts` — fc.scheduler; T2 deletes rule between T1 findFirst and update; assert NOT_FOUND not P2025                                      | Change toggle to updateMany + count check; change delete to deleteMany + count check; add tenantId WHERE guard  | low        |
| RACE-ROUTI-M3 | Medium | `apps/api/src/modules/account/account.router.ts`   | no        | no  | `bulk-reassign-stale-prev-owner.prop.test.ts` — fc.scheduler; overlapping bulkReassign calls; assert previousOwnerId matches actual DB at commit                            | Replace batched updateMany with per-item performAccountReassign sequential calls preserving per-item tx re-read | medium     |

> RACE-ROUTI-03 must precede RACE-ROUTI-M3 (shared account-reassign.ts).
> RACE-ROUTI-04, RACE-ROUTI-M1, RACE-ROUTI-M2 all touch routing.router.ts —
> serialize them in that order.

---

### BATCH 23 — Medium, booking confirm use case (depends on BATCH 4)

| ID            | Sev    | Primary File                                                               | Migration | ADR | Red test (1 line)                                                                                                    | Fix (1 line)                                                                                                 | Complexity |
| ------------- | ------ | -------------------------------------------------------------------------- | --------- | --- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------- |
| RACE-BOOKI-M3 | Medium | `packages/application/src/usecases/scheduling/ConfirmAppointment.ts` (new) | no        | no  | `appointment-confirm-race.prop.test.ts` — fc.scheduler mock repo; two concurrent confirms; assert save called <=1    | Create ConfirmAppointmentUseCase; wire in container; replace raw Prisma confirm in router with use-case call | medium     |
| RACE-BOOKI-04 | High   | `packages/adapters/src/repositories/PrismaAppointmentRepository.ts`        | no        | no  | `batch-update-status-terminal-guard.prop.test.ts` — in-process mock; assert updateMany WHERE notIn terminal statuses | Add status:{notIn:['CANCELLED','COMPLETED','NO_SHOW']} to batchUpdateStatus WHERE clause                     | low        |

> RACE-BOOKI-M3 depends on RACE-BOOKI-03 (BATCH 4) for the version column.

---

### BATCH 24 — Medium, RBAC cache + MFA TTL (serialize within)

| ID           | Sev    | Primary File                                                           | Migration | ADR | Red test (1 line)                                                                                                     | Fix (1 line)                                                                                        | Complexity |
| ------------ | ------ | ---------------------------------------------------------------------- | --------- | --- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------- |
| RACE-RBAC-04 | Medium | `apps/api/src/security/rbac.ts`                                        | no        | no  | `rbac-assign-revoke-race.prop.test.ts` — fc.scheduler; assignRole then removeRole interleaved; assert revocation wins | Wrap findUnique+upsert in Serializable $transaction for assignRole; same for removeRole             | low        |
| RACE-RBAC-05 | Medium | `apps/api/src/security/rbac.ts` + `apps/api/src/services/container.ts` | no        | yes | `rbac-cache-staleness.prop.test.ts` — two RBACService instances; advance time past TTL; assert re-fetch               | Short-term: confirm TTL bound; long-term: Redis pub/sub invalidation gated by REDIS_URL             | high       |
| RACE-RBAC-M3 | Medium | `apps/api/src/services/mfa.service.ts`                                 | no        | no  | `mfa-cache-ttl.prop.test.ts` — fake time past MFA_CACHE_TTL_MS; assert DB re-fetched not stale entry                  | Change mfaSettingsCache to Map<string,{settings,cachedAt}>; add 30s TTL check in getUserMfaSettings | low        |

> RACE-RBAC-04 and RACE-RBAC-05 both touch rbac.ts — serialize: RACE-RBAC-04 →
> RACE-RBAC-05. RACE-RBAC-M3 depends on RACE-RBAC-07 (BATCH 3).

---

### BATCH 25 — Medium, webhook DLQ + retry

| ID            | Sev    | Primary File                         | Migration | ADR | Red test (1 line)                                                                                                               | Fix (1 line)                                                                                   | Complexity |
| ------------- | ------ | ------------------------------------ | --------- | --- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------- |
| RACE-WEBHO-05 | Medium | `packages/webhooks/src/framework.ts` | no        | no  | `webhook-dlq-reprocess.prop.test.ts` — fc.scheduler; two concurrent reprocessDeadLetter same eventId; assert handler fires once | Synchronously remove entry before any await; claim idempotency key as CAS gate                 | low        |
| RACE-WEBHO-M2 | Medium | `packages/webhooks/src/framework.ts` | no        | no  | `webhook-retry-idempotency.prop.test.ts` — fc.scheduler; concurrent processRetries + handle for same eventId; assert count<=1   | Add idempotency.claim() synchronously at start of processRetries event loop before first await | low        |

> Both touch framework.ts — serialize: RACE-WEBHO-05 → RACE-WEBHO-M2.

---

### BATCH 26 — Medium, workers remaining

| ID            | Sev    | Primary File                                                   | Migration                       | ADR | Red test (1 line)                                                                                                             | Fix (1 line)                                                                                                                       | Complexity |
| ------------- | ------ | -------------------------------------------------------------- | ------------------------------- | --- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| RACE-WORKE-02 | Medium | `apps/workers/events-worker/src/maintenance/scheduled-jobs.ts` | yes (shared with RACE-WORKE-01) | no  | `follow-up-reminder-dedup.prop.test.ts` — real-DB 2 workers; stale lead; assert notification count===1 for each reminder type | Add skipDuplicates:true to all four createMany reminder calls; @@unique shared with RACE-WORKE-01 migration                        | medium     |
| RACE-WORKE-03 | Medium | `apps/ai-worker/src/jobs/insight-generation.job.ts`            | yes                             | no  | `ai-insight-dedup.prop.test.ts` — real-DB 2 clients; concurrent persistInsightRecord; assert count===1                        | Replace findFirst+create with upsert WHERE @@unique([tenantId,title]); add partial unique index                                    | medium     |
| RACE-WORKE-M1 | Medium | `apps/ai-worker/src/jobs/insight-generation.job.ts`            | yes (shared)                    | no  | `insight-notification-dedup.prop.test.ts` — real-DB 2 clients; same insight+user; assert notification count===1               | Replace findFirst+create with raw INSERT ... ON CONFLICT DO NOTHING; requires @@unique([tenantId,recipientId,sourceId,sourceType]) | medium     |
| RACE-WORKE-06 | Medium | `apps/ai-worker/src/account-scoring.chain.ts`                  | no                              | no  | `account-scoring-lost-update.prop.test.ts` — real-DB 2 clients; score=75 then score=0; assert deterministic winner            | Replace unconditional update with updateMany WHERE scoredAt=null OR scoredAt<now; check count>0                                    | low        |
| RACE-WORKE-M2 | Medium | `apps/ai-worker/src/jobs/account-scoring.job.ts`               | no                              | no  | `account-scoring-dedup-jobid.prop.test.ts` — in-process; two consecutive dispatch ticks; assert same jobId (BullMQ dedup)     | Pass jobId:`score-account-${accountId}-${tenantId}-${dateBucket}` to queue.add                                                     | low        |

> RACE-WORKE-02 must land in same migration PR as RACE-WORKE-01 (shared
> Notification @@unique). RACE-WORKE-03 and RACE-WORKE-M1 share
> insight-generation.job.ts — serialize them.

---

### BATCH 27 — Medium, test infrastructure fixes (fully disjoint)

| ID            | Sev    | Primary File                                             | Migration | ADR | Red test (1 line)                                                                                                                    | Fix (1 line)                                                                                                | Complexity |
| ------------- | ------ | -------------------------------------------------------- | --------- | --- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ---------- |
| RACE-TEST--M1 | High   | `tests/integration/ingestion/file-ingestion.e2e.test.ts` | no        | no  | `prisma-adapter-constructor.prop.test.ts` — assert old datasources:{} constructor throws; new adapter pattern does not               | Replace `new PrismaClient({ datasources: ... })` with `new PrismaClient({ adapter: new PrismaPg({...}) })`  | low        |
| RACE-TEST--M2 | Medium | `vitest.config.ts`                                       | no        | no  | `integration-worker-isolation.prop.test.ts` — fc.scheduler; two TRUNCATE+INSERT sequences; assert race is possible without isolation | Change integration project maxWorkers from 4 to 1                                                           | low        |
| RACE-TEST--M3 | Medium | `scripts/run-tests.js`                                   | no        | no  | `run-tests-count-parser.prop.test.ts` — sequence of summary lines; assert passed/failed are summed not overwritten                   | Change assignment `=` to `+=` for testsPassedCount and testsFailedCount in stdout handler and close handler | low        |

---

### BATCH 28 — Medium, audit TOCTOU tenant-delete

| ID            | Sev    | Primary File                            | Migration | ADR | Red test (1 line)                                                                                                                           | Fix (1 line)                                                                                                                                       | Complexity |
| ------------- | ------ | --------------------------------------- | --------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| RACE-AUDIT-M3 | Medium | `apps/api/src/security/audit/writer.ts` | no        | no  | `audit-toctou-tenant-delete.prop.test.ts` — real-DB; delete tenant between validateTenant and create; assert P2003 re-thrown as typed error | Remove validateTenant pre-check; rely on FK; catch P2003 as AuditTenantNotFoundError; replace fire-and-forget .catch(console.error) with OTel span | medium     |

> Depends on RACE-AUDIT-M2 (same writer.ts file, BATCH 5).

---

## Already-Fixed Findings

| ID                               | Severity | Evidence                                                                                                                                                                                                                                                                 |
| -------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| RACE-AUDIT-01                    | Critical | `DurableAuditLogAdapter.ts` line 72: `chainTail` promise-mutex serialises all single-instance chain appends. Both `logSecurityEvent` and `logBatchEvents` route through `enqueueChainAppend`. Test: `tests/property/concurrency/audit-hash-chain.prop.test.ts` passes.   |
| RACE-BOOKI-01                    | Critical | Migration `20260530000000_appointment_no_overlap_exclusion` adds btree_gist EXCLUDE constraint. `PrismaAppointmentRepository.save` maps 23P01 to `ConflictDetectionError`. Test: `tests/property/concurrency/appointment-double-booking.prop.test.ts` passes.            |
| RACE-BOOKI-02                    | Critical | DB-level exclusion constraint (same migration) is the authoritative guard. Both concurrent `ScheduleAppointmentUseCase.execute()` callers hitting constraint — second save raises `ConflictDetectionError`. Test: covered by `appointment-double-booking.prop.test.ts`.  |
| RACE-RBAC-M1                     | Critical | `consumeBackupCode` in `mfa.service.ts` uses atomic guarded `UPDATE ... WHERE $hash = ANY(backupCodes)`. Second concurrent attempt sees code absent and returns false. Cache deleted on success. Test: `tests/property/concurrency/mfa-backup-code.prop.test.ts` passes. |
| RACE-WEBHO-03 (IdempotencyStore) | High     | `packages/webhooks/src/framework.ts` now has atomic `claim()`/`complete()`/`release()` in the in-memory `IdempotencyStore`. Prevents concurrent handlers for the same event id. Test: `tests/property/unit/platform/webhook-idempotency-store.prop.test.ts` passes.      |

---

_End of REMEDIATION_PLAN.md_
