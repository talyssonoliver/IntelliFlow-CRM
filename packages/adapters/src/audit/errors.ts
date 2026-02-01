/**
 * Audit Adapter Errors
 *
 * Error classes for audit logging operations.
 *
 * IMPLEMENTS: IFC-125 (AI Guardrails Audit Logger Integration)
 */

/**
 * Error thrown when an event's tenantId doesn't match the context tenantId.
 * This prevents cross-tenant data access/modification.
 *
 * @example
 * ```typescript
 * throw new CrossTenantViolationError('tenant-a', 'tenant-b');
 * // Error: Cross-tenant violation: event tenant 'tenant-a' does not match context tenant 'tenant-b'
 * ```
 */
export class CrossTenantViolationError extends Error {
  public readonly code = 'CROSS_TENANT_VIOLATION';
  public readonly eventTenantId: string;
  public readonly contextTenantId: string;

  constructor(eventTenantId: string, contextTenantId: string) {
    super(
      `Cross-tenant violation: event tenant '${eventTenantId}' does not match context tenant '${contextTenantId}'`
    );
    this.name = 'CrossTenantViolationError';
    this.eventTenantId = eventTenantId;
    this.contextTenantId = contextTenantId;

    // Maintains proper stack trace for where error was thrown (V8 engines)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CrossTenantViolationError);
    }
  }
}

/**
 * Error thrown when audit log persistence fails after retries.
 */
export class AuditLogFailedError extends Error {
  public readonly code = 'AUDIT_LOG_FAILED';
  public readonly cause?: Error;

  constructor(message: string, cause?: Error) {
    super(message);
    this.name = 'AuditLogFailedError';
    this.cause = cause;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AuditLogFailedError);
    }
  }
}

/**
 * Error thrown when integrity verification detects tampering.
 */
export class IntegrityVerificationError extends Error {
  public readonly code = 'INTEGRITY_VERIFICATION_FAILED';
  public readonly eventId: string;
  public readonly reason: string;

  constructor(eventId: string, reason: string) {
    super(`Integrity verification failed for event '${eventId}': ${reason}`);
    this.name = 'IntegrityVerificationError';
    this.eventId = eventId;
    this.reason = reason;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, IntegrityVerificationError);
    }
  }
}
