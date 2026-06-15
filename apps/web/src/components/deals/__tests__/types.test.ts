/**
 * Deal types & filter-mapping helper tests (IFC-287 F-10, F-19).
 * Covers transformDeals (typed API boundary), dateRangeToBounds, and
 * buildOpportunityListInput.
 */
import { describe, it, expect } from 'vitest';
import {
  transformDeals,
  dateRangeToBounds,
  buildOpportunityListInput,
  calculateStats,
  type OpportunityListResult,
} from '../types';

// A realistic opportunity.list payload (default JSON serializer: Decimal/Date
// arrive as strings). Cast through unknown — the runtime shape is what matters.
function makeListResult(overrides?: Partial<OpportunityListResult>): OpportunityListResult {
  return {
    opportunities: [
      {
        id: 'opp-1',
        name: 'Enterprise License',
        value: '75000.00',
        stage: 'QUALIFICATION',
        probability: 40,
        expectedCloseDate: '2026-03-15',
        account: { id: 'acc-1', name: 'Acme Corp', industry: 'TECH' },
        contact: { id: 'c-1', email: 'j@x.com', firstName: 'John', lastName: 'Doe' },
        owner: { id: 'u-1', email: 'jane@x.com', name: 'Jane Smith' },
        ownerId: 'u-1',
        createdAt: '2026-01-15',
      },
    ],
    total: 1,
    page: 1,
    limit: 100,
    hasMore: false,
    ...overrides,
  } as unknown as OpportunityListResult;
}

describe('transformDeals (F-19 typed boundary)', () => {
  it('returns [] for undefined / empty input', () => {
    expect(transformDeals(undefined)).toEqual([]);
    expect(transformDeals(makeListResult({ opportunities: [] }))).toEqual([]);
  });

  it('maps a typed list payload to Deal[]', () => {
    const [deal] = transformDeals(makeListResult());
    expect(deal).toMatchObject({
      id: 'opp-1',
      name: 'Enterprise License',
      value: 75000,
      stage: 'QUALIFICATION',
      probability: 40,
      accountName: 'Acme Corp',
      contactName: 'John Doe',
      ownerId: 'u-1',
      ownerName: 'Jane Smith',
    });
    expect(deal.expectedCloseDate).toBe('2026-03-15');
  });

  it('falls back when contact is null and owner has no name', () => {
    const result = makeListResult();
    result.opportunities[0].contact = null;
    result.opportunities[0].owner = { id: 'u-1', email: 'only@email.com', name: null };
    const [deal] = transformDeals(result);
    expect(deal.contactName).toBeNull();
    expect(deal.ownerName).toBe('only@email.com');
  });

  it('produces deals that compute pipeline stats', () => {
    const deals = transformDeals(makeListResult());
    const stats = calculateStats(deals);
    expect(stats.totalDeals).toBe(1);
    expect(stats.totalValue).toBe(75000);
  });
});

describe('dateRangeToBounds (F-10)', () => {
  // Fixed reference: Wed 2026-06-17 (a quarter-2 month).
  const now = new Date(2026, 5, 17, 12, 0, 0);

  it('returns empty bounds for undefined range', () => {
    expect(dateRangeToBounds(undefined, undefined, now)).toEqual({});
  });

  it('computes this_month bounds', () => {
    const { dateFrom, dateTo } = dateRangeToBounds('this_month', undefined, now);
    expect(dateFrom).toEqual(new Date(2026, 5, 1));
    expect(dateTo).toEqual(new Date(2026, 6, 0, 23, 59, 59, 999));
  });

  it('computes this_quarter bounds (Q2: Apr–Jun)', () => {
    const { dateFrom, dateTo } = dateRangeToBounds('this_quarter', undefined, now);
    expect(dateFrom).toEqual(new Date(2026, 3, 1));
    expect(dateTo).toEqual(new Date(2026, 6, 0, 23, 59, 59, 999));
  });

  it('computes this_year bounds', () => {
    const { dateFrom, dateTo } = dateRangeToBounds('this_year', undefined, now);
    expect(dateFrom).toEqual(new Date(2026, 0, 1));
    expect(dateTo).toEqual(new Date(2026, 11, 31, 23, 59, 59, 999));
  });

  it('computes this_week bounds (Monday → Sunday)', () => {
    // 2026-06-17 is a Wednesday → Monday is 2026-06-15.
    const { dateFrom, dateTo } = dateRangeToBounds('this_week', undefined, now);
    expect(dateFrom).toEqual(new Date(2026, 5, 15));
    expect(dateTo).toEqual(new Date(2026, 5, 21, 23, 59, 59, 999));
  });

  it('passes through custom bounds', () => {
    const from = new Date(2026, 0, 1);
    const to = new Date(2026, 0, 31);
    expect(dateRangeToBounds('custom', { dateFrom: from, dateTo: to }, now)).toEqual({
      dateFrom: from,
      dateTo: to,
    });
  });
});

describe('buildOpportunityListInput (F-10)', () => {
  const now = new Date(2026, 5, 17, 12, 0, 0);

  it('omits empty values', () => {
    expect(buildOpportunityListInput({}, now)).toEqual({
      ownerId: undefined,
      stage: undefined,
      minValue: undefined,
      maxValue: undefined,
      search: undefined,
      dateFrom: undefined,
      dateTo: undefined,
    });
  });

  it('maps owner, stages, value range and trimmed search', () => {
    const result = buildOpportunityListInput(
      {
        ownerId: 'u-1',
        stages: ['PROPOSAL', 'NEGOTIATION'],
        minValue: 1000,
        maxValue: 50000,
        search: '  acme  ',
      },
      now
    );
    expect(result.ownerId).toBe('u-1');
    expect(result.stage).toEqual(['PROPOSAL', 'NEGOTIATION']);
    expect(result.minValue).toBe(1000);
    expect(result.maxValue).toBe(50000);
    expect(result.search).toBe('acme');
  });

  it('drops a blank/whitespace-only search and empty stage array', () => {
    const result = buildOpportunityListInput({ search: '   ', stages: [] }, now);
    expect(result.search).toBeUndefined();
    expect(result.stage).toBeUndefined();
  });

  it('drops a zero or negative value bound (server requires positive) (#451)', () => {
    const result = buildOpportunityListInput({ minValue: 0, maxValue: -5 }, now);
    expect(result.minValue).toBeUndefined();
    expect(result.maxValue).toBeUndefined();
  });

  it('keeps a positive value bound', () => {
    const result = buildOpportunityListInput({ minValue: 1, maxValue: 100 }, now);
    expect(result.minValue).toBe(1);
    expect(result.maxValue).toBe(100);
  });

  it('expands a dateRange into dateFrom/dateTo', () => {
    const result = buildOpportunityListInput({ dateRange: 'this_month' }, now);
    expect(result.dateFrom).toEqual(new Date(2026, 5, 1));
    expect(result.dateTo).toEqual(new Date(2026, 6, 0, 23, 59, 59, 999));
  });
});
