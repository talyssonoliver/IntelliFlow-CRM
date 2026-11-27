import { describe, it, expect, vi } from 'vitest';
import { PrismaActivityFeedRepository } from '../PrismaActivityFeedRepository';
import { sourceTypeWhere, sourceServesType } from '../activity-feed-type-maps';

// MVP-012 (register row 21): a typed filter must narrow each source BEFORE its row limit,
// otherwise recent rows of other types fill the limit and older matching rows vanish.

type Row = { id: string; type: string; timestamp: Date };

/** A findMany that behaves like the database: type filter first, then order, then take. */
function fakeFindMany(rows: Row[], mapRow: (r: Row) => Record<string, unknown>) {
  return vi.fn(async (args: { where: any; take: number }) => {
    const clauses: any[] = args.where.AND?.[0]?.OR ?? [];
    const keep = (r: Row) =>
      clauses.length === 0 ||
      clauses.some((c) =>
        c.type.in ? c.type.in.includes(r.type) : !c.type.notIn.includes(r.type)
      );
    return rows
      .filter(keep)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, args.take)
      .map(mapRow);
  });
}

function build() {
  const day = (n: number) => new Date(Date.UTC(2026, 0, n));
  // 6 recent notes, one old email: with limit 5 the old email used to be cut off.
  const leadRows: Row[] = [
    ...[10, 11, 12, 13, 14, 15].map((n) => ({ id: `n${n}`, type: 'NOTE', timestamp: day(n) })),
    { id: 'old-email', type: 'EMAIL', timestamp: day(1) },
  ];
  const lead = fakeFindMany(leadRows, (r) => ({
    ...r,
    leadId: 'lead-1',
    title: r.id,
    description: null,
    userId: 'u1',
    userName: 'Ann',
    metadata: null,
    lead: {
      id: 'lead-1',
      firstName: 'Jo',
      lastName: 'Doe',
      company: null,
      email: 'jo@example.invalid',
    },
  }));
  const callRows: Row[] = [20, 21, 22, 23, 24, 25].map((n) => ({
    id: `c${n}`,
    type: 'CALL',
    timestamp: day(n),
  }));
  const call = vi.fn(async () =>
    callRows.map((r) => ({
      id: r.id,
      startedAt: r.timestamp,
      direction: 'inbound',
      contactName: null,
      summary: null,
      outcome: null,
      userId: 'u1',
      userName: 'Ann',
      contactId: null,
      toNumber: '000',
      duration: 1,
      status: 'done',
      sentiment: null,
    }))
  );
  const none = () => ({ findMany: vi.fn(async () => []) });
  const prisma = {
    leadActivity: { findMany: lead },
    contactActivity: none(),
    activityEvent: none(),
    ticketActivity: none(),
    emailRecord: none(),
    callRecord: { findMany: call },
    chatMessage: none(),
  } as any;
  return { repo: new PrismaActivityFeedRepository(prisma), lead, call, prisma };
}

describe('PrismaActivityFeedRepository.getUnifiedFeed type filter', () => {
  it('returns an old matching entry that recent entries of other types would have pushed out', async () => {
    const { repo, lead } = build();
    const items = await repo.getUnifiedFeed('t1', 5, null, { types: ['EMAIL'] });

    expect(items.map((i) => i.id)).toEqual(['lead_old-email']);
    expect(lead.mock.calls[0]![0].take).toBe(5);
  });

  it('does not query sources that cannot produce the requested type', async () => {
    const { repo, call, prisma } = build();
    await repo.getUnifiedFeed('t1', 5, null, { types: ['EMAIL'] });

    expect(call).not.toHaveBeenCalled();
    expect(prisma.chatMessage.findMany).not.toHaveBeenCalled();
  });

  it('returns calls, newest first and limited, when filtering on CALL across mixed sources', async () => {
    const { repo } = build();
    const items = await repo.getUnifiedFeed('t1', 3, null, { types: ['CALL'] });

    expect(items.map((i) => i.id)).toEqual(['call_c25', 'call_c24', 'call_c23']);
  });

  it('serves several requested types from one source and skips the sources that cannot', async () => {
    const { repo, lead, call } = build();
    const items = await repo.getUnifiedFeed('t1', 10, null, { types: ['EMAIL', 'CALL'] });

    expect(items.map((i) => i.id)).toContain('lead_old-email');
    expect(items.some((i) => i.id.startsWith('call_'))).toBe(true);
    expect(items.some((i) => i.id.startsWith('lead_n'))).toBe(false);
    expect(lead.mock.calls[0]![0].where.AND[0].OR).toEqual([{ type: { in: ['EMAIL', 'CALL'] } }]);
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('asking for SYSTEM also keeps source types the map does not know', async () => {
    const { repo, lead } = build();
    await repo.getUnifiedFeed('t1', 5, null, { types: ['SYSTEM'] });

    expect(lead.mock.calls[0]![0].where.AND[0].OR).toEqual([
      { type: { in: ['WEB_FORM'] } },
      { type: { notIn: expect.arrayContaining(['WEB_FORM', 'NOTE']) } },
    ]);
  });

  it('keeps the cursor condition next to the type condition', async () => {
    const { repo, lead } = build();
    const cursor = { timestamp: new Date('2026-01-12T00:00:00Z'), id: 'x' };
    await repo.getUnifiedFeed('t1', 5, cursor, { types: ['EMAIL'] });

    const where = lead.mock.calls[0]![0].where;
    expect(where.OR).toHaveLength(2);
    // the type condition and the email-entry scope (register #64)
    expect(where.AND).toHaveLength(2);
  });
  it('applies no type clause without a type filter', async () => {
    const { repo, lead } = build();
    await repo.getUnifiedFeed('t1', 5, null, {});

    // only the email-entry scope (register #64): no viewer, no EMAIL entries
    expect(lead.mock.calls[0]![0].where.AND).toEqual([{ type: { not: 'EMAIL' } }]);
  });
});

describe('activity-feed type helpers', () => {
  const map = { A: 'NOTE', B: 'EMAIL', C: 'SYSTEM' } as const;

  it('lists matching source types, and the unmapped ones when SYSTEM is requested', () => {
    expect(sourceTypeWhere(map, ['NOTE'])).toEqual({ OR: [{ type: { in: ['A'] } }] });
    expect(sourceTypeWhere(map, ['SYSTEM'])).toEqual({
      OR: [{ type: { in: ['C'] } }, { type: { notIn: ['A', 'B', 'C'] } }],
    });
  });

  it('returns undefined without a filter and null when nothing can match', () => {
    expect(sourceTypeWhere(map, undefined)).toBeUndefined();
    expect(sourceTypeWhere(map, [])).toBeUndefined();
    expect(sourceTypeWhere(map, ['CALL'])).toBeNull();
  });

  it('serves a fixed type only when requested or unfiltered', () => {
    expect(sourceServesType('CALL', undefined)).toBe(true);
    expect(sourceServesType('CALL', ['CALL'])).toBe(true);
    expect(sourceServesType('CALL', ['EMAIL'])).toBe(false);
  });
});
