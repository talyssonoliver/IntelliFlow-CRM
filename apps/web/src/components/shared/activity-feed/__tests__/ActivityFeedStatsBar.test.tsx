/**
 * ActivityFeedStatsBar — #1223 UI-001: pills are off unless a page opts in.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const { mockUseActivityFeedStats } = vi.hoisted(() => ({
  mockUseActivityFeedStats: vi.fn(),
}));

vi.mock('@/hooks/useActivityFeedStats', () => ({
  useActivityFeedStats: mockUseActivityFeedStats,
}));

import { ActivityFeedStatsBar } from '../ActivityFeedStatsBar';

const STATS = {
  timeWindow: '7d',
  total: 12,
  byType: [
    { type: 'NOTE', count: 6 },
    { type: 'SCORE_UPDATE', count: 4 },
    { type: 'EMAIL', count: 2 },
  ],
};

describe('ActivityFeedStatsBar', () => {
  it('shows only the total by default', () => {
    mockUseActivityFeedStats.mockReturnValue({ stats: STATS, isLoading: false });
    const { container } = render(<ActivityFeedStatsBar timeWindow="7d" />);

    expect(container.textContent).toContain('12');
    expect(container.textContent).toContain('activities');
    expect(container.textContent).toContain('past 7 days');
    expect(screen.queryByText('Notes')).toBeNull();
    expect(screen.queryByText('Scores')).toBeNull();
  });

  it('shows the type pills, with a label for SCORE_UPDATE, when opted in', () => {
    mockUseActivityFeedStats.mockReturnValue({ stats: STATS, isLoading: false });
    render(<ActivityFeedStatsBar timeWindow="7d" showBreakdown />);

    expect(screen.getByText('Notes')).toBeDefined();
    expect(screen.getByText('Scores')).toBeDefined();
    expect(screen.queryByText('SCORE_UPDATE')).toBeNull();
  });
});
