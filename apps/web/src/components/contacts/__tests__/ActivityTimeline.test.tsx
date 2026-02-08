import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ActivityTimeline, type Activity } from '../ActivityTimeline';

// ─── Mock IntersectionObserver ──────────────────────────────────────────────────

let intersectionCallback: IntersectionObserverCallback | null = null;

class MockIntersectionObserver implements IntersectionObserver {
  root = null;
  rootMargin = '';
  thresholds = [0];

  constructor(callback: IntersectionObserverCallback) {
    intersectionCallback = callback;
  }

  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords = () => [] as IntersectionObserverEntry[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function createActivity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: 'act-1',
    type: 'email',
    title: 'Sent proposal',
    description: 'Sent Q1 proposal document',
    timestamp: '2026-01-15T14:00:00.000Z',
    user: 'Jane Smith',
    metadata: {},
    sentiment: undefined,
    ...overrides,
  };
}

function createActivities(): Activity[] {
  return [
    createActivity({ id: 'act-1', type: 'email', title: 'Sent proposal', description: 'Sent Q1 proposal document', timestamp: '2026-01-15T14:00:00.000Z' }),
    createActivity({ id: 'act-2', type: 'call', title: 'Follow-up call', description: 'Called to follow up on deal', timestamp: '2026-01-14T10:00:00.000Z' }),
    createActivity({ id: 'act-3', type: 'meeting', title: 'Demo meeting', description: 'Product demonstration', timestamp: '2026-01-13T09:00:00.000Z' }),
    createActivity({ id: 'act-4', type: 'note', title: 'Added note', description: 'Captured meeting notes', timestamp: '2026-01-12T08:00:00.000Z' }),
  ];
}

