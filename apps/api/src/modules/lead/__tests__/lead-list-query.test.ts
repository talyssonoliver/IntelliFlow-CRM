import { describe, it, expect } from 'vitest';
import {
  buildDateRange,
  buildLeadListWhere,
  buildNumberRange,
  leadListOrderBy,
} from '../lead-list-query';

describe('leadListOrderBy', () => {
  it('puts never-contacted leads first when sorting last contact ascending (most overdue first)', () => {
    expect(leadListOrderBy('lastContactedAt', 'asc')).toEqual({
      lastContactedAt: { sort: 'asc', nulls: 'first' },
    });
  });

  it('puts never-contacted leads last when sorting last contact descending (most recent first)', () => {
    expect(leadListOrderBy('lastContactedAt', 'desc')).toEqual({
      lastContactedAt: { sort: 'desc', nulls: 'last' },
    });
  });

  it('leaves every other sort exactly as it was', () => {
    expect(leadListOrderBy('createdAt', 'desc')).toEqual({ createdAt: 'desc' });
    expect(leadListOrderBy('score', 'asc')).toEqual({ score: 'asc' });
    expect(leadListOrderBy('estimatedValue', 'desc')).toEqual({ estimatedValue: 'desc' });
  });
});

describe('buildLeadListWhere', () => {
  it('is empty with no filters', () => {
    expect(buildLeadListWhere({})).toEqual({});
  });

  it('filters by status, source, owner and starred', () => {
    expect(
      buildLeadListWhere({
        status: ['CONTACTED'],
        source: ['WEBSITE'],
        ownerId: 'user-1',
        isStarred: false,
      })
    ).toEqual({
      status: { in: ['CONTACTED'] },
      source: { in: ['WEBSITE'] },
      ownerId: 'user-1',
      isStarred: false,
    });
  });

  it('ignores empty status and source lists', () => {
    expect(buildLeadListWhere({ status: [], source: [] })).toEqual({});
  });

  it('adds a score range and a created-date range', () => {
    const from = new Date('2026-01-01T00:00:00.000Z');
    const to = new Date('2026-02-01T00:00:00.000Z');
    expect(buildLeadListWhere({ minScore: 40, maxScore: 80, dateFrom: from, dateTo: to })).toEqual({
      score: { gte: 40, lte: 80 },
      createdAt: { gte: from, lte: to },
    });
  });

  it('searches email, names and company', () => {
    const where = buildLeadListWhere({ search: 'fern' });
    expect(where.OR).toEqual([
      { email: { contains: 'fern', mode: 'insensitive' } },
      { firstName: { contains: 'fern', mode: 'insensitive' } },
      { lastName: { contains: 'fern', mode: 'insensitive' } },
      { company: { contains: 'fern', mode: 'insensitive' } },
    ]);
  });

  it('"Needs follow-up" includes never-contacted leads and those last contacted by the cutoff', () => {
    const cutoff = new Date('2026-11-10T23:59:59.999Z');
    expect(buildLeadListWhere({ status: ['CONTACTED'], lastContactedBefore: cutoff })).toEqual({
      status: { in: ['CONTACTED'] },
      OR: [{ lastContactedAt: null }, { lastContactedAt: { lte: cutoff } }],
    });
  });

  it('with a search and "needs follow-up" together, both must hold (AND, not one merged OR)', () => {
    const cutoff = new Date('2026-11-10T23:59:59.999Z');
    const where = buildLeadListWhere({ search: 'fern', lastContactedBefore: cutoff });
    expect(where.OR).toBeUndefined();
    expect(where.AND).toEqual([
      {
        OR: [
          { email: { contains: 'fern', mode: 'insensitive' } },
          { firstName: { contains: 'fern', mode: 'insensitive' } },
          { lastName: { contains: 'fern', mode: 'insensitive' } },
          { company: { contains: 'fern', mode: 'insensitive' } },
        ],
      },
      { OR: [{ lastContactedAt: null }, { lastContactedAt: { lte: cutoff } }] },
    ]);
  });

  it('filters to the given ids, and an empty id list matches nothing', () => {
    expect(buildLeadListWhere({ ids: ['a', 'b'] })).toEqual({ id: { in: ['a', 'b'] } });
    expect(buildLeadListWhere({ ids: [] })).toEqual({ id: { in: [] } });
  });
});

describe('range helpers', () => {
  it('buildNumberRange is undefined with no bounds and keeps a zero bound', () => {
    expect(buildNumberRange(undefined, undefined)).toBeUndefined();
    expect(buildNumberRange(0, undefined)).toEqual({ gte: 0 });
    expect(buildNumberRange(undefined, 10)).toEqual({ lte: 10 });
  });

  it('buildDateRange is undefined with no bounds', () => {
    const d = new Date('2026-01-01T00:00:00.000Z');
    expect(buildDateRange(undefined, undefined)).toBeUndefined();
    expect(buildDateRange(d, undefined)).toEqual({ gte: d });
    expect(buildDateRange(undefined, d)).toEqual({ lte: d });
  });
});
