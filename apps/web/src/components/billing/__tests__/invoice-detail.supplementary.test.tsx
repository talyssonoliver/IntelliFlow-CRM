/**
 * @vitest-environment jsdom
 */
/**
 * Invoice Detail Component - Supplementary Tests
 *
 * @implements PG-028 (Invoice Detail)
 *
 * Tests cover:
 * - Loading skeleton state
 * - Error state
 * - Not found state
 * - Invoice header rendering (id, status, dates)
 * - Line items table
 * - Totals section (subtotal, tax, discount, balance due)
 * - Action buttons (download, view, print, copy, email)
 * - Customer/billing details
 * - Action message toast
 * - Invoice ID formatting
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { InvoiceDetailData } from '../invoice-detail';

// ============================================
// Module mocks
// ============================================

vi.mock('@/lib/billing/stripe-portal', () => ({
  formatBillingDate: (d: string | Date) => {
    const date = typeof d === 'string' ? new Date(d) : d instanceof Date ? d : new Date();
    return date.toLocaleDateString('en-GB');
  },
  formatBillingDateTime: (d: string | Date) => {
    const date = typeof d === 'string' ? new Date(d) : d instanceof Date ? d : new Date();
    return date.toLocaleString('en-GB');
  },
  formatCurrency: (amount: number, currency: string) =>
    `${currency === 'gbp' ? '£' : '$'}${(amount / 100).toFixed(2)}`,
  getInvoiceStatusDisplay: (status: string) => {
    const map: Record<string, any> = {
      paid: { label: 'Paid', variant: 'success' },
      open: { label: 'Open', variant: 'warning' },
      void: { label: 'Void', variant: 'error' },
      draft: { label: 'Draft', variant: 'default' },
      uncollectible: { label: 'Uncollectible', variant: 'error' },
    };
    return map[status] ?? { label: status, variant: 'default' };
  },
}));

const mockDownloadInvoice = vi.hoisted(() => vi.fn());
const mockViewInvoice = vi.hoisted(() => vi.fn());
const mockPrintInvoice = vi.hoisted(() => vi.fn());
const mockCopyInvoiceLink = vi.hoisted(() => vi.fn());
const mockEmailInvoice = vi.hoisted(() => vi.fn());
const mockHasViewableUrl = vi.hoisted(() => vi.fn());

vi.mock('@/lib/billing/invoice-actions', () => ({
  downloadInvoice: mockDownloadInvoice,
  viewInvoice: mockViewInvoice,
  printInvoice: mockPrintInvoice,
  copyInvoiceLink: mockCopyInvoiceLink,
  emailInvoice: mockEmailInvoice,
  hasViewableUrl: mockHasViewableUrl,
}));

import { InvoiceDetail } from '../invoice-detail';

// ============================================
// Test data
// ============================================

const baseInvoice: InvoiceDetailData = {
  id: 'in_abc123_xyz456',
  customerId: 'cus_test',
  subscriptionId: 'sub_test',
  status: 'paid',
  amountDue: 7900,
  amountPaid: 7900,
  amountRemaining: 0,
  currency: 'gbp',
  created: '2025-01-15T10:00:00Z',
  dueDate: '2025-02-15T10:00:00Z',
  paidAt: '2025-01-20T10:00:00Z',
  hostedInvoiceUrl: 'https://invoice.stripe.com/i/test',
  invoicePdf: 'https://invoice.stripe.com/i/test.pdf',
  lineItems: [
    {
      id: 'li_001',
      description: 'Professional Plan (Jan 2025)',
      quantity: 1,
      unitAmount: 7900,
      amount: 7900,
      currency: 'gbp',
    },
  ],
  subtotal: 7900,
  tax: 0,
  discount: 0,
  customerName: 'John Doe',
  customerEmail: 'john@example.com',
  billingAddress: {
    line1: '123 Main St',
    line2: 'Apt 4B',
    city: 'London',
    state: 'Greater London',
    postalCode: 'SW1A 1AA',
    country: 'United Kingdom',
  },
};

// ============================================
// Tests
// ============================================

describe('InvoiceDetail', () => {
  beforeEach(() => {
    mockHasViewableUrl.mockReturnValue(true);
    mockDownloadInvoice.mockResolvedValue({ success: true, message: 'Downloaded' });
    mockViewInvoice.mockReturnValue({ success: true, message: 'Opened' });
    mockPrintInvoice.mockReturnValue({ success: true, message: 'Print dialog opened' });
    mockCopyInvoiceLink.mockResolvedValue({ success: true, message: 'Link copied' });
    mockEmailInvoice.mockReturnValue({ success: true, message: 'Email client opened' });
  });

  describe('Loading State', () => {
    it('renders skeleton when loading', () => {
      const { container } = render(<InvoiceDetail invoice={null} isLoading={true} />);

      // Skeleton should be rendered (no invoice content)
      expect(screen.queryByText(/Invoice #/)).not.toBeInTheDocument();
      // Container should have content (skeleton divs)
      expect(container.firstChild).toBeTruthy();
    });
  });

  describe('Error State', () => {
    it('renders error message', () => {
      render(<InvoiceDetail invoice={null} isLoading={false} error="Failed to fetch invoice" />);

      expect(screen.getByText('Error Loading Invoice')).toBeInTheDocument();
      expect(screen.getByText('Failed to fetch invoice')).toBeInTheDocument();
    });

    it('renders Back to Invoices link in error state', () => {
      render(<InvoiceDetail invoice={null} isLoading={false} error="Network error" />);

      expect(screen.getByRole('link', { name: /back to invoices/i })).toHaveAttribute(
        'href',
        '/billing/invoices'
      );
    });
  });

  describe('Not Found State', () => {
    it('renders not found when invoice is null and not loading', () => {
      render(<InvoiceDetail invoice={null} isLoading={false} />);

      expect(screen.getByText('Invoice Not Found')).toBeInTheDocument();
    });

    it('renders Back to Invoices link in not found state', () => {
      render(<InvoiceDetail invoice={null} isLoading={false} />);

      expect(screen.getByRole('link', { name: /back to invoices/i })).toHaveAttribute(
        'href',
        '/billing/invoices'
      );
    });
  });

  describe('Invoice Header', () => {
    it('renders invoice ID (last segment after underscore)', () => {
      render(<InvoiceDetail invoice={baseInvoice} isLoading={false} />);

      // id is 'in_abc123_xyz456', displayId = 'xyz456' (last segment after _)
      expect(screen.getByText(/Invoice #xyz456/)).toBeInTheDocument();
    });

    it('uses first 12 chars when id has no underscore', () => {
      const invoice = { ...baseInvoice, id: 'nounderscore1234567890' };

      render(<InvoiceDetail invoice={invoice} isLoading={false} />);

      expect(screen.getByText(/Invoice #nounderscore/)).toBeInTheDocument();
    });

    it('renders status badge', () => {
      render(<InvoiceDetail invoice={baseInvoice} isLoading={false} />);

      expect(screen.getByText('Paid')).toBeInTheDocument();
    });

    it('renders created date', () => {
      render(<InvoiceDetail invoice={baseInvoice} isLoading={false} />);

      expect(screen.getByText(/Created on/)).toBeInTheDocument();
    });

    it('renders due date when present', () => {
      render(<InvoiceDetail invoice={baseInvoice} isLoading={false} />);

      expect(screen.getByText('Due Date')).toBeInTheDocument();
    });

    it('does not render due date when absent', () => {
      const invoice = { ...baseInvoice, dueDate: null };

      render(<InvoiceDetail invoice={invoice} isLoading={false} />);

      expect(screen.queryByText('Due Date')).not.toBeInTheDocument();
    });

    it('renders paid date when present', () => {
      render(<InvoiceDetail invoice={baseInvoice} isLoading={false} />);

      expect(screen.getByText('Paid Date')).toBeInTheDocument();
    });

    it('does not render paid date when absent', () => {
      const invoice = { ...baseInvoice, paidAt: null };

      render(<InvoiceDetail invoice={invoice} isLoading={false} />);

      expect(screen.queryByText('Paid Date')).not.toBeInTheDocument();
    });
  });

  describe('Back Link', () => {
    it('renders back to invoices link', () => {
      render(<InvoiceDetail invoice={baseInvoice} isLoading={false} />);

      expect(screen.getByText('Back to Invoices')).toBeInTheDocument();
    });
  });

  describe('Customer Details', () => {
    it('renders customer name and email', () => {
      render(<InvoiceDetail invoice={baseInvoice} isLoading={false} />);

      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('john@example.com')).toBeInTheDocument();
    });

    it('renders billing address', () => {
      render(<InvoiceDetail invoice={baseInvoice} isLoading={false} />);

      expect(screen.getByText('123 Main St')).toBeInTheDocument();
      expect(screen.getByText('Apt 4B')).toBeInTheDocument();
      expect(screen.getByText('United Kingdom')).toBeInTheDocument();
    });

    it('does not render billing details section when no customer info', () => {
      const invoice = {
        ...baseInvoice,
        customerName: undefined,
        customerEmail: undefined,
        billingAddress: undefined,
      };

      render(<InvoiceDetail invoice={invoice} isLoading={false} />);

      expect(screen.queryByText('Billing Details')).not.toBeInTheDocument();
    });
  });

  describe('Line Items', () => {
    it('renders line items table', () => {
      render(<InvoiceDetail invoice={baseInvoice} isLoading={false} />);

      expect(screen.getByText('Line Items')).toBeInTheDocument();
      expect(screen.getByText('Professional Plan (Jan 2025)')).toBeInTheDocument();
    });

    it('shows empty message when no line items', () => {
      const invoice = { ...baseInvoice, lineItems: [] };

      render(<InvoiceDetail invoice={invoice} isLoading={false} />);

      expect(screen.getByText('No line items available')).toBeInTheDocument();
    });

    it('renders correct column headers', () => {
      render(<InvoiceDetail invoice={baseInvoice} isLoading={false} />);

      expect(screen.getByText('Description')).toBeInTheDocument();
      expect(screen.getByText('Qty')).toBeInTheDocument();
      expect(screen.getByText('Unit Price')).toBeInTheDocument();
      // "Amount" appears in both table header and invoice summary, use getAllByText
      const amountElements = screen.getAllByText('Amount');
      expect(amountElements.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Totals Section', () => {
    it('renders subtotal when present', () => {
      render(<InvoiceDetail invoice={baseInvoice} isLoading={false} />);

      expect(screen.getByText('Subtotal')).toBeInTheDocument();
    });

    it('renders discount when positive', () => {
      const invoice = { ...baseInvoice, discount: 1000 };

      render(<InvoiceDetail invoice={invoice} isLoading={false} />);

      expect(screen.getByText('Discount')).toBeInTheDocument();
    });

    it('does not render discount when zero', () => {
      render(<InvoiceDetail invoice={baseInvoice} isLoading={false} />);

      expect(screen.queryByText('Discount')).not.toBeInTheDocument();
    });

    it('renders tax when present', () => {
      const invoice = { ...baseInvoice, tax: 1580 };

      render(<InvoiceDetail invoice={invoice} isLoading={false} />);

      expect(screen.getByText('Tax')).toBeInTheDocument();
    });

    it('renders total amount', () => {
      render(<InvoiceDetail invoice={baseInvoice} isLoading={false} />);

      expect(screen.getByText('Total')).toBeInTheDocument();
    });

    it('renders balance due when partially paid', () => {
      const invoice = {
        ...baseInvoice,
        amountDue: 7900,
        amountPaid: 3000,
      };

      render(<InvoiceDetail invoice={invoice} isLoading={false} />);

      expect(screen.getByText('Amount Paid')).toBeInTheDocument();
      expect(screen.getByText('Balance Due')).toBeInTheDocument();
    });

    it('does not render balance due when fully paid', () => {
      // amountPaid === amountDue, so no balance due section
      render(<InvoiceDetail invoice={baseInvoice} isLoading={false} />);

      expect(screen.queryByText('Balance Due')).not.toBeInTheDocument();
    });
  });

  describe('Action Buttons', () => {
    it('renders download, view, print, copy, and email buttons when viewable', () => {
      mockHasViewableUrl.mockReturnValue(true);

      render(<InvoiceDetail invoice={baseInvoice} isLoading={false} />);

      expect(screen.getByRole('button', { name: /download pdf/i })).toBeInTheDocument();
      // The View button has accessible name including icon text "open_in_new View"
      expect(screen.getByRole('button', { name: /^view$/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /print/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /copy link/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /email/i })).toBeInTheDocument();
    });

    it('only renders email button when not viewable', () => {
      mockHasViewableUrl.mockReturnValue(false);

      render(<InvoiceDetail invoice={baseInvoice} isLoading={false} />);

      expect(screen.queryByRole('button', { name: /download pdf/i })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /email/i })).toBeInTheDocument();
    });

    it('calls downloadInvoice on download click', async () => {
      const user = userEvent.setup();
      render(<InvoiceDetail invoice={baseInvoice} isLoading={false} />);

      await user.click(screen.getByRole('button', { name: /download pdf/i }));

      await waitFor(() => {
        expect(mockDownloadInvoice).toHaveBeenCalled();
      });
    });

    it('calls viewInvoice on view click', async () => {
      const user = userEvent.setup();
      render(<InvoiceDetail invoice={baseInvoice} isLoading={false} />);

      await user.click(screen.getByRole('button', { name: /^view$/i }));

      expect(mockViewInvoice).toHaveBeenCalled();
    });

    it('calls printInvoice on print click', async () => {
      const user = userEvent.setup();
      render(<InvoiceDetail invoice={baseInvoice} isLoading={false} />);

      await user.click(screen.getByRole('button', { name: /print/i }));

      expect(mockPrintInvoice).toHaveBeenCalled();
    });

    it('calls copyInvoiceLink on copy click', async () => {
      const user = userEvent.setup();
      render(<InvoiceDetail invoice={baseInvoice} isLoading={false} />);

      await user.click(screen.getByRole('button', { name: /copy link/i }));

      await waitFor(() => {
        expect(mockCopyInvoiceLink).toHaveBeenCalled();
      });
    });

    it('calls emailInvoice on email click', async () => {
      const user = userEvent.setup();
      render(<InvoiceDetail invoice={baseInvoice} isLoading={false} />);

      await user.click(screen.getByRole('button', { name: /email/i }));

      expect(mockEmailInvoice).toHaveBeenCalled();
    });

    it('shows success toast on successful download', async () => {
      mockDownloadInvoice.mockResolvedValue({ success: true, message: 'Downloaded' });
      const user = userEvent.setup();

      render(<InvoiceDetail invoice={baseInvoice} isLoading={false} />);

      await user.click(screen.getByRole('button', { name: /download pdf/i }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText('Downloaded')).toBeInTheDocument();
      });
    });

    it('shows error toast on failed view', async () => {
      mockViewInvoice.mockReturnValue({ success: false, message: 'No URL available' });
      const user = userEvent.setup();

      render(<InvoiceDetail invoice={baseInvoice} isLoading={false} />);

      await user.click(screen.getByRole('button', { name: /^view$/i }));

      await waitFor(() => {
        expect(screen.getByText('No URL available')).toBeInTheDocument();
      });
    });
  });

  // ============================================
  // PG-028: Pay Now Button (AC-005)
  // ============================================

  describe('Pay Now Button', () => {
    const openInvoice: InvoiceDetailData = {
      ...baseInvoice,
      status: 'open',
      amountDue: 7900,
      amountPaid: 0,
      amountRemaining: 7900,
    };

    // T-008
    it('visible for OPEN invoices with amountRemaining > 0', () => {
      const onPayNow = vi.fn();
      render(<InvoiceDetail invoice={openInvoice} isLoading={false} onPayNow={onPayNow} />);

      expect(screen.getByRole('button', { name: /pay now/i })).toBeInTheDocument();
    });

    // T-009
    it('hidden for PAID invoices', () => {
      const onPayNow = vi.fn();
      render(<InvoiceDetail invoice={baseInvoice} isLoading={false} onPayNow={onPayNow} />);

      expect(screen.queryByRole('button', { name: /pay now/i })).not.toBeInTheDocument();
    });

    // T-010
    it('hidden for VOID invoices', () => {
      const voidInvoice = { ...openInvoice, status: 'void', amountRemaining: 7900 };
      const onPayNow = vi.fn();
      render(<InvoiceDetail invoice={voidInvoice} isLoading={false} onPayNow={onPayNow} />);

      expect(screen.queryByRole('button', { name: /pay now/i })).not.toBeInTheDocument();
    });

    // T-011
    it('hidden for DRAFT invoices', () => {
      const draftInvoice = { ...openInvoice, status: 'draft', amountRemaining: 7900 };
      const onPayNow = vi.fn();
      render(<InvoiceDetail invoice={draftInvoice} isLoading={false} onPayNow={onPayNow} />);

      expect(screen.queryByRole('button', { name: /pay now/i })).not.toBeInTheDocument();
    });

    it('hidden when onPayNow is not provided', () => {
      render(<InvoiceDetail invoice={openInvoice} isLoading={false} />);

      expect(screen.queryByRole('button', { name: /pay now/i })).not.toBeInTheDocument();
    });

    it('opens hosted URL when hostedInvoiceUrl available', async () => {
      const windowOpen = vi.spyOn(window, 'open').mockImplementation(() => null);
      const onPayNow = vi.fn();
      const user = userEvent.setup();

      render(
        <InvoiceDetail
          invoice={{ ...openInvoice, hostedInvoiceUrl: 'https://invoice.stripe.com/i/test' }}
          isLoading={false}
          onPayNow={onPayNow}
        />
      );

      await user.click(screen.getByRole('button', { name: /pay now/i }));

      expect(windowOpen).toHaveBeenCalledWith(
        'https://invoice.stripe.com/i/test',
        '_blank',
        'noopener,noreferrer'
      );
      expect(onPayNow).not.toHaveBeenCalled();
      windowOpen.mockRestore();
    });

    it('calls onPayNow when no hosted URL', async () => {
      const onPayNow = vi.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();

      render(
        <InvoiceDetail
          invoice={{ ...openInvoice, hostedInvoiceUrl: null }}
          isLoading={false}
          onPayNow={onPayNow}
        />
      );

      await user.click(screen.getByRole('button', { name: /pay now/i }));

      await waitFor(() => {
        expect(onPayNow).toHaveBeenCalledWith(openInvoice.id);
      });
    });

    it('shows error message when onPayNow rejects', async () => {
      const onPayNow = vi.fn().mockRejectedValue(new Error('Payment failed'));
      const user = userEvent.setup();

      render(
        <InvoiceDetail
          invoice={{ ...openInvoice, hostedInvoiceUrl: null }}
          isLoading={false}
          onPayNow={onPayNow}
        />
      );

      await user.click(screen.getByRole('button', { name: /pay now/i }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('Payment failed');
      });
    });
  });

  // ============================================
  // PG-028: Tax Breakdown (AC-003)
  // ============================================

  describe('Tax Breakdown', () => {
    // T-012
    it('shows VAT label with rate percentage', () => {
      const invoice: InvoiceDetailData = {
        ...baseInvoice,
        taxBreakdown: { amount: 1580, rate: 20, type: 'VAT' },
      };

      render(<InvoiceDetail invoice={invoice} isLoading={false} />);

      expect(screen.getByTestId('tax-breakdown')).toHaveTextContent('VAT (20%)');
    });

    // T-013
    it('shows Sales Tax label', () => {
      const invoice: InvoiceDetailData = {
        ...baseInvoice,
        taxBreakdown: { amount: 790, rate: 10, type: 'SALES_TAX' },
      };

      render(<InvoiceDetail invoice={invoice} isLoading={false} />);

      expect(screen.getByTestId('tax-breakdown')).toHaveTextContent('Sales Tax (10%)');
    });

    // T-014
    it('shows jurisdiction when present', () => {
      const invoice: InvoiceDetailData = {
        ...baseInvoice,
        taxBreakdown: { amount: 1580, rate: 20, type: 'VAT', jurisdiction: 'GB' },
      };

      render(<InvoiceDetail invoice={invoice} isLoading={false} />);

      expect(screen.getByTestId('tax-breakdown')).toHaveTextContent('GB');
    });

    // T-015
    it('hidden when type is NONE', () => {
      const invoice: InvoiceDetailData = {
        ...baseInvoice,
        taxBreakdown: { amount: 0, rate: 0, type: 'NONE' },
      };

      render(<InvoiceDetail invoice={invoice} isLoading={false} />);

      expect(screen.queryByTestId('tax-breakdown')).not.toBeInTheDocument();
    });

    it('hidden when rate is 0', () => {
      const invoice: InvoiceDetailData = {
        ...baseInvoice,
        taxBreakdown: { amount: 0, rate: 0, type: 'VAT' },
      };

      render(<InvoiceDetail invoice={invoice} isLoading={false} />);

      expect(screen.queryByTestId('tax-breakdown')).not.toBeInTheDocument();
    });
  });

  // ============================================
  // PG-028: Invoice Number (AC-002)
  // ============================================

  describe('Invoice Number Display', () => {
    // T-016
    it('displays invoiceNumber when available', () => {
      const invoice: InvoiceDetailData = {
        ...baseInvoice,
        invoiceNumber: 'INV-2025-001',
      };

      render(<InvoiceDetail invoice={invoice} isLoading={false} />);

      expect(screen.getByText(/Invoice #INV-2025-001/)).toBeInTheDocument();
    });

    // T-017
    it('falls back to truncated ID when invoiceNumber absent', () => {
      render(<InvoiceDetail invoice={baseInvoice} isLoading={false} />);

      // id is 'in_abc123_xyz456', displayId = 'xyz456' (last segment)
      expect(screen.getByText(/Invoice #xyz456/)).toBeInTheDocument();
    });
  });

  // ============================================
  // PG-028: Multiple Line Items (AC-001)
  // ============================================

  describe('Multiple Line Items', () => {
    // T-018
    it('renders multiple line items correctly', () => {
      const invoice: InvoiceDetailData = {
        ...baseInvoice,
        lineItems: [
          {
            id: 'li_1',
            description: 'Professional Plan',
            quantity: 1,
            unitAmount: 5000,
            amount: 5000,
            currency: 'gbp',
          },
          {
            id: 'li_2',
            description: 'API Add-on',
            quantity: 2,
            unitAmount: 1000,
            amount: 2000,
            currency: 'gbp',
          },
          {
            id: 'li_3',
            description: 'Support Upgrade',
            quantity: 1,
            unitAmount: 900,
            amount: 900,
            currency: 'gbp',
          },
        ],
      };

      render(<InvoiceDetail invoice={invoice} isLoading={false} />);

      expect(screen.getByText('Professional Plan')).toBeInTheDocument();
      expect(screen.getByText('API Add-on')).toBeInTheDocument();
      expect(screen.getByText('Support Upgrade')).toBeInTheDocument();
    });
  });

  // ============================================
  // PG-028: Totals (AC-004)
  // ============================================

  describe('Totals with totalAmount', () => {
    // T-019
    it('shows totalAmount as Total (not amountDue)', () => {
      const invoice: InvoiceDetailData = {
        ...baseInvoice,
        totalAmount: 9480, // subtotal + tax
        subtotal: 7900,
        tax: 1580,
      };

      render(<InvoiceDetail invoice={invoice} isLoading={false} />);

      const totalsEl = screen.getByTestId('totals-total');
      // Should display totalAmount (9480 / 100 = £94.80)
      expect(totalsEl).toHaveTextContent('£94.80');
    });
  });

  // ============================================
  // PG-028: Accessibility (AC-008)
  // ============================================

  describe('Accessibility', () => {
    // T-020
    it('action buttons have aria-label attributes', () => {
      mockHasViewableUrl.mockReturnValue(true);
      render(<InvoiceDetail invoice={baseInvoice} isLoading={false} />);

      const buttons = screen.getAllByRole('button');
      buttons.forEach((button) => {
        expect(button).toHaveAttribute('aria-label');
      });
    });

    // T-029
    it('toast container has role="alert"', async () => {
      mockDownloadInvoice.mockResolvedValue({ success: true, message: 'Downloaded' });
      const user = userEvent.setup();

      render(<InvoiceDetail invoice={baseInvoice} isLoading={false} />);

      await user.click(screen.getByRole('button', { name: /download pdf/i }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
    });

    // T-030
    it('status badge renders icon element alongside text', () => {
      render(<InvoiceDetail invoice={baseInvoice} isLoading={false} />);

      const badge = screen.getByTestId('status-badge');
      // Should contain a material icon span
      const icon = badge.querySelector('.material-symbols-outlined');
      expect(icon).toBeTruthy();
      expect(badge).toHaveTextContent('Paid');
    });

    // T-031
    it('Pay Now button is reachable via Tab key', async () => {
      const onPayNow = vi.fn();
      const openInvoice: InvoiceDetailData = {
        ...baseInvoice,
        status: 'open',
        amountPaid: 0,
        amountRemaining: 7900,
      };
      const user = userEvent.setup();

      render(<InvoiceDetail invoice={openInvoice} isLoading={false} onPayNow={onPayNow} />);

      const payButton = screen.getByRole('button', { name: /pay now/i });
      // Tab through elements until Pay Now is focused
      await user.tab();
      // Keep tabbing until we reach the Pay Now button or exceed reasonable tries
      let tries = 0;
      while (document.activeElement !== payButton && tries < 20) {
        await user.tab();
        tries++;
      }
      expect(document.activeElement).toBe(payButton);
    });
  });
});
