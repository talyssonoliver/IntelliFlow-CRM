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
 *
 * The adapter writes `audit_log_entries` only (security_events has no columns for
 * AI events). tests/integration/ai-security-audit.test.ts proves the rows land in
 * the real schema; these tests pin the mapping and the hash chain.
 */

import { createHmac } from 'node:crypto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DurableAuditLogAdapter } from '../DurableAuditLogAdapter';
import { CrossTenantViolationError } from '../errors';
import type { AISecurityEventInput, TenantContext } from '@intelliflow/application';

/**
 * Mock Prisma client that records every auditLogEntry write and serves them back
 * from findFirst, with jsonb's key reordering simulated on metadata. `users` holds
 * the `tenantId:id` pairs of users that still exist.
 */
const mockPrismaClient = () => {
  const writes: any[] = [];
  const users = new Set<string>(['tenant-123:user-456']);
  const reorderKeys = (value: unknown): unknown =>
    value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)
      ? Object.fromEntries(
          Object.keys(value as Record<string, unknown>)
            .reverse()
            .map((k) => [k, reorderKeys((value as Record<string, unknown>)[k])])
        )
      : value;
  const tx = {
    auditLogEntry: {
      create: vi.fn(async (args: { data: any }) => {
        writes.push(args.data);
        return args.data;
      }),
    },
  };
  return {
    writes,
    users,
    tx,
    user: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; tenantId: string } }) =>
        users.has(`${where.tenantId}:${where.id}`) ? { id: where.id } : null
      ),
    },
    auditLogEntry: {
      create: vi.fn(),
      findFirst: vi.fn(async ({ where }: { where: { eventId: string } }) => {
        const row = writes.find((w) => w.eventId === where.eventId);
        return row
          ? { ...row, metadata: reorderKeys(JSON.parse(JSON.stringify(row.metadata))) }
          : null;
      }),
    },
    $transaction: vi.fn((callback: (t: any) => Promise<any>) => callback(tx)),
  };
};

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
      const result = await adapter.logSecurityEvent(createValidEvent(), createValidTenantContext());

      expect(result.status).toBe('PERSISTED');
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.writes).toHaveLength(1);
    });

    it('returns eventId and integrityHash on success', async () => {
      const result = await adapter.logSecurityEvent(createValidEvent(), createValidTenantContext());

      expect(typeof result.eventId).toBe('string');
      expect(typeof result.integrityHash).toBe('string');
      expect(prisma.writes[0].eventId).toBe(result.eventId);
    });

    it('writes only audit_log_entries, with the AI event type and real columns', async () => {
      await adapter.logSecurityEvent(createValidEvent(), createValidTenantContext());

      const [row] = prisma.writes;
      expect(row).toMatchObject({
        tenantId: 'tenant-123',
        eventType: 'AI_GUARDRAIL_TRIGGERED',
        resourceType: 'AI_GUARDRAIL',
        resourceId: 'guardrail-789',
        actionReason: 'Guardrail triggered during lead scoring',
        dataClassification: 'INTERNAL',
      });
      // No security_events-only fields leak onto the audit row.
      for (const field of [
        'severity',
        'userId',
        'description',
        'integrityHash',
        'signature',
        'previousHash',
      ]) {
        expect(row).not.toHaveProperty(field);
      }
      expect(row.metadata.audit).toMatchObject({
        severity: 'HIGH',
        userId: 'user-456',
        previousHash: 'GENESIS',
      });
    });

    it('defaults resourceType and resourceId when the event has none', async () => {
      const event = { ...createValidEvent(), resourceType: undefined, resourceId: undefined };
      const result = await adapter.logSecurityEvent(event, createValidTenantContext());

      expect(prisma.writes[0]).toMatchObject({
        resourceType: 'AI_GUARDRAIL',
        resourceId: result.eventId,
      });
    });
  });

  describe('Actor, action and result mapping', () => {
    it.each([
      ['a real user id', 'user-456', { actorType: 'USER', actorId: 'user-456' }],
      ['the system actor', 'system', { actorType: 'SYSTEM', actorId: null }],
      ['no user (an ai-worker agent)', undefined, { actorType: 'AI_AGENT', actorId: null }],
    ])('records %s', async (_label, userId, expected) => {
      await adapter.logSecurityEvent({ ...createValidEvent(), userId }, createValidTenantContext());
      expect(prisma.writes[0]).toMatchObject(expected);
    });

    it.each([
      [{ action: 'CREATE' }, 'CREATE'],
      [{ action: 'UPSERT' }, 'UPDATE'],
      [{ action: 'DELETE' }, 'DELETE'],
      [{ operation: 'scoreLead' }, 'AI_SCORE'],
      [{ operation: 'qualifyLead' }, 'AI_PREDICT'],
      [{ operation: 'generateEmail' }, 'AI_GENERATE'],
      [{}, 'CONFIGURE'],
    ])('maps details %j to the %s AuditAction', async (details, action) => {
      const event = createValidEvent();
      await adapter.logSecurityEvent(
        { ...event, metadata: { ...event.metadata, details } },
        createValidTenantContext()
      );
      expect(prisma.writes[0].action).toBe(action);
    });

    it.each([
      ['AI_CHAIN_FAILURE', 'FAILURE'],
      ['AI_PROMPT_INJECTION_DETECTED', 'DENIED'],
      ['AI_PII_EXPOSURE_BLOCKED', 'DENIED'],
      ['AI_GUARDRAIL_TRIGGERED', 'SUCCESS'],
    ] as const)('records %s as %s', async (eventType, actionResult) => {
      await adapter.logSecurityEvent(
        { ...createValidEvent(), eventType },
        createValidTenantContext()
      );
      expect(prisma.writes[0].actionResult).toBe(actionResult);
    });
  });

  describe('Fallback tenants', () => {
    it.each(['default', 'system', ''])(
      "skips the write for the fallback tenant '%s' and warns",
      async (tenantId) => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const result = await adapter.logSecurityEvent(
          { ...createValidEvent(), tenantId },
          { ...createValidTenantContext(), tenantId }
        );

        expect(result.status).toBe('SKIPPED');
        expect(prisma.writes).toHaveLength(0);
        expect(warn).toHaveBeenCalledWith(
          expect.stringContaining('not persisted'),
          expect.objectContaining({ tenantId, eventType: 'AI_GUARDRAIL_TRIGGERED' })
        );
        warn.mockRestore();
      }
    );

    it('does not advance the hash chain for a skipped event', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      await adapter.logSecurityEvent(
        { ...createValidEvent(), tenantId: 'default' },
        { ...createValidTenantContext(), tenantId: 'default' }
      );
      await adapter.logSecurityEvent(createValidEvent(), createValidTenantContext());

      expect(prisma.writes[0].metadata.audit.previousHash).toBe('GENESIS');
    });
  });

  describe('Tenant isolation (Decision 7)', () => {
    it('throws CrossTenantViolationError for mismatched tenants', async () => {
      const event = { ...createValidEvent(), tenantId: 'tenant-a' };
      const context = { ...createValidTenantContext(), tenantId: 'tenant-b' };

      await expect(adapter.logSecurityEvent(event, context)).rejects.toThrow(
        CrossTenantViolationError
      );
      expect(prisma.writes).toHaveLength(0);
    });

    it('includes tenantId in all persisted records', async () => {
      await adapter.logSecurityEvent(createValidEvent(), createValidTenantContext());

      expect(prisma.writes[0].tenantId).toBe('tenant-123');
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
      const context = createValidTenantContext();
      const first = await adapter.logSecurityEvent(createValidEvent(), context);
      await adapter.logSecurityEvent(
        { ...createValidEvent(), description: 'Second event' },
        context
      );

      expect(prisma.writes[1].metadata.audit.previousHash).toBe(first.integrityHash);
    });

    it('computes HMAC-SHA256 integrity hash', async () => {
      const result = await adapter.logSecurityEvent(createValidEvent(), createValidTenantContext());

      expect(/^[a-f0-9]{64}$/.test(result.integrityHash!)).toBe(true);
      expect(prisma.writes[0].metadata.audit.integrityHash).toBe(result.integrityHash);
      expect(/^[a-f0-9]{64}$/.test(prisma.writes[0].metadata.audit.signature)).toBe(true);
    });

    it('verifyLogIntegrity detects tampered entries', async () => {
      const result = await adapter.logSecurityEvent(createValidEvent(), createValidTenantContext());
      prisma.writes[0].metadata.audit.severity = 'LOW'; // TAMPERED: was originally HIGH

      const verification = await adapter.verifyLogIntegrity(result.eventId);

      expect(verification.valid).toBe(false);
      expect(verification.reason).toBe('SIGNATURE_INVALID');
    });

    it.each([
      ['actionResult', 'SUCCESS'],
      ['action', 'READ'],
      ['actorType', 'SYSTEM'],
      ['resourceId', 'another-resource'],
      ['actionReason', 'rewritten'],
      ['dataClassification', 'PUBLIC'],
    ])('verifyLogIntegrity detects a tampered %s column', async (column, value) => {
      const result = await adapter.logSecurityEvent(
        { ...createValidEvent(), eventType: 'AI_PROMPT_INJECTION_DETECTED' },
        createValidTenantContext()
      );
      prisma.writes[0][column] = value;

      const verification = await adapter.verifyLogIntegrity(result.eventId);

      expect(verification).toMatchObject({ valid: false, reason: 'SIGNATURE_INVALID' });
    });

    it('verifyLogIntegrity detects an actorId swapped to another user', async () => {
      const result = await adapter.logSecurityEvent(createValidEvent(), createValidTenantContext());
      prisma.writes[0].actorId = 'someone-else';

      await expect(adapter.verifyLogIntegrity(result.eventId)).resolves.toMatchObject({
        valid: false,
        signatureValid: false,
      });
    });

    it('verifyLogIntegrity accepts an actorId nulled by the users FK (ON DELETE SET NULL)', async () => {
      const result = await adapter.logSecurityEvent(createValidEvent(), createValidTenantContext());
      prisma.users.delete('tenant-123:user-456');
      prisma.writes[0].actorId = null;

      await expect(adapter.verifyLogIntegrity(result.eventId)).resolves.toMatchObject({
        valid: true,
      });
    });

    it('verifyLogIntegrity detects a user actorId nulled while that user still exists', async () => {
      const result = await adapter.logSecurityEvent(createValidEvent(), createValidTenantContext());
      prisma.writes[0].actorId = null;

      await expect(adapter.verifyLogIntegrity(result.eventId)).resolves.toMatchObject({
        valid: false,
        signatureValid: false,
      });
      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { id: 'user-456', tenantId: 'tenant-123' },
        select: { id: true },
      });
    });

    it('verifyLogIntegrity accepts a null actorId on a system row without a users lookup', async () => {
      const result = await adapter.logSecurityEvent(
        { ...createValidEvent(), userId: 'system' },
        createValidTenantContext()
      );

      await expect(adapter.verifyLogIntegrity(result.eventId)).resolves.toMatchObject({
        valid: true,
      });
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
    });

    it('verifyLogIntegrity reports a hash mismatch when metadata is altered', async () => {
      const result = await adapter.logSecurityEvent(createValidEvent(), createValidTenantContext());
      prisma.writes[0].metadata.modelId = 'forged';

      const verification = await adapter.verifyLogIntegrity(result.eventId);

      expect(verification).toMatchObject({ valid: false, reason: 'HASH_MISMATCH' });
    });

    it.each(['integrityHash', 'signature'])(
      'verifyLogIntegrity reports a multibyte %s of the right length as invalid, not a throw',
      async (field) => {
        const result = await adapter.logSecurityEvent(
          createValidEvent(),
          createValidTenantContext()
        );
        // 64 characters, like a hex digest, but 128 UTF-8 bytes.
        prisma.writes[0].metadata.audit[field] = 'é'.repeat(64);

        await expect(adapter.verifyLogIntegrity(result.eventId)).resolves.toMatchObject({
          valid: false,
        });
      }
    );

    it('hashes mixed-case and unicode keys byte-identically to the default sort order', () => {
      // Stored chains were hashed with keys in a default sort() order: UTF-16 code
      // units, not locale and not code points (so the emoji's surrogate sorts before
      // U+FB00). The explicit comparator must reproduce that order exactly.
      const defaultSortOrder = [
        'A',
        'B',
        'Z',
        '_x',
        'a',
        'b',
        'e',
        'z1',
        'z10',
        'z2',
        '\u00c4',
        '\u00c9',
        '\u00df',
        '\u00e4',
        '\u00e9',
        '\u4e2d',
        '\ud83d\ude00',
        '\ufb00',
      ];
      const scrambled = [...defaultSortOrder].reverse();
      const valueOf = (k: string) => defaultSortOrder.indexOf(k);
      const build = (order: string[]) => Object.fromEntries(order.map((k) => [k, valueOf(k)]));
      const ordered = build(defaultSortOrder);
      const row = {
        eventType: 'AI_GUARDRAIL_TRIGGERED',
        tenantId: 'tenant-123',
        timestamp: '2026-10-27T00:00:00.000Z',
        metadata: { ...build(scrambled), inner: build(scrambled), audit: { previousHash: 'p' } },
      };

      // The canonical bytes, written out in the stored order (no sort involved);
      // 'inner' falls between 'e' and 'z1'.
      const [beforeInner, afterInner] = [defaultSortOrder.slice(0, 7), defaultSortOrder.slice(7)];
      const canonical = JSON.stringify({
        eventType: row.eventType,
        metadata: { ...build(beforeInner), inner: ordered, ...build(afterInner) },
        previousHash: 'p',
        tenantId: row.tenantId,
        timestamp: row.timestamp,
      });
      const expected = createHmac('sha256', signingKey).update(canonical).digest('hex');

      expect((adapter as any).computeHash(row)).toBe(expected);
    });

    it('verifyLogIntegrity returns valid=true for untampered entries, whatever the key order', async () => {
      const event = createValidEvent();
      const result = await adapter.logSecurityEvent(
        {
          ...event,
          metadata: {
            ...event.metadata,
            details: { operation: 'scoreLead', nested: { b: 1, a: 2 } },
          },
        },
        createValidTenantContext()
      );

      const verification = await adapter.verifyLogIntegrity(result.eventId);

      expect(verification.valid).toBe(true);
      expect(verification.signatureValid).toBe(true);
    });

    it('starts hash chain with GENESIS', async () => {
      const freshAdapter = new DurableAuditLogAdapter(prisma as any, signingKey);
      await freshAdapter.logSecurityEvent(createValidEvent(), createValidTenantContext());

      expect(prisma.writes[0].metadata.audit.previousHash).toBe('GENESIS');
    });

    it('does not advance the chain when the write fails', async () => {
      prisma.tx.auditLogEntry.create.mockRejectedValueOnce(new Error('db down'));
      await expect(
        adapter.logSecurityEvent(createValidEvent(), createValidTenantContext())
      ).rejects.toThrow('db down');

      await adapter.logSecurityEvent(createValidEvent(), createValidTenantContext());
      expect(prisma.writes[0].metadata.audit.previousHash).toBe('GENESIS');
    });
  });

  describe('GDPR retention (Decision 5)', () => {
    it('calculates 7-year retention for EU jurisdiction', async () => {
      const context = { ...createValidTenantContext(), jurisdiction: 'EU' as const };
      await adapter.logSecurityEvent(createValidEvent(), context);

      const retentionExpiresAt: Date = prisma.writes[0].retentionExpiresAt;
      const sevenYearsFromNow = new Date();
      sevenYearsFromNow.setUTCFullYear(sevenYearsFromNow.getUTCFullYear() + 7);

      // Allow 1 day tolerance
      const diff = Math.abs(retentionExpiresAt.getTime() - sevenYearsFromNow.getTime());
      expect(diff).toBeLessThan(24 * 60 * 60 * 1000);
    });

    it('calculates retention based on jurisdiction', async () => {
      const jurisdictions = ['EU', 'UK', 'US', 'GLOBAL'] as const;

      for (const [i, jurisdiction] of jurisdictions.entries()) {
        await adapter.logSecurityEvent(createValidEvent(), {
          ...createValidTenantContext(),
          jurisdiction,
        });

        // All jurisdictions should use 7-year retention for security events
        expect(prisma.writes[i].retentionExpiresAt.getUTCFullYear()).toBe(
          new Date().getUTCFullYear() + 7
        );
      }
    });

    it('encrypts PII fields before persistence', async () => {
      const event = {
        ...createValidEvent(),
        metadata: { ...createValidEvent().metadata, dataSubjectId: 'sensitive-subject-id-123' },
      };
      adapter = new DurableAuditLogAdapter(prisma as any, signingKey, { encryptPII: true });
      await adapter.logSecurityEvent(event, createValidTenantContext());

      expect(prisma.writes[0].metadata.dataSubjectId).toBeDefined();
      expect(prisma.writes[0].metadata.dataSubjectId).not.toBe('sensitive-subject-id-123');
    });
  });

  describe('Concurrent safety', () => {
    it('handles concurrent events without data loss', async () => {
      const context = createValidTenantContext();
      const events = Array.from({ length: 10 }, (_, i) => ({
        ...createValidEvent(),
        description: `Event ${i}`,
      }));

      const results = await Promise.all(events.map((e) => adapter.logSecurityEvent(e, context)));

      expect(results.filter((r) => r.status === 'PERSISTED')).toHaveLength(10);
      expect(prisma.writes).toHaveLength(10);
    });

    it('maintains an unforked hash chain under concurrent writes', async () => {
      const context = createValidTenantContext();
      const events = Array.from({ length: 5 }, (_, i) => ({
        ...createValidEvent(),
        description: `Event ${i}`,
      }));

      await Promise.all(events.map((e) => adapter.logSecurityEvent(e, context)));

      const previous = prisma.writes.map((w) => w.metadata.audit.previousHash);
      const hashes = prisma.writes.map((w) => w.metadata.audit.integrityHash);
      expect(previous[0]).toBe('GENESIS');
      for (let i = 1; i < previous.length; i++) {
        expect(previous[i]).toBe(hashes[i - 1]);
      }
    });
  });

  describe('Error handling', () => {
    it('returns EVENT_NOT_FOUND when the event is missing in verifyLogIntegrity', async () => {
      const verification = await adapter.verifyLogIntegrity('non-existent-event');

      expect(verification.valid).toBe(false);
      expect(verification.reason).toBe('EVENT_NOT_FOUND');
    });

    it('returns EVENT_NOT_FOUND for an audit row this adapter did not write', async () => {
      prisma.auditLogEntry.findFirst.mockResolvedValueOnce({ eventId: 'e', metadata: {} });

      const verification = await adapter.verifyLogIntegrity('e');

      expect(verification.reason).toBe('EVENT_NOT_FOUND');
    });
  });

  describe('Batch operations', () => {
    it('logBatchEvents persists all events in single transaction', async () => {
      const events = [createValidEvent(), createValidEvent(), createValidEvent()];

      const result = await adapter.logBatchEvents(events, createValidTenantContext());

      // Batch should use a single transaction
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(result.totalEvents).toBe(3);
      expect(result.successCount).toBe(3);
      expect(prisma.writes.map((w) => w.metadata.audit.previousHash)[1]).toBe(
        prisma.writes[0].metadata.audit.integrityHash
      );
    });

    it('counts a cross-tenant event as a failure', async () => {
      const result = await adapter.logBatchEvents(
        [createValidEvent(), { ...createValidEvent(), tenantId: 'tenant-other' }],
        createValidTenantContext()
      );

      expect(result).toMatchObject({ totalEvents: 2, successCount: 1, failureCount: 1 });
      expect(result.results.map((r) => r.status)).toEqual(['PERSISTED', 'FAILED']);
      expect(prisma.writes).toHaveLength(1);
    });

    it('reports every event FAILED and keeps the chain head when the batch rolls back', async () => {
      // A failed statement aborts the whole Postgres transaction, so rows written
      // before it are rolled back too and must not be reported as persisted.
      prisma.tx.auditLogEntry.create
        .mockImplementationOnce(async (args: { data: any }) => args.data)
        .mockRejectedValueOnce(new Error('insert failed'));
      prisma.$transaction.mockImplementationOnce(async (callback: (t: any) => Promise<any>) => {
        await callback(prisma.tx); // rejects on the second insert, like a rolled-back tx
      });

      const result = await adapter.logBatchEvents(
        [createValidEvent(), createValidEvent(), createValidEvent()],
        createValidTenantContext()
      );

      expect(result).toMatchObject({ totalEvents: 3, successCount: 0, failureCount: 3 });
      expect(result.results.every((r) => r.status === 'FAILED')).toBe(true);

      await adapter.logSecurityEvent(createValidEvent(), createValidTenantContext());
      expect(prisma.writes.at(-1).metadata.audit.previousHash).toBe('GENESIS');
    });

    it('skips a batch for a fallback tenant without failing it', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const event = { ...createValidEvent(), tenantId: 'default' };
      const result = await adapter.logBatchEvents([event, event], {
        ...createValidTenantContext(),
        tenantId: 'default',
      });

      expect(result).toMatchObject({ totalEvents: 2, successCount: 0, failureCount: 0 });
      expect(result.results.map((r) => r.status)).toEqual(['SKIPPED', 'SKIPPED']);
      expect(prisma.writes).toHaveLength(0);
    });
  });
});
