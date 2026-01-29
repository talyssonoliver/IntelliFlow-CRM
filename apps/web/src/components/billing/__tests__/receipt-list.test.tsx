/**
 * @vitest-environment jsdom
 */
/**
 * Receipt List Component Tests
 *
 * @implements PG-031 (Receipts)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ReceiptList, type Receipt } from '../receipt-list';

// Mock the billing utilities
vi.mock('@/lib/billing/stripe-portal', () => ({
  formatBillingDate: (date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('en-GB', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  },
  formatCurrency: (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount / 100);
  },
}));

vi.mock('@/lib/billing/pdf-generator', () => ({
  downloadInvoicePdf: vi.fn().mockResolvedValue(undefined),
  openInvoicePdf: vi.fn(),
  isValidPdfUrl: (url: string | null) => !!url && url.startsWith('https://'),
}));

const mockReceipts: Receipt[] = [
  {
    id: 'rcpt_001',
    receiptNumber: 'RCP-2026-0001',
    amountPaid: 7900,
    currency: 'GBP',
    paymentDate: '2026-01-05',
    paymentMethod: 'Visa ****4242',
    receiptUrl: 'https://pay.stripe.com/receipts/123',
    customerEmail: 'user@example.com',
  },
  {
    id: 'rcpt_002',
    receiptNumber: 'RCP-2025-0012',
    amountPaid: 7900,
    currency: 'GBP',
    paymentDate: '2025-12-05',
    paymentMethod: 'Mastercard ****5678',
    receiptUrl: null,
    customerEmail: 'user@example.com',
  },
];

describe('ReceiptList', () => {
  const defaultProps = {
    receipts: mockReceipts,
    isLoading: false,
    hasMore: false,
    onLoadMore: vi.fn(),
    onSendEmail: vi.fn().mockResolvedValue(undefined),
    total: 2,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Loading State', () => {
    it('renders loading skeleton when isLoading is true', () => {
      render(<ReceiptList {...defaultProps} isLoading={true} receipts={[]} />);

      expect(screen.getByText(/loading your receipts/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/loading receipts/i)).toBeInTheDocument();
    });

    it('shows receipt icon in loading state', () => {
      render(<ReceiptList {...defaultProps} isLoading={true} receipts={[]} />);

      expect(screen.getByText('receipt')).toBeInTheDocument();
    });
  });

  describe('Empty State', () => {
    it('renders empty state when no receipts', () => {
      render(<ReceiptList {...defaultProps} receipts={[]} total={0} />);

      expect(screen.getByText(/no receipts yet/i)).toBeInTheDocument();
      expect(
        screen.getByText(/when you make payments/i)
      ).toBeInTheDocument();
    });
  });

  describe('Receipt Table', () => {
    it('renders table with correct headers', () => {
      render(<ReceiptList {...defaultProps} />);

      expect(screen.getByText('Date')).toBeInTheDocument();
      expect(screen.getByText('Receipt #')).toBeInTheDocument();
      expect(screen.getByText('Amount')).toBeInTheDocument();
      expect(screen.getByText('Payment Method')).toBeInTheDocument();
      expect(screen.getByText('Actions')).toBeInTheDocument();
    });

    it('renders receipt data correctly', () => {
      render(<ReceiptList {...defaultProps} />);

      expect(screen.getByText('RCP-2026-0001')).toBeInTheDocument();
      expect(screen.getByText('RCP-2025-0012')).toBeInTheDocument();
      expect(screen.getByText('Visa ****4242')).toBeInTheDocument();
      expect(screen.getByText('Mastercard ****5678')).toBeInTheDocument();
    });

    it('formats currency correctly', () => {
      render(<ReceiptList {...defaultProps} />);

      // £79.00 should appear twice (for both receipts)
      const currencyElements = screen.getAllByText(/£79\.00/);
      expect(currencyElements.length).toBe(2);
    });

    it('shows count in description', () => {
      render(<ReceiptList {...defaultProps} />);

      expect(screen.getByText(/showing 2 of 2 receipts/i)).toBeInTheDocument();
    });
  });

  describe('Actions', () => {
    it('shows download button when receiptUrl exists', () => {
      render(<ReceiptList {...defaultProps} />);

      const downloadButtons = screen.getAllByTitle('Download receipt');
      // Only first receipt has a valid URL
      expect(downloadButtons.length).toBe(1);
    });

    it('shows email button for all receipts', () => {
      render(<ReceiptList {...defaultProps} />);

      const emailButtons = screen.getAllByTitle('Email receipt');
      expect(emailButtons.length).toBe(2);
    });

    it('calls onSendEmail when email button is clicked', async () => {
      const onSendEmail = vi.fn().mockResolvedValue(undefined);
      render(<ReceiptList {...defaultProps} onSendEmail={onSendEmail} />);

      const emailButtons = screen.getAllByTitle('Email receipt');
      fireEvent.click(emailButtons[0]);

      await waitFor(() => {
        expect(onSendEmail).toHaveBeenCalledWith('rcpt_001', 'user@example.com');
      });
    });

    it('disables email button while sending', async () => {
      // Create a slow mock
      const onSendEmail = vi.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      );

      render(<ReceiptList {...defaultProps} onSendEmail={onSendEmail} />);

      const emailButtons = screen.getAllByTitle('Email receipt');
      fireEvent.click(emailButtons[0]);

      // Button should be disabled during send
      await waitFor(() => {
        expect(emailButtons[0]).toBeDisabled();
      });
    });
  });

  describe('Pagination', () => {
    it('shows load more button when hasMore is true', () => {
      render(<ReceiptList {...defaultProps} hasMore={true} />);

      expect(
        screen.getByRole('button', { name: /load more/i })
      ).toBeInTheDocument();
    });

    it('hides load more button when hasMore is false', () => {
      render(<ReceiptList {...defaultProps} hasMore={false} />);

      expect(
        screen.queryByRole('button', { name: /load more/i })
      ).not.toBeInTheDocument();
    });

    it('calls onLoadMore when load more is clicked', () => {
      const onLoadMore = vi.fn();
      render(
        <ReceiptList {...defaultProps} hasMore={true} onLoadMore={onLoadMore} />
      );

      fireEvent.click(screen.getByRole('button', { name: /load more/i }));
      expect(onLoadMore).toHaveBeenCalled();
    });

    it('disables load more button when isLoadingMore', () => {
      render(
        <ReceiptList {...defaultProps} hasMore={true} isLoadingMore={true} />
      );

      const button = screen.getByRole('button', { name: /loading/i });
      expect(button).toBeDisabled();
    });
  });

  describe('Accessibility', () => {
    it('has accessible button labels', () => {
      render(<ReceiptList {...defaultProps} />);

      expect(
        screen.getByLabelText(/download receipt RCP-2026-0001/i)
      ).toBeInTheDocument();
      expect(
        screen.getByLabelText(/email receipt RCP-2026-0001/i)
      ).toBeInTheDocument();
    });
  });
});
