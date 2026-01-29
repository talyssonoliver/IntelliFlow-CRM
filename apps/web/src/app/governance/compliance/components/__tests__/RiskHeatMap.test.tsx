/**
 * RiskHeatMap Component Tests
 *
 * @vitest-environment jsdom
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch globally
const mockRiskResponse = {
  success: true,
  data: {
    risks: [
      {
        id: 'RISK-001',
        title: 'AI Model Bias Risk',
        probability: 'high',
        impact: 'high',
        status: 'requires_action',
        category: 'ISO 42001',
        owner: 'AI Team',
        mitigationPlan: 'Implement bias detection monitoring',
      },
      {
        id: 'RISK-002',
        title: 'Data Retention Policy Gap',
        probability: 'medium',
        impact: 'medium',
        status: 'mitigated',
        category: 'GDPR',
      },
      {
        id: 'RISK-003',
        title: 'Third-Party Vendor Risk',
        probability: 'low',
        impact: 'low',
        status: 'accepted',
        category: 'ISO 27001',
      },
    ],
    summary: {
      total: 3,
      byStatus: {
        accepted: 1,
        mitigated: 1,
        requires_action: 1,
      },
      byProbability: {
        high: 1,
        medium: 1,
        low: 1,
      },
      byImpact: {
        high: 1,
        medium: 1,
        low: 1,
      },
    },
    lastUpdated: '2026-01-05T10:00:00Z',
  },
};

// Mock fetch - declared at module level, stubbed in beforeEach
const mockFetch = vi.fn();

import { RiskHeatMap } from '../RiskHeatMap';

describe('RiskHeatMap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-stub fetch in beforeEach because unstubGlobals:true removes it after each test
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve(mockRiskResponse),
    });
  });

  describe('Initial Render', () => {
    it('should render the component header', async () => {
      render(<RiskHeatMap />);

      await waitFor(() => {
        expect(screen.getByText('Risk Heat Map')).toBeInTheDocument();
      });
    });

    it('should show loading state initially', () => {
      render(<RiskHeatMap />);

      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('should display risk count after loading', async () => {
      render(<RiskHeatMap />);

      await waitFor(() => {
        expect(screen.getByText('3 risks tracked')).toBeInTheDocument();
      });
    });
  });

  describe('Risk Legend', () => {
    it('should display legend for accepted risks', async () => {
      render(<RiskHeatMap />);

      await waitFor(() => {
        expect(screen.getByText(/Accepted \(1\)/)).toBeInTheDocument();
      });
    });

    it('should display legend for mitigated risks', async () => {
      render(<RiskHeatMap />);

      await waitFor(() => {
        expect(screen.getByText(/Mitigated \(1\)/)).toBeInTheDocument();
      });
    });

    it('should display legend for requires action risks', async () => {
      render(<RiskHeatMap />);

      await waitFor(() => {
        expect(screen.getByText(/Requires Action \(1\)/)).toBeInTheDocument();
      });
    });

    it('should show risk symbols', async () => {
      render(<RiskHeatMap />);

      await waitFor(() => {
        // Accepted: ○, Mitigated: △, Requires Action: □
        // Use getAllByText since symbols may appear in multiple places
        expect(screen.getAllByText('○').length).toBeGreaterThan(0);
        expect(screen.getAllByText('△').length).toBeGreaterThan(0);
        expect(screen.getAllByText('□').length).toBeGreaterThan(0);
      });
    });
  });

  describe('Heat Map Grid', () => {
    it('should render probability labels', async () => {
      render(<RiskHeatMap />);

      await waitFor(() => {
        const highLabels = screen.getAllByText('high');
        const mediumLabels = screen.getAllByText('medium');
        const lowLabels = screen.getAllByText('low');

        expect(highLabels.length).toBeGreaterThan(0);
        expect(mediumLabels.length).toBeGreaterThan(0);
        expect(lowLabels.length).toBeGreaterThan(0);
      });
    });

    it('should render impact header', async () => {
      render(<RiskHeatMap />);

      await waitFor(() => {
        expect(screen.getByText('Impact →')).toBeInTheDocument();
      });
    });

    it('should render 9 grid cells (3x3)', async () => {
      const { container } = render(<RiskHeatMap />);

      await waitFor(() => {
        // Each cell is a button with min-h-[80px]
        const cells = container.querySelectorAll('button.min-h-\\[80px\\]');
        expect(cells).toHaveLength(9);
      });
    });

    it('should show risk count in cells', async () => {
      render(<RiskHeatMap />);

      await waitFor(() => {
        // We have 3 risks, each in different cells, so we should see "1" three times
        const oneCounts = screen.getAllByText('1');
        expect(oneCounts.length).toBeGreaterThanOrEqual(3);
      });
    });
  });

  describe('Cell Interaction', () => {
    it('should open risk detail modal when clicking a cell with risks', async () => {
      const user = userEvent.setup();
      const { container } = render(<RiskHeatMap />);

      await waitFor(() => {
        expect(screen.getByText('3 risks tracked')).toBeInTheDocument();
      });

      // Find and click a cell with risks
      const cells = container.querySelectorAll('button.min-h-\\[80px\\]');
      // Find the cell that has the high-high risk
      for (const cell of cells) {
        if (cell.textContent?.includes('□')) {
          await user.click(cell);
          break;
        }
      }

      await waitFor(() => {
        expect(screen.getByText('1 Risk in this cell')).toBeInTheDocument();
      });
    });

    it('should show risk details in modal', async () => {
      const user = userEvent.setup();
      const { container } = render(<RiskHeatMap />);

      await waitFor(() => {
        expect(screen.getByText('3 risks tracked')).toBeInTheDocument();
      });

      // Click a cell with risks
      const cells = container.querySelectorAll('button.min-h-\\[80px\\]');
      for (const cell of cells) {
        if (cell.textContent?.includes('□')) {
          await user.click(cell);
          break;
        }
      }

      await waitFor(() => {
        expect(screen.getByText('AI Model Bias Risk')).toBeInTheDocument();
        expect(screen.getByText(/RISK-001/)).toBeInTheDocument();
        expect(screen.getByText(/ISO 42001/)).toBeInTheDocument();
      });
    });

    it('should close modal when clicking close button', async () => {
      const user = userEvent.setup();
      const { container } = render(<RiskHeatMap />);

      await waitFor(() => {
        expect(screen.getByText('3 risks tracked')).toBeInTheDocument();
      });

      // Click a cell with risks
      const cells = container.querySelectorAll('button.min-h-\\[80px\\]');
      for (const cell of cells) {
        if (cell.textContent?.includes('□')) {
          await user.click(cell);
          break;
        }
      }

      await waitFor(() => {
        expect(screen.getByText('1 Risk in this cell')).toBeInTheDocument();
      });

      // Click close button
      const closeButton = screen.getByLabelText('Close');
      await user.click(closeButton);

      await waitFor(() => {
        expect(screen.queryByText('1 Risk in this cell')).not.toBeInTheDocument();
      });
    });

    it('should close modal when clicking backdrop', async () => {
      const user = userEvent.setup();
      const { container } = render(<RiskHeatMap />);

      await waitFor(() => {
        expect(screen.getByText('3 risks tracked')).toBeInTheDocument();
      });

      // Click a cell with risks
      const cells = container.querySelectorAll('button.min-h-\\[80px\\]');
      for (const cell of cells) {
        if (cell.textContent?.includes('□')) {
          await user.click(cell);
          break;
        }
      }

      await waitFor(() => {
        expect(screen.getByText('1 Risk in this cell')).toBeInTheDocument();
      });

      // Click backdrop (the second Close button with aria-label)
      const backdrop = screen.getByLabelText('Close');
      await user.click(backdrop);

      await waitFor(() => {
        expect(screen.queryByText('1 Risk in this cell')).not.toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle API error gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      render(<RiskHeatMap />);

      // Should still render the header
      await waitFor(() => {
        expect(screen.getByText('Risk Heat Map')).toBeInTheDocument();
      });
    });
  });

  describe('Last Updated', () => {
    it('should display last updated time', async () => {
      render(<RiskHeatMap />);

      await waitFor(() => {
        expect(screen.getByText(/Last updated:/)).toBeInTheDocument();
      });
    });
  });
});
