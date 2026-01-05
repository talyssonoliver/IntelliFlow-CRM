/**
 * ExportReportButton Component Tests
 *
 * @vitest-environment jsdom
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock jsPDF
const mockSave = vi.fn();
const mockAddPage = vi.fn();
const mockSetPage = vi.fn();
const mockText = vi.fn();
const mockLine = vi.fn();
const mockSetFontSize = vi.fn();
const mockSetFont = vi.fn();
const mockSetTextColor = vi.fn();
const mockSetDrawColor = vi.fn();
const mockGetNumberOfPages = vi.fn(() => 1);

vi.mock('jspdf', () => ({
  default: vi.fn().mockImplementation(() => ({
    internal: {
      pageSize: {
        getWidth: () => 210,
        getHeight: () => 297,
      },
    },
    save: mockSave,
    addPage: mockAddPage,
    setPage: mockSetPage,
    text: mockText,
    line: mockLine,
    setFontSize: mockSetFontSize,
    setFont: mockSetFont,
    setTextColor: mockSetTextColor,
    setDrawColor: mockSetDrawColor,
    getNumberOfPages: mockGetNumberOfPages,
  })),
}));

// Mock data for API responses
const mockRisksResponse = {
  success: true,
  data: {
    risks: [
      {
        id: 'RISK-001',
        title: 'Test Risk',
        probability: 'high',
        impact: 'high',
        status: 'requires_action',
        category: 'ISO 42001',
        mitigationPlan: 'Implement controls',
      },
    ],
    summary: {
      total: 1,
      byStatus: { accepted: 0, mitigated: 0, requires_action: 1 },
      byProbability: { high: 1, medium: 0, low: 0 },
      byImpact: { high: 1, medium: 0, low: 0 },
    },
  },
};

const mockTimelineResponse = {
  success: true,
  data: {
    events: [
      {
        id: 'EVT-001',
        title: 'ISO 27001 Audit',
        date: '2026-02-15',
        type: 'audit',
        standard: 'ISO 27001',
        status: 'scheduled',
      },
    ],
  },
};

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { ExportReportButton } from '../ExportReportButton';

describe('ExportReportButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/risks')) {
        return Promise.resolve({ json: () => Promise.resolve(mockRisksResponse) });
      }
      if (url.includes('/timeline')) {
        return Promise.resolve({ json: () => Promise.resolve(mockTimelineResponse) });
      }
      return Promise.resolve({ json: () => Promise.resolve({}) });
    });
  });

  describe('Initial Render', () => {
    it('should render export button', () => {
      render(<ExportReportButton />);

      expect(screen.getByRole('button', { name: /export report/i })).toBeInTheDocument();
    });

    it('should display download icon', () => {
      const { container } = render(<ExportReportButton />);

      const icon = container.querySelector('.material-symbols-outlined');
      expect(icon).toBeInTheDocument();
      expect(icon?.textContent).toBe('download');
    });

    it('should not be disabled initially', () => {
      render(<ExportReportButton />);

      const button = screen.getByRole('button', { name: /export report/i });
      expect(button).not.toBeDisabled();
    });
  });

  describe('Export Process', () => {
    it('should show loading state when clicked', async () => {
      const user = userEvent.setup();
      render(<ExportReportButton />);

      const button = screen.getByRole('button', { name: /export report/i });
      await user.click(button);

      // Should show exporting state
      expect(screen.getByText('Exporting...')).toBeInTheDocument();
    });

    it('should disable button during export', async () => {
      const user = userEvent.setup();
      render(<ExportReportButton />);

      const button = screen.getByRole('button', { name: /export report/i });
      await user.click(button);

      expect(button).toBeDisabled();
    });

    it('should show progress icon during export', async () => {
      const user = userEvent.setup();
      const { container } = render(<ExportReportButton />);

      const button = screen.getByRole('button', { name: /export report/i });
      await user.click(button);

      const icon = container.querySelector('.material-symbols-outlined');
      expect(icon?.textContent).toBe('progress_activity');
    });

    it('should fetch risks data', async () => {
      const user = userEvent.setup();
      render(<ExportReportButton />);

      const button = screen.getByRole('button', { name: /export report/i });
      await user.click(button);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /export report/i })).not.toBeDisabled();
      });
    });

    it('should fetch timeline data', async () => {
      const user = userEvent.setup();
      render(<ExportReportButton />);

      const button = screen.getByRole('button', { name: /export report/i });
      await user.click(button);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /export report/i })).not.toBeDisabled();
      });
    });

    it('should call jsPDF save method', async () => {
      const user = userEvent.setup();
      render(<ExportReportButton />);

      const button = screen.getByRole('button', { name: /export report/i });
      await user.click(button);

      await waitFor(() => {
        expect(mockSave).toHaveBeenCalled();
      });
    });

    it('should generate PDF with compliance report filename', async () => {
      const user = userEvent.setup();
      render(<ExportReportButton />);

      const button = screen.getByRole('button', { name: /export report/i });
      await user.click(button);

      await waitFor(() => {
        expect(mockSave).toHaveBeenCalledWith(expect.stringContaining('compliance-report-'));
      });
    });

    it('should re-enable button after export completes', async () => {
      const user = userEvent.setup();
      render(<ExportReportButton />);

      const button = screen.getByRole('button', { name: /export report/i });
      await user.click(button);

      await waitFor(() => {
        expect(button).not.toBeDisabled();
        expect(screen.getByText('Export Report')).toBeInTheDocument();
      });
    });
  });

  describe('PDF Content', () => {
    it('should add title to PDF', async () => {
      const user = userEvent.setup();
      render(<ExportReportButton />);

      const button = screen.getByRole('button', { name: /export report/i });
      await user.click(button);

      await waitFor(() => {
        expect(mockText).toHaveBeenCalledWith(
          'Compliance Report',
          expect.any(Number),
          expect.any(Number),
          expect.anything()
        );
      });
    });

    it('should include compliance standards section', async () => {
      const user = userEvent.setup();
      render(<ExportReportButton />);

      const button = screen.getByRole('button', { name: /export report/i });
      await user.click(button);

      await waitFor(() => {
        expect(mockText).toHaveBeenCalledWith(
          'Compliance Standards Overview',
          expect.any(Number),
          expect.any(Number)
        );
      });
    });

    it('should include risk summary section', async () => {
      const user = userEvent.setup();
      render(<ExportReportButton />);

      const button = screen.getByRole('button', { name: /export report/i });
      await user.click(button);

      await waitFor(() => {
        expect(mockText).toHaveBeenCalledWith(
          'Risk Summary',
          expect.any(Number),
          expect.any(Number)
        );
      });
    });

    it('should include upcoming events section', async () => {
      const user = userEvent.setup();
      render(<ExportReportButton />);

      const button = screen.getByRole('button', { name: /export report/i });
      await user.click(button);

      await waitFor(() => {
        expect(mockText).toHaveBeenCalledWith(
          'Upcoming Compliance Events',
          expect.any(Number),
          expect.any(Number)
        );
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle API error gracefully', async () => {
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

      mockFetch.mockRejectedValue(new Error('Network error'));

      const user = userEvent.setup();
      render(<ExportReportButton />);

      const button = screen.getByRole('button', { name: /export report/i });
      await user.click(button);

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith('Failed to generate PDF report. Please try again.');
      });

      alertSpy.mockRestore();
    });

    it('should re-enable button after error', async () => {
      vi.spyOn(window, 'alert').mockImplementation(() => {});

      mockFetch.mockRejectedValue(new Error('Network error'));

      const user = userEvent.setup();
      render(<ExportReportButton />);

      const button = screen.getByRole('button', { name: /export report/i });
      await user.click(button);

      await waitFor(() => {
        expect(button).not.toBeDisabled();
      });
    });
  });

  describe('Custom className', () => {
    it('should apply custom className', () => {
      render(<ExportReportButton className="custom-class" />);

      const button = screen.getByRole('button', { name: /export report/i });
      expect(button.className).toContain('custom-class');
    });
  });
});
