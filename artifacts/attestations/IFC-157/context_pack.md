# Context Pack: IFC-157

**Task**: Notification service MVP: unified delivery (in-app + email) with preference model (backend), templates, and audit logging

**Sprint**: 11
**Owner**: Backend Dev + SRE (STOA-Domain)
**Date Created**: 2025-12-31

## Prerequisites Reviewed

### Files Read

1. **packages/adapters/src/messaging/email/outbound.ts**
   - Existing email infrastructure with SendGrid and Mock providers
   - Template rendering with variable interpolation
   - Rate limiting and bulk sending support
   - Provider failover logic

2. **packages/application/src/ports/external/NotificationServicePort.ts**
   - Port interface for email, SMS, push, webhook channels
   - Notification scheduling support
   - Reminder service port for appointments

3. **packages/application/src/ports/external/EventBusPort.ts**
   - Domain event publishing interface
   - Event subscription support

4. **packages/domain/src/shared/DomainEvent.ts**
   - Base domain event class with eventId, occurredAt, eventType

5. **apps/api/src/security/audit-logger.ts**
   - Comprehensive audit logging service
   - Supports multiple actor types (USER, SYSTEM, AI_AGENT)
   - Data classification for compliance
   - Async batched logging support

6. **docs/planning/adr/ADR-008-audit-logging.md**
   - Hybrid approach: Domain Events -> Audit Table + OpenTelemetry
   - Audit log schema design
   - Query patterns and retention

7. **docs/operations/runbooks/dlq-triage.md**
   - DLQ monitoring and alerting
   - Retry configuration (maxRetries: 3, backoff: [1s, 5s, 30s])
   - Drain procedures
   - Escalation paths

8. **packages/db/prisma/schema.prisma**
   - Existing notification-related models (EmailTemplate, EmailRecord)
   - Multi-tenancy pattern with tenantId
   - Audit log models (AuditLog, AuditLogEntry)

## Architecture Decisions

### Existing Patterns to Follow

1. **Hexagonal Architecture**
   - Domain layer: Pure business logic (Notification entity, events)
   - Application layer: Ports (NotificationServicePort exists)
   - Adapters layer: Implementations (email exists, need in-app)

2. **Domain Events**
   - Extend DomainEvent base class
   - Events: NotificationSent, NotificationFailed, NotificationRead

3. **Audit Logging**
   - Use AuditLogger for all notification events
   - ResourceType: 'notification'
   - Actions: CREATE, READ, UPDATE (for preferences)

4. **DLQ Integration**
   - Follow existing retry/backoff pattern
   - Use outbox pattern for reliable delivery

### New Components to Implement

1. **Domain Layer** (packages/domain)
   - Notification entity with value objects
   - NotificationPreference entity
   - NotificationEvents (Sent, Failed, Read, PreferenceUpdated)

2. **Prisma Schema Updates**
   - Notification model with status, channel, content
   - NotificationPreference model with channel preferences
   - NotificationTemplate model (extend existing)

3. **Adapters Layer**
   - InAppNotificationAdapter (WebSocket/polling delivery)
   - Enhance OutboundEmailService integration

4. **Application Layer**
   - UnifiedNotificationService
   - NotificationPreferenceService

## Dependencies Verified

- IFC-144 (DONE): Event consumer framework ready
- IFC-098 (DONE): Audit logging present
- IFC-151 (DONE): DLQ runbook exists

## Implementation Strategy

1. TDD approach - write tests first
2. Domain model first (entities, value objects, events)
3. Prisma schema additions
4. Service implementation with audit integration
5. Adapter implementations
6. Integration tests
7. Runbook documentation

## KPIs to Meet

- Delivery success rate >= 99%
- All notifications audited (100% coverage)
- Preferences persisted with defaults
- Retry mechanism with DLQ fallback
