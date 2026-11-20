import { describe, expect, it, vi } from 'vitest';
import { parseArgs, planCleanup, runCleanup } from '../clean-activity-ids';

const ID = 'c' + 'mw5j72u40001p5ug01kf3vot';

type Row = { id: string; tenantId: string; title: string; description: string | null };

function fakePrisma(rows: Row[]) {
  const update = vi.fn(async () => ({}));
  const findMany = vi.fn(async (q: { take: number; cursor?: { id: string }; skip?: number }) => {
    const start = q.cursor ? rows.findIndex((r) => r.id === q.cursor!.id) + (q.skip ?? 0) : 0;
    return rows.slice(start, start + q.take);
  });
  return { prisma: { leadActivity: { findMany, update } } as never, update, findMany };
}

const dirty: Row = {
  id: 'a1',
  tenantId: 't1',
  title: 'Price follow-up sent',
  description: `Offer GBP 0. COA ledger row ${ID}.`,
};
const clean: Row = { id: 'a2', tenantId: 't1', title: 'Call', description: 'Spoke to owner' };

describe('planCleanup', () => {
  it('returns the cleaned text for a row with an id', () => {
    expect(planCleanup(dirty)).toEqual({
      title: 'Price follow-up sent',
      description: 'Offer GBP 0.',
    });
  });

  it('returns null for a clean row and for a null description', () => {
    expect(planCleanup(clean)).toBeNull();
    expect(planCleanup({ title: 'Call', description: null })).toBeNull();
  });

  it('never empties a title', () => {
    expect(planCleanup({ title: ID, description: '' })).toBeNull();
  });
});

describe('parseArgs', () => {
  it('reads the flags', () => {
    expect(parseArgs(['--apply', '--tenant', 't1', '--lead', 'l1'])).toEqual({
      isApply: true,
      tenantFilter: 't1',
      leadFilter: 'l1',
    });
    expect(parseArgs([])).toEqual({
      isApply: false,
      tenantFilter: undefined,
      leadFilter: undefined,
    });
  });
});

describe('runCleanup', () => {
  const args = { isApply: false, tenantFilter: undefined, leadFilter: undefined };

  it('writes nothing in a dry run', async () => {
    const { prisma, update } = fakePrisma([dirty, clean]);
    const totals = { cleaned: 0, skipped: 0 };
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await runCleanup(prisma, args, totals);

    expect(totals).toEqual({ cleaned: 1, skipped: 1 });
    expect(update).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it('updates the row by id and tenant with --apply, and a re-run changes nothing', async () => {
    const rows = [{ ...dirty }, { ...clean }];
    const { prisma, update } = fakePrisma(rows);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await runCleanup(prisma, { ...args, isApply: true }, { cleaned: 0, skipped: 0 });

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'a1', tenantId: 't1' },
      data: { title: 'Price follow-up sent', description: 'Offer GBP 0.' },
    });

    rows[0] = { ...dirty, description: 'Offer GBP 0.' };
    const again = fakePrisma(rows);
    const totals = { cleaned: 0, skipped: 0 };
    await runCleanup(again.prisma, { ...args, isApply: true }, totals);
    expect(totals.cleaned).toBe(0);
    expect(again.update).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it('scopes the scan to a tenant and a lead', async () => {
    const { prisma, findMany } = fakePrisma([]);
    await runCleanup(
      prisma,
      { isApply: false, tenantFilter: 't9', leadFilter: 'l9' },
      { cleaned: 0, skipped: 0 }
    );
    expect(findMany.mock.calls[0]![0]).toMatchObject({ where: { tenantId: 't9', leadId: 'l9' } });
  });

  it('walks more than one batch', async () => {
    const many: Row[] = Array.from({ length: 205 }, (_, i) => ({
      id: `r${String(i).padStart(3, '0')}`,
      tenantId: 't1',
      title: 'Call',
      description: '',
    }));
    const { prisma, findMany } = fakePrisma(many);
    const totals = { cleaned: 0, skipped: 0 };
    await runCleanup(prisma, args, totals);
    expect(totals.skipped).toBe(205);
    expect(findMany).toHaveBeenCalledTimes(2);
  });
});
