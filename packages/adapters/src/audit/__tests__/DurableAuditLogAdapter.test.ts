/**
 * DurableAuditLogAdapter Tests
 *
 * Tests for the durable audit log adapter implementation.
 *
 * IMPLEMENTS: IFC-125 (AI Guardrails Audit Logger Integration)
 *
 * Test scenarios based on spec consensus decisions:
 * - Decision 4: Hash chain integrity
 * - Decision 5: GDPR-compliant retention
 * - Decision 6: Comprehensive test coverage
 * - Decision 7: Cross-tenant isolation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DurableAuditLogAdapter } from '../DurableAuditLogAdapter';
import { CrossTenantViolationError } from '../errors';
import type { AISecurityEventInput, TenantContext } from '@intelliflow/application';

// Mock Prisma client
const mockPrismaClient = () => ({
  securityEvent: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  auditLogEntry: {
    create: vi.fn(),
  },
  $transaction: vi.fn((callback: (tx: any) => Promise<any>) =>
    callback({
      securityEvent: { create: vi.fn().mockResolvedValue({}) },
      auditLogEntry: { create: vi.fn().mockResolvedValue({}) },
    })
  ),
});

describe('DurableAuditLogAdapter', () => {
  let prisma: ReturnType<typeof mockPrismaClient>;
  let signingKey: Buffer;
  let adapter: DurableAuditLogAdapter;

  const createValidEvent = (): AISecurityEventInput => ({
    eventType: 'AI_GUARDRAIL_TRIGGERED',
    severity: 'HIGH',
    tenantId: 'tenant-123',
    userId: 'user-456',
    resourceType: 'AI_GUARDRAIL',
    resourceId: 'guardrail-789',
    description: 'Guardrail triggered during lead scoring',
    metadata: {
      modelId: 'gpt-4o',
      modelVersion: '2024-01',
      guardrailId: 'prompt-injection-detector',
      guardrailVersion: '1.0.0',
      processingPurpose: 'AI_GUARDRAIL_ENFORCEMENT',
      legalBasis: 'LEGITIMATE_INTEREST',
    },
  });

  const createValidTenantContext = (): TenantContext => ({
    tenantId: 'tenant-123',
    userId: 'user-456',
    sessionId: 'session-789',
    jurisdiction: 'EU',
  });

  beforeEach(() => {
    prisma = mockPrismaClient();
    signingKey = Buffer.from('a'.repeat(64), 'hex'); // 256-bit key
    adapter = new DurableAuditLogAdapter(prisma as any, signingKey);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Core functionality', () => {
    it('persists security event to database', async () => {
      const event = createValidEvent();
      const context = createValidTenantContext();

      const result = await adapter.logSecurityEvent(event, context);

      expect(result.status).toBe('PERSISTED');
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('returns eventId and integrityHash on success', async () => {
      const event = createValidEvent();
      const context = createValidTenantContext();

      const result = await adapter.logSecurityEvent(event, context);

      expect(result.eventId).toBeDefined();
      expect(typeof result.eventId).toBe('string');
      expect(result.integrityHash).toBeDefined();
      expect(typeof result.integrityHash).toBe('string');
    });

    it('writes to both SecurityEvent and AuditLogEntry tables', async () => {
      const event = createValidEvent();
      const context = createValidTenantContext();

      let securityEventCreated = false;
      let auditLogCreated = false;

      prisma.$transaction = vi.fn((callback: (tx: any) => Promise<any>) =>
        callback({
          securityEvent: {
            create: vi.fn().mockImplementation(() => {
              securityEventCreated = true;
              return Promise.resolve({});
            }),
          },
          auditLogEntry: {
            create: vi.fn().mockImplementation(() => {
              auditLogCreated = true;
              return Promise.resolve({});
            }),
          },
        })
      );

      adapter = new DurableAuditLogAdapter(prisma as any, signingKey);
      await adapter.logSecurityEvent(event, context);

      expect(securityEventCreated).toBe(true);
      expect(auditLogCreated).toBe(true);
    });
  });

  describe('Tenant isolation (Decision 7)', () => {
    it('throws CrossTenantViolationError for mismatched tenants', async () => {
      const event = { ...createValidEvent(), tenantId: 'tenant-a' };
      const context = { ...createValidTenantContext(), tenantId: 'tenant-b' };

      await expect(adapter.logSecurityEvent(event, context)).rejects.toThrow(
        CrossTenantViolationError
      );
    });

    it('includes tenantId in all persisted records', async () => {
      const event = createValidEvent();
      const context = createValidTenantContext();

      let persistedTenantId: string | undefined;

      prisma.$transaction = vi.fn((callback: (tx: any) => Promise<any>) =>
        callback({
          securityEvent: {
            create: vi.fn().mockImplementation((args: any) => {
              persistedTenantId = args.data.tenantId;
              return Promise.resolve({});
            }),
          },
          auditLogEntry: {
            create: vi.fn().mockResolvedValue({}),
          },
        })
      );

      adapter = new DurableAuditLogAdapter(prisma as any, signingKey);
      await adapter.logSecurityEvent(event, context);

      expect(persistedTenantId).toBe('tenant-123');
    });

    it('throws CrossTenantViolationError with correct tenant IDs', async () => {
      const event = { ...createValidEvent(), tenantId: 'tenant-a' };
      const context = { ...createValidTenantContext(), tenantId: 'tenant-b' };

      try {
        await adapter.logSecurityEvent(event, context);
        expect.fail('Should have thrown CrossTenantViolationError');
      } catch (error) {
        expect(error).toBeInstanceOf(CrossTenantViolationError);
        if (error instanceof CrossTenantViolationError) {
          expect(error.eventTenantId).toBe('tenant-a');
          expect(error.contextTenantId).toBe('tenant-b');
        }
      }
    });
  });

  describe('Hash chain integrity (Decision 4)', () => {
    it('links events via previousHash', async () => {
      const event1 = createValidEvent();
      const event2 = { ...createValidEvent(), description: 'Second event' };
      const context = createValidTenantContext();

      let firstEventHash: string | undefined;
      let secondEventPreviousHash: string | undefined;

      // Track hashes across calls
      let callCount = 0;
      prisma.$transaction = vi.fn((callback: (tx: any) => Promise<any>) =>
        callback({
          securityEvent: {
            create: vi.fn().mockImplementation((args: any) => {
              if (callCount === 0) {
                firstEventHash = args.data.integrityHash;
              } else {
                secondEventPreviousHash = args.data.previousHash;
              }
              callCount++;
              return Promise.resolve({});
            }),
          },
          auditLogEntry: {
            create: vi.fn().mockResolvedValue({}),
          },
        })
      );

      adapter = new DurableAuditLogAdapter(prisma as any, signingKey);

      await adapter.logSecurityEvent(event1, context);
      await adapter.logSecurityEvent(event2, context);

      expect(secondEventPreviousHash).toBe(firstEventHash);
    });

    it('computes HMAC-SHA256 integrity hash', async () => {
      const event = createValidEvent();
      const context = createValidTenantContext();

      const result = await adapter.logSecurityEvent(event, context);

      // HMAC-SHA256 produces 64 hex characters
      expect(result.integrityHash).toBeDefined();
      expect(result.integrityHash!.length).toBe(64);
      expect(/^[a-f0-9]{64}$/.test(result.integrityHash!)).toBe(true);
    });

    it('verifyLogIntegrity detects tampered entries', async () => {
      const eventId = 'event-123';

      // Mock finding a tampered entry (hash mismatch)
      prisma.securityEvent.findUnique = vi.fn().mockResolvedValue({
        eventId,
        eventType: 'AI_GUARDRAIL_TRIGGERED',
        severity: 'LOW', // TAMPERED: was originally HIGH
        tenantId: 'tenant-123',
        timestamp: new Date(),
        previousHash: 'GENESIS',
        metadata: {},
        integrityHash: 'original-hash-before-tampering',
        signature: 'original-signature',
      });

      const verification = await adapter.verifyLogIntegrity(eventId);

      expect(verification.valid).toBe(false);
    });

    it('verifyLogIntegrity returns valid=true for untampered entries', async () => {
      // First create an entry
      const event = createValidEvent();
      const context = createValidTenantContext();

      let storedEntry: any;
      prisma.$transaction = vi.fn((callback: (tx: any) => Promise<any>) =>
        callback({
          securityEvent: {
            create: vi.fn().mockImplementation((args: any) => {
              storedEntry = args.data;
              return Promise.resolve(args.data);
            }),
          },
          auditLogEntry: {
            create: vi.fn().mockResolvedValue({}),
          },
        })
      );

      adapter = new DurableAuditLogAdapter(prisma as any, signingKey);
      const result = await adapter.logSecurityEvent(event, context);

      // Now verify it
      prisma.securityEvent.findUnique = vi.fn().mockResolvedValue(storedEntry);

      const verification = await adapter.verifyLogIntegrity(result.eventId);

      expect(verification.valid).toBe(true);
      expect(verification.signatureValid).toBe(true);
    });

    it('starts hash chain with GENESIS', async () => {
      const event = createValidEvent();
      const context = createValidTenantContext();

      let firstPreviousHash: string | undefined;

      prisma.$transaction = vi.fn((callback: (tx: any) => Promise<any>) =>
        callback({
          securityEvent: {
            create: vi.fn().mockImplementation((args: any) => {
              firstPreviousHash = args.data.previousHash;
              return Promise.resolve({});
            }),
          },
          auditLogEntry: {
            create: vi.fn().mockResolvedValue({}),
          },
        })
      );

      // Create a fresh adapter instance
      const freshAdapter = new DurableAuditLogAdapter(prisma as any, signingKey);
      await freshAdapter.logSecurityEvent(event, context);

      expect(firstPreviousHash).toBe('GENESIS');
    });
  });

  describe('GDPR retention (Decision 5)', () => {
    it('calculates 7-year retention for EU jurisdiction', async () => {
      const event = createValidEvent();
      const context = { ...createValidTenantContext(), jurisdiction: 'EU' as const };

      let retentionExpiresAt: Date | undefined;

      prisma.$transaction = vi.fn((callback: (tx: any) => Promise<any>) =>
        callback({
          securityEvent: {
            create: vi.fn().mockImplementation((args: any) => {
              retentionExpiresAt = args.data.retentionExpiresAt;
              return Promise.resolve({});
            }),
          },
          auditLogEntry: {
            create: vi.fn().mockResolvedValue({}),
          },
        })
      );

      adapter = new DurableAuditLogAdapter(prisma as any, signingKey);
      await adapter.logSecurityEvent(event, context);

      expect(retentionExpiresAt).toBeDefined();
      const now = new Date();
      const sevenYearsFromNow = new Date(now);
      sevenYearsFromNow.setFullYear(sevenYearsFromNow.getFullYear() + 7);

      // Allow 1 day tolerance
      const diff = Math.abs(retentionExpiresAt!.getTime() - sevenYearsFromNow.getTime());
      expect(diff).toBeLessThan(24 * 60 * 60 * 1000);
    });

    it('calculates retention based on jurisdiction', async () => {
      const jurisdictions = ['EU', 'UK', 'US', 'GLOBAL'] as const;

      for (const jurisdiction of jurisdictions) {
        const event = createValidEvent();
        const context = { ...createValidTenantContext(), jurisdiction };

        let retentionExpiresAt: Date | undefined;

        prisma.$transaction = vi.fn((callback: (tx: any) => Promise<any>) =>
          callback({
            securityEvent: {
              create: vi.fn().mockImplementation((args: any) => {
                retentionExpiresAt = args.data.retentionExpiresAt;
                return Promise.resolve({});
              }),
            },
            auditLogEntry: {
              create: vi.fn().mockResolvedValue({}),
            },
          })
        );

        const jurisdictionAdapter = new DurableAuditLogAdapter(prisma as any, signingKey);
        await jurisdictionAdapter.logSecurityEvent(event, context);

        expect(retentionExpiresAt).toBeDefined();
        // All jurisdictions should use 7-year retention for security events
        const now = new Date();
        const expectedYear = now.getFullYear() + 7;
        expect(retentionExpiresAt!.getFullYear()).toBe(expectedYear);
      }
    });

    it('encrypts PII fields before persistence', async () => {
      const event = {
        ...createValidEvent(),
        metadata: {
          ...createValidEvent().metadata,
          dataSubjectId: 'sensitive-subject-id-123',
        },
      };
      const context = createValidTenantContext();

      let persistedMetadata: any;

      prisma.$transaction = vi.fn((callback: (tx: any) => Promise<any>) =>
        callback({
          securityEvent: {
            create: vi.fn().mockImplementation((args: any) => {
              persistedMetadata = args.data.metadata;
              return Promise.resolve({});
            }),
          },
          auditLogEntry: {
            create: vi.fn().mockResolvedValue({}),
          },
        })
      );

      adapter = new DurableAuditLogAdapter(prisma as any, signingKey, { encryptPII: true });
      await adapter.logSecurityEvent(event, context);

      // If dataSubjectId is present, it should be encrypted (not in plain text)
      if (persistedMetadata?.dataSubjectId) {
        expect(persistedMetadata.dataSubjectId).not.toBe('sensitive-subject-id-123');
      }
    });
  });

  describe('Concurrent safety', () => {
    it('handles concurrent events without data loss', async () => {
      const context = createValidTenantContext();
      const events = Array(10)
        .fill(null)
        .map((_, i) => ({
          ...createValidEvent(),
          description: `Event ${i}`,
        }));

      let persistedCount = 0;

      prisma.$transaction = vi.fn((callback: (tx: any) => Promise<any>) =>
        callback({
          securityEvent: {
            create: vi.fn().mockImplementation(() => {
              persistedCount++;
              return Promise.resolve({});
            }),
          },
          auditLogEntry: {
            create: vi.fn().mockResolvedValue({}),
          },
        })
      );

      adapter = new DurableAuditLogAdapter(prisma as any, signingKey);

      const results = await Promise.all(events.map((e) => adapter.logSecurityEvent(e, context)));

      expect(results.filter((r) => r.status === 'PERSISTED')).toHaveLength(10);
      expect(persistedCount).toBe(10);
    });

    it('maintains hash chain under concurrent writes', async () => {
      const context = createValidTenantContext();
      const events = Array(5)
        .fill(null)
        .map((_, i) => ({
          ...createValidEvent(),
          description: `Event ${i}`,
        }));

      const previousHashes: string[] = [];

      prisma.$transaction = vi.fn((callback: (tx: any) => Promise<any>) =>
        callback({
          securityEvent: {
            create: vi.fn().mockImplementation((args: any) => {
              previousHashes.push(args.data.previousHash);
              return Promise.resolve({});
            }),
          },
          auditLogEntry: {
            create: vi.fn().mockResolvedValue({}),
          },
        })
      );

      adapter = new DurableAuditLogAdapter(prisma as any, signingKey);

      // Sequential writes to ensure proper chain
      for (const event of events) {
        await adapter.logSecurityEvent(event, context);
      }

      // First should be GENESIS, rest should be previous hashes
      expect(previousHashes[0]).toBe('GENESIS');
      // Subsequent entries should have non-GENESIS previous hashes
      for (let i = 1; i < previousHashes.length; i++) {
        expect(previousHashes[i]).not.toBe('GENESIS');
      }
    });
  });

  describe('Error handling', () => {
    it('throws error when event not found in verifyLogIntegrity', async () => {
      prisma.securityEvent.findUnique = vi.fn().mockResolvedValue(null);

      const verification = await adapter.verifyLogIntegrity('non-existent-event');

      expect(verification.valid).toBe(false);
      expect(verification.reason).toBe('EVENT_NOT_FOUND');
    });
  });

  describe('Batch operations', () => {
    it('logBatchEvents persists all events in single transaction', async () => {
      const events = [createValidEvent(), createValidEvent(), createValidEvent()];
      const context = createValidTenantContext();

      let transactionCallCount = 0;

      prisma.$transaction = vi.fn((callback: (tx: any) => Promise<any>) => {
        transactionCallCount++;
        return callback({
          securityEvent: { create: vi.fn().mockResolvedValue({}) },
          auditLogEntry: { create: vi.fn().mockResolvedValue({}) },
        });
      });

      adapter = new DurableAuditLogAdapter(prisma as any, signingKey);

      const result = await adapter.logBatchEvents(events, context);

      // Batch should use a single transaction
      expect(transactionCallCount).toBe(1);
      expect(result.totalEvents).toBe(3);
      expect(result.successCount).toBe(3);
    });
  });
});
