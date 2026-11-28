/**
 * The SQL form of "who is waiting" (waiting-sql.ts): the statement it builds for each viewer scope
 * and how its rows map back to the API shape. That the SQL decides exactly as the original loader
 * does is proved on a real database in tests/integration/waiting-sql.test.ts.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Prisma } from '@intelliflow/db';
import { ZONE_SUFFIX, loadWaitingPage, waitingSql } from '../waiting-sql';
import { waitingRouter } from '../waiting.router';
import { prismaMock, createAdminContext, TEST_UUIDS } from '../../../test/setup';

const viewer = { tenantId: 't1', userId: 'u1', role: 'USER', teamMemberIds: null };

const row = (over: Record<string, unknown> = {}) => ({
  kind: 'lead',
  id: 'lead-1',
  firstName: 'Jane',
  lastName: 'Example',
  email: 'jane@example.invalid',
  company: 'Example Ltd',
  since: new Date('2026-10-10T09:00:00.000Z'),
  subject: 'Quote?',
  unanswered: 2,
  latest: new Date('2026-10-12T09:00:00.000Z'),
  total: 7,
  leadTotal: 5,
  contactTotal: 2,
  ...over,
});

describe('waitingSql', () => {
  const sqlOf = (v: typeof viewer & { role: string }, opts?: { limit?: number }) => {
    const q = waitingSql(v, opts);
    return { text: q.text, values: q.values };
  };

  it('is tenant scoped and binds the tenant and the viewer, never inlines them', () => {
    const { text, values } = sqlOf(viewer);
    expect(text).toContain('"tenantId" = $');
    expect(values).toContain('t1');
    expect(values).toContain('u1');
    expect(text).not.toContain("'t1'");
  });

  it("scopes a rep to their own people, a manager to the team's, an admin to the tenant's", () => {
    expect(sqlOf(viewer).text).toContain('l."ownerId" = $');
    const manager = sqlOf({ ...viewer, role: 'MANAGER', teamMemberIds: ['u2', 'u3'] } as never);
    expect(manager.text).toContain('l."ownerId" IN ($');
    expect(manager.values).toEqual(expect.arrayContaining(['u1', 'u2', 'u3']));
    // A manager with no team falls back to their own, like createTenantWhereClause.
    expect(sqlOf({ ...viewer, role: 'MANAGER', teamMemberIds: [] } as never).text).toContain(
      'l."ownerId" = $'
    );
    const admin = sqlOf({ ...viewer, role: 'ADMIN' });
    expect(admin.text).not.toContain('l."ownerId"');
    expect(admin.text).not.toContain('c."ownerId"');
  });

  it('hides dismissed people, per tenant, by the newest mail the dismissal saw', () => {
    const { text, values } = sqlOf(viewer);
    expect(text).toContain('FROM waiting_dismissals d');
    expect(text).toContain('w.latest <= d."latestAt"');
    expect(text).toContain(`d."personKey" = p.kind || ':' || p.id`);
    expect(values.filter((v) => v === 't1').length).toBeGreaterThanOrEqual(5);
  });

  it('reads mail through the visibility policy and applies the limit only when given', () => {
    expect(sqlOf(viewer).text).toContain('email_mailboxes mb');
    expect(sqlOf(viewer).text).not.toContain('LIMIT');
    const limited = sqlOf(viewer, { limit: 5 });
    expect(limited.text).toMatch(/LIMIT \$\d+\s*$/);
    expect(limited.values.at(-1)).toBe(5);
  });
});

describe('loadWaitingPage', () => {
  /** A client whose transaction hands the callback one connection (`tx`) that records its calls. */
  const dbOf = (rows: unknown[]) => {
    const order: string[] = [];
    const tx = {
      $executeRaw: vi.fn(async (q: Prisma.Sql) => {
        order.push(`bind:${q.values.join(',')}`);
        return 1;
      }),
      $queryRaw: vi.fn(async (_q: Prisma.Sql) => {
        order.push('query');
        return rows as never;
      }),
    };
    return {
      order,
      tx,
      $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)) as never,
      $queryRaw: tx.$queryRaw,
    };
  };

  it('maps rows to items with the totals of everyone waiting', async () => {
    const db = dbOf([
      row(),
      row({ kind: 'contact', id: 'contact-1', firstName: null, lastName: null, company: null }),
    ]);
    const page = await loadWaitingPage(db, viewer, { limit: 2 });
    expect(db.tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(page.total).toBe(7);
    expect(page.leadTotal).toBe(5);
    expect(page.contactTotal).toBe(2);
    expect(page.items[0]).toEqual({
      kind: 'lead',
      id: 'lead-1',
      name: 'Jane Example',
      email: 'jane@example.invalid',
      company: 'Example Ltd',
      since: new Date('2026-10-10T09:00:00.000Z'),
      subject: 'Quote?',
      unanswered: 2,
      latestAt: new Date('2026-10-12T09:00:00.000Z'),
    });
    // No name and no company: the address names them, as the lead's display name does.
    expect(page.items[1]).toMatchObject({ kind: 'contact', name: 'jane@example.invalid' });
  });

  it('binds the tenant for the transaction before the statement, on the same connection', async () => {
    const db = dbOf([row()]);
    await loadWaitingPage(db, viewer);
    expect(db.order).toEqual(['bind:t1', 'query']);
  });

  it('is empty, with zero totals, when nobody is waiting', async () => {
    expect(await loadWaitingPage(dbOf([]), viewer)).toEqual({
      items: [],
      total: 0,
      leadTotal: 0,
      contactTotal: 0,
    });
  });

  it('reads timestamps the driver returns as text (UTC, no zone) as UTC dates', async () => {
    const at = '2026-10-10T09:00:00.000Z';
    for (const since of [
      at,
      '2026-10-10 09:00:00',
      '2026-10-10T09:00:00',
      '2026-10-10T10:00:00+01:00',
    ]) {
      const page = await loadWaitingPage(dbOf([row({ since })]), viewer);
      expect(page.items[0]?.since.toISOString(), since).toBe(at);
    }
  });

  it('turns bigint-ish counts into numbers', async () => {
    const page = await loadWaitingPage(
      dbOf([row({ unanswered: '3', total: '4', leadTotal: '3', contactTotal: '1' })]),
      viewer
    );
    expect(page.items[0]?.unanswered).toBe(3);
    expect([page.total, page.leadTotal, page.contactTotal]).toEqual([4, 3, 1]);
  });
});

