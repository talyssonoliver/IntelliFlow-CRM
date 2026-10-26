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
 *
 * Storage: AI security events are written to `audit_log_entries` only. The
 * adapter used to also write `security_events`, whose columns and
 * SecurityEventType enum have no place for AI events, so every write failed
 * with a PrismaClientValidationError and no AI security event was ever stored.
 * The event's severity, actor and hash chain (previousHash,
 * integrityHash, signature) live in `metadata.audit`.
 */

import { createHmac, randomUUID, createCipheriv, timingSafeEqual } from 'node:crypto';
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
  auditLogEntry: {
    create: (args: { data: any }) => Promise<any>;
    findFirst: (args: { where: { eventId: string } }) => Promise<any>;
  };
  $transaction: <T>(callback: (tx: any) => Promise<T>) => Promise<T>;
}

/** The actor id the API container uses for system-initiated AI calls. */
const SYSTEM_ACTOR_ID = 'system';

/**
 * Tenant ids that callers use as fallbacks when they have no real tenant. They
 * have no tenants row, so a write would fail the tenant FK; such events are
 * skipped with a warning instead.
 */
const FALLBACK_TENANT_IDS = new Set(['', 'default', SYSTEM_ACTOR_ID]);

const CRUD_ACTIONS: Record<string, string> = {
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  UPSERT: 'UPDATE',
  DELETE: 'DELETE',
};

const OPERATION_ACTIONS: Record<string, string> = {
  scoreLead: 'AI_SCORE',
  qualifyLead: 'AI_PREDICT',
  generateEmail: 'AI_GENERATE',
};

const FAILURE_EVENTS = new Set([
  'AI_CHAIN_FAILURE',
  'AI_OUTPUT_VALIDATION_FAILED',
  'AI_CONSENT_VALIDATION_FAILED',
  'AI_GUARDRAIL_TIMEOUT',
  'AI_MODEL_VERSION_MISMATCH',
]);

const DENIED_EVENTS = new Set([
  'AI_PROMPT_INJECTION_DETECTED',
  'AI_PII_EXPOSURE_BLOCKED',
  'AI_TOXIC_CONTENT_BLOCKED',
  'AI_CROSS_TENANT_ACCESS_ATTEMPT',
  'AI_RATE_LIMIT_TRIGGERED',
]);

/**
 * JSON with object keys sorted at every level. Postgres jsonb does not keep key
 * order, so hashes and signatures over stored metadata must not depend on it.
 */
function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)
      ? Object.fromEntries(
          Object.keys(v as Record<string, unknown>)
            .sort()
            .map((k) => [k, (v as Record<string, unknown>)[k]])
        )
      : v
  );
}

/**
 * audit_log_entries columns covered by the signature, so editing any of them
 * (actor type, resource, action, result, reason...) fails verification. actorId
 * is checked separately: its users FK is ON DELETE SET NULL, so a deleted user
 * legitimately nulls it.
 */
const SIGNED_COLUMNS = [
  'tenantId',
  'eventType',
  'eventId',
  'timestamp',
  'actorType',
  'resourceType',
  'resourceId',
  'action',
  'actionResult',
  'actionReason',
  'dataClassification',
  'retentionExpiresAt',
] as const;

/** An audit_log_entries row as written by, or read back for, this adapter. */
type AuditRow = Record<string, any>;

const isoOrValue = (v: unknown) => (v instanceof Date ? v.toISOString() : v);

/** Metadata without the chain block: what the integrity hash covers. */
function eventMetadata(row: AuditRow): Record<string, unknown> {
  const { audit: _audit, ...metadata } = row.metadata;
  return metadata;
}

/** The signed payload: every signed column plus metadata, minus the hash and signature. */
function signablePayload(row: AuditRow): Record<string, unknown> {
  const { integrityHash: _hash, signature: _signature, ...chain } = row.metadata.audit;
  const payload: Record<string, unknown> = { metadata: { ...row.metadata, audit: chain } };
  for (const column of SIGNED_COLUMNS) payload[column] = isoOrValue(row[column]);
  return payload;
}

function safeEqualHex(a: unknown, b: unknown): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Durable Audit Log Adapter
 *
 * Provides cryptographically-verified, durable audit logging for AI security events.
 */
