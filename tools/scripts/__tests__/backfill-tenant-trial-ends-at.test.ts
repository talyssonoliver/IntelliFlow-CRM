/**
 * Tests for the #1220 trial-end backfill (ADR-069 Class B). The Prisma client is a fake,
 * so nothing here touches a database: it pins which tenants qualify, that a dry run writes
 * nothing, that --apply needs the deploy date, and that every write repeats the rule.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../packages/db/generated/prisma/client', () => ({
  PrismaClient: vi.fn(function PrismaClient() {
    return {};
  }),
}));
vi.mock('@prisma/adapter-pg', () => ({
  PrismaPg: vi.fn(function PrismaPg() {
    return {};
  }),
}));

import { parseArgs, trialEndFrom, eligibleWhere, run } from '../backfill-tenant-trial-ends-at';

const START = new Date('2026-11-10T00:00:00Z');

function fakePrisma(tenants: Array<{ id: string }>, paying: string[] = []) {
  return {
    stripeSubscription: {
      findMany: vi.fn().mockResolvedValue(paying.map((tenantId) => ({ tenantId }))),
    },
    tenant: {
      findMany: vi.fn().mockResolvedValue(
        tenants.map((t) => ({
          ...t,
          slug: t.id,
          plan: 'STARTER',
          createdAt: new Date('2026-06-16'),
        }))
      ),
      updateMany: vi.fn().mockResolvedValue({ count: tenants.length }),
    },
  };
}

describe('parseArgs', () => {
  it('defaults to a dry run with no start date', () => {
    expect(parseArgs(['node', 'script'])).toEqual({ isApply: false, start: undefined });
  });

  it('reads --apply and --start', () => {
    expect(parseArgs(['node', 'script', '--start', '2026-11-10', '--apply'])).toEqual({
      isApply: true,
      start: START,
    });
  });

  it('refuses a start that is not a date, rather than using now', () => {
    expect(() => parseArgs(['node', 'script', '--start', 'tomorrow'])).toThrow(/not a date/);
  });
});

describe('trialEndFrom', () => {
  it('ends 14 days after the start', () => {
    expect(trialEndFrom(START).toISOString()).toBe('2026-11-24T00:00:00.000Z');
  });
});

describe('eligibleWhere', () => {
  it('covers only direct, non-partner tenants with no stored end and no live subscription', () => {
    expect(eligibleWhere(['paying-1'])).toEqual({
      trialEndsAt: null,
      source: 'DIRECT',
      plan: { not: 'PARTNER_FREE' },
      id: { notIn: ['paying-1'] },
    });
  });
});

describe('run', () => {
  const log = vi.fn();
  beforeEach(() => log.mockReset());

  it('dry run: counts and lists, writes nothing', async () => {
    const prisma = fakePrisma([{ id: 't1' }, { id: 't2' }]);

    const n = await run(prisma as never, { isApply: false, start: START }, log);

    expect(n).toBe(2);
    expect(prisma.tenant.updateMany).not.toHaveBeenCalled();
    expect(log.mock.calls[0][0]).toContain('mode=DRY-RUN');
    expect(log.mock.calls[0][0]).toContain('trialEndsAt=2026-11-24T00:00:00.000Z');
  });

  it('leaves paying tenants out of the selection', async () => {
    const prisma = fakePrisma([{ id: 't1' }], ['paying-1', 'paying-1']);

    await run(prisma as never, { isApply: false, start: START }, log);

    expect(prisma.stripeSubscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: { in: ['ACTIVE', 'PAST_DUE'] } } })
    );
    expect(prisma.tenant.findMany.mock.calls[0][0].where.id).toEqual({ notIn: ['paying-1'] });
  });

  it('refuses --apply without the deploy date', async () => {
    const prisma = fakePrisma([{ id: 't1' }]);

    await expect(run(prisma as never, { isApply: true, start: undefined }, log)).rejects.toThrow(
      /--start/
    );
    expect(prisma.tenant.updateMany).not.toHaveBeenCalled();
  });

  it('apply: writes start + 14 days, repeating the rule in the WHERE', async () => {
    const prisma = fakePrisma([{ id: 't1' }, { id: 't2' }], ['paying-1']);

    const n = await run(prisma as never, { isApply: true, start: START }, log);

    expect(n).toBe(2);
    expect(prisma.tenant.updateMany).toHaveBeenCalledWith({
      where: {
        AND: [eligibleWhere(['paying-1']), { id: { in: ['t1', 't2'] } }],
      },
      data: { trialEndsAt: new Date('2026-11-24T00:00:00Z') },
    });
  });

  it('apply with nothing to do writes nothing', async () => {
    const prisma = fakePrisma([]);

    expect(await run(prisma as never, { isApply: true, start: START }, log)).toBe(0);
    expect(prisma.tenant.updateMany).not.toHaveBeenCalled();
  });
});
