// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { RecentActivityWidget } from '../RecentActivityWidget';

const feedMock = vi.fn();

vi.mock('@/hooks/useActivityFeed', () => ({
  useActivityFeed: (...args: unknown[]) => feedMock(...args),
}));

// Stub shared activity-feed components
vi.mock('@/components/shared/activity-feed', () => ({
  ActivityFeedItem: (props: { title: string }) => (
    <div data-testid="activity-feed-item">{props.title}</div>
  ),
  ActivityFeedTypeFilter: () => <div data-testid="activity-type-filter" />,
}));

const sampleItem = {
  id: '1',
  type: 'EMAIL',
  source: 'EMAIL',
  title: 'Sent proposal',
  description: 'Follow-up email sent',
  timestamp: new Date(),
  actor: { id: 'u1', name: 'Jane Doe' },
  entity: null,
  metadata: null,
};

describe('RecentActivityWidget', () => {
  beforeEach(() => {
    feedMock.mockReset();
    feedMock.mockReturnValue({
      items: [sampleItem],
      isLoading: false,
      isError: false,
      error: null,
      isFetchingNextPage: false,
      hasNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    });
  });

  it('renders ActivityFeedItem for each activity', () => {
    render(<RecentActivityWidget />);

    expect(screen.getByText('Recent Activity')).toBeInTheDocument();
    expect(screen.getByTestId('activity-feed-item')).toHaveTextContent('Sent proposal');
  });

  it('renders filter and View All link', () => {
    render(<RecentActivityWidget />);

    expect(screen.getByTestId('activity-type-filter')).toBeInTheDocument();
    expect(screen.getByText('View All')).toBeInTheDocument();
  });

  it('shows empty state when no activities exist', () => {
    feedMock.mockReturnValue({
      items: [],
      isLoading: false,
      isError: false,
      error: null,
      isFetchingNextPage: false,
      hasNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    });

    render(<RecentActivityWidget />);

    expect(screen.getByText('No recent activity yet.')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    feedMock.mockReturnValue({
      items: [],
      isLoading: true,
      isError: false,
      error: null,
      isFetchingNextPage: false,
      hasNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    });

    render(<RecentActivityWidget />);

    expect(screen.getByText('Loading activity...')).toBeInTheDocument();
  });

  it('defaults to limit 3 without config', () => {
    render(<RecentActivityWidget />);

    expect(feedMock).toHaveBeenCalledWith({ limit: 3, types: undefined });
  });

  it('respects maxItems from config', () => {
    render(<RecentActivityWidget config={{ maxItems: 5 }} />);

    expect(feedMock).toHaveBeenCalledWith({ limit: 5, types: undefined });
  });
});
