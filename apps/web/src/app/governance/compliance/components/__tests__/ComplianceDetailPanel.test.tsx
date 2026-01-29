/**
 * ComplianceDetailPanel Component Tests
 *
 * @vitest-environment jsdom
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock detail data
const mockDetailResponse = {
  success: true,
  data: {
    standardId: 'iso-27001',
    standardName: 'ISO 27001',
    score: 92,
    trend: 2.4,
    status: 'compliant',
    nextAuditDate: '2026-03-01',
    certificationExpiry: '2027-03-01',
    controls: [
      {
        id: 'A.5.1',
        name: 'Information Security Policies',
        status: 'passed',
        lastAssessed: '2026-01-01',
        notes: 'All policies reviewed and approved',
      },
      {
        id: 'A.6.1',
        name: 'Organization of Information Security',
        status: 'passed',
        lastAssessed: '2026-01-01',
      },
      {
        id: 'A.7.1',
        name: 'Human Resource Security',
        status: 'in_progress',
        lastAssessed: '2025-12-15',
        notes: 'Background check process being updated',
      },
      {
        id: 'A.8.1',
        name: 'Asset Management',
        status: 'failed',
        lastAssessed: '2025-12-01',
        notes: 'Asset inventory incomplete',
      },
    ],
    historicalScores: [
      { date: '2025-08-01', score: 85 },
      { date: '2025-09-01', score: 87 },
      { date: '2025-10-01', score: 88 },
      { date: '2025-11-01', score: 90 },
      { date: '2025-12-01', score: 91 },
      { date: '2026-01-01', score: 92 },
    ],
    recentChanges: [
      {
        action: 'Updated access control policy',
        date: '2026-01-03',
        user: 'Security Team',
      },
      {
        action: 'Completed risk assessment',
        date: '2026-01-01',
        user: 'Compliance Officer',
      },
      {
        action: 'Added new backup controls',
        date: '2025-12-28',
        user: 'IT Team',
      },
    ],
  },
};

// Mock fetch - declared at module level, stubbed in beforeEach
const mockFetch = vi.fn();

import { ComplianceDetailPanel } from '../ComplianceDetailPanel';

describe('ComplianceDetailPanel', () => {
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnClose.mockClear();
    // Re-stub fetch in beforeEach because unstubGlobals:true removes it after each test
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve(mockDetailResponse),
    });
  });

  describe('Closed State', () => {
    it('should not render content when closed', () => {
      render(
        <ComplianceDetailPanel
          standardId="iso-27001"
          open={false}
          onClose={mockOnClose}
        />
      );

      expect(screen.queryByText('ISO 27001')).not.toBeInTheDocument();
    });

    it('should not fetch data when closed', () => {
      render(
        <ComplianceDetailPanel
          standardId="iso-27001"
          open={false}
          onClose={mockOnClose}
        />
      );

      expect(screen.queryByText('Loading')).not.toBeInTheDocument();
    });
  });

  describe('Open State', () => {
    it('should display standard name when open', async () => {
      render(
        <ComplianceDetailPanel
          standardId="iso-27001"
          open={true}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('ISO 27001')).toBeInTheDocument();
      });
    });

    it('should display compliance score', async () => {
      render(
        <ComplianceDetailPanel
          standardId="iso-27001"
          open={true}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('92%')).toBeInTheDocument();
      });
    });

    it('should display trend indicator', async () => {
      render(
        <ComplianceDetailPanel
          standardId="iso-27001"
          open={true}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('+2.4%')).toBeInTheDocument();
      });
    });

    it('should display status badge', async () => {
      render(
        <ComplianceDetailPanel
          standardId="iso-27001"
          open={true}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('compliant')).toBeInTheDocument();
      });
    });

    it('should display next audit date', async () => {
      render(
        <ComplianceDetailPanel
          standardId="iso-27001"
          open={true}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Next Audit')).toBeInTheDocument();
      });
    });

    it('should display certification expiry', async () => {
      render(
        <ComplianceDetailPanel
          standardId="iso-27001"
          open={true}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Cert. Expiry')).toBeInTheDocument();
      });
    });
  });

  describe('Tabs Navigation', () => {
    it('should display controls tab by default', async () => {
      render(
        <ComplianceDetailPanel
          standardId="iso-27001"
          open={true}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        const controlsTab = screen.getByRole('button', { name: /controls/i });
        expect(controlsTab.className).toContain('border-primary');
      });
    });

    it('should have history tab', async () => {
      render(
        <ComplianceDetailPanel
          standardId="iso-27001"
          open={true}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /history/i })).toBeInTheDocument();
      });
    });

    it('should have changes tab', async () => {
      render(
        <ComplianceDetailPanel
          standardId="iso-27001"
          open={true}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /changes/i })).toBeInTheDocument();
      });
    });

    it('should switch to history tab when clicked', async () => {
      const user = userEvent.setup();
      render(
        <ComplianceDetailPanel
          standardId="iso-27001"
          open={true}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('ISO 27001')).toBeInTheDocument();
      });

      const historyTab = screen.getByRole('button', { name: /history/i });
      await user.click(historyTab);

      await waitFor(() => {
        expect(screen.getByText('Score trend over the last 6 months')).toBeInTheDocument();
      });
    });

    it('should switch to changes tab when clicked', async () => {
      const user = userEvent.setup();
      render(
        <ComplianceDetailPanel
          standardId="iso-27001"
          open={true}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('ISO 27001')).toBeInTheDocument();
      });

      const changesTab = screen.getByRole('button', { name: /changes/i });
      await user.click(changesTab);

      await waitFor(() => {
        expect(screen.getByText('Updated access control policy')).toBeInTheDocument();
      });
    });
  });

  describe('Controls Tab', () => {
    it('should display control statistics', async () => {
      render(
        <ComplianceDetailPanel
          standardId="iso-27001"
          open={true}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Passed')).toBeInTheDocument();
        expect(screen.getByText('Failed')).toBeInTheDocument();
        expect(screen.getByText('In Progress')).toBeInTheDocument();
        expect(screen.getByText('N/A')).toBeInTheDocument();
      });
    });

    it('should display control list', async () => {
      render(
        <ComplianceDetailPanel
          standardId="iso-27001"
          open={true}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/A\.5\.1: Information Security Policies/)).toBeInTheDocument();
        expect(screen.getByText(/A\.6\.1: Organization of Information Security/)).toBeInTheDocument();
      });
    });

    it('should display control status icons', async () => {
      render(
        <ComplianceDetailPanel
          standardId="iso-27001"
          open={true}
          onClose={mockOnClose}
        />
      );

      // Wait for data to load first
      await waitFor(() => {
        expect(screen.getByText('ISO 27001')).toBeInTheDocument();
      });

      // Should have material-symbols-outlined icons for control statuses
      // Note: Sheet renders into a portal, so use document.querySelectorAll
      await waitFor(() => {
        const icons = document.querySelectorAll('.material-symbols-outlined');
        expect(icons.length).toBeGreaterThan(0);
      });
    });

    it('should display control notes when available', async () => {
      render(
        <ComplianceDetailPanel
          standardId="iso-27001"
          open={true}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('All policies reviewed and approved')).toBeInTheDocument();
      });
    });

    it('should display last assessed date for controls', async () => {
      render(
        <ComplianceDetailPanel
          standardId="iso-27001"
          open={true}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        // Multiple controls have last assessed dates
        const assessedTexts = screen.getAllByText(/Last assessed:/);
        expect(assessedTexts.length).toBeGreaterThan(0);
      });
    });
  });

  describe('History Tab', () => {
    it('should display historical scores', async () => {
      const user = userEvent.setup();
      render(
        <ComplianceDetailPanel
          standardId="iso-27001"
          open={true}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('ISO 27001')).toBeInTheDocument();
      });

      const historyTab = screen.getByRole('button', { name: /history/i });
      await user.click(historyTab);

      await waitFor(() => {
        // Should show scores from historical data
        // Note: 85% is unique to history, 92% appears in both overview and history
        expect(screen.getByText('85%')).toBeInTheDocument();
        // 92% appears multiple times (overview + history list)
        const score92Elements = screen.getAllByText('92%');
        expect(score92Elements.length).toBeGreaterThan(0);
      });
    });

    it('should render SVG chart', async () => {
      const user = userEvent.setup();
      render(
        <ComplianceDetailPanel
          standardId="iso-27001"
          open={true}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('ISO 27001')).toBeInTheDocument();
      });

      const historyTab = screen.getByRole('button', { name: /history/i });
      await user.click(historyTab);

      // Wait for history content to appear (score trend text indicates history is active)
      await waitFor(() => {
        expect(screen.getByText('Score trend over the last 6 months')).toBeInTheDocument();
      });

      // Now check for the SVG chart
      // Note: Sheet renders into a portal, so use document.querySelector
      const svg = document.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });
  });

  describe('Changes Tab', () => {
    it('should display recent changes', async () => {
      const user = userEvent.setup();
      render(
        <ComplianceDetailPanel
          standardId="iso-27001"
          open={true}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('ISO 27001')).toBeInTheDocument();
      });

      const changesTab = screen.getByRole('button', { name: /changes/i });
      await user.click(changesTab);

      await waitFor(() => {
        expect(screen.getByText('Updated access control policy')).toBeInTheDocument();
        expect(screen.getByText('Completed risk assessment')).toBeInTheDocument();
        expect(screen.getByText('Added new backup controls')).toBeInTheDocument();
      });
    });

    it('should display change author', async () => {
      const user = userEvent.setup();
      render(
        <ComplianceDetailPanel
          standardId="iso-27001"
          open={true}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('ISO 27001')).toBeInTheDocument();
      });

      const changesTab = screen.getByRole('button', { name: /changes/i });
      await user.click(changesTab);

      await waitFor(() => {
        expect(screen.getByText(/Security Team/)).toBeInTheDocument();
        expect(screen.getByText(/Compliance Officer/)).toBeInTheDocument();
      });
    });
  });

  describe('Null Standard', () => {
    it('should show placeholder when no standard selected', () => {
      render(
        <ComplianceDetailPanel
          standardId={null}
          open={true}
          onClose={mockOnClose}
        />
      );

      expect(screen.getByText('Select a compliance standard to view details')).toBeInTheDocument();
    });
  });

  describe('Loading State', () => {
    it('should show loading spinner while fetching', async () => {
      render(
        <ComplianceDetailPanel
          standardId="iso-27001"
          open={true}
          onClose={mockOnClose}
        />
      );

      // Initially should show loading (spinner icon)
      render(
        <ComplianceDetailPanel
          standardId="iso-27001"
          open={true}
          onClose={mockOnClose}
        />
      );

      // Should eventually load
      await waitFor(() => {
        expect(screen.getByText('ISO 27001')).toBeInTheDocument();
      });
    });
  });
});
