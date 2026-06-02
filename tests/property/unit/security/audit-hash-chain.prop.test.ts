/**
 * Property tests for DurableAuditLogAdapter — computeHash determinism and
 * sequential hash-chain integrity (pure-domain variant, no real DB).
 *
 * All tests wire the adapter against an in-memory mock that captures persisted
 * data so we can verify the cryptographic invariants without requiring a live
 * PostgreSQL instance.
 *
 * Properties covered:
 *
 * Hash determinism:
 *  P-AUDIT-01: computeHash is deterministic — identical entry payloads always
 *              produce the same HMAC-SHA256 hex string.
 *  P-AUDIT-02: Different eventType values always produce different hashes
 *              (collision resistance at this granularity).
 *  P-AUDIT-03: Different tenantId values always produce different hashes
 *              (tenant-scoped uniqueness).
 *  P-AUDIT-04: Different metadata values always produce different hashes.
 *  P-AUDIT-05: Hash output is always exactly 64 lowercase hex characters.
 *  P-AUDIT-06: Hash changes when previousHash changes (chain integrity input).
 *
 * Chain integrity (sequential):
 *  P-AUDIT-07: First event's previousHash is always 'GENESIS'.
 *  P-AUDIT-08: For any sequential chain of N events, event[i].previousHash ===
 *              event[i-1].integrityHash for all i >= 1 (strict chain linkage).
 *  P-AUDIT-09: Each integrityHash in a sequential chain is unique (no forks,
 *              no collisions for distinct inputs).
 *  P-AUDIT-10: Adapter instance state resets per construction — a new adapter
 *              always starts from GENESIS regardless of what a sibling did.
 *
 * Tenant isolation:
 *  P-AUDIT-11: logSecurityEvent throws CrossTenantViolationError whenever
 *              event.tenantId !== tenantContext.tenantId, for all string pairs.
 *  P-AUDIT-12: CrossTenantViolationError carries the correct eventTenantId and
 *              contextTenantId fields.
 *
 * Signing key sensitivity:
 *  P-AUDIT-13: Two adapters initialised with different 32-byte signing keys
 *              always produce different hashes for identical inputs.
 *
 * Metadata processing:
 *  P-AUDIT-14: Enabling encryptPII transforms dataSubjectId — the persisted
 *              value is never the original plain-text string.
 *  P-AUDIT-15: Disabling encryptPII leaves non-PII metadata fields unchanged.
 *
 * @see packages/adapters/src/audit/DurableAuditLogAdapter.ts
 * @see docs/operations/property-testing/PROPERTY_TESTING_AUDIT.md RACE-AUDIT-01
 */

import { describe, expect } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import {
  DurableAuditLogAdapter,
  type AuditPrismaClient,
} from '../../../../packages/adapters/src/audit/DurableAuditLogAdapter';
import { CrossTenantViolationError } from '../../../../packages/adapters/src/audit/errors';
import type {
  AISecurityEventInput,
  TenantContext,
  AISecurityMetadata,
} from '@intelliflow/application';
import type { AISecurityEventType } from '@intelliflow/domain';
import { propertyParams } from '../../support';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALL_EVENT_TYPES: readonly AISecurityEventType[] = [
  'AI_GUARDRAIL_TRIGGERED',
  'AI_GUARDRAIL_BYPASSED',
  'AI_GUARDRAIL_TIMEOUT',
  'AI_PROMPT_INJECTION_DETECTED',
  'AI_PII_EXPOSURE_BLOCKED',
  'AI_TOXIC_CONTENT_BLOCKED',
  'AI_HALLUCINATION_DETECTED',
  'AI_TOKEN_LIMIT_EXCEEDED',
  'AI_COST_THRESHOLD_BREACH',
  'AI_RATE_LIMIT_TRIGGERED',
  'AI_LOW_CONFIDENCE_OVERRIDE',
  'AI_CHAIN_FAILURE',
  'AI_OUTPUT_VALIDATION_FAILED',
  'AI_MODEL_VERSION_MISMATCH',
  'AI_CONSENT_VALIDATION_FAILED',
  'AI_DATA_RETENTION_VIOLATION',
  'AI_CROSS_TENANT_ACCESS_ATTEMPT',
  'AI_BIAS_THRESHOLD_EXCEEDED',
] as const;

// ---------------------------------------------------------------------------
// In-memory mock Prisma client
// ---------------------------------------------------------------------------

