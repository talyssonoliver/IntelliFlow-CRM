/**
 * Tests for the #770 legacy RoutingRule.conditions migration operator script.
 * The Prisma client/adapter are mocked so this never touches a real database;
 * processRow/fetchBatch/main all take a fake `prisma` so the dry-run vs
 * --apply and tenant-scoping behaviour is asserted directly.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const prismaMock = {
  routingRule: {
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
  convertEntry,
  classifyAndConvert,
  logNonArrayActions,
  processRow,
  fetchBatch,
  flipTenantPriorities,
  main,
  type Totals,
} from '../migrate-legacy-routing-rules';

describe('parseArgs', () => {
  it('defaults to dry-run with no tenant filter', () => {
    expect(parseArgs(['node', 'migrate-legacy-routing-rules.ts'])).toEqual({
      isApply: false,
      tenantFilter: undefined,
      flipPriorities: false,
    });
  });

  it('reads --apply and --tenant <id> together', () => {
    expect(parseArgs(['node', 'script.ts', '--tenant', 't1', '--apply'])).toEqual({
      isApply: true,
      tenantFilter: 't1',
      flipPriorities: false,
    });
  });
});

describe('convertEntry', () => {
  it('maps a legacy field alias (score -> leadScore)', () => {
    expect(convertEntry('score', { operator: 'gte', value: 90 })).toEqual({
      field: 'leadScore',
      operator: 'greater_than',
      value: 89,
    });
  });

  it('maps source -> leadSource and passes a canonical field name through', () => {
    expect(convertEntry('source', { operator: 'eq', value: 'WEBSITE' })).toEqual({
      field: 'leadSource',
      operator: 'equals',
      value: 'WEBSITE',
    });
    expect(convertEntry('leadStatus', { operator: 'eq', value: 'NEW' })).toEqual({
      field: 'leadStatus',
      operator: 'equals',
      value: 'NEW',
    });
  });

  it('converts lt as-is (inclusive threshold, no off-by-one needed)', () => {
    expect(convertEntry('score', { operator: 'lt', value: 50 })).toEqual({
      field: 'leadScore',
      operator: 'less_than',
      value: 50,
    });
  });

  it('returns null for gte with a non-number value rather than guessing', () => {
    expect(convertEntry('score', { operator: 'gte', value: 'ninety' })).toBeNull();
  });

  it('returns null for an unknown field alias', () => {
    expect(convertEntry('unknownField', { operator: 'eq', value: 1 })).toBeNull();
  });

  it('returns null for an operator it does not know how to map', () => {
    expect(convertEntry('score', { operator: 'between', value: [1, 2] })).toBeNull();
  });
});

describe('classifyAndConvert', () => {
  it('reports an already-array conditions value unchanged', () => {
    expect(
      classifyAndConvert([{ field: 'leadScore', operator: 'greater_than', value: 80 }])
    ).toEqual({ outcome: 'already-array' });
  });

  it('reports null conditions as malformed', () => {
    expect(classifyAndConvert(null)).toEqual({ outcome: 'malformed' });
  });

  it('reports a non-object, non-array conditions value as malformed', () => {
    expect(classifyAndConvert('oops')).toEqual({ outcome: 'malformed' });
  });

  it('reports an empty keyed object as malformed', () => {
    expect(classifyAndConvert({})).toEqual({ outcome: 'malformed' });
  });

  it('reports unmapped when an entry has no operator field', () => {
    expect(classifyAndConvert({ score: { value: 90 } })).toEqual({ outcome: 'unmapped' });
  });

  it('reports unmapped when any entry fails to convert, even if others would', () => {
    expect(
      classifyAndConvert({
        score: { operator: 'gte', value: 90 },
        other: { operator: 'between', value: [1, 2] },
      })
    ).toEqual({ outcome: 'unmapped' });
  });

  it('converts every entry of a fully-mappable legacy object', () => {
    expect(
      classifyAndConvert({
        score: { operator: 'gte', value: 90 },
        source: { operator: 'eq', value: 'WEBSITE' },
      })
    ).toEqual({
      outcome: 'converted',
      converted: [
        { field: 'leadScore', operator: 'greater_than', value: 89 },
        { field: 'leadSource', operator: 'equals', value: 'WEBSITE' },
      ],
    });
  });
});

describe('logNonArrayActions', () => {
  it('does nothing when actions is already an array', () => {
    const totals: Totals = {
      counts: { converted: 0, 'already-array': 0, unmapped: 0, malformed: 0 },
      nonArrayActions: 0,
    };
    logNonArrayActions({ id: 'r1', tenantId: 't1', actions: [] } as never, totals);
    expect(totals.nonArrayActions).toBe(0);
  });

  it('counts and logs a non-array actions value for a human to look at', () => {
    const totals: Totals = {
      counts: { converted: 0, 'already-array': 0, unmapped: 0, malformed: 0 },
      nonArrayActions: 0,
    };
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    logNonArrayActions({ id: 'r1', tenantId: 't1', actions: { assign: 'x' } } as never, totals);

    expect(totals.nonArrayActions).toBe(1);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('rule=r1 tenant=t1'));
    logSpy.mockRestore();
  });
});

describe('processRow', () => {
  const makeRule = (overrides: Record<string, unknown> = {}) => ({
    id: 'rule-1',
    tenantId: 'tenant-1',
    conditions: { score: { operator: 'gte', value: 90 } },
    actions: [{ type: 'assign_to_team', target: 'sales' }],
    ...overrides,
  });

  it('counts already-array rows and never writes', async () => {
    const prisma = { routingRule: { update: vi.fn() } };
    const totals: Totals = {
      counts: { converted: 0, 'already-array': 0, unmapped: 0, malformed: 0 },
      nonArrayActions: 0,
    };

    await processRow(
      prisma as never,
      makeRule({ conditions: [{ field: 'leadScore', operator: 'greater_than', value: 80 }] }),
      totals,
      true
    );

    expect(totals.counts['already-array']).toBe(1);
    expect(prisma.routingRule.update).not.toHaveBeenCalled();
  });

  it('dry-run counts a convertible row but never writes', async () => {
    const prisma = { routingRule: { update: vi.fn() } };
    const totals: Totals = {
      counts: { converted: 0, 'already-array': 0, unmapped: 0, malformed: 0 },
      nonArrayActions: 0,
    };

    await processRow(prisma as never, makeRule(), totals, false);

    expect(totals.counts.converted).toBe(1);
    expect(prisma.routingRule.update).not.toHaveBeenCalled();
  });

  it('--apply writes the converted conditions scoped to the row id AND its own tenantId', async () => {
    const prisma = { routingRule: { update: vi.fn().mockResolvedValue({}) } };
    const totals: Totals = {
      counts: { converted: 0, 'already-array': 0, unmapped: 0, malformed: 0 },
      nonArrayActions: 0,
    };

    await processRow(prisma as never, makeRule(), totals, true);

    expect(prisma.routingRule.update).toHaveBeenCalledWith({
      where: { id: 'rule-1', tenantId: 'tenant-1' },
      data: { conditions: [{ field: 'leadScore', operator: 'greater_than', value: 89 }] },
    });
  });

  it('also flags a non-array actions value on an otherwise-convertible row', async () => {
    const prisma = { routingRule: { update: vi.fn() } };
    const totals: Totals = {
      counts: { converted: 0, 'already-array': 0, unmapped: 0, malformed: 0 },
      nonArrayActions: 0,
    };

    await processRow(prisma as never, makeRule({ actions: { legacy: 'shape' } }), totals, false);

    expect(totals.counts.converted).toBe(1);
    expect(totals.nonArrayActions).toBe(1);
  });

  it('unmapped/malformed rows are reported but never written, even under --apply', async () => {
    const prisma = { routingRule: { update: vi.fn() } };
    const totals: Totals = {
      counts: { converted: 0, 'already-array': 0, unmapped: 0, malformed: 0 },
      nonArrayActions: 0,
    };

    await processRow(prisma as never, makeRule({ conditions: {} }), totals, true);

    expect(totals.counts.malformed).toBe(1);
    expect(prisma.routingRule.update).not.toHaveBeenCalled();
  });
});

describe('fetchBatch', () => {
  it('paginates with a cursor and leaves `where` undefined with no tenant filter', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = { routingRule: { findMany } };

    await fetchBatch(prisma as never, 'cursor-1', undefined);

    expect(findMany).toHaveBeenCalledWith({
      where: undefined,
      take: 100,
      cursor: { id: 'cursor-1' },
      skip: 1,
      orderBy: { id: 'asc' },
    });
  });

  it('scopes to one tenant when --tenant is set', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = { routingRule: { findMany } };

    await fetchBatch(prisma as never, undefined, 'tenant-9');

    expect(findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-9' },
      take: 100,
      orderBy: { id: 'asc' },
    });
  });
});

describe('main', () => {
  const ORIGINAL_ARGV = process.argv;
  const ORIGINAL_DATABASE_URL = process.env['DATABASE_URL'];

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.routingRule.findMany.mockReset();
    prismaMock.routingRule.update.mockReset();
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
    expect(prismaMock.routingRule.findMany).not.toHaveBeenCalled();

    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('paginates with the cursor across a full batch, dry-run by default, and disconnects', async () => {
    process.env['DATABASE_URL'] = 'postgresql://test.example.invalid/db';
    process.argv = ['node', 'migrate-legacy-routing-rules.ts'];

    const fullPage = Array.from({ length: 100 }, (_, i) => ({
      id: `rule-${i}`,
      tenantId: 't1',
      conditions: [{ field: 'leadScore', operator: 'greater_than', value: 80 }],
      actions: [],
    }));
    prismaMock.routingRule.findMany.mockResolvedValueOnce(fullPage).mockResolvedValueOnce([]);

    await main();

    expect(prismaMock.routingRule.findMany).toHaveBeenCalledTimes(2);
    expect(prismaMock.routingRule.findMany.mock.calls[1]?.[0]).toMatchObject({
      cursor: { id: 'rule-99' },
    });
    expect(prismaMock.routingRule.update).not.toHaveBeenCalled();
    expect(prismaMock.$disconnect).toHaveBeenCalled();
  });

  it('--apply converts a legacy row and leaves an unmapped one untouched', async () => {
    process.env['DATABASE_URL'] = 'postgresql://test.example.invalid/db';
    process.argv = ['node', 'migrate-legacy-routing-rules.ts', '--apply'];

    prismaMock.routingRule.findMany
      .mockResolvedValueOnce([
        {
          id: 'r1',
          tenantId: 't1',
          conditions: { score: { operator: 'gte', value: 90 } },
          actions: [],
        },
        {
          id: 'r2',
          tenantId: 't1',
          conditions: { other: { operator: 'between', value: [1, 2] } },
          actions: [],
        },
      ])
      .mockResolvedValueOnce([]);
    prismaMock.routingRule.update.mockResolvedValue({});

    await main();

    expect(prismaMock.routingRule.update).toHaveBeenCalledTimes(1);
    expect(prismaMock.routingRule.update).toHaveBeenCalledWith({
      where: { id: 'r1', tenantId: 't1' },
      data: { conditions: [{ field: 'leadScore', operator: 'greater_than', value: 89 }] },
    });
  });
});

describe('estimatedValue is not guessed at', () => {
  it('leaves a legacy estimatedValue threshold unmapped instead of converting it unscaled', () => {
    expect(convertEntry('estimatedValue', { operator: 'gte', value: 1000 })).toBeNull();
    expect(classifyAndConvert({ estimatedValue: { operator: 'gte', value: 1000 } }).outcome).toBe(
      'unmapped'
    );
  });
});

describe('flipTenantPriorities', () => {
  beforeEach(() => {
    prismaMock.routingRule.findMany.mockReset();
    prismaMock.routingRule.update.mockReset();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  const rows = [
    { id: 'a', priority: 0 },
    { id: 'b', priority: 1 },
    { id: 'c', priority: 2 },
  ];

  it('mirrors priorities within the tenant under --apply', async () => {
    prismaMock.routingRule.findMany.mockResolvedValue(rows);
    prismaMock.routingRule.update.mockResolvedValue({});
    const changed = await flipTenantPriorities(prismaMock as never, 't1', true);
    expect(changed).toBe(2);
    expect(prismaMock.routingRule.update).toHaveBeenCalledWith({
      where: { id: 'a', tenantId: 't1' },
      data: { priority: 2 },
    });
    expect(prismaMock.routingRule.update).toHaveBeenCalledWith({
      where: { id: 'c', tenantId: 't1' },
      data: { priority: 0 },
    });
  });

  it('writes nothing in dry-run', async () => {
    prismaMock.routingRule.findMany.mockResolvedValue(rows);
    expect(await flipTenantPriorities(prismaMock as never, 't1', false)).toBe(2);
    expect(prismaMock.routingRule.update).not.toHaveBeenCalled();
  });

  it('main refuses --flip-priorities without --tenant', async () => {
    const ORIG = process.argv;
    process.env['DATABASE_URL'] = 'postgresql://test.example.invalid/db';
    process.argv = ['node', 'migrate-legacy-routing-rules.ts', '--flip-priorities', '--apply'];
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await main();
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(prismaMock.routingRule.findMany).not.toHaveBeenCalled();
    process.argv = ORIG;
  });
});
