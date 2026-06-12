import { describe, it, expect, vi } from 'vitest';

import { instrumentOperation } from '../query-budget/extension';
import { runWithQueryBudget, getQueryBudgetSnapshot } from '../query-budget/context';

describe('query-budget extension — instrumentOperation', () => {
  it('passes through without counting when no budget context is active', async () => {
    const query = vi.fn(async () => ['row']);

    const result = await instrumentOperation({
      model: 'Lead',
      operation: 'findMany',
      args: { where: { tenantId: 't1' } },
      query,
    });

    expect(result).toEqual(['row']);
    expect(query).toHaveBeenCalledOnce();
    // No active store → nothing recorded.
    expect(getQueryBudgetSnapshot()).toBeUndefined();
  });

  it('counts the operation and fingerprints multi-key args + where shape', async () => {
    const snapshot = await runWithQueryBudget({ budget: 15, context: 'request' }, async () => {
      // Top-level keys deliberately out of alphabetical order (where/take/orderBy)
      // and where keys too (status/tenantId) so both localeCompare sorts run.
      // Issue the identical shape twice so it surfaces as a repeated fingerprint,
      // which is where the value-free shape string is observable.
      for (let i = 0; i < 2; i++) {
        await instrumentOperation({
          model: 'Lead',
          operation: 'findMany',
          args: {
            where: { status: 'open', tenantId: 't1' },
            take: 5,
            orderBy: { createdAt: 'desc' },
          },
          query: async () => [],
        });
      }
      return getQueryBudgetSnapshot();
    });

    expect(snapshot?.count).toBe(2);
    expect(snapshot?.records[0]?.model).toBe('Lead');
    expect(snapshot?.records[0]?.action).toBe('findMany');
    // Fingerprint is value-free and shape-stable: keys sorted alphabetically.
    expect(snapshot?.repeated).toEqual([
      { fingerprint: 'Lead.findMany(orderBy,take,where|status,tenantId)', count: 2 },
    ]);
  });

  it('detects an N+1 when the same query shape repeats within one request', async () => {
    const snapshot = await runWithQueryBudget({ budget: 15, context: 'request' }, async () => {
      for (let i = 0; i < 3; i++) {
        await instrumentOperation({
          model: 'Contact',
          operation: 'findUnique',
          args: { where: { id: `contact-${i}` } },
          query: async () => ({ id: `contact-${i}` }),
        });
      }
      return getQueryBudgetSnapshot();
    });

    expect(snapshot?.count).toBe(3);
    const repeated = snapshot?.repeated ?? [];
    expect(repeated).toHaveLength(1);
    expect(repeated[0]?.fingerprint).toBe('Contact.findUnique(where|id)');
    expect(repeated[0]?.count).toBe(3);
  });

  it('still counts a failed operation and rethrows the original error', async () => {
    const boom = new Error('db exploded');

    await expect(
      runWithQueryBudget({ budget: 15, context: 'request' }, async () => {
        await instrumentOperation({
          model: 'Account',
          operation: 'update',
          args: { where: { id: 'a1' }, data: { name: 'x' } },
          query: async () => {
            throw boom;
          },
        });
      })
    ).rejects.toBe(boom);
  });

  it('handles a raw operation with no model and non-object args', async () => {
    const snapshot = await runWithQueryBudget({ budget: 15, context: 'request' }, async () => {
      for (let i = 0; i < 2; i++) {
        await instrumentOperation({
          operation: '$queryRaw',
          args: undefined,
          query: async () => 1,
        });
      }
      return getQueryBudgetSnapshot();
    });

    expect(snapshot?.count).toBe(2);
    expect(snapshot?.records[0]?.model).toBe('$raw');
    // Empty shape → no key lists at all.
    expect(snapshot?.repeated).toEqual([{ fingerprint: '$raw.$queryRaw()', count: 2 }]);
  });
});