interface PersistedEntry {
  eventId: string;
  eventType: string;
  tenantId: string;
  previousHash: string;
  integrityHash: string;
  signature: string;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

function makeMockPrisma(): {
  prisma: AuditPrismaClient;
  securityEvents: PersistedEntry[];
} {
  const securityEvents: PersistedEntry[] = [];

  const prisma: AuditPrismaClient = {
    securityEvent: {
      create: async (args: { data: any }) => {
        securityEvents.push({ ...args.data });
        return args.data;
      },
      findUnique: async (args: { where: { eventId: string } }) => {
        return securityEvents.find((e) => e.eventId === args.where.eventId) ?? null;
      },
      update: async (args: { where: { eventId: string }; data: any }) => {
        const idx = securityEvents.findIndex((e) => e.eventId === args.where.eventId);
        if (idx >= 0) Object.assign(securityEvents[idx], args.data);
        return securityEvents[idx] ?? null;
      },
    },
    auditLogEntry: {
      create: async (_args: { data: any }) => ({}),
    },
    $transaction: async <T>(callback: (tx: any) => Promise<T>): Promise<T> => {
      // Inline transaction: forward to same in-memory store
      return callback({
        securityEvent: {
          create: async (args: { data: any }) => {
            securityEvents.push({ ...args.data });
            return args.data;
          },
        },
        auditLogEntry: {
          create: async (_args: { data: any }) => ({}),
        },
      });
    },
  };

  return { prisma, securityEvents };
}

// ---------------------------------------------------------------------------
// Inline arbitraries (never edit support/arbitraries)
// ---------------------------------------------------------------------------

/** A valid non-empty ASCII string no longer than 64 chars. */
const arbShortStr: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 64 })
  .filter((s) => s.trim().length > 0);

/** A valid UUID-like tenant id. */
const arbTenantId: fc.Arbitrary<string> = fc.uuid();

/** A valid event type drawn from the known set. */
const arbEventType: fc.Arbitrary<AISecurityEventType> = fc.constantFrom(...ALL_EVENT_TYPES);

/** A pair of distinct event types. */
const arbTwoDistinctEventTypes: fc.Arbitrary<[AISecurityEventType, AISecurityEventType]> = fc
  .tuple(arbEventType, arbEventType)
  .filter(([a, b]) => a !== b);

/** A pair of distinct tenant ids. */
const arbTwoDistinctTenantIds: fc.Arbitrary<[string, string]> = fc
  .tuple(arbTenantId, arbTenantId)
  .filter(([a, b]) => a !== b);

/** A pair of distinct 32-byte signing keys. */
const arbTwoDistinctKeys: fc.Arbitrary<[Buffer, Buffer]> = fc
  .tuple(
    fc.uint8Array({ minLength: 32, maxLength: 32 }),
    fc.uint8Array({ minLength: 32, maxLength: 32 })
  )
  .filter(([a, b]) => {
    // Compare Uint8Arrays element-by-element (Buffer.equals is not available here)
    if (a.length !== b.length) return true;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return true;
    }
    return false; // They are equal — exclude this pair
  })
  .map(([a, b]) => [Buffer.from(a), Buffer.from(b)] as [Buffer, Buffer]);

/** A valid signing key (32 bytes). */
const arbSigningKey: fc.Arbitrary<Buffer> = fc
  .uint8Array({ minLength: 32, maxLength: 32 })
  .map((a) => Buffer.from(a));

/** Minimal valid AISecurityMetadata. */
const arbMetadata = (tenantId?: string): fc.Arbitrary<AISecurityMetadata> =>
  fc.record({
    modelId: arbShortStr,
    modelVersion: arbShortStr,
    guardrailId: arbShortStr,
    guardrailVersion: arbShortStr,
    processingPurpose: arbShortStr,
    legalBasis: arbShortStr,
    dataSubjectId: fc.option(arbShortStr, { nil: undefined }),
    detectionConfidence: fc.option(
      fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
      { nil: undefined }
    ),
  });

/** A valid TenantContext for a given tenantId. */
function tenantCtx(tenantId: string): TenantContext {
  return { tenantId };
}

// ---------------------------------------------------------------------------
// Helper: expose computeHash via any-cast (it is private)
// ---------------------------------------------------------------------------

function callComputeHash(adapter: DurableAuditLogAdapter, entry: Record<string, unknown>): string {
  return (adapter as any).computeHash(entry);
}

// ---------------------------------------------------------------------------
// P-AUDIT-01: computeHash is deterministic
// ---------------------------------------------------------------------------