export class DurableAuditLogAdapter implements AuditLogPort {
  private previousHash: string = 'GENESIS';
  // Serializes hash-chain appends so the previousHash read->persist->advance
  // sequence is atomic. Without this, concurrent appends fork the chain
  // (RACE-AUDIT-01). NOTE: this guards a single adapter instance; multi-process
  // chain integrity requires a DB-derived chain head and is tracked separately
  // (see ADR-056).
  private chainTail: Promise<unknown> = Promise.resolve();
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
    // Serialize chain appends: previousHash is shared mutable state read before
    // the persistence await and advanced after it, so two concurrent calls would
    // both read the same predecessor and FORK the hash chain (RACE-AUDIT-01).
    return this.enqueueChainAppend(() => this.appendSecurityEvent(event, tenantContext));
  }

  /**
   * Run a chain-mutating operation under the chain mutex so reads and advances of
   * `previousHash` are atomic relative to other appends. The tail is kept alive on
   * both success and failure so one rejected append never wedges the queue.
   */
  private enqueueChainAppend<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.chainTail.then(operation, operation);
    this.chainTail = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  private async appendSecurityEvent(
    event: AISecurityEventInput,
    tenantContext: TenantContext
  ): Promise<AuditLogResult> {
    // Verify tenant isolation (Decision 7)
    if (event.tenantId !== tenantContext.tenantId) {
      throw new CrossTenantViolationError(event.tenantId, tenantContext.tenantId);
    }
    if (this.isFallbackTenant(event)) return this.skipped(event);

    let result!: AuditLogResult;
    // Persist with transaction (Decision 3: WAL-like durability)
    await this.prisma.$transaction(async (tx) => {
      result = await this.writeEntry(tx, event, tenantContext);
    });

    // Update hash chain only once the row is committed
    this.previousHash = result.integrityHash!;
    return result;
  }

  /**
   * Log multiple events in a single transaction.
   */
  async logBatchEvents(
    events: AISecurityEventInput[],
    tenantContext: TenantContext
  ): Promise<BatchAuditResult> {
    // Same chain mutex as logSecurityEvent so a batch and a concurrent single
    // append never interleave their previousHash read/advance (RACE-AUDIT-01).
    return this.enqueueChainAppend(() => this.appendBatchEvents(events, tenantContext));
  }

  private async appendBatchEvents(
    events: AISecurityEventInput[],
    tenantContext: TenantContext
  ): Promise<BatchAuditResult> {
    const results: AuditLogResult[] = new Array(events.length);
    const failed = (): AuditLogResult => ({
      eventId: randomUUID(),
      persistedAt: new Date(),
      status: 'FAILED',
    });

    // Reject cross-tenant events and skip fallback tenants before the transaction:
    // a failed statement aborts the whole Postgres transaction, so only events
    // that can be written go into it.
    const toWrite: number[] = [];
    events.forEach((event, i) => {
      if (event.tenantId !== tenantContext.tenantId) results[i] = failed();
      else if (this.isFallbackTenant(event)) results[i] = this.skipped(event);
      else toWrite.push(i);
    });

    if (toWrite.length > 0) {
      const written: AuditLogResult[] = [];
      let head = this.previousHash;
      try {
        await this.prisma.$transaction(async (tx) => {
          for (const i of toWrite) {
            const result = await this.writeEntry(tx, events[i], tenantContext, head);
            head = result.integrityHash!;
            written.push(result);
          }
        });
        // All or nothing: the chain head moves only once the batch is committed.
        this.previousHash = head;
        toWrite.forEach((i, n) => (results[i] = written[n]));
      } catch {
        for (const i of toWrite) results[i] = failed();
      }
    }

    return {
      totalEvents: events.length,
      successCount: results.filter((r) => r.status === 'PERSISTED').length,
      failureCount: results.filter((r) => r.status === 'FAILED').length,
      results,
    };
  }

  /**
   * Build, hash, sign and write one `audit_log_entries` row inside `tx`, chained
   * to `previousHash`. Does not advance the chain head: the caller does that once
   * the write is committed.
   */
  private async writeEntry(
    tx: any,
    event: AISecurityEventInput,
    tenantContext: TenantContext,
    previousHash: string = this.previousHash
  ): Promise<AuditLogResult> {
    const eventId = randomUUID();
    const actor = this.actorFor(event.userId);
    const row: AuditRow = {
      tenantId: event.tenantId,
      eventType: event.eventType,
      eventId,
      timestamp: new Date(),
      actorType: actor.actorType,
      actorId: actor.actorId,
      resourceType: event.resourceType ?? 'AI_GUARDRAIL',
      resourceId: event.resourceId ?? eventId,
      action: this.actionFor(event),
      actionResult: this.actionResultFor(event),
      actionReason: event.description,
      dataClassification: this.classifyData(event),
      retentionExpiresAt: this.calculateRetention(tenantContext.jurisdiction),
      metadata: {
        ...this.processMetadata(event.metadata, tenantContext.tenantId),
        audit: { severity: event.severity, userId: event.userId, previousHash },
      },
    };

    // Compute integrity hash (Decision 4), then sign the persisted columns
    const integrityHash = this.computeHash(row);
    row.metadata.audit.integrityHash = integrityHash;
    row.metadata.audit.signature = this.sign(row);

    await tx.auditLogEntry.create({ data: row });

    return {
      eventId,
      persistedAt: row.timestamp,
      status: 'PERSISTED',
      integrityHash,
    };
  }

  /**
   * Verify the integrity of a logged event.
   */
  async verifyLogIntegrity(eventId: string): Promise<IntegrityVerification> {
    const entry = await this.prisma.auditLogEntry.findFirst({
      where: { eventId },
    });

    const audit = entry?.metadata?.audit;
    if (!audit?.integrityHash || !audit?.signature) {
      return {
        valid: false,
        reason: 'EVENT_NOT_FOUND',
        verifiedAt: new Date(),
      };
    }

    // Recompute hash from stored data
    const computedHash = this.computeHash(entry);
    const hashMatch = safeEqualHex(computedHash, audit.integrityHash);

    // actorId is not signed (users FK is ON DELETE SET NULL): it must be the actor
    // the signed userId implies, or null after the user was deleted.
    const actorValid =
      entry.actorId === null || entry.actorId === this.actorFor(audit.userId).actorId;
    const signatureValid = safeEqualHex(this.sign(entry), audit.signature) && actorValid;

    const invalidReason = hashMatch ? 'SIGNATURE_INVALID' : 'HASH_MISMATCH';
    return {
      valid: hashMatch && signatureValid,
      reason: hashMatch && signatureValid ? undefined : invalidReason,
      computedHash,
      storedHash: audit.integrityHash,
      signatureValid,
      verifiedAt: new Date(),
    };
  }

  /** A fallback tenant has no tenants row; writing it would fail the FK. */
  private isFallbackTenant(event: AISecurityEventInput): boolean {
    return FALLBACK_TENANT_IDS.has(event.tenantId);
  }

  private skipped(event: AISecurityEventInput): AuditLogResult {
    console.warn('[AUDIT] AI security event not persisted: no real tenant', {
      eventType: event.eventType,
      severity: event.severity,
      tenantId: event.tenantId,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
    });
    return { eventId: randomUUID(), persistedAt: new Date(), status: 'SKIPPED' };
  }

  /**
   * actorId references users.id, so only a real user id goes there. The system
   * actor and ai-worker agents (no userId; the agent name is metadata.modelId)
   * are recorded by actorType with a null actorId.
   */
  private actorFor(userId?: string): { actorType: string; actorId: string | null } {
    if (!userId) return { actorType: 'AI_AGENT', actorId: null };
    if (userId === SYSTEM_ACTOR_ID) return { actorType: 'SYSTEM', actorId: null };
    return { actorType: 'USER', actorId: userId };
  }

  /** Map to the AuditAction enum: the write ai-worker made, else the AI operation. */
  private actionFor(event: AISecurityEventInput): string {
    const details = (event.metadata.details ?? {}) as Record<string, unknown>;
    const action = String(details.action);
    if (Object.hasOwn(CRUD_ACTIONS, action)) return CRUD_ACTIONS[action];
    const operation = String(details.operation);
    return Object.hasOwn(OPERATION_ACTIONS, operation) ? OPERATION_ACTIONS[operation] : 'CONFIGURE';
  }

  private actionResultFor(event: AISecurityEventInput): string {
    if (FAILURE_EVENTS.has(event.eventType)) return 'FAILURE';
    if (DENIED_EVENTS.has(event.eventType)) return 'DENIED';
    return 'SUCCESS';
  }

  /**
   * Compute HMAC-SHA256 hash for integrity verification.
   */
  private computeHash(row: AuditRow): string {
    const payload = canonicalJson({
      eventType: row.eventType,
      tenantId: row.tenantId,
      timestamp: isoOrValue(row.timestamp),
      previousHash: row.metadata.audit.previousHash,
      metadata: eventMetadata(row),
    });

    return createHmac('sha256', this.signingKey).update(payload).digest('hex');
  }

  /**
   * Sign the persisted row for cryptographic verification.
   */
  private sign(row: AuditRow): string {
    return createHmac('sha256', this.signingKey)
      .update(canonicalJson(signablePayload(row)))
      .digest('hex');
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

    // Drop undefined fields: jsonb does not store them, so they must not be hashed.
    return JSON.parse(JSON.stringify(processed));
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
    date.setUTCFullYear(date.getUTCFullYear() + years);
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
