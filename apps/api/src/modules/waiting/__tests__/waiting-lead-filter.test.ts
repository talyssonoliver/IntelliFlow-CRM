/**
 * The leads-list "Waiting for reply" filter (waiting-lead-filter.ts) now asks the database for the
 * waiting leads' ids (waiting-sql.ts, leadIdsOnly). That those are exactly the leads the original
 * loader found is proved on a real database in tests/integration/waiting-sql.test.ts.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Prisma } from '@intelliflow/db';
import { loadWaitingLeadIds, waitingSql } from '../waiting-sql';
import { narrowToWaiting } from '../waiting-lead-filter';

const viewer = { tenantId: 't1', userId: 'u1', role: 'USER', teamMemberIds: null };

describe('waitingSql leadIdsOnly', () => {
  const text = (opts: Parameters<typeof waitingSql>[1]) => waitingSql(viewer, opts).text;

  it('selects one column, the lead ids, in the card order, with no totals or person columns', () => {
    const t = text({ leadIdsOnly: true });
    expect(t).toMatch(/SELECT id FROM listed WHERE kind = 'lead' ORDER BY since, id COLLATE "C"/);
    expect(t).not.toContain('count(*) OVER');
    expect(t).not.toContain('"firstName", "lastName", email, company, since');
    expect(t).not.toContain('LIMIT');
  });

  it('shares the card statement: tenant, owner scope, visibility and dismissals', () => {
    const full = waitingSql(viewer, {});
    const ids = waitingSql(viewer, { leadIdsOnly: true });
    const head = (s: Prisma.Sql) =>
      s.text.slice(
        0,
        s.text.indexOf('SELECT kind, id,') >= 0
          ? s.text.indexOf('SELECT kind, id,')
          : s.text.indexOf('SELECT id FROM listed')
      );
    expect(head(ids)).toBe(head(full));
    expect(ids.values).toEqual(full.values);
  });
});

describe('loadWaitingLeadIds', () => {
  const dbOf = (rows: unknown[]) => {
    const order: string[] = [];
    const tx = {
      $executeRaw: vi.fn(async (q: Prisma.Sql) => {
        order.push(`bind:${q.values.join(',')}`);
        return 1;
      }),
      $queryRaw: vi.fn(async () => {
        order.push('query');
        return rows as never;
      }),
    };
    return {
      order,
      tx,
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) as never,
    };
  };

  it('binds the tenant, runs one statement and returns the ids in order', async () => {
    const db = dbOf([{ id: 'a' }, { id: 'b' }]);
    expect(await loadWaitingLeadIds(db, viewer)).toEqual(['a', 'b']);
    expect(db.order).toEqual(['bind:t1', 'query']);
  });

  it('is empty when nobody is waiting', async () => {
    expect(await loadWaitingLeadIds(dbOf([]), viewer)).toEqual([]);
  });
});

describe('narrowToWaiting', () => {
  const ctxOf = (rows: unknown[]) => {
    const db = {
      $transaction: async (fn: (t: unknown) => unknown) =>
        fn({ $executeRaw: async () => 1, $queryRaw: async () => rows }),
    };
    return {
      prismaWithTenant: db,
      tenant: { tenantId: 't1', userId: 'u1', role: 'USER', teamMemberIds: null },
    } as never;
  };

  it('leaves ids alone, and asks the database nothing, when the filter is off', async () => {
    const ctx = ctxOf([]);
    expect(await narrowToWaiting(ctx, { ids: ['x'] })).toEqual(['x']);
    expect(await narrowToWaiting(ctx, {})).toBeUndefined();
    expect(await narrowToWaiting(ctx, { waitingForReply: false, ids: ['x'] })).toEqual(['x']);
  });

  it('returns the waiting leads, and only those within any ids', async () => {
    const ctx = ctxOf([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    expect(await narrowToWaiting(ctx, { waitingForReply: true })).toEqual(['a', 'b', 'c']);
    expect(await narrowToWaiting(ctx, { waitingForReply: true, ids: ['c', 'z', 'a'] })).toEqual([
      'a',
      'c',
    ]);
    expect(await narrowToWaiting(ctxOf([]), { waitingForReply: true })).toEqual([]);
  });
});
