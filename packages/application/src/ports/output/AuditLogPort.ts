/**
 * AuditLogPort Interface
 *
 * Port interface for AI security audit logging.
 * Implements hexagonal architecture pattern - application layer defines the port,
 * adapters layer provides implementations.
 *
 * IMPLEMENTS: IFC-125 (AI Guardrails Audit Logger Integration)
 *
 * Key design decisions (from STOA spec session):
 * - Required dependency (not optional) for GuardrailsAIService
 * - Domain event-based pattern for loose coupling
 * - Cross-tenant isolation at port level
 * - GDPR-compliant metadata fields
 * - ISO 42001 traceability fields
 *
 * @see .specify/sprints/sprint-11/specifications/IFC-125-spec.md
 */

import type { AISecurityEventType } from '@intelliflow/domain';

/**
 * Security severity levels for audit events.
 * Aligned with domain layer SecuritySeverity.
 */
export type AuditSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/**
 * Jurisdiction codes for retention policy calculation.
 * Based on GDPR, UK GDPR, and SOX requirements.
 */
export type Jurisdiction = 'EU' | 'UK' | 'US' | 'GLOBAL';

/**
 * Metadata for AI security events.
 * Includes ISO 42001 traceability fields and GDPR compliance fields.
 */
export interface AISecurityMetadata {
  // Model context (ISO 42001 traceability)
  /** AI model identifier (e.g., 'gpt-4o', 'claude-3') */
  modelId: string;
  /** Model version for reproducibility */
  modelVersion: string;
  /** Optional chain identifier for multi-step AI workflows */
  chainId?: string;

  // Guardrail context
  /** Guardrail rule identifier */
  guardrailId: string;
  /** Guardrail version for audit trail */
  guardrailVersion: string;

  // Input/output context (encrypted for PII protection)
  /** SHA256 hash of input (not raw input, to protect PII) */
  inputHash?: string;
  /** SHA256 hash of output */
  outputHash?: string;

  // GDPR compliance context
  /** DSAR-queryable subject identifier (encrypted) */
  dataSubjectId?: string;
  /** Processing purpose per GDPR Art. 35 */
  processingPurpose: string;
  /** Legal basis for processing */
  legalBasis: string;

  // Detection details
  /** Confidence score for detection (0-1) */
  detectionConfidence?: number;
  /** Calculated risk score (0-1) */
  riskScore?: number;

  // Additional context
  /** Arbitrary additional metadata */
  details?: Record<string, unknown>;
}

/**
 * Input for logging an AI security event.
 */
export interface AISecurityEventInput {
  /** Event type from domain constants */
  eventType: AISecurityEventType;
  /** Severity level */
  severity: AuditSeverity;
  /** Tenant identifier for isolation */
  tenantId: string;
  /** User who triggered the event (optional for system events) */
  userId?: string;
  /** Resource type being accessed/protected */
  resourceType?: string;
  /** Resource identifier */
  resourceId?: string;
  /** Human-readable event description */
  description: string;
  /** AI-specific metadata */
  metadata: AISecurityMetadata;
}

/**
 * Result of logging a security event.
 */
export interface AuditLogResult {
  /** Generated event ID (UUID) */
  eventId: string;
  /** Timestamp when event was persisted */
  persistedAt: Date;
  /** Persistence status */
  status: 'PERSISTED' | 'PERSISTED_PENDING_PROCESSING' | 'FAILED';
  /** Cryptographic integrity hash (HMAC-SHA256) */
  integrityHash?: string;
}

/**
 * Result of batch event logging.
 */
export interface BatchAuditResult {
  /** Total events submitted */
  totalEvents: number;
  /** Successfully persisted events */
  successCount: number;
  /** Failed events */
  failureCount: number;
  /** Individual results */
  results: AuditLogResult[];
}

/**
 * Tenant context for audit operations.
 * Required for cross-tenant isolation verification.
 */
export interface TenantContext {
  /** Tenant identifier */
  tenantId: string;
  /** User identifier (optional) */
  userId?: string;
  /** Session identifier (optional) */
  sessionId?: string;
  /** Jurisdiction for retention policy */
  jurisdiction?: Jurisdiction;
}

/**
 * Result of integrity verification.
 */
export interface IntegrityVerification {
  /** Whether the entry passes integrity check */
  valid: boolean;
  /** Reason for invalid status */
  reason?: 'EVENT_NOT_FOUND' | 'HASH_MISMATCH' | 'SIGNATURE_INVALID' | 'CHAIN_BROKEN';
  /** Computed hash from current entry data */
  computedHash?: string;
  /** Stored hash from database */
  storedHash?: string;
  /** Whether cryptographic signature is valid */
  signatureValid?: boolean;
  /** Timestamp of verification */
  verifiedAt?: Date;
}

/**
 * Port interface for AI security audit logging.
 *
 * Implementations must provide:
 * - Durable persistence (WAL pattern recommended)
 * - Cryptographic integrity (hash chain)
 * - Cross-tenant isolation
 * - GDPR-compliant retention
 *
 * @example
 * ```typescript
 * // In composition root (apps/api/src/context.ts)
 * const auditLogPort: AuditLogPort = new DurableAuditLogAdapter(prisma, signingKey);
 * const guardrailsService = new GuardrailsAIService(aiService, auditLogPort, config);
 * ```
 */
export interface AuditLogPort {
  /**
   * Log a single security event with guaranteed durability.
   *
   * @param event - The security event to log
   * @param tenantContext - Tenant context for isolation
   * @returns Result with event ID and integrity hash
   * @throws {CrossTenantViolationError} If event.tenantId !== tenantContext.tenantId
   * @throws {AuditLogFailedError} If persistence fails after retries
   */
  logSecurityEvent(
    event: AISecurityEventInput,
    tenantContext: TenantContext
  ): Promise<AuditLogResult>;

  /**
   * Log multiple events in a single transaction.
   * All events must belong to the same tenant.
   *
   * @param events - Events to log
   * @param tenantContext - Tenant context for isolation
   * @returns Batch result with individual outcomes
   */
  logBatchEvents(
    events: AISecurityEventInput[],
    tenantContext: TenantContext
  ): Promise<BatchAuditResult>;

  /**
   * Verify the integrity of a logged event.
   * Checks hash chain and cryptographic signature.
   *
   * @param eventId - Event ID to verify
   * @returns Verification result
   */
  verifyLogIntegrity(eventId: string): Promise<IntegrityVerification>;
}