describe('ZONE_SUFFIX', () => {
  it.each([
    '2026-10-10T09:00:00Z',
    '2026-10-10T09:00:00z',
    '2026-10-10T10:00:00+01',
    '2026-10-10 10:00:00+0100',
    '2026-10-10T04:00:00-05:30',
  ])('sees the zone at the end of %s', (v) => expect(ZONE_SUFFIX.test(v)).toBe(true));

  it.each(['2026-10-10T09:00:00', '2026-10-10 09:00:00', '2026-10-10 09:00:00.123'])(
    'sees no zone in %s',
    (v) => expect(ZONE_SUFFIX.test(v)).toBe(false)
  );

  it('anchors every alternative: a Z or an offset in the middle is not a zone', () => {
    expect(ZONE_SUFFIX.test('Z2026-10-10T09:00:00')).toBe(false);
    expect(ZONE_SUFFIX.test('2026-10-10Z09:00:00')).toBe(false);
    expect(ZONE_SUFFIX.test('2026-10-10T09:00:00+01:00 later')).toBe(false);
  });
});

describe('waiting.list', () => {
  const call = (input?: { limit: number }) => {
    const ctx = createAdminContext();
    (prismaMock.$queryRaw as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([row()]);
    (prismaMock.$executeRaw as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(1);
    (prismaMock.$transaction as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async (fn: (tx: unknown) => unknown) => fn(prismaMock)
    );
    return waitingRouter.createCaller(ctx as never).list(input);
  };

  it('answers with one statement and defaults the page to five', async () => {
    const out = await call();
    expect(out.items).toHaveLength(1);
    expect(out).toMatchObject({ total: 7, leadTotal: 5, contactTotal: 2 });
    const [q] = (
      prismaMock.$queryRaw as unknown as { mock: { calls: Prisma.Sql[][] } }
    ).mock.calls.at(-1)!;
    expect(q!.values.at(-1)).toBe(5);
    expect(q!.values).toContain(TEST_UUIDS.tenant);
  });

  it('passes the requested limit through', async () => {
    await call({ limit: 12 });
    const [q] = (
      prismaMock.$queryRaw as unknown as { mock: { calls: Prisma.Sql[][] } }
    ).mock.calls.at(-1)!;
    expect(q!.values.at(-1)).toBe(12);
  });
});
