// @vitest-environment jsdom
/**
 * ActivityTimeline Component Tests (PG-133)
 *
 * Tests the ActivityTimeline component for:
 * - Activity rendering with timeline layout
 * - Type filters (all, email, call, meeting, etc.)
 * - Search functionality
 * - Expand/collapse activity details
 * - Infinite scroll (load more)
 * - Sentiment indicators
 * - Loading states
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ActivityTimeline } from '../ActivityTimeline';
import {
  createMockActivity,
  createMockActivityList,
  createMockHandlers,
  resetAllMocks,
} from './contact-test-utils';

describe('ActivityTimeline', () => {
  let handlers: ReturnType<typeof createMockHandlers>;

  beforeEach(() => {
    handlers = createMockHandlers();
    resetAllMocks(handlers);
    // JSDOM doesn't provide IntersectionObserver — stub it globally
    global.IntersectionObserver = class MockIntersectionObserver {
      observe = vi.fn();
      disconnect = vi.fn();
      unobserve = vi.fn();
      root = null;
      rootMargin = '';
      thresholds = [] as number[];
      takeRecords = () => [] as IntersectionObserverEntry[];
      constructor(_cb: IntersectionObserverCallback, _opts?: IntersectionObserverInit) {}
    } as any as typeof IntersectionObserver; // test-only mock
  });

  describe('Rendering', () => {
    it('renders activities in timeline format', () => {
      const activities = createMockActivityList(3);
      render(<ActivityTimeline contactId="contact-1" activities={activities} />);

      expect(screen.getByText('Activity 1')).toBeInTheDocument();
      expect(screen.getByText('Activity 2')).toBeInTheDocument();
      expect(screen.getByText('Activity 3')).toBeInTheDocument();
    });

    it('renders activity descriptions', () => {
      const activities = [createMockActivity({ description: 'Discussed quarterly review' })];
      render(<ActivityTimeline contactId="contact-1" activities={activities} />);

      expect(screen.getByText('Discussed quarterly review')).toBeInTheDocument();
    });

    it('renders user names', () => {
      const activities = [createMockActivity({ user: 'Sales Manager' })];
      render(<ActivityTimeline contactId="contact-1" activities={activities} />);

      expect(screen.getByText(/Sales Manager/)).toBeInTheDocument();
    });

    it('renders relative timestamps', () => {
      const now = new Date();
      const activities = [
        createMockActivity({
          timestamp: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
        }),
      ];
      render(<ActivityTimeline contactId="contact-1" activities={activities} />);

      expect(screen.getByText(/2 days ago/i)).toBeInTheDocument();
    });
  });

  describe('Search Functionality', () => {
    it('renders search input', () => {
      render(<ActivityTimeline contactId="contact-1" activities={[]} />);

      expect(screen.getByPlaceholderText('Search activities...')).toBeInTheDocument();
    });

    it('filters activities by search query in title', async () => {
      const user = userEvent.setup();
      const activities = [
        createMockActivity({ id: '1', title: 'Email sent' }),
        createMockActivity({ id: '2', title: 'Phone call' }),
      ];

      render(<ActivityTimeline contactId="contact-1" activities={activities} />);

      const searchInput = screen.getByPlaceholderText('Search activities...');
      await user.type(searchInput, 'email');

      expect(screen.getByText('Email sent')).toBeInTheDocument();
      expect(screen.queryByText('Phone call')).not.toBeInTheDocument();
    });

    it('filters activities by search query in description', async () => {
      const user = userEvent.setup();
      const activities = [
        createMockActivity({ id: '1', description: 'Discussed pricing' }),
        createMockActivity({ id: '2', description: 'Follow-up meeting' }),
      ];

      render(<ActivityTimeline contactId="contact-1" activities={activities} />);

      const searchInput = screen.getByPlaceholderText('Search activities...');
      await user.type(searchInput, 'pricing');

      expect(screen.getByText(/Discussed pricing/)).toBeInTheDocument();
      expect(screen.queryByText(/Follow-up meeting/)).not.toBeInTheDocument();
    });

    it('calls onSearch when search input changes', async () => {
      const user = userEvent.setup();
      render(
        <ActivityTimeline contactId="contact-1" activities={[]} onSearch={handlers.onSearch} />
      );

      const searchInput = screen.getByPlaceholderText('Search activities...');
      await user.type(searchInput, 'test');

      await waitFor(() => {
        expect(handlers.onSearch).toHaveBeenCalled();
        expect(handlers.onSearch).toHaveBeenCalledWith(expect.stringContaining('test'));
      });
    });

    it('updates result count on search', async () => {
      const user = userEvent.setup();
      const activities = createMockActivityList(5);

      render(<ActivityTimeline contactId="contact-1" activities={activities} />);

      const searchInput = screen.getByPlaceholderText('Search activities...');
      await user.type(searchInput, 'Activity 1');

      await waitFor(() => {
        expect(screen.getByText(/Showing 1 of 5/)).toBeInTheDocument();
      });
    });
  });

  describe('Type Filters', () => {
    it('renders all filter buttons', () => {
      render(<ActivityTimeline contactId="contact-1" activities={[]} />);

      expect(screen.getByRole('radio', { name: /^All$/i })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: /Emails/i })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: /Calls/i })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: /Meetings/i })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: /Chats/i })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: /Documents/i })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: /Deals/i })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: /Tickets/i })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: /Notes/i })).toBeInTheDocument();
    });

    it('filters by email type', () => {
      const activities = [
        createMockActivity({ id: '1', type: 'email' }),
        createMockActivity({ id: '2', type: 'call' }),
      ];

      render(<ActivityTimeline contactId="contact-1" activities={activities} />);

      fireEvent.click(screen.getByRole('radio', { name: /Emails/i }));

      expect(screen.getByText(/Showing 1 of 2/)).toBeInTheDocument();
    });

    it('filters by call type', () => {
      const activities = [
        createMockActivity({ id: '1', type: 'call', title: 'Called client' }),
        createMockActivity({ id: '2', type: 'email', title: 'Sent email' }),
      ];

      render(<ActivityTimeline contactId="contact-1" activities={activities} />);

      fireEvent.click(screen.getByRole('radio', { name: /Calls/i }));

      expect(screen.getByText('Called client')).toBeInTheDocument();
      expect(screen.queryByText('Sent email')).not.toBeInTheDocument();
    });

    it('shows all activities when "All" is selected', () => {
      const activities = createMockActivityList(5);

      render(<ActivityTimeline contactId="contact-1" activities={activities} />);

      // Click a filter
      fireEvent.click(screen.getByRole('radio', { name: /Emails/i }));

      // Click "All" to reset
      fireEvent.click(screen.getByRole('radio', { name: /^All$/i }));

      expect(screen.getByText(/Showing 5 of 5/)).toBeInTheDocument();
    });

    it('highlights active filter', () => {
      // Filter uses native `<input type="radio" checked={...}>` wrapped in a
      // <label> (ActivityTimeline.tsx:208-215). Native radios expose state via
      // the `checked` property; `aria-checked` is not set on the element.
      // Use `.toBeChecked()` from testing-library which works with native radios.
      render(<ActivityTimeline contactId="contact-1" activities={[]} />);

      const emailFilter = screen.getByRole('radio', { name: /Emails/i });
      fireEvent.click(emailFilter);

      expect(emailFilter).toBeChecked();
    });
  });

  describe('Expand/Collapse', () => {
    it('renders expand button for each activity', () => {
      const activities = [createMockActivity()];
      render(<ActivityTimeline contactId="contact-1" activities={activities} />);

      expect(screen.getByLabelText('Expand details')).toBeInTheDocument();
    });

    it('expands activity details on button click', () => {
      const activities = [createMockActivity({ title: 'Test Activity' })];
      render(<ActivityTimeline contactId="contact-1" activities={activities} />);

      const expandButton = screen.getByLabelText('Expand details');
      fireEvent.click(expandButton);

      expect(screen.getByText(/Full details for Test Activity/)).toBeInTheDocument();
    });

    it('changes button label when expanded', () => {
      const activities = [createMockActivity()];
      render(<ActivityTimeline contactId="contact-1" activities={activities} />);

      const expandButton = screen.getByLabelText('Expand details');
      fireEvent.click(expandButton);

      expect(screen.getByLabelText('Collapse details')).toBeInTheDocument();
    });

    it('collapses activity on second click', () => {
      const activities = [createMockActivity({ title: 'Test Activity' })];
      render(<ActivityTimeline contactId="contact-1" activities={activities} />);

      const expandButton = screen.getByLabelText('Expand details');
      fireEvent.click(expandButton);
      fireEvent.click(screen.getByLabelText('Collapse details'));

      expect(screen.queryByText(/Full details for Test Activity/)).not.toBeInTheDocument();
    });
  });

  describe('Sentiment Indicators', () => {
    it('renders positive sentiment icon', () => {
      const activities = [createMockActivity({ sentiment: 'positive' })];
      const { container } = render(
        <ActivityTimeline contactId="contact-1" activities={activities} />
      );

      expect(container.querySelector('[title="Positive sentiment"]')).toBeInTheDocument();
    });

    it('renders neutral sentiment icon', () => {
      const activities = [createMockActivity({ sentiment: 'neutral' })];
      const { container } = render(
        <ActivityTimeline contactId="contact-1" activities={activities} />
      );

      expect(container.querySelector('[title="Neutral sentiment"]')).toBeInTheDocument();
    });

    it('renders negative sentiment icon', () => {
      const activities = [createMockActivity({ sentiment: 'negative' })];
      const { container } = render(
        <ActivityTimeline contactId="contact-1" activities={activities} />
      );

      expect(container.querySelector('[title="Negative sentiment"]')).toBeInTheDocument();
    });

    it('does not render sentiment when not provided', () => {
      const activities = [createMockActivity({ sentiment: undefined })];
      const { container } = render(
        <ActivityTimeline contactId="contact-1" activities={activities} />
      );

      expect(container.querySelector('[title*="sentiment"]')).not.toBeInTheDocument();
    });
  });

  describe('Loading State', () => {
    it('renders loading skeletons when isLoading is true', () => {
      render(<ActivityTimeline contactId="contact-1" activities={[]} isLoading={true} />);

      expect(screen.getByText('Loading activities...')).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    });
  });

  describe('Empty State', () => {
    it('shows empty message when no activities match filters', () => {
      const activities = [createMockActivity({ type: 'email' })];
      render(<ActivityTimeline contactId="contact-1" activities={activities} />);

      // Filter to show only calls (no matches)
      fireEvent.click(screen.getByRole('radio', { name: /Calls/i }));

      // Canonical EmptyState (entity="activity" variant="filtered") description
      // includes a trailing period: 'No activities match your filters.'.
      expect(screen.getByText('No activities match your filters.')).toBeInTheDocument();
    });
  });

  describe('Infinite Scroll', () => {
    it('renders load more trigger when hasMore is true', () => {
      const activities = createMockActivityList(5);
      render(
        <ActivityTimeline
          contactId="contact-1"
          activities={activities}
          hasMore={true}
          onLoadMore={handlers.onLoadMore}
        />
      );

      expect(screen.getByText('Load more...')).toBeInTheDocument();
    });

    it('does not render load more trigger when hasMore is false', () => {
      const activities = createMockActivityList(5);
      render(
        <ActivityTimeline
          contactId="contact-1"
          activities={activities}
          hasMore={false}
          onLoadMore={handlers.onLoadMore}
        />
      );

      expect(screen.queryByText('Load more...')).not.toBeInTheDocument();
    });

    it('sets up IntersectionObserver when hasMore and onLoadMore provided', () => {
      const observeMock = vi.fn();
      const disconnectMock = vi.fn();

      global.IntersectionObserver = class MockIO {
        observe = observeMock;
        disconnect = disconnectMock;
        unobserve = vi.fn();
        root = null;
        rootMargin = '';
        thresholds = [] as number[];
        takeRecords = () => [] as IntersectionObserverEntry[];
        constructor(_cb: IntersectionObserverCallback, _opts?: IntersectionObserverInit) {}
      } as any as typeof IntersectionObserver; // test-only mock

      const activities = createMockActivityList(5);
      render(
        <ActivityTimeline
          contactId="contact-1"
          activities={activities}
          hasMore={true}
          onLoadMore={handlers.onLoadMore}
        />
      );

      expect(observeMock).toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('has proper aria-label for search input', () => {
      render(<ActivityTimeline contactId="contact-1" activities={[]} />);

      expect(screen.getByLabelText('Search activities')).toBeInTheDocument();
    });

    it('has aria-describedby linking search to result count', () => {
      render(<ActivityTimeline contactId="contact-1" activities={createMockActivityList(3)} />);

      const searchInput = screen.getByLabelText('Search activities');
      expect(searchInput).toHaveAttribute('aria-describedby', 'activity-result-count');
      expect(screen.getByText(/Showing 3 of 3/)).toHaveAttribute('id', 'activity-result-count');
    });

    it('has aria-live region for result count updates', () => {
      render(<ActivityTimeline contactId="contact-1" activities={createMockActivityList(3)} />);

      const resultCount = screen.getByText(/Showing 3 of 3/);
      expect(resultCount).toHaveAttribute('aria-live', 'polite');
    });

    it('has proper aria-label for timeline list', () => {
      const activities = createMockActivityList(3);
      render(<ActivityTimeline contactId="contact-1" activities={activities} />);

      expect(screen.getByRole('list')).toHaveAttribute(
        'aria-label',
        'Activity timeline, newest first'
      );
    });

    it('has aria-expanded on expand buttons', () => {
      const activities = [createMockActivity()];
      render(<ActivityTimeline contactId="contact-1" activities={activities} />);

      const expandButton = screen.getByLabelText('Expand details');
      expect(expandButton).toHaveAttribute('aria-expanded', 'false');

      fireEvent.click(expandButton);
      expect(screen.getByLabelText('Collapse details')).toHaveAttribute('aria-expanded', 'true');
    });

    it('has aria-controls linking expand button to detail panel', () => {
      const activities = [createMockActivity({ id: 'activity-1' })];
      render(<ActivityTimeline contactId="contact-1" activities={activities} />);

      const expandButton = screen.getByLabelText('Expand details');
      expect(expandButton).toHaveAttribute('aria-controls', 'detail-activity-1');
    });
  });
});
