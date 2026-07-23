/**
 * Transaction manager adapter tests (ENG-OPS-002 DDD-001/002).
 *
 * Covers the two {@link TransactionPort} implementations:
 *  - PrismaTransactionManager: delegates to `@intelliflow/db`'s `withTransaction`,
 *    threading the Prisma transaction client through as the opaque handle and
 *    propagating rollback (thrown errors).
 *  - InMemoryTransactionManager: a no-atomicity test double that still exercises
 *    the same `run(tx => …)` code path.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock @intelliflow/db BEFORE importing the adapter so the real withTransaction
// (which opens a real Prisma transaction) is never invoked. Mirrors the pattern
// in events/__tests__/OutboxEventBusAdapter.impl.test.ts.
vi.mock('@intelliflow/db', () => ({
  withTransaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
    const mockTx = { __mockTransactionClient: true };
    return callback(mockTx);
  }),
}));

import { withTransaction } from '@intelliflow/db';
import { PrismaTransactionManager } from '../PrismaTransactionManager';
import { InMemoryTransactionManager } from '../InMemoryTransactionManager';

describe('PrismaTransactionManager', () => {
  beforeEach(() => {
    vi.mocked(withTransaction).mockClear();
  });

  it('runs work inside a single withTransaction call and returns its result', async () => {
    const mgr = new PrismaTransactionManager();
    const work = vi.fn(async () => 'result-value');

    const result = await mgr.run(work);

    expect(result).toBe('result-value');
    expect(withTransaction).toHaveBeenCalledTimes(1);
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('threads the Prisma transaction client through to work as the opaque handle', async () => {
    const mgr = new PrismaTransactionManager();
    let received: unknown;
    const work = vi.fn(async (tx: unknown) => {
      received = tx;
      return 1;
    });

    await mgr.run(work);

    expect(received).toEqual({ __mockTransactionClient: true });
  });

  it('propagates errors so the transaction rolls back (nothing is swallowed)', async () => {
    const mgr = new PrismaTransactionManager();
    const boom = new Error('write failed');

    await expect(
      mgr.run(async () => {
        throw boom;
      })
    ).rejects.toBe(boom);
    expect(withTransaction).toHaveBeenCalledTimes(1);
  });
});

describe('InMemoryTransactionManager', () => {
  it('invokes work with a sentinel handle and returns its result — no real DB', async () => {
    const mgr = new InMemoryTransactionManager();
    let received: unknown = 'unset';
    const work = vi.fn(async (tx: unknown) => {
      received = tx;
      return 'ok';
    });

    const result = await mgr.run(work);

    expect(result).toBe('ok');
    expect(work).toHaveBeenCalledTimes(1);
    // Sentinel handle is a plain object (no real transaction / atomicity).
    expect(received).toEqual({});
  });

  it('propagates errors from work', async () => {
    const mgr = new InMemoryTransactionManager();
    const boom = new Error('boom');

    await expect(
      mgr.run(async () => {
        throw boom;
      })
    ).rejects.toBe(boom);
  });
});
