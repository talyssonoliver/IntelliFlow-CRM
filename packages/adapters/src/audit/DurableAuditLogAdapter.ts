/**
 * Durable Audit Log Adapter
 *
 * Implements AuditLogPort with:
 * - WAL-backed durability
 * - HMAC-SHA256 hash chain integrity
 * - Cross-tenant isolation
 * - GDPR-compliant retention
 * - PII encryption
 *
 * IMPLEMENTS: IFC-125 (AI Guardrails Audit Logger Integration)
 *
 * Design decisions implemented:
 * - Decision 3: WAL pattern for durability
 * - Decision 4: Hash chain signing
 * - Decision 5: GDPR retention with jurisdictional variance
 * - Decision 7: Cross-tenant isolation
 */

import { createHmac, randomUUID, createCipheriv } from 'node:crypto';
import type {
  AuditLogPort,
  AISecurityEventInput,
  AISecurityMetadata,
  AuditLogResult,
  BatchAuditResult,
  TenantContext,
  IntegrityVerification,
  Jurisdiction,
} from '@intelliflow/application';
import { CrossTenantViolationError } from './errors';

/**
 * Configuration for DurableAuditLogAdapter
 */
export interface DurableAuditConfig {
  /** Default retention period in years (default: 7) */
  defaultRetentionYears?: number;
  /** Whether to encrypt PII fields (default: true) */
  encryptPII?: boolean;
  /** Encryption key for PII (required if encryptPII is true) */
  piiEncryptionKey?: Buffer;
}

/**
 * Prisma-like interface for the adapter (to avoid direct Prisma dependency)
 */
export interface AuditPrismaClient {
  securityEvent: {
    create: (args: { data: any }) => Promise<any>;
    findUnique: (args: { where: { eventId: string } }) => Promise<any>;
    update: (args: { where: { eventId: string }; data: any }) => Promise<any>;
  };
  auditLogEntry: {
    create: (args: { data: any }) => Promise<any>;
  };
  $transaction: <T>(callback: (tx: any) => Promise<T>) => Promise<T>;
}

/**
 * Durable Audit Log Adapter
 *
 * Provides cryptographically-verified, durable audit logging for AI security events.
 */
export class DurableAuditLogAdapter implements AuditLogPort {
  private previousHash: string = 'GENESIS';
  private readonly config: Required<Omit<DurableAuditConfig, 'piiEncryptionKey'>> & {
    piiEncryptionKey?: Buffer;
  };

  constructor(
    private readonly prisma: AuditPrismaClient,
    private readonly signingKey: Buffer,
    config: DurableAuditConfig = {}
  ) {
    this.config = {
      defaultRetentionYears: config.defaultRetentionYears ?? 7,
      encryptPII: config.encryptPII ?? true,
      piiEncryptionKey: config.piiEncryptionKey,
    };
  }

  /**
   * Log a single security event with guaranteed durability.
   */
  async logSecurityEvent(
    event: AISecurityEventInput,
    tenantContext: TenantContext
  ): Promise<AuditLogResult> {
    // Verify tenant isolation (Decision 7)
    if (event.tenantId !== tenantContext.tenantId) {
      throw new CrossTenantViolationError(event.tenantId, tenantContext.tenantId);
    }

    const eventId = randomUUID();
    const timestamp = new Date();

    // Build the entry for persistence
    const entry = {
      eventId,
      eventType: event.eventType,
      severity: event.severity,
      tenantId: event.tenantId,
      userId: event.userId,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      description: event.description,
      metadata: this.processMetadata(event.metadata, tenantContext.tenantId),
      timestamp,
      previousHash: this.previousHash,
      retentionExpiresAt: this.calculateRetention(tenantContext.jurisdiction),
      dataClassification: this.classifyData(event),
    };

    // Compute integrity hash (Decision 4)
    const integrityHash = this.computeHash(entry);
    const signature = this.sign(entry);

    // Persist with transaction (Decision 3: WAL-like durability)
    await this.prisma.$transaction(async (tx) => {
      // Write to SecurityEvent table
      await tx.securityEvent.create({
        data: {
          ...entry,
          integrityHash,
          signature,
        },
      });

      // Also write to comprehensive AuditLogEntry table
      await tx.auditLogEntry.create({
        data: {
          eventId,
          action: event.eventType,
          resourceType: event.resourceType ?? 'AI_GUARDRAIL',
          resourceId: event.resourceId ?? eventId,
          tenantId: event.tenantId,
          actorId: event.userId,
          actorType: 'USER',
          timestamp,
          metadata: entry.metadata,
          integrityHash,
        },
      });
    });

    // Update hash chain
    this.previousHash = integrityHash;

    return {
      eventId,
      persistedAt: timestamp,
      status: 'PERSISTED',
      integrityHash,
    };
  }

