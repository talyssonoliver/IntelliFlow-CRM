/**
 * PG-203 — the scoring guard and the dispatcher filter (owner Q18; plan should-fix 7).
 */
import { describe, it, expect, vi } from 'vitest';
import {
  scorableLeads,
  scoringBlockedBy,
  writeContactIfStillEligible,
  writeIfStillEligible,
} from '../data-request-guard';

function prismaWith(opts: {
  lead?: { email: string } | null;
  restriction?: { id: string } | null;
  restricted?: string[];
}) {
  return {
    lead: { findFirst: vi.fn().mockResolvedValue(opts.lead ?? null) },
    processingRestriction: {
      findFirst: vi.fn().mockResolvedValue(opts.restriction ?? null),
      findMany: vi
        .fn()
        .mockResolvedValue((opts.restricted ?? []).map((subjectEmail) => ({ subjectEmail }))),
    },
  };
}

const job = { leadId: 'l1', tenantId: 't1', email: ' Ada@Example.invalid ' };

describe('scoringBlockedBy', () => {
  it('allows a lead whose stored email matches and is not restricted', async () => {
    const prisma = prismaWith({ lead: { email: 'ada@example.invalid' } });
    await expect(scoringBlockedBy(prisma, job)).resolves.toBeNull();
  });

  it.each([
    ['LEAD_MISSING', { lead: null }],
    ['ERASED', { lead: { email: 'erased-l1@erased.invalid' } }],
    ['EMAIL_CHANGED', { lead: { email: 'new@example.invalid' } }],
    ['RESTRICTED', { lead: { email: 'ADA@example.invalid' }, restriction: { id: 'r1' } }],
  ] as const)('blocks %s', async (reason, opts) => {
    await expect(scoringBlockedBy(prismaWith(opts), job)).resolves.toBe(reason);
  });

  it('does not look up a restriction for an erased lead', async () => {
    const prisma = prismaWith({ lead: { email: 'erased-l1@erased.invalid' } });
    await scoringBlockedBy(prisma, job);
    expect(prisma.processingRestriction.findFirst).not.toHaveBeenCalled();
  });
});

describe('scorableLeads', () => {
  it('drops erased and restricted people, keeps everyone else', async () => {
    const prisma = prismaWith({ restricted: ['bob@example.invalid'] });
    const leads = [
      { id: '1', email: 'ada@example.invalid' },
      { id: '2', email: 'Bob@Example.invalid' },
      { id: '3', email: 'erased-3@erased.invalid' },
    ];
    await expect(scorableLeads(prisma, 't1', leads)).resolves.toEqual([leads[0]]);
    expect(prisma.processingRestriction.findMany).toHaveBeenCalledWith({
      where: { tenantId: 't1', liftedAt: null },
      select: { subjectEmail: true },
    });
  });
});

describe('writeIfStillEligible (codex: no insight written after an erasure)', () => {
  function locking(lockedEmail: string | null, restricted = false) {
    const tx = {
      $queryRaw: vi.fn(async () => (lockedEmail ? [{ email: lockedEmail }] : [])),
      processingRestriction: {
        findFirst: vi.fn().mockResolvedValue(restricted ? { id: 'r1' } : null),
      },
    };
    return { tx, prisma: { $transaction: vi.fn(async (fn: any) => fn(tx)) } };
  }

  it('writes under the lead row lock when the person is still eligible', async () => {
    const { tx, prisma } = locking('ada@example.invalid');
    const write = vi.fn().mockResolvedValue('saved');
    await expect(writeIfStillEligible(prisma, job, write)).resolves.toEqual({
      written: true,
      value: 'saved',
    });
    expect(write).toHaveBeenCalledWith(tx);
    expect((tx.$queryRaw.mock.calls[0] as any)[0].join('?')).toContain('FOR UPDATE');
    // Then the address lock, before the restriction is read (codex race).
    const [lockSql, ...lockArgs] = tx.$queryRaw.mock.calls[1] as any[];
    expect(lockSql.join('?')).toContain('dsar_subject_lock(');
    expect(lockArgs).toEqual(['t1', 'ada@example.invalid']);
    expect(tx.$queryRaw.mock.invocationCallOrder[1]).toBeLessThan(
      tx.processingRestriction.findFirst.mock.invocationCallOrder[0]!
    );
  });

  it.each([
    ['LEAD_MISSING', null, false],
    ['ERASED', 'erased-l1@erased.invalid', false],
    ['EMAIL_CHANGED', 'new@example.invalid', false],
    ['RESTRICTED', 'ada@example.invalid', true],
  ] as const)('writes nothing when %s', async (reason, email, restricted) => {
    const { prisma } = locking(email, restricted);
    const write = vi.fn();
    await expect(writeIfStillEligible(prisma, job, write)).resolves.toEqual({
      written: false,
      reason,
    });
    expect(write).not.toHaveBeenCalled();
  });
});

describe('writeContactIfStillEligible', () => {
  it('locks the contact row and writes only for the same, unrestricted address', async () => {
    const tx = {
      $queryRaw: vi.fn(async () => [{ email: 'ADA@example.invalid' }]),
      processingRestriction: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const prisma = { $transaction: vi.fn(async (fn: any) => fn(tx)) };
    const write = vi.fn().mockResolvedValue(undefined);
    await expect(
      writeContactIfStillEligible(
        prisma,
        { contactId: 'c1', tenantId: 't1', email: 'ada@example.invalid' },
        write
      )
    ).resolves.toEqual({ written: true, value: undefined });
    expect((tx.$queryRaw.mock.calls[0] as any)[0].join('?')).toContain('FROM contacts');
    tx.$queryRaw.mockResolvedValueOnce([]);
    await expect(
      writeContactIfStillEligible(
        prisma,
        { contactId: 'gone', tenantId: 't1', email: 'ada@example.invalid' },
        write
      )
    ).resolves.toEqual({ written: false, reason: 'LEAD_MISSING' });
  });
});
