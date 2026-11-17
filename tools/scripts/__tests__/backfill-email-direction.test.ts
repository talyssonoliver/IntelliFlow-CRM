import { describe, it, expect, vi } from 'vitest';
import { parseArgs, planDirectionFix, run, type Totals } from '../backfill-email-direction';

const email = (title: string, metadata: unknown = null) => ({
  type: 'EMAIL',
  title,
  metadata,
});

describe('parseArgs', () => {
  it('is a dry run unless --apply is given, and reads the scope', () => {
    expect(parseArgs(['node', 'x'])).toEqual({
      isApply: false,
      tenantFilter: undefined,
      leadFilter: undefined,
    });
    expect(parseArgs(['node', 'x', '--apply', '--tenant', 't1', '--lead', 'l1'])).toEqual({
      isApply: true,
      tenantFilter: 't1',
      leadFilter: 'l1',
    });
  });

  it('does not take a flag as the value of another', () => {
    expect(parseArgs(['node', 'x', '--tenant', '--apply']).tenantFilter).toBeUndefined();
  });
});

describe('planDirectionFix', () => {
  it('sets inbound on a "Reply received" email with no metadata', () => {
    expect(planDirectionFix(email('Reply received: pricing'))).toEqual({
      metadata: { direction: 'inbound' },
    });
  });

  it('keeps the rest of the metadata', () => {
    expect(
      planDirectionFix(email('Reply received 14/10/2026: hi', { subject: 'Hi', openCount: 2 }))
    ).toEqual({ metadata: { subject: 'Hi', openCount: 2, direction: 'inbound' } });
  });

  it('replaces a direction that is not inbound or outbound', () => {
    expect(planDirectionFix(email('Reply received', { direction: 'sideways', from: 'a' }))).toEqual(
      { metadata: { direction: 'inbound', from: 'a' } }
    );
  });

  it('never touches a row that already has a direction, so a stored one always wins', () => {
    expect(planDirectionFix(email('Reply received: x', { direction: 'inbound' }))).toBeNull();
    expect(planDirectionFix(email('Reply received: x', { direction: 'outbound' }))).toBeNull();
  });

  it('ignores other emails, non-emails and metadata that is not an object', () => {
    expect(planDirectionFix(email('Outreach email sent'))).toBeNull();
    expect(planDirectionFix(email('No reply received yet'))).toBeNull();
    expect(planDirectionFix({ type: 'NOTE', title: 'Reply received', metadata: null })).toBeNull();
    expect(planDirectionFix(email('Reply received', ['x']))).toBeNull();
    expect(planDirectionFix(email('Reply received', 'text'))).toBeNull();
  });

  it('does not change the row it was given', () => {
    const meta = { subject: 'Hi' };
    planDirectionFix(email('Reply received', meta));
    expect(meta).toEqual({ subject: 'Hi' });
  });
});

describe('run', () => {
  const row = (id: string, title: string, metadata: unknown = null) => ({
    id,
    tenantId: 'tenant-1',
    leadId: 'lead-1',
    type: 'EMAIL',
    title,
    metadata,
  });

  function fakePrisma(pages: Array<ReturnType<typeof row>[]>) {
    const findMany = vi.fn(async () => pages.shift() ?? []);
    const update = vi.fn(async () => ({}));
    return { prisma: { leadActivity: { findMany, update } } as never, findMany, update };
  }

  const args = { isApply: false, tenantFilter: undefined, leadFilter: undefined };

  it('writes nothing on a dry run, and counts what it would change', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { prisma, update } = fakePrisma([
      [row('a', 'Reply received: x'), row('b', 'Reply received: y', { direction: 'inbound' })],
    ]);
    const totals: Totals = { fixed: 0, skipped: 0 };

    await run(prisma, args, totals);

    expect(update).not.toHaveBeenCalled();
    expect(totals).toEqual({ fixed: 1, skipped: 1 });
    expect(log).toHaveBeenCalledWith(expect.stringContaining('would set row=a tenant=tenant-1'));
    log.mockRestore();
  });

  it('with --apply writes the merged metadata, keyed on the row id and its tenant', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { prisma, update } = fakePrisma([[row('a', 'Reply received: x', { subject: 'Hi' })]]);
    const totals: Totals = { fixed: 0, skipped: 0 };

    await run(prisma, { ...args, isApply: true }, totals);

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'a', tenantId: 'tenant-1' },
      data: { metadata: { subject: 'Hi', direction: 'inbound' } },
    });
    expect(totals.fixed).toBe(1);
    log.mockRestore();
  });

  it('a second pass over rows already fixed changes nothing (idempotent)', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { prisma, update } = fakePrisma([
      [row('a', 'Reply received: x', { direction: 'inbound' })],
    ]);
    const totals: Totals = { fixed: 0, skipped: 0 };

    await run(prisma, { ...args, isApply: true }, totals);

    expect(update).not.toHaveBeenCalled();
    expect(totals).toEqual({ fixed: 0, skipped: 1 });
    log.mockRestore();
  });

  it('narrows the query by tenant and lead, and only asks for reply emails', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { prisma, findMany } = fakePrisma([[]]);

    await run(prisma, { ...args, tenantFilter: 't9', leadFilter: 'l9' }, { fixed: 0, skipped: 0 });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: 't9',
          leadId: 'l9',
          type: 'EMAIL',
          title: { startsWith: 'Reply received', mode: 'insensitive' },
        },
      })
    );
    log.mockRestore();
  });

  it('walks every batch in id order', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const full = Array.from({ length: 200 }, (_, i) =>
      row(`r${String(i).padStart(3, '0')}`, 'Reply received')
    );
    const { prisma, findMany } = fakePrisma([full, [row('r999', 'Reply received')]]);
    const totals: Totals = { fixed: 0, skipped: 0 };

    await run(prisma, args, totals);

    expect(findMany).toHaveBeenCalledTimes(2);
    expect(findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: { id: 'r199' }, skip: 1 })
    );
    expect(totals.fixed).toBe(201);
    log.mockRestore();
  });
});
