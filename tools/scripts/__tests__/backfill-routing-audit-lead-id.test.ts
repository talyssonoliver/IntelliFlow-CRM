/**
 * Tests for the #770 RoutingAudit.leadId backfill operator script.
 * The Prisma client/adapter are mocked so this never touches a real database;
 * processRow/fetchBatch/main all take a fake `prisma` so the dry-run vs
 * --apply and tenant-scoping behaviour is asserted directly.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const prismaMock = {
  routingAudit: {
    findMany: vi.fn(),
    update: vi.fn(),
  },
  $disconnect: vi.fn(),
};

// vi.fn() needs a `function`, not an arrow, to be usable as a constructor
// (the scripts call `new PrismaClient(...)` / `new PrismaPg(...)`).
vi.mock('../../../packages/db/generated/prisma/client', () => ({
  PrismaClient: vi.fn(function PrismaClient() {
    return prismaMock;
  }),
}));
vi.mock('@prisma/adapter-pg', () => ({
  PrismaPg: vi.fn(function PrismaPg() {
    return {};
  }),
}));

import {
  parseArgs,
  resolveLegacyLeadId,
  processRow,
  fetchBatch,
  main,
  type Totals,
} from '../backfill-routing-audit-lead-id';

describe('parseArgs', () => {
  it('defaults to dry-run with no tenant filter', () => {
    expect(parseArgs(['node', 'backfill-routing-audit-lead-id.ts'])).toEqual({
      isApply: false,
      tenantFilter: undefined,
    });
  });

  it('reads --apply', () => {
    expect(parseArgs(['node', 'script.ts', '--apply']).isApply).toBe(true);
  });

  it('reads --tenant <id>', () => {
    expect(parseArgs(['node', 'script.ts', '--tenant', 'tenant-1']).tenantFilter).toBe('tenant-1');
  });

  it('ignores a trailing --tenant with no value', () => {
    expect(parseArgs(['node', 'script.ts', '--tenant']).tenantFilter).toBeUndefined();
  });
});

describe('resolveLegacyLeadId', () => {
  it('reads details.leadId when it is a string (old assignLead)', () => {
    expect(resolveLegacyLeadId({ leadId: 'lead-1' }, 'ticket-9')).toBe('lead-1');
  });

  it('falls back to ticketId when details.entityType is "lead" (old LeadRoutingService)', () => {
    expect(resolveLegacyLeadId({ entityType: 'lead' }, 'ticket-9')).toBe('ticket-9');
  });

  it('returns null for a real ticket-routing row', () => {
    expect(resolveLegacyLeadId({ entityType: 'ticket', routingMethod: 'skill' }, 'ticket-9')).toBe(
      null
    );
  });

  it('returns null when details is null', () => {
    expect(resolveLegacyLeadId(null, 'ticket-9')).toBe(null);
  });

  it('returns null when details is not an object (malformed legacy data)', () => {
    expect(resolveLegacyLeadId('oops', 'ticket-9')).toBe(null);
  });

  it('does not trust a non-string leadId', () => {
    expect(resolveLegacyLeadId({ leadId: 42 }, 'ticket-9')).toBe(null);
  });
});

describe('processRow', () => {
  const makeAudit = (overrides: Record<string, unknown> = {}) => ({
    id: 'audit-1',
    tenantId: 'tenant-1',
    ticketId: 'ticket-9',
    details: { entityType: 'lead' },
    ...overrides,
  });

  it('counts a ticket-routing row as notLeadRows and never writes', async () => {
    const prisma = { routingAudit: { update: vi.fn() } };
    const totals: Totals = { updated: 0, notLeadRows: 0 };

    await processRow(
      prisma as never,
      makeAudit({ details: { entityType: 'ticket' } }),
      totals,
      true
    );

    expect(totals).toEqual({ updated: 0, notLeadRows: 1 });
    expect(prisma.routingAudit.update).not.toHaveBeenCalled();
  });

  it('dry-run counts the row as updated but never writes', async () => {
    const prisma = { routingAudit: { update: vi.fn() } };
    const totals: Totals = { updated: 0, notLeadRows: 0 };

    await processRow(prisma as never, makeAudit(), totals, false);

    expect(totals).toEqual({ updated: 1, notLeadRows: 0 });
    expect(prisma.routingAudit.update).not.toHaveBeenCalled();
  });

  it('--apply writes leadId scoped to the row id AND its own tenantId', async () => {
    const prisma = { routingAudit: { update: vi.fn().mockResolvedValue({}) } };
    const totals: Totals = { updated: 0, notLeadRows: 0 };

    await processRow(prisma as never, makeAudit(), totals, true);

    expect(prisma.routingAudit.update).toHaveBeenCalledWith({
      where: { id: 'audit-1', tenantId: 'tenant-1' },
      data: { leadId: 'ticket-9' },
    });
  });
});

describe('fetchBatch', () => {
  it('filters on leadId: null, paginates with a cursor, and omits tenantId when unset', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = { routingAudit: { findMany } };

    await fetchBatch(prisma as never, 'cursor-1', undefined);

    expect(findMany).toHaveBeenCalledWith({
      where: { leadId: null },
      take: 200,
      cursor: { id: 'cursor-1' },
      skip: 1,
      orderBy: { id: 'asc' },
    });
  });

  it('scopes to one tenant when --tenant is set, with no cursor on the first page', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = { routingAudit: { findMany } };

    await fetchBatch(prisma as never, undefined, 'tenant-9');

    expect(findMany).toHaveBeenCalledWith({
      where: { leadId: null, tenantId: 'tenant-9' },
      take: 200,
      orderBy: { id: 'asc' },
    });
  });
});

describe('main', () => {
  const ORIGINAL_ARGV = process.argv;
  const ORIGINAL_DATABASE_URL = process.env['DATABASE_URL'];

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.routingAudit.findMany.mockReset();
    prismaMock.routingAudit.update.mockReset();
    prismaMock.$disconnect.mockReset();
  });

  afterEach(() => {
    process.argv = ORIGINAL_ARGV;
    if (ORIGINAL_DATABASE_URL === undefined) delete process.env['DATABASE_URL'];
    else process.env['DATABASE_URL'] = ORIGINAL_DATABASE_URL;
  });

  it('exits 1 and never queries the database when DATABASE_URL is unset', async () => {
    delete process.env['DATABASE_URL'];
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await main();

    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('DATABASE_URL is not set'));
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(prismaMock.routingAudit.findMany).not.toHaveBeenCalled();

    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('paginates with the cursor across a full batch, dry-run by default, and disconnects', async () => {
    process.env['DATABASE_URL'] = 'postgresql://test.example.invalid/db';
    process.argv = ['node', 'backfill-routing-audit-lead-id.ts'];

    const fullPage = Array.from({ length: 200 }, (_, i) => ({
      id: `audit-${i}`,
      tenantId: 't1',
      ticketId: `ticket-${i}`,
      details: { entityType: 'lead' },
    }));
    prismaMock.routingAudit.findMany.mockResolvedValueOnce(fullPage).mockResolvedValueOnce([]);

    await main();

    expect(prismaMock.routingAudit.findMany).toHaveBeenCalledTimes(2);
    // Second page is fetched from the cursor at the end of the first page.
    expect(prismaMock.routingAudit.findMany.mock.calls[1]?.[0]).toMatchObject({
      cursor: { id: 'audit-199' },
    });
    expect(prismaMock.routingAudit.update).not.toHaveBeenCalled();
    expect(prismaMock.$disconnect).toHaveBeenCalled();
  });

  it('--apply writes every resolved row, scoped per tenant', async () => {
    process.env['DATABASE_URL'] = 'postgresql://test.example.invalid/db';
    process.argv = ['node', 'backfill-routing-audit-lead-id.ts', '--apply'];

    prismaMock.routingAudit.findMany
      .mockResolvedValueOnce([
        { id: 'a1', tenantId: 't1', ticketId: 'lead-auto', details: { entityType: 'lead' } },
        { id: 'a2', tenantId: 't1', ticketId: 'ticket-9', details: { entityType: 'ticket' } },
      ])
      .mockResolvedValueOnce([]);
    prismaMock.routingAudit.update.mockResolvedValue({});

    await main();

    expect(prismaMock.routingAudit.update).toHaveBeenCalledTimes(1);
    expect(prismaMock.routingAudit.update).toHaveBeenCalledWith({
      where: { id: 'a1', tenantId: 't1' },
      data: { leadId: 'lead-auto' },
    });
  });
});