const defaultProps = {
  contactId: 'c-1',
  activities: createActivities(),
  isLoading: false,
};

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('ActivityTimeline', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
    intersectionCallback = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Event Rendering ───────────────────────────────────────────────────────────

  describe('Event Rendering', () => {
    it('renders activity events in the list', () => {
      render(<ActivityTimeline {...defaultProps} />);

      expect(screen.getByText('Sent proposal')).toBeInTheDocument();
      expect(screen.getByText('Follow-up call')).toBeInTheDocument();
      expect(screen.getByText('Demo meeting')).toBeInTheDocument();
      expect(screen.getByText('Added note')).toBeInTheDocument();
    });

    it('displays event description text', () => {
      render(<ActivityTimeline {...defaultProps} />);

      expect(screen.getByText('Sent Q1 proposal document')).toBeInTheDocument();
    });

    it('shows relative timestamps using <time> element', () => {
      render(<ActivityTimeline {...defaultProps} />);

      const timeElements = screen.getAllByRole('listitem');
      expect(timeElements.length).toBeGreaterThan(0);

      const timeEl = document.querySelector('time[datetime]');
      expect(timeEl).toBeTruthy();
      expect(timeEl?.getAttribute('dateTime')).toBeTruthy();
    });

    it('shows user name for each activity', () => {
      render(<ActivityTimeline {...defaultProps} />);

      const janeTexts = screen.getAllByText(/Jane Smith/);
      expect(janeTexts.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Filtering ─────────────────────────────────────────────────────────────────

  describe('Filtering', () => {
    it('filters by event type using radio group', async () => {
      const user = userEvent.setup();
      render(<ActivityTimeline {...defaultProps} />);

      // Click on "Calls" filter
      const callFilter = screen.getByRole('radio', { name: /calls/i });
      await user.click(callFilter);

      expect(screen.getByText('Follow-up call')).toBeInTheDocument();
      expect(screen.queryByText('Sent proposal')).not.toBeInTheDocument();
    });

    it('event type filter buttons have role="radio" and aria-checked', () => {
      render(<ActivityTimeline {...defaultProps} />);

      const radios = screen.getAllByRole('radio');
      expect(radios.length).toBeGreaterThanOrEqual(2);

      // "All" should be checked by default — use exact match to avoid matching "Calls"
      const allRadio = screen.getByRole('radio', { name: /^All$/i });
      expect(allRadio).toHaveAttribute('aria-checked', 'true');
    });

    it('filter container has role="radiogroup"', () => {
      render(<ActivityTimeline {...defaultProps} />);

      const radiogroup = screen.getByRole('radiogroup');
      expect(radiogroup).toHaveAttribute('aria-label', 'Filter by activity type');
    });

    it('search input filters activities by text', async () => {
      const user = userEvent.setup();
      render(<ActivityTimeline {...defaultProps} />);

      const search = screen.getByLabelText('Search activities');
      await user.type(search, 'proposal');

      expect(screen.getByText('Sent proposal')).toBeInTheDocument();
      expect(screen.queryByText('Follow-up call')).not.toBeInTheDocument();
    });

    it('search has aria-describedby for result count', () => {
      render(<ActivityTimeline {...defaultProps} />);

      const search = screen.getByLabelText('Search activities');
      const describedBy = search.getAttribute('aria-describedby');
      expect(describedBy).toBeTruthy();
      expect(document.getElementById(describedBy!)).toBeInTheDocument();
    });

    it('result count uses aria-live="polite"', () => {
      render(<ActivityTimeline {...defaultProps} />);

      const liveRegion = screen.getByText(/Showing \d+ of \d+ activities/);
      expect(liveRegion).toHaveAttribute('aria-live', 'polite');
    });
  });

  // ── Expandable Details ────────────────────────────────────────────────────────

  describe('Expandable Details', () => {
    it('expand button has aria-expanded attribute', () => {
      render(<ActivityTimeline {...defaultProps} />);

      const expandBtns = screen.getAllByLabelText('Expand details');
      expect(expandBtns[0]).toHaveAttribute('aria-expanded', 'false');
    });

    it('expanded content has aria-controls pointing to detail panel', async () => {
      const user = userEvent.setup();
      render(<ActivityTimeline {...defaultProps} />);

      const expandBtn = screen.getAllByLabelText('Expand details')[0];
      const controlsId = expandBtn.getAttribute('aria-controls');
      expect(controlsId).toBeTruthy();

      await user.click(expandBtn);

      expect(expandBtn).toHaveAttribute('aria-expanded', 'true');
      expect(document.getElementById(controlsId!)).toBeInTheDocument();
    });

    it('clicking expand shows details and changes label', async () => {
      const user = userEvent.setup();
      render(<ActivityTimeline {...defaultProps} />);

      const expandBtn = screen.getAllByLabelText('Expand details')[0];
      await user.click(expandBtn);

      expect(screen.getByLabelText('Collapse details')).toBeInTheDocument();
    });
  });

  // ── Infinite Scroll ───────────────────────────────────────────────────────────

  describe('Infinite Scroll', () => {
    it('shows "Load more" indicator when hasMore=true', () => {
      render(<ActivityTimeline {...defaultProps} hasMore={true} onLoadMore={vi.fn()} />);

      expect(screen.getByText('Load more...')).toBeInTheDocument();
    });

    it('calls onLoadMore when scroll trigger is intersecting', () => {
      const onLoadMore = vi.fn();
      render(<ActivityTimeline {...defaultProps} hasMore={true} onLoadMore={onLoadMore} />);

      // Simulate intersection
      if (intersectionCallback) {
        intersectionCallback(
          [{ isIntersecting: true } as IntersectionObserverEntry],
          {} as IntersectionObserver,
        );
      }

      expect(onLoadMore).toHaveBeenCalled();
    });
  });

  // ── Accessibility ─────────────────────────────────────────────────────────────

  describe('Accessibility', () => {
    it('timeline uses semantic <ol> with role="list"', () => {
      render(<ActivityTimeline {...defaultProps} />);

      const list = screen.getByRole('list', { name: /activity timeline/i });
      expect(list.tagName).toBe('OL');
    });

    it('each event is an <li> element', () => {
      render(<ActivityTimeline {...defaultProps} />);

      const items = screen.getAllByRole('listitem');
      expect(items.length).toBe(4);
      expect(items[0].tagName).toBe('LI');
    });
  });

  // ── Loading State ─────────────────────────────────────────────────────────────

  describe('Loading State', () => {
    it('shows loading state when isLoading=true', () => {
      render(<ActivityTimeline {...defaultProps} isLoading={true} />);

      const status = screen.getByRole('status');
      expect(status).toHaveAttribute('aria-busy', 'true');
      expect(screen.getByText('Loading activities...')).toBeInTheDocument();
    });
  });

  // ── Empty State ───────────────────────────────────────────────────────────────

  describe('Empty State', () => {
    it('shows empty state when no activities match filters', async () => {
      const user = userEvent.setup();
      render(<ActivityTimeline {...defaultProps} />);

      const search = screen.getByLabelText('Search activities');
      await user.type(search, 'nonexistent xyz');

      expect(screen.getByText('No activities match your filters')).toBeInTheDocument();
    });
  });
});