describe('P-AUDIT-01: computeHash determinism', () => {
  test.prop([arbSigningKey, arbEventType, arbTenantId, arbMetadata()], propertyParams())(
    'same entry always produces the same hash',
    (key, eventType, tenantId, metadata) => {
      const adapter = new DurableAuditLogAdapter(makeMockPrisma().prisma, key);
      const entry = {
        eventType,
        tenantId,
        timestamp: new Date('2025-01-01T00:00:00.000Z'), // fixed timestamp for determinism
        previousHash: 'GENESIS',
        metadata,
      };
      const h1 = callComputeHash(adapter, entry);
      const h2 = callComputeHash(adapter, entry);
      expect(h1).toBe(h2);
    }
  );
});

// ---------------------------------------------------------------------------
// P-AUDIT-02: Different eventType => different hash
// ---------------------------------------------------------------------------

describe('P-AUDIT-02: Different eventType produces different hash', () => {
  test.prop(
    [arbSigningKey, arbTwoDistinctEventTypes, arbTenantId, arbMetadata()],
    propertyParams()
  )(
    'distinct eventType values yield distinct hashes (same key, tenant, meta)',
    (key, [typeA, typeB], tenantId, metadata) => {
      const adapter = new DurableAuditLogAdapter(makeMockPrisma().prisma, key);
      const base = {
        tenantId,
        timestamp: new Date('2025-01-01T00:00:00.000Z'),
        previousHash: 'GENESIS',
        metadata,
      };
      const h1 = callComputeHash(adapter, { ...base, eventType: typeA });
      const h2 = callComputeHash(adapter, { ...base, eventType: typeB });
      expect(h1).not.toBe(h2);
    }
  );
});

// ---------------------------------------------------------------------------
// P-AUDIT-03: Different tenantId => different hash
// ---------------------------------------------------------------------------

describe('P-AUDIT-03: Different tenantId produces different hash', () => {
  test.prop(
    [arbSigningKey, arbEventType, arbTwoDistinctTenantIds, arbMetadata()],
    propertyParams()
  )(
    'distinct tenantId values yield distinct hashes (same key, event type, meta)',
    (key, eventType, [tenantA, tenantB], metadata) => {
      const adapter = new DurableAuditLogAdapter(makeMockPrisma().prisma, key);
      const base = {
        eventType,
        timestamp: new Date('2025-01-01T00:00:00.000Z'),
        previousHash: 'GENESIS',
        metadata,
      };
      const h1 = callComputeHash(adapter, { ...base, tenantId: tenantA });
      const h2 = callComputeHash(adapter, { ...base, tenantId: tenantB });
      expect(h1).not.toBe(h2);
    }
  );
});

// ---------------------------------------------------------------------------
// P-AUDIT-04: Different metadata => different hash
// ---------------------------------------------------------------------------

describe('P-AUDIT-04: Different metadata produces different hash', () => {
  test.prop([arbSigningKey, arbEventType, arbTenantId], propertyParams())(
    'metadata with distinct modelId values yield distinct hashes',
    (key, eventType, tenantId) => {
      const adapter = new DurableAuditLogAdapter(makeMockPrisma().prisma, key);
      const base = {
        eventType,
        tenantId,
        timestamp: new Date('2025-01-01T00:00:00.000Z'),
        previousHash: 'GENESIS',
      };
      const meta1 = {
        modelId: 'model-alpha',
        modelVersion: '1.0',
        guardrailId: 'g1',
        guardrailVersion: '1',
        processingPurpose: 'pp',
        legalBasis: 'lb',
      };
      const meta2 = {
        modelId: 'model-beta',
        modelVersion: '1.0',
        guardrailId: 'g1',
        guardrailVersion: '1',
        processingPurpose: 'pp',
        legalBasis: 'lb',
      };
      const h1 = callComputeHash(adapter, { ...base, metadata: meta1 });
      const h2 = callComputeHash(adapter, { ...base, metadata: meta2 });
      expect(h1).not.toBe(h2);
    }
  );
});

// ---------------------------------------------------------------------------
// P-AUDIT-05: Hash output is always exactly 64 lowercase hex characters
// ---------------------------------------------------------------------------

describe('P-AUDIT-05: Hash output format', () => {
  test.prop([arbSigningKey, arbEventType, arbTenantId, arbMetadata()], propertyParams())(
    'hash is always 64 lowercase hex chars',
    (key, eventType, tenantId, metadata) => {
      const adapter = new DurableAuditLogAdapter(makeMockPrisma().prisma, key);
      const h = callComputeHash(adapter, {
        eventType,
        tenantId,
        timestamp: new Date('2025-01-01T00:00:00.000Z'),
        previousHash: 'GENESIS',
        metadata,
      });
      expect(typeof h).toBe('string');
      expect(h).toHaveLength(64);
      expect(/^[a-f0-9]{64}$/.test(h)).toBe(true);
    }
  );
});

