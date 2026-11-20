/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as React from 'react';
import { render, screen } from '@testing-library/react';

const listQuery = vi.fn();
vi.mock('@/lib/api', () => ({
  api: { lead: { list: { useQuery: (input: unknown) => listQuery(input) } } },
}));

import { FollowUpsDueTasks, TASKS_PAGE_FOLLOW_UP_LIMIT } from '../FollowUpsDueTasks';
import { useFollowUpsDue } from '@/components/dashboard/widgets/useFollowUpsDue';

// The dashboard card calls the hook with no argument.
function DashboardProbe() {
  useFollowUpsDue();
  return null;
}

const lead = (n: number) => ({
  id: `lead-${n}`,
  firstName: 'Lead',
  lastName: `Number${n}`,
  company: null,
  email: `lead${n}@example.invalid`,
  lastContactedAt: '2026-10-01T09:00:00.000Z',
});

describe('FollowUpsDueTasks (Tasks page)', () => {
  beforeEach(() => {
    listQuery.mockReset();
    listQuery.mockReturnValue({ data: { data: [lead(1), lead(2)], total: 111 }, isLoading: false });
  });

  it('shows the same total the dashboard counts and links each lead', () => {
    render(<FollowUpsDueTasks />);
    expect(screen.getByText('Follow-ups due (111)')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Lead Number1/ })).toHaveAttribute(
      'href',
      '/leads/lead-1'
    );
    expect(screen.getByRole('link', { name: /See all leads needing a follow-up/ })).toHaveAttribute(
      'href',
      '/leads?segment=followup'
    );
  });

  it('asks lead.list for the same filter as the dashboard, with only a larger limit', () => {
    render(<FollowUpsDueTasks />);
    const tasksInput = listQuery.mock.calls[0][0];
    listQuery.mockClear();
    render(<DashboardProbe />);
    const dashboardCall = listQuery.mock.calls[0];
    expect(dashboardCall).toBeDefined();
    const { limit: dashboardLimit, ...dashboardRest } = dashboardCall![0] as Record<
      string,
      unknown
    >;
    const { limit, ...tasksRest } = tasksInput;
    expect(tasksRest).toEqual(dashboardRest);
    expect(limit).toBe(TASKS_PAGE_FOLLOW_UP_LIMIT);
    expect(dashboardLimit).toBeLessThan(limit);
  });

  it('renders nothing when no follow-up is due', () => {
    listQuery.mockReturnValue({ data: { data: [], total: 0 }, isLoading: false });
    const { container } = render(<FollowUpsDueTasks />);
    expect(container.firstChild).toBeNull();
  });
});
