/**
 * ComplianceTimeline Component Tests
 *
 * @vitest-environment jsdom
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock timeline data
const mockTimelineResponse = {
  success: true,
  data: {
    events: [
      {
        id: 'EVT-001',
        title: 'ISO 27001 Annual Audit',
        date: '2026-01-15',
        type: 'audit',
        standard: 'ISO 27001',
        status: 'scheduled',
        description: 'Annual certification audit',
      },
      {
        id: 'EVT-002',
        title: 'GDPR Policy Review',
        date: '2026-01-20',
        type: 'review',
        standard: 'GDPR',
        status: 'scheduled',
      },
      {
        id: 'EVT-003',
        title: 'SOC 2 Certification Renewal',
        date: '2026-02-15',
        type: 'certification',
        standard: 'SOC 2',
        status: 'scheduled',
      },
      {
        id: 'EVT-004',
        title: 'ISO 42001 Assessment',
        date: '2025-12-15',
        type: 'assessment',
        standard: 'ISO 42001',
        status: 'completed',
      },
    ],
    currentMonth: '2026-01',
    upcomingCount: 3,
  },
};

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { ComplianceTimeline } from '../ComplianceTimeline';

describe('ComplianceTimeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
        expect(screen.getByText(/\d+ upcoming events?/)).toBeInTheDocument();
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
      const { container } = render(<ComplianceTimeline />);

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
        expect(heading.textContent).toMatch(/\w+ \d{4}/);
      });
    });

    it('should have previous month navigation button', async () => {
      const { container } = render(<ComplianceTimeline />);

      await waitFor(() => {
        const prevButton = container.querySelector('[class*="chevron_left"]');
        expect(prevButton).toBeInTheDocument();
      });
    });

    it('should have next month navigation button', async () => {
      const { container } = render(<ComplianceTimeline />);

      await waitFor(() => {
        const nextButton = container.querySelector('[class*="chevron_right"]');
        expect(nextButton).toBeInTheDocument();
      });
    });

    it('should navigate to previous month when clicking prev button', async () => {
      const user = userEvent.setup();
      const { container } = render(<ComplianceTimeline />);

      await waitFor(() => {
        expect(screen.getByText('Compliance Timeline')).toBeInTheDocument();
      });

      const currentHeading = screen.getByRole('heading', { level: 3 });
      const initialMonth = currentHeading.textContent;

      // Click prev button
      const prevButton = container.querySelector('button:has(.material-symbols-outlined)');
      if (prevButton) {
        await user.click(prevButton);
      }

      await waitFor(() => {
        const newHeading = screen.getByRole('heading', { level: 3 });
        // Month should have changed
        expect(newHeading.textContent).not.toBe(initialMonth);
      });
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
        const dayCells = container.querySelectorAll('.min-h-\\[70px\\]');
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
        expect(screen.getByText('ISO 27001 Annual Audit')).toBeInTheDocument();
      });
    });

    it('should show event date in list', async () => {
      render(<ComplianceTimeline />);

      await waitFor(() => {
        // Events should show date format like "Jan 15"
        expect(screen.getByText(/Jan 15/)).toBeInTheDocument();
      });
    });

    it('should show event standard in list', async () => {
      render(<ComplianceTimeline />);

      await waitFor(() => {
        // The events list shows standard next to date
        expect(screen.getByText(/ISO 27001/)).toBeInTheDocument();
      });
    });
  });

  describe('Event Detail Modal', () => {
    it('should open event detail modal when clicking an event', async () => {
      const user = userEvent.setup();
      render(<ComplianceTimeline />);

      await waitFor(() => {
        expect(screen.getByText('ISO 27001 Annual Audit')).toBeInTheDocument();
      });

      // Click on an event in the upcoming list
      const eventButton = screen.getByRole('button', { name: /ISO 27001 Annual Audit/i });
      await user.click(eventButton);

      await waitFor(() => {
        // Modal should show event details
        expect(screen.getByText('Annual certification audit')).toBeInTheDocument();
      });
    });

    it('should display event date in modal', async () => {
      const user = userEvent.setup();
      render(<ComplianceTimeline />);

      await waitFor(() => {
        expect(screen.getByText('ISO 27001 Annual Audit')).toBeInTheDocument();
      });

      const eventButton = screen.getByRole('button', { name: /ISO 27001 Annual Audit/i });
      await user.click(eventButton);

      await waitFor(() => {
        // Should show formatted date
        expect(screen.getByText(/Thursday, January 15, 2026/)).toBeInTheDocument();
      });
    });

    it('should display event status in modal', async () => {
      const user = userEvent.setup();
      render(<ComplianceTimeline />);

      await waitFor(() => {
        expect(screen.getByText('ISO 27001 Annual Audit')).toBeInTheDocument();
      });

      const eventButton = screen.getByRole('button', { name: /ISO 27001 Annual Audit/i });
      await user.click(eventButton);

      await waitFor(() => {
        expect(screen.getByText('scheduled')).toBeInTheDocument();
      });
    });

    it('should close modal when clicking close button', async () => {
      const user = userEvent.setup();
      render(<ComplianceTimeline />);

      await waitFor(() => {
        expect(screen.getByText('ISO 27001 Annual Audit')).toBeInTheDocument();
      });

      const eventButton = screen.getByRole('button', { name: /ISO 27001 Annual Audit/i });
      await user.click(eventButton);

      await waitFor(() => {
        expect(screen.getByText('Annual certification audit')).toBeInTheDocument();
      });

      // Click close button
      const closeButton = screen.getByRole('button', { name: /close/i });
      await user.click(closeButton);

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
        json: () => Promise.resolve({
          success: true,
          data: {
            events: [],
            currentMonth: '2026-01',
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