// ---------------------------------------------------------------------------
// P-AUDIT-06: Hash changes when previousHash changes
// ---------------------------------------------------------------------------

describe('P-AUDIT-06: previousHash participates in hash computation', () => {
  test.prop(
    [arbSigningKey, arbEventType, arbTenantId, arbMetadata(), arbShortStr, arbShortStr],
    propertyParams()
  )(
    'different previousHash values produce different hashes for the same entry',
    (key, eventType, tenantId, metadata, prevA, prevB) => {
      fc.pre(prevA !== prevB);
      const adapter = new DurableAuditLogAdapter(makeMockPrisma().prisma, key);
      const base = {
        eventType,
        tenantId,
        timestamp: new Date('2025-01-01T00:00:00.000Z'),
        metadata,
      };
      const h1 = callComputeHash(adapter, { ...base, previousHash: prevA });
      const h2 = callComputeHash(adapter, { ...base, previousHash: prevB });
      expect(h1).not.toBe(h2);
    }
  );
});

// ---------------------------------------------------------------------------
// P-AUDIT-07: First persisted event has previousHash === 'GENESIS'
// ---------------------------------------------------------------------------

describe('P-AUDIT-07: Chain starts from GENESIS', () => {
  test.prop([arbSigningKey, arbTenantId, arbMetadata()], propertyParams())(
    'first logged event always has previousHash GENESIS',
    async (key, tenantId, metadata) => {
      const { prisma, securityEvents } = makeMockPrisma();
      const adapter = new DurableAuditLogAdapter(prisma, key);
      const event: AISecurityEventInput = {
        eventType: 'AI_GUARDRAIL_TRIGGERED',
        severity: 'MEDIUM',
        tenantId,
        description: 'first event',
        metadata: { ...metadata, dataSubjectId: undefined },
      };
      await adapter.logSecurityEvent(event, tenantCtx(tenantId));
      expect(securityEvents).toHaveLength(1);
      expect(securityEvents[0].previousHash).toBe('GENESIS');
    }
  );
});

// ---------------------------------------------------------------------------
// P-AUDIT-08: Sequential chain linkage (event[i].previousHash === event[i-1].integrityHash)
// ---------------------------------------------------------------------------

describe('P-AUDIT-08: Sequential hash chain linkage', () => {
  test.prop([arbSigningKey, arbTenantId, fc.integer({ min: 2, max: 6 })], propertyParams())(
    'event[i].previousHash equals event[i-1].integrityHash for all i>=1',
    async (key, tenantId, chainLength) => {
      const { prisma, securityEvents } = makeMockPrisma();
      const adapter = new DurableAuditLogAdapter(prisma, key);

      const baseEvent: AISecurityEventInput = {
        eventType: 'AI_GUARDRAIL_TRIGGERED',
        severity: 'MEDIUM',
        tenantId,
        description: 'chain test event',
        metadata: {
          modelId: 'test-model',
          modelVersion: '1.0',
          guardrailId: 'g1',
          guardrailVersion: '1',
          processingPurpose: 'testing',
          legalBasis: 'legitimate interest',
        },
      };

      for (let i = 0; i < chainLength; i++) {
        await adapter.logSecurityEvent(
          { ...baseEvent, description: `event-${i}` },
          tenantCtx(tenantId)
        );
      }

      expect(securityEvents).toHaveLength(chainLength);

      // First event starts from GENESIS
      expect(securityEvents[0].previousHash).toBe('GENESIS');

      // Each subsequent event must reference the prior event's integrityHash
      for (let i = 1; i < chainLength; i++) {
        expect(securityEvents[i].previousHash).toBe(securityEvents[i - 1].integrityHash);
      }
    }
  );
});

// ---------------------------------------------------------------------------
// P-AUDIT-09: Hashes in a sequential chain are all unique
// ---------------------------------------------------------------------------

