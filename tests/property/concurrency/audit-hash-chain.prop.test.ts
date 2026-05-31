/**
 * Race-condition test: audit log hash-chain integrity under concurrency.
 *
 * Finding RACE-AUDIT-01. Invariant: "Audit log records critical state changes
 * exactly once" — and the tamper-evident HMAC hash chain must stay a CHAIN.
 *
 * `DurableAuditLogAdapter.previousHash` is shared mutable state: each call reads
 * it BEFORE the persistence `await` and writes it AFTER. Two concurrent
 * `logSecurityEvent` calls both read the same predecessor and persist with the
 * same `previousHash` — forking the chain and destroying tamper-evidence.
 *
 * Pure in-process race (one adapter instance, a fake Prisma client) — no DB.
 *
 * @see docs/operations/property-testing/invariant-ledger.md
 */

import fc from 'fast-check';
import { describe, it, expect } from 'vitest';
import { DurableAuditLogAdapter } from '@intelliflow/adapters/audit/DurableAuditLogAdapter';
import { runConcurrently, expectNoDuplicates, propertyParams } from '../support';

/** Minimal in-memory AuditPrismaClient that records every persisted entry. */
function makeFakePrisma(records: Array<Record<string, unknown>>) {
  const models = {
    securityEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        records.push(data);
        return data;
      },
      findUnique: async () => null,
      update: async () => ({}),
    },
    auditLogEntry: { create: async () => ({}) },
  };
  return {
    ...models,
    // Yields a microtask (like a real tx) before running the callback.
    $transaction: async <T>(cb: (tx: unknown) => Promise<T>): Promise<T> => {
      await Promise.resolve();
      return cb(models);
    },
  };
}

describe('DurableAuditLogAdapter hash chain under concurrency (RACE-AUDIT-01)', () => {
  it('keeps a valid (non-forked) hash chain across N concurrent logSecurityEvent calls', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 2, max: 8 }), async (n) => {
        const records: Array<Record<string, unknown>> = [];
        const prisma = makeFakePrisma(records);
        const signingKey = Buffer.from('property-test-signing-key-32byte', 'utf8');
        const adapter = new DurableAuditLogAdapter(prisma as never, signingKey, {
          encryptPII: false,
        });

        const tenantId = 'tnt_audit_chain';
        const tenantContext = { tenantId, jurisdiction: 'GLOBAL' };
        const event = {
          tenantId,
          eventType: 'AI_PROMPT_INJECTION_DETECTED',
          severity: 'CRITICAL',
          userId: 'user-1',
          resourceType: 'AI',
          resourceId: 'res-1',
          description: 'concurrent audit event',
          metadata: {},
        };

        await runConcurrently(n, () =>
          adapter.logSecurityEvent(event as never, tenantContext as never)
        );

        expect(records.length, 'every event should persist').toBe(n);

        // INVARIANT: a sound hash chain never reuses a previousHash. A fork makes
        // multiple events share the same predecessor (e.g. all 'GENESIS').
        const previousHashes = records.map((r) => String(r.previousHash));
        expectNoDuplicates(previousHashes, (h) => h, 'audit chain previousHash');
      }),
      propertyParams()
    );
  });
});
