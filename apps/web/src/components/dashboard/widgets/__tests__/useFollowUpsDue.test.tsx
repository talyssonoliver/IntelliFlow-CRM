/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as React from 'react';
import { render } from '@testing-library/react';

const listQuery = vi.fn();
vi.mock('@/lib/api', () => ({
  api: { lead: { list: { useQuery: (input: unknown) => listQuery(input) } } },
}));

import { useFollowUpsDue } from '../useFollowUpsDue';
import { FOLLOW_UP_SCAN_LIMIT } from '@/lib/leads/follow-ups-due';

const lead = (n: number, lastContactedAt: string) => ({
  id: `lead-${n}`,
  firstName: 'Lead',
  lastName: `Number${n}`,
  company: null,
  email: `lead${n}@example.invalid`,
  lastContactedAt,
});

function probe(limit?: number) {
  let seen: ReturnType<typeof useFollowUpsDue> | undefined;
  function Probe() {
    seen = useFollowUpsDue(limit);
    return null;
  }
  render(<Probe />);
  return seen!;
}

describe('useFollowUpsDue (#46)', () => {
  beforeEach(() => listQuery.mockReset());

  it('asks for contacted leads newest due first, one shared 25-row query for card and Tasks', () => {
    listQuery.mockReturnValue({ data: { data: [], total: 0 }, isLoading: false });
    probe();
    const card = listQuery.mock.calls[0][0];
    listQuery.mockClear();
    probe(FOLLOW_UP_SCAN_LIMIT);
    const tasksPage = listQuery.mock.calls[0][0];
    expect(card).toEqual(tasksPage);
    expect(card).toMatchObject({
      status: ['CONTACTED'],
      sortBy: 'lastContactedAt',
      sortOrder: 'desc',
      limit: FOLLOW_UP_SCAN_LIMIT,
    });
  });

  it('lists 3 on the dashboard card and counts today from every row read', () => {
    const today = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const rows = Array.from({ length: 25 }, (_, i) => lead(i, today));
    listQuery.mockReturnValue({ data: { data: rows, total: 40 }, isLoading: false });
    const seen = probe();
    expect(seen.leads).toHaveLength(3);
    expect(seen.dueToday).toBe(25);
    // All 25 read are due today and 40 are due: today's count is a floor.
    expect(seen.dueTodayIsLowerBound).toBe(true);
  });

  it('counts none due today when every row read is overdue', () => {
    listQuery.mockReturnValue({
      data: { data: [lead(1, '2026-10-01T09:00:00.000Z')], total: 111 },
      isLoading: false,
    });
    const seen = probe();
    expect(seen.dueToday).toBe(0);
    expect(seen.dueTodayIsLowerBound).toBe(false);
    expect(seen.total).toBe(111);
  });
});