describe('P-AUDIT-09: Sequential chain hashes are unique', () => {
  test.prop([arbSigningKey, arbTenantId, fc.integer({ min: 2, max: 8 })], propertyParams())(
    'all integrityHash values in a sequential chain are distinct',
    async (key, tenantId, chainLength) => {
      const { prisma, securityEvents } = makeMockPrisma();
      const adapter = new DurableAuditLogAdapter(prisma, key);

      const baseEvent: AISecurityEventInput = {
        eventType: 'AI_GUARDRAIL_TRIGGERED',
        severity: 'MEDIUM',
        tenantId,
        description: 'uniqueness test',
        metadata: {
          modelId: 'test-model',
          modelVersion: '1.0',
          guardrailId: 'g1',
          guardrailVersion: '1',
          processingPurpose: 'testing',
          legalBasis: 'legitimate interest',
        },
      };

      for (let i = 0; i < chainLength; i++) {
        await adapter.logSecurityEvent(
          { ...baseEvent, description: `unique-event-${i}` },
          tenantCtx(tenantId)
        );
      }

      const hashes = securityEvents.map((e) => e.integrityHash);
      const uniqueHashes = new Set(hashes);
      expect(uniqueHashes.size).toBe(chainLength);
    }
  );
});

// ---------------------------------------------------------------------------
// P-AUDIT-10: New adapter instance always starts from GENESIS
// ---------------------------------------------------------------------------

describe('P-AUDIT-10: New adapter instance resets to GENESIS', () => {
  test.prop([arbSigningKey, arbTenantId], propertyParams())(
    'a fresh adapter always emits GENESIS as the first previousHash, independent of siblings',
    async (key, tenantId) => {
      const { prisma: prismaA, securityEvents: eventsA } = makeMockPrisma();
      const adapterA = new DurableAuditLogAdapter(prismaA, key);

      const { prisma: prismaB, securityEvents: eventsB } = makeMockPrisma();
      const adapterB = new DurableAuditLogAdapter(prismaB, key);

      const event: AISecurityEventInput = {
        eventType: 'AI_GUARDRAIL_TRIGGERED',
        severity: 'MEDIUM',
        tenantId,
        description: 'genesis check',
        metadata: {
          modelId: 'm',
          modelVersion: '1',
          guardrailId: 'g',
          guardrailVersion: '1',
          processingPurpose: 'p',
          legalBasis: 'l',
        },
      };

      // Log two events on adapterA first
      await adapterA.logSecurityEvent(event, tenantCtx(tenantId));
      await adapterA.logSecurityEvent({ ...event, description: 'second' }, tenantCtx(tenantId));

      // adapterB is fresh — its first event must still start from GENESIS
      await adapterB.logSecurityEvent(event, tenantCtx(tenantId));

      expect(eventsA[0].previousHash).toBe('GENESIS');
      expect(eventsB[0].previousHash).toBe('GENESIS');
    }
  );
});

// ---------------------------------------------------------------------------
// P-AUDIT-11: Cross-tenant violation always throws
// ---------------------------------------------------------------------------

describe('P-AUDIT-11: Cross-tenant violation is always thrown', () => {
  test.prop([arbSigningKey, arbTwoDistinctTenantIds], propertyParams())(
    'event.tenantId !== context.tenantId always throws CrossTenantViolationError',
    async (key, [eventTenantId, contextTenantId]) => {
      const { prisma } = makeMockPrisma();
      const adapter = new DurableAuditLogAdapter(prisma, key);
      const event: AISecurityEventInput = {
        eventType: 'AI_GUARDRAIL_TRIGGERED',
        severity: 'MEDIUM',
        tenantId: eventTenantId,
        description: 'cross-tenant test',
        metadata: {
          modelId: 'm',
          modelVersion: '1',
          guardrailId: 'g',
          guardrailVersion: '1',
          processingPurpose: 'p',
          legalBasis: 'l',
        },
      };
      await expect(adapter.logSecurityEvent(event, tenantCtx(contextTenantId))).rejects.toThrow(
        CrossTenantViolationError
      );
    }
  );
});

// ---------------------------------------------------------------------------
// P-AUDIT-12: CrossTenantViolationError carries correct tenant ids
// ---------------------------------------------------------------------------

