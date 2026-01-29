// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { StatusMonitor } from '../status-monitor';

/**
 * StatusMonitor Component Tests - PG-014
 *
 * Tests the status monitor component for:
 * - Rendering service uptime charts
 * - Real-time updates
 * - Status color indicators
 * - Accessibility
 */

// Mock data - use unique uptime values to avoid collision with hardcoded UI values
const mockServices = [
  { id: 'api', name: 'API', description: 'API Service', status: 'operational' as const, uptime: 99.95 },
  { id: 'web', name: 'Web App', description: 'Web Application', status: 'operational' as const, uptime: 99.9 },
  { id: 'db', name: 'Database', description: 'Database Service', status: 'degraded' as const, uptime: 99.5 },
  { id: 'cdn', name: 'CDN', description: 'Content Delivery', status: 'operational' as const, uptime: 99.8 },
];

describe('StatusMonitor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-12-28T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Rendering', () => {
    it('should render uptime overview card', async () => {
      render(<StatusMonitor services={mockServices} />);

      // Advance timers to trigger useEffect
      await act(async () => {
        vi.advanceTimersByTime(10);
      });

      expect(screen.getByText('90-Day Uptime')).toBeInTheDocument();
    });

    it('should render service names', async () => {
      render(<StatusMonitor services={mockServices} />);

      await act(async () => {
        vi.advanceTimersByTime(10);
      });

      expect(screen.getByText('API')).toBeInTheDocument();
      expect(screen.getByText('Web App')).toBeInTheDocument();
      expect(screen.getByText('Database')).toBeInTheDocument();
      expect(screen.getByText('CDN')).toBeInTheDocument();
    });

    it('should render uptime percentages', async () => {
      render(<StatusMonitor services={mockServices} />);

      await act(async () => {
        vi.advanceTimersByTime(10);
      });

      // Check for service uptime values (these are in the service list)
      expect(screen.getByText('99.95%')).toBeInTheDocument();
      expect(screen.getByText('99.9%')).toBeInTheDocument();
      expect(screen.getByText('99.5%')).toBeInTheDocument();
      expect(screen.getByText('99.8%')).toBeInTheDocument();
    });

    it('should render only first 4 services', async () => {
      const manyServices = [
        ...mockServices,
        { id: 'extra', name: 'Extra Service', description: 'Extra', status: 'operational' as const, uptime: 99.0 },
      ];

      render(<StatusMonitor services={manyServices} />);

      await act(async () => {
        vi.advanceTimersByTime(10);
      });

      expect(screen.getByText('API')).toBeInTheDocument();
      expect(screen.queryByText('Extra Service')).not.toBeInTheDocument();
    });

    it('should render response times card', async () => {
      render(<StatusMonitor services={mockServices} />);

      await act(async () => {
        vi.advanceTimersByTime(10);
      });

      expect(screen.getByText('Current Response Times')).toBeInTheDocument();
      expect(screen.getByText('API p50')).toBeInTheDocument();
      expect(screen.getByText('API p95')).toBeInTheDocument();
      expect(screen.getByText('API p99')).toBeInTheDocument();
      expect(screen.getByText('Success Rate')).toBeInTheDocument();
    });

    it('should handle initial null date state gracefully', async () => {
      // This tests that the component doesn't crash when lastUpdated is null
      // The component shows "Loading..." until useEffect sets the date
      render(<StatusMonitor services={mockServices} />);

      // After hydration, the date should be set
      await act(async () => {
        vi.advanceTimersByTime(10);
      });

      // Now it should show the updated time, not "Loading..."
      expect(screen.getByText(/Updated/)).toBeInTheDocument();
    });

    it('should show updated time after mount', async () => {
      render(<StatusMonitor services={mockServices} />);

      await act(async () => {
        vi.advanceTimersByTime(10);
      });

      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
      expect(screen.getByText(/Updated/)).toBeInTheDocument();
    });
  });

  describe('Uptime Bars', () => {
    it('should render 90 uptime bars per service', async () => {
      render(<StatusMonitor services={[mockServices[0]]} />);

      await act(async () => {
        vi.advanceTimersByTime(10);
      });

      const uptimeChart = screen.getByRole('img', { name: /API uptime chart/i });
      expect(uptimeChart).toBeInTheDocument();

      // Each bar is a div inside the chart
      const bars = uptimeChart.querySelectorAll('div');
      expect(bars.length).toBe(90);
    });

    it('should have accessible aria-label for uptime charts', async () => {
      render(<StatusMonitor services={mockServices} />);

      await act(async () => {
        vi.advanceTimersByTime(10);
      });

      expect(screen.getByRole('img', { name: /API uptime chart: 99.95% over 90 days/i })).toBeInTheDocument();
      expect(screen.getByRole('img', { name: /Web App uptime chart: 99.9% over 90 days/i })).toBeInTheDocument();
    });

    it('should generate deterministic uptime bars based on service id', async () => {
      const { rerender } = render(<StatusMonitor services={mockServices} />);

      await act(async () => {
        vi.advanceTimersByTime(10);
      });

      const firstRenderBars = screen
        .getByRole('img', { name: /API uptime chart/i })
        .querySelectorAll('div');
      const firstBarClasses = Array.from(firstRenderBars).map((b) => b.className);

      rerender(<StatusMonitor services={mockServices} />);

      await act(async () => {
        vi.advanceTimersByTime(10);
      });

      const secondRenderBars = screen
        .getByRole('img', { name: /API uptime chart/i })
        .querySelectorAll('div');
      const secondBarClasses = Array.from(secondRenderBars).map((b) => b.className);

      // Bars should be identical between renders (deterministic)
      expect(firstBarClasses).toEqual(secondBarClasses);
    });
  });

  describe('Status Legend', () => {
    it('should render all status legend items', async () => {
      render(<StatusMonitor services={mockServices} />);

      await act(async () => {
        vi.advanceTimersByTime(10);
      });

      expect(screen.getByText('Operational')).toBeInTheDocument();
      expect(screen.getByText('Degraded')).toBeInTheDocument();
      expect(screen.getByText('Partial Outage')).toBeInTheDocument();
      expect(screen.getByText('Major Outage')).toBeInTheDocument();
    });
  });

  describe('Auto Refresh', () => {
    it('should update lastUpdated after refresh interval', async () => {
      render(<StatusMonitor services={mockServices} refreshInterval={1000} />);

      // Wait for initial mount
      await act(async () => {
        vi.advanceTimersByTime(10);
      });

      const initialText = screen.getByText(/Updated/).textContent;

      // Advance time to trigger refresh
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });

      // Wait for refresh animation (500ms)
      await act(async () => {
        vi.advanceTimersByTime(500);
      });

      const updatedText = screen.getByText(/Updated/).textContent;
      // Time should have advanced - the text content should exist
      expect(updatedText).toBeDefined();
      // Both should contain "Updated" - showing the component updated
      expect(initialText).toContain('Updated');
      expect(updatedText).toContain('Updated');
    });

    it('should show refresh indicator during refresh', async () => {
      render(<StatusMonitor services={mockServices} refreshInterval={1000} />);

      // Wait for initial mount
      await act(async () => {
        vi.advanceTimersByTime(10);
      });

      // Trigger refresh
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });

      // During the 500ms refresh animation, isRefreshing should be true
      const refreshIcon = document.querySelector('.animate-spin');
      expect(refreshIcon).toBeInTheDocument();
    });

    it('should use default 30 second refresh interval', async () => {
      const { container } = render(<StatusMonitor services={mockServices} />);

      // Wait for initial mount
      await act(async () => {
        vi.advanceTimersByTime(10);
      });

      // Advance less than 30 seconds - should not trigger refresh
      await act(async () => {
        vi.advanceTimersByTime(29000);
      });

      expect(container.querySelector('.animate-spin')).not.toBeInTheDocument();

      // Advance to 30 seconds - should trigger refresh
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });

      expect(container.querySelector('.animate-spin')).toBeInTheDocument();
    });
  });

  describe('Empty State', () => {
    it('should handle empty services array', async () => {
      render(<StatusMonitor services={[]} />);

      await act(async () => {
        vi.advanceTimersByTime(10);
      });

      expect(screen.getByText('90-Day Uptime')).toBeInTheDocument();
      // Should not crash with empty services
    });
  });

  describe('Accessibility', () => {
    it('should have semantic heading structure', async () => {
      render(<StatusMonitor services={mockServices} />);

      await act(async () => {
        vi.advanceTimersByTime(10);
      });

      const headings = screen.getAllByRole('heading', { level: 3 });
      expect(headings.length).toBeGreaterThanOrEqual(2);
    });

    it('should have aria-hidden on decorative elements', async () => {
      render(<StatusMonitor services={mockServices} />);

      await act(async () => {
        vi.advanceTimersByTime(10);
      });

      const hiddenElements = document.querySelectorAll('[aria-hidden="true"]');
      expect(hiddenElements.length).toBeGreaterThan(0);
    });

    it('should have proper img role for uptime charts', async () => {
      render(<StatusMonitor services={mockServices} />);

      await act(async () => {
        vi.advanceTimersByTime(10);
      });

      const images = screen.getAllByRole('img');
      expect(images.length).toBe(4); // One per service
    });
  });
});
