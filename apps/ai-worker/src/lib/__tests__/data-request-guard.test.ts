/**
 * PG-203 — the scoring guard and the dispatcher filter (owner Q18; plan should-fix 7).
 */
import { describe, it, expect, vi } from 'vitest';
import {
  dealContactIds,
  eligibleSubjectEmail,
  eligibleSubjects,
  scorableLeads,
  scoringBlockedBy,
  writeContactIfStillEligible,
  writeIfQueuedAddressStillClear,
  writeIfStillEligible,
  writeSubjectIfStillEligible,
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

describe('writeIfQueuedAddressStillClear (codex HIGH: a deal with no contact)', () => {
  function addressTx(opts: { restricted?: boolean; erasureCompleted?: boolean } = {}) {
    const tx = {
      $queryRaw: vi.fn(async () => [{ locked: 1 }]),
      processingRestriction: {
        findFirst: vi.fn().mockResolvedValue(opts.restricted ? { id: 'r1' } : null),
      },
      dsarRequest: {
        findFirst: vi.fn().mockResolvedValue(opts.erasureCompleted ? { id: 'd1' } : null),
      },
    };
    return { tx, prisma: { $transaction: vi.fn(async (fn: any) => fn(tx)) } };
  }
  const queued = { tenantId: 't1', email: ' Ada@Example.invalid ' };

  it('takes the address lock, then re-checks, then writes', async () => {
    const { tx, prisma } = addressTx();
    const write = vi.fn().mockResolvedValue('kept');
    await expect(writeIfQueuedAddressStillClear(prisma, queued, write)).resolves.toEqual({
      written: true,
      value: 'kept',
    });
    expect(write).toHaveBeenCalledWith(tx);
    const [lockSql, ...lockArgs] = tx.$queryRaw.mock.calls[0] as any[];
    expect(lockSql.join('?')).toContain('dsar_subject_lock(');
    expect(lockArgs).toEqual(['t1', 'ada@example.invalid']);
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.processingRestriction.findFirst.mock.invocationCallOrder[0]!
    );
  });

  it.each([
    ['restricted', { restricted: true }],
    ['the subject of a completed erasure', { erasureCompleted: true }],
  ])('writes nothing when the address is %s', async (_label, opts) => {
    const { prisma } = addressTx(opts);
    const write = vi.fn();
    await expect(writeIfQueuedAddressStillClear(prisma, queued, write)).resolves.toEqual({
      written: false,
      reason: 'RESTRICTED',
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

describe('insight and prediction subjects (#1002)', () => {
  function subjects(rows: { leads?: SubjectRows; contacts?: SubjectRows; restricted?: string[] }) {
    const table = (map: SubjectRows = {}) => ({
      findFirst: vi.fn(async ({ where }: { where: { id: string } }) =>
        where.id in map ? { email: map[where.id] ?? null } : null
      ),
      findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in.filter((id) => id in map).map((id) => ({ id, email: map[id] ?? null }))
      ),
    });
    const restricted = rows.restricted ?? [];
    return {
      lead: table(rows.leads),
      contact: table(rows.contacts),
      processingRestriction: {
        findFirst: vi.fn(async ({ where }: { where: { subjectEmail: string } }) =>
          restricted.includes(where.subjectEmail) ? { id: 'r1' } : null
        ),
        findMany: vi.fn(async () => restricted.map((subjectEmail) => ({ subjectEmail }))),
      },
    };
  }
  type SubjectRows = Record<string, string | null>;
  const ref = (kind: 'lead' | 'contact', id: string) => ({ kind, id, tenantId: 't1' });

  it('returns the stored address of an eligible person, empty for a contact without one', async () => {
    const prisma = subjects({ leads: { l1: 'Ada@Example.invalid' }, contacts: { c1: null } });
    await expect(eligibleSubjectEmail(prisma, ref('lead', 'l1'))).resolves.toBe(
      'Ada@Example.invalid'
    );
    await expect(eligibleSubjectEmail(prisma, ref('contact', 'c1'))).resolves.toBe('');
  });

  it.each([
    ['missing', {}],
    ['erased', { leads: { l1: 'erased-l1@erased.invalid' } }],
    ['restricted', { leads: { l1: ' ADA@example.invalid' }, restricted: ['ada@example.invalid'] }],
  ])('returns null for a %s person', async (_label, rows) => {
    await expect(eligibleSubjectEmail(subjects(rows), ref('lead', 'l1'))).resolves.toBeNull();
  });

  it('keeps only eligible people of a batch, with their stored addresses', async () => {
    const prisma = subjects({
      leads: { l1: 'ada@example.invalid', l2: 'Bob@Example.invalid' },
      contacts: { c1: 'erased-c1@erased.invalid', c2: null },
      restricted: ['bob@example.invalid'],
    });
    const result = await eligibleSubjects(prisma, 't1', {
      leadIds: ['l1', 'l2', 'gone'],
      contactIds: ['c1', 'c2'],
    });
    expect([...result.leads]).toEqual([['l1', 'ada@example.invalid']]);
    expect([...result.contacts]).toEqual([['c2', '']]);
  });

  it('does not query a table when the batch has no one of that kind', async () => {
    const prisma = subjects({});
    const result = await eligibleSubjects(prisma, 't1', { leadIds: [], contactIds: [] });
    expect(result.leads.size + result.contacts.size).toBe(0);
    expect(prisma.lead.findMany).not.toHaveBeenCalled();
    expect(prisma.contact.findMany).not.toHaveBeenCalled();
  });

  it.each([
    ['lead', 'FROM leads'],
    ['contact', 'FROM contacts'],
  ] as const)('locks the %s row for the write', async (kind, table) => {
    const tx = {
      $queryRaw: vi.fn(async () => [{ email: 'ada@example.invalid' }]),
      processingRestriction: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const prisma = { $transaction: vi.fn(async (fn: any) => fn(tx)) };
    const write = vi.fn().mockResolvedValue('saved');
    await expect(
      writeSubjectIfStillEligible(
        prisma,
        { ...ref(kind, 'x1'), email: 'ada@example.invalid' },
        write
      )
    ).resolves.toEqual({ written: true, value: 'saved' });
    expect((tx.$queryRaw.mock.calls[0] as any)[0].join('?')).toContain(table);
  });
});

describe('dealContactIds (Q22: a deal follows its contact)', () => {
  it("maps each of the firm's deals to its contact, null when it has none", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: 'd1', contactId: 'c1' },
      { id: 'd2', contactId: null },
    ]);
    const map = await dealContactIds({ opportunity: { findMany } }, 't1', ['d1', 'd2', 'gone']);
    expect([...map]).toEqual([
      ['d1', 'c1'],
      ['d2', null],
    ]);
    expect(findMany).toHaveBeenCalledWith({
      where: { id: { in: ['d1', 'd2', 'gone'] }, tenantId: 't1' },
      select: { id: true, contactId: true },
    });
  });

  it('does not query when there are no deals', async () => {
    const findMany = vi.fn();
    await expect(dealContactIds({ opportunity: { findMany } }, 't1', [])).resolves.toEqual(
      new Map()
    );
    expect(findMany).not.toHaveBeenCalled();
  });
});