describe('P-AUDIT-12: CrossTenantViolationError carries the correct tenant ids', () => {
  test.prop([arbSigningKey, arbTwoDistinctTenantIds], propertyParams())(
    'error.eventTenantId and error.contextTenantId match the input arguments',
    async (key, [eventTenantId, contextTenantId]) => {
      const { prisma } = makeMockPrisma();
      const adapter = new DurableAuditLogAdapter(prisma, key);
      const event: AISecurityEventInput = {
        eventType: 'AI_GUARDRAIL_TRIGGERED',
        severity: 'MEDIUM',
        tenantId: eventTenantId,
        description: 'tenant id check',
        metadata: {
          modelId: 'm',
          modelVersion: '1',
          guardrailId: 'g',
          guardrailVersion: '1',
          processingPurpose: 'p',
          legalBasis: 'l',
        },
      };
      let caughtError: CrossTenantViolationError | null = null;
      try {
        await adapter.logSecurityEvent(event, tenantCtx(contextTenantId));
      } catch (err) {
        if (err instanceof CrossTenantViolationError) caughtError = err;
      }
      expect(caughtError).not.toBeNull();
      expect(caughtError!.eventTenantId).toBe(eventTenantId);
      expect(caughtError!.contextTenantId).toBe(contextTenantId);
    }
  );
});

// ---------------------------------------------------------------------------
// P-AUDIT-13: Different signing keys produce different hashes
// ---------------------------------------------------------------------------

describe('P-AUDIT-13: Signing key sensitivity', () => {
  test.prop([arbTwoDistinctKeys, arbEventType, arbTenantId, arbMetadata()], propertyParams())(
    'two distinct signing keys always produce distinct hashes for identical inputs',
    ([keyA, keyB], eventType, tenantId, metadata) => {
      const prisma = makeMockPrisma().prisma;
      const adapterA = new DurableAuditLogAdapter(prisma, keyA);
      const adapterB = new DurableAuditLogAdapter(prisma, keyB);
      const entry = {
        eventType,
        tenantId,
        timestamp: new Date('2025-01-01T00:00:00.000Z'),
        previousHash: 'GENESIS',
        metadata,
      };
      const hA = callComputeHash(adapterA, entry);
      const hB = callComputeHash(adapterB, entry);
      expect(hA).not.toBe(hB);
    }
  );
});

// ---------------------------------------------------------------------------
// P-AUDIT-14: encryptPII transforms dataSubjectId
// ---------------------------------------------------------------------------

describe('P-AUDIT-14: PII encryption transforms dataSubjectId', () => {
  test.prop([arbSigningKey, arbTenantId, arbShortStr], propertyParams())(
    'when encryptPII=true the persisted dataSubjectId is not the plain-text original',
    async (key, tenantId, plainSubjectId) => {
      const { prisma, securityEvents } = makeMockPrisma();
      const adapter = new DurableAuditLogAdapter(prisma, key, { encryptPII: true });

      const event: AISecurityEventInput = {
        eventType: 'AI_PII_EXPOSURE_BLOCKED',
        severity: 'HIGH',
        tenantId,
        description: 'pii test',
        metadata: {
          modelId: 'm',
          modelVersion: '1',
          guardrailId: 'g',
          guardrailVersion: '1',
          processingPurpose: 'p',
          legalBasis: 'l',
          dataSubjectId: plainSubjectId,
        },
      };

      await adapter.logSecurityEvent(event, tenantCtx(tenantId));
      expect(securityEvents).toHaveLength(1);
      const persisted = securityEvents[0];
      // The stored dataSubjectId must not equal the original plain text
      expect(persisted.metadata.dataSubjectId).not.toBe(plainSubjectId);
    }
  );
});

// ---------------------------------------------------------------------------
// P-AUDIT-15: Disabling encryptPII leaves non-PII metadata unchanged
// ---------------------------------------------------------------------------

describe('P-AUDIT-15: Disabled PII encryption does not corrupt non-PII metadata', () => {
  test.prop([arbSigningKey, arbTenantId, arbShortStr, arbShortStr], propertyParams())(
    'modelId and guardrailId survive unmodified when encryptPII=false',
    async (key, tenantId, modelId, guardrailId) => {
      const { prisma, securityEvents } = makeMockPrisma();
      const adapter = new DurableAuditLogAdapter(prisma, key, { encryptPII: false });

      const event: AISecurityEventInput = {
        eventType: 'AI_GUARDRAIL_TRIGGERED',
        severity: 'MEDIUM',
        tenantId,
        description: 'no-pii metadata test',
        metadata: {
          modelId,
          modelVersion: '1.0',
          guardrailId,
          guardrailVersion: '1',
          processingPurpose: 'testing',
          legalBasis: 'legitimate interest',
        },
      };

      await adapter.logSecurityEvent(event, tenantCtx(tenantId));
      expect(securityEvents).toHaveLength(1);
      const persisted = securityEvents[0];
      expect(persisted.metadata.modelId).toBe(modelId);
      expect(persisted.metadata.guardrailId).toBe(guardrailId);
    }
  );
});