  /**
   * Log multiple events in a single transaction.
   */
  async logBatchEvents(
    events: AISecurityEventInput[],
    tenantContext: TenantContext
  ): Promise<BatchAuditResult> {
    const results: AuditLogResult[] = [];
    let successCount = 0;
    let failureCount = 0;

    await this.prisma.$transaction(async (tx) => {
      for (const event of events) {
        try {
          // Verify tenant isolation
          if (event.tenantId !== tenantContext.tenantId) {
            throw new CrossTenantViolationError(event.tenantId, tenantContext.tenantId);
          }

          const eventId = randomUUID();
          const timestamp = new Date();

          const entry = {
            eventId,
            eventType: event.eventType,
            severity: event.severity,
            tenantId: event.tenantId,
            userId: event.userId,
            resourceType: event.resourceType,
            resourceId: event.resourceId,
            description: event.description,
            metadata: this.processMetadata(event.metadata, tenantContext.tenantId),
            timestamp,
            previousHash: this.previousHash,
            retentionExpiresAt: this.calculateRetention(tenantContext.jurisdiction),
            dataClassification: this.classifyData(event),
          };

          const integrityHash = this.computeHash(entry);
          const signature = this.sign(entry);

          await tx.securityEvent.create({
            data: { ...entry, integrityHash, signature },
          });

          await tx.auditLogEntry.create({
            data: {
              eventId,
              action: event.eventType,
              resourceType: event.resourceType ?? 'AI_GUARDRAIL',
              resourceId: event.resourceId ?? eventId,
              tenantId: event.tenantId,
              actorId: event.userId,
              actorType: 'USER',
              timestamp,
              metadata: entry.metadata,
              integrityHash,
            },
          });

          this.previousHash = integrityHash;

          results.push({
            eventId,
            persistedAt: timestamp,
            status: 'PERSISTED',
            integrityHash,
          });
          successCount++;
        } catch {
          failureCount++;
          results.push({
            eventId: randomUUID(),
            persistedAt: new Date(),
            status: 'FAILED',
          });
        }
      }
    });

    return {
      totalEvents: events.length,
      successCount,
      failureCount,
      results,
    };
  }

  /**
   * Verify the integrity of a logged event.
   */
  async verifyLogIntegrity(eventId: string): Promise<IntegrityVerification> {
    const entry = await this.prisma.securityEvent.findUnique({
      where: { eventId },
    });

    if (!entry) {
      return {
        valid: false,
        reason: 'EVENT_NOT_FOUND',
        verifiedAt: new Date(),
      };
    }

    // Recompute hash from stored data
    const computedHash = this.computeHash({
      eventType: entry.eventType,
      tenantId: entry.tenantId,
      timestamp: entry.timestamp,
      previousHash: entry.previousHash,
      metadata: entry.metadata,
    });

    const hashMatch = computedHash === entry.integrityHash;
    const signatureValid = this.verifySignature(entry);

    const invalidReason = hashMatch ? 'SIGNATURE_INVALID' : 'HASH_MISMATCH';
    return {
      valid: hashMatch && signatureValid,
      reason: hashMatch && signatureValid ? undefined : invalidReason,
      computedHash,
      storedHash: entry.integrityHash,
      signatureValid,
      verifiedAt: new Date(),
    };
  }

