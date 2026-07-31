/**
 * ComplianceTimeline Component Tests
 *
 * @vitest-environment jsdom
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock timeline data - using future dates (2027) to avoid tests becoming stale
const mockTimelineResponse = {
  success: true,
  data: {
    events: [
      {
        id: 'EVT-001',
        title: 'ISO 27001 Annual Audit',
        date: '2027-02-10',
        type: 'audit',
        standard: 'ISO 27001',
        status: 'scheduled',
        description: 'Annual certification audit',
      },
      {
        id: 'EVT-002',
        title: 'GDPR Policy Review',
        date: '2027-02-15',
        type: 'review',
        standard: 'GDPR',
        status: 'scheduled',
      },
      {
        id: 'EVT-003',
        title: 'SOC 2 Certification Renewal',
        date: '2027-02-25',
        type: 'certification',
        standard: 'SOC 2',
        status: 'scheduled',
      },
      {
        id: 'EVT-004',
        title: 'ISO 42001 Assessment',
        date: '2027-01-15',
        type: 'assessment',
        standard: 'ISO 42001',
        status: 'completed',
      },
    ],
    currentMonth: '2027-02',
    upcomingCount: 3,
  },
};

// Mock fetch - declared at module level, stubbed in beforeEach
const mockFetch = vi.fn();

import { ComplianceTimeline } from '../ComplianceTimeline';

describe('ComplianceTimeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-stub fetch in beforeEach because unstubGlobals:true removes it after each test
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve(mockTimelineResponse),
    });
  });

  describe('Initial Render', () => {
    it('should render the component header', async () => {
      render(<ComplianceTimeline />);

      await waitFor(() => {
        expect(screen.getByText('Compliance Timeline')).toBeInTheDocument();
      });
    });

    it('should show loading state initially', () => {
      render(<ComplianceTimeline />);

      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('should display upcoming event count after loading', async () => {
      render(<ComplianceTimeline />);

      await waitFor(() => {
        // Anchored + bounded: sonarjs/slow-regex flags the unbounded `\d+` form.
        expect(screen.getByText(/^\d{1,4} upcoming events?$/)).toBeInTheDocument();
      });
    });
  });

  describe('View Mode Toggle', () => {
    it('should have Month view button', async () => {
      render(<ComplianceTimeline />);

      await waitFor(() => {
        expect(screen.getByText('Month')).toBeInTheDocument();
      });
    });

    it('should have Quarter view button', async () => {
      render(<ComplianceTimeline />);

      await waitFor(() => {
        expect(screen.getByText('Quarter')).toBeInTheDocument();
      });
    });

    it('should highlight active view mode', async () => {
      render(<ComplianceTimeline />);

      await waitFor(() => {
        const monthButton = screen.getByText('Month');
        // Month is default, should have primary background
        expect(monthButton.className).toContain('bg-primary');
      });
    });
  });

  describe('Calendar Navigation', () => {
    it('should display current month and year', async () => {
      render(<ComplianceTimeline />);

      await waitFor(() => {
        // Should show month name and year
        const heading = screen.getByRole('heading', { level: 3 });
        // Anchored + bounded: sonarjs/slow-regex flags the unbounded `\w+` form.
        expect(heading.textContent).toMatch(/^[A-Za-z]{3,12} \d{4}$/);
      });
    });

    it('should have previous month navigation button', async () => {
      render(<ComplianceTimeline />);

      await waitFor(() => {
        // chevron_left is text content inside span.material-symbols-outlined
        expect(screen.getByText('chevron_left')).toBeInTheDocument();
      });
    });

    it('should have next month navigation button', async () => {
      render(<ComplianceTimeline />);

      await waitFor(() => {
        // There are multiple chevron_right icons - one for navigation, one per event
        const chevronRights = screen.getAllByText('chevron_right');
        // At least one should be present for navigation
        expect(chevronRights.length).toBeGreaterThan(0);
      });
    });

    // Pinned to the 31st on purpose. This assertion used to run against the real
    // clock, so it only exercised the end-of-month `setMonth` overflow on the
    // ~3 days a month where it reproduces — it passed by luck for weeks and then
    // reddened the nightly on 2026-07-31. Stepping back from July 31 sets June 31,
    // which JS normalises to July 1, so the month never changed.
    it.each([
      ['2026-07-31T12:00:00Z', 'July 2026', 'June 2026'],
      ['2026-03-31T12:00:00Z', 'March 2026', 'February 2026'],
      ['2026-07-15T12:00:00Z', 'July 2026', 'June 2026'],
    ])('navigates back from %s even when the day overflows', async (now, from, to) => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.setSystemTime(new Date(now));
      try {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        render(<ComplianceTimeline />);

        await waitFor(() => {
          expect(screen.getByText('Compliance Timeline')).toBeInTheDocument();
        });

        expect(screen.getByRole('heading', { level: 3 }).textContent).toBe(from);

        const prevButton = screen.getByText('chevron_left').closest('button');
        expect(prevButton).not.toBeNull();
        await user.click(prevButton!);

        await waitFor(() => {
          expect(screen.getByRole('heading', { level: 3 }).textContent).toBe(to);
        });
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('Calendar Grid', () => {
    it('should display weekday headers', async () => {
      render(<ComplianceTimeline />);

      await waitFor(() => {
        expect(screen.getByText('Sun')).toBeInTheDocument();
        expect(screen.getByText('Mon')).toBeInTheDocument();
        expect(screen.getByText('Tue')).toBeInTheDocument();
        expect(screen.getByText('Wed')).toBeInTheDocument();
        expect(screen.getByText('Thu')).toBeInTheDocument();
        expect(screen.getByText('Fri')).toBeInTheDocument();
        expect(screen.getByText('Sat')).toBeInTheDocument();
      });
    });

    it('should render calendar day cells', async () => {
      const { container } = render(<ComplianceTimeline />);

      await waitFor(() => {
        // Should have multiple calendar day cells (at least 28)
        // Use attribute selector to avoid escaping Tailwind bracket syntax
        const dayCells = container.querySelectorAll('[class*="min-h-"]');
        expect(dayCells.length).toBeGreaterThanOrEqual(28);
      });
    });
  });

  describe('Event Type Legend', () => {
    it('should display audit event type', async () => {
      render(<ComplianceTimeline />);

      await waitFor(() => {
        expect(screen.getByText('audit')).toBeInTheDocument();
      });
    });

    it('should display certification event type', async () => {
      render(<ComplianceTimeline />);

      await waitFor(() => {
        expect(screen.getByText('certification')).toBeInTheDocument();
      });
    });

    it('should display review event type', async () => {
      render(<ComplianceTimeline />);

      await waitFor(() => {
        expect(screen.getByText('review')).toBeInTheDocument();
      });
    });

    it('should display assessment event type', async () => {
      render(<ComplianceTimeline />);

      await waitFor(() => {
        expect(screen.getByText('assessment')).toBeInTheDocument();
      });
    });

    it('should display renewal event type', async () => {
      render(<ComplianceTimeline />);

      await waitFor(() => {
        expect(screen.getByText('renewal')).toBeInTheDocument();
      });
    });
  });

  describe('Upcoming Events List', () => {
    it('should display upcoming events section', async () => {
      render(<ComplianceTimeline />);

      await waitFor(() => {
        expect(screen.getByText('Upcoming Events')).toBeInTheDocument();
      });
    });

    it('should list upcoming scheduled events', async () => {
      render(<ComplianceTimeline />);

      await waitFor(() => {
        // Event appears in both calendar and upcoming list, so use getAllByText
        const eventElements = screen.getAllByText('ISO 27001 Annual Audit');
        expect(eventElements.length).toBeGreaterThan(0);
      });
    });

    it('should show event date in list', async () => {
      render(<ComplianceTimeline />);

      await waitFor(
        () => {
          // Component uses toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })
          // → '10 Feb' (day-first) after the Timezone Refactor locale migration.
          expect(screen.getByText(/10 Feb/)).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });

    it('should show event standard in list', async () => {
      render(<ComplianceTimeline />);

      await waitFor(() => {
        // The events list shows standard next to date - use getAllByText since it appears in multiple places
        const standardElements = screen.getAllByText(/ISO 27001/);
        expect(standardElements.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Event Detail Modal', () => {
    it('should open event detail modal when clicking an event', async () => {
      const user = userEvent.setup();
      render(<ComplianceTimeline />);

      await waitFor(() => {
        // Event appears in multiple places (calendar + upcoming list)
        const eventElements = screen.getAllByText('ISO 27001 Annual Audit');
        expect(eventElements.length).toBeGreaterThan(0);
      });

      // Click on an event in the upcoming list - find first button containing the event title
      const eventElements = screen.getAllByText('ISO 27001 Annual Audit');
      const eventButton = eventElements[0].closest('button');
      if (eventButton) {
        await user.click(eventButton);
      }

      await waitFor(() => {
        // Modal should show event details
        expect(screen.getByText('Annual certification audit')).toBeInTheDocument();
      });
    });

    it('should display event date in modal', async () => {
      const user = userEvent.setup();
      render(<ComplianceTimeline />);

      await waitFor(() => {
        const eventElements = screen.getAllByText('ISO 27001 Annual Audit');
        expect(eventElements.length).toBeGreaterThan(0);
      });

      const eventElements = screen.getAllByText('ISO 27001 Annual Audit');
      const eventButton = eventElements[0].closest('button');
      if (eventButton) {
        await user.click(eventButton);
      }

      await waitFor(() => {
        // Should show formatted date
        // en-GB long date: 'Wednesday, 10 February 2027' (day-first).
        expect(screen.getByText(/Wednesday, 10 February 2027/)).toBeInTheDocument();
      });
    });

    it('should display event status in modal', async () => {
      const user = userEvent.setup();
      render(<ComplianceTimeline />);

      await waitFor(() => {
        const eventElements = screen.getAllByText('ISO 27001 Annual Audit');
        expect(eventElements.length).toBeGreaterThan(0);
      });

      const eventElements = screen.getAllByText('ISO 27001 Annual Audit');
      const eventButton = eventElements[0].closest('button');
      if (eventButton) {
        await user.click(eventButton);
      }

      await waitFor(() => {
        expect(screen.getByText('scheduled')).toBeInTheDocument();
      });
    });

    it('should close modal when clicking close button', async () => {
      const user = userEvent.setup();
      render(<ComplianceTimeline />);

      await waitFor(() => {
        const eventElements = screen.getAllByText('ISO 27001 Annual Audit');
        expect(eventElements.length).toBeGreaterThan(0);
      });

      const eventElements = screen.getAllByText('ISO 27001 Annual Audit');
      const eventButton = eventElements[0].closest('button');
      if (eventButton) {
        await user.click(eventButton);
      }

      await waitFor(() => {
        expect(screen.getByText('Annual certification audit')).toBeInTheDocument();
      });

      // Click close button - the button contains text "close" which is icon text
      const closeIcon = screen.getByText('close');
      const closeButton = closeIcon.closest('button');
      if (closeButton) {
        await user.click(closeButton);
      }

      await waitFor(() => {
        expect(screen.queryByText('Annual certification audit')).not.toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle API error gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      render(<ComplianceTimeline />);

      await waitFor(() => {
        expect(screen.getByText('Compliance Timeline')).toBeInTheDocument();
      });
    });
  });

  describe('Empty State', () => {
    it('should show empty state when no upcoming events', async () => {
      mockFetch.mockResolvedValue({
        json: () =>
          Promise.resolve({
            success: true,
            data: {
              events: [],
              currentMonth: '2027-01',
              upcomingCount: 0,
            },
          }),
      });

      render(<ComplianceTimeline />);

      await waitFor(() => {
        expect(screen.getByText('No upcoming events')).toBeInTheDocument();
      });
    });
  });
});