  /**
   * Compute HMAC-SHA256 hash for integrity verification.
   */
  private computeHash(entry: Record<string, unknown>): string {
    const payload = JSON.stringify({
      eventType: entry.eventType,
      tenantId: entry.tenantId,
      timestamp: entry.timestamp instanceof Date ? entry.timestamp.toISOString() : entry.timestamp,
      previousHash: entry.previousHash,
      metadata: entry.metadata,
    });

    return createHmac('sha256', this.signingKey).update(payload).digest('hex');
  }

  /**
   * Sign entry for cryptographic verification.
   */
  private sign(entry: Record<string, unknown>): string {
    const payload = JSON.stringify(entry);
    return createHmac('sha256', this.signingKey).update(payload).digest('hex');
  }

  /**
   * Verify signature of an entry.
   */
  private verifySignature(entry: any): boolean {
    const storedSignature = entry.signature;
    const entryWithoutSignature = { ...entry };
    delete entryWithoutSignature.signature;
    delete entryWithoutSignature.integrityHash;

    const computedSignature = this.sign(entryWithoutSignature);
    return storedSignature === computedSignature;
  }

  /**
   * Process metadata - encrypt PII if configured.
   */
  private processMetadata(metadata: AISecurityMetadata, tenantId: string): Record<string, unknown> {
    const processed: Record<string, unknown> = { ...metadata };

    // Encrypt PII fields if configured (Decision 5)
    if (this.config.encryptPII && metadata.dataSubjectId) {
      processed.dataSubjectId = this.encryptPII(metadata.dataSubjectId, tenantId);
    }

    return processed;
  }

  /**
   * Encrypt PII using AES-256-GCM.
   */
  private encryptPII(value: string, tenantId: string): string {
    if (!this.config.piiEncryptionKey) {
      // If no encryption key, return hashed value
      return createHmac('sha256', this.signingKey).update(value).digest('hex').slice(0, 16) + '...';
    }

    const iv = Buffer.alloc(16, 0);
    const cipher = createCipheriv('aes-256-gcm', this.config.piiEncryptionKey, iv);

    let encrypted = cipher.update(value, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return `encrypted:${encrypted}`;
  }

  /**
   * Calculate retention expiration date based on jurisdiction (Decision 5).
   *
   * GDPR Art. 17(3)(e): Security events exempt from erasure for legal claims
   * SOX Section 802: 7-year retention requirement
   */
  private calculateRetention(jurisdiction?: Jurisdiction): Date {
    const retentionYears: Record<Jurisdiction, number> = {
      EU: 7, // GDPR Art. 17(3)(e)
      UK: 7, // UK GDPR Schedule 2, para 5
      US: 7, // SOX Section 802
      GLOBAL: 7, // Default to strictest
    };

    const years = retentionYears[jurisdiction ?? 'GLOBAL'] ?? this.config.defaultRetentionYears;

    const date = new Date();
    date.setFullYear(date.getFullYear() + years);
    return date;
  }

  /**
   * Classify data sensitivity level based on event type.
   */
  private classifyData(event: AISecurityEventInput): string {
    const criticalTypes = ['AI_PROMPT_INJECTION_DETECTED', 'AI_CROSS_TENANT_ACCESS_ATTEMPT'];

    const highTypes = [
      'AI_PII_EXPOSURE_BLOCKED',
      'AI_BIAS_THRESHOLD_EXCEEDED',
      'AI_CONSENT_VALIDATION_FAILED',
    ];

    if (criticalTypes.includes(event.eventType)) {
      return 'PRIVILEGED';
    }
    if (highTypes.includes(event.eventType)) {
      return 'CONFIDENTIAL';
    }
    return 'INTERNAL';
  }
}
