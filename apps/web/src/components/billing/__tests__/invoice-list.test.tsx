// @vitest-environment jsdom
/**
 * Invoice List Component Tests
 *
 * @implements PG-027 (Invoices)
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InvoiceList } from '../invoice-list';
import type { Invoice } from '@intelliflow/validators';

// Mock invoice data
const createMockInvoice = (overrides: Partial<Invoice> = {}): Invoice => ({
  id: 'in_123456789',
  customerId: 'cus_123',
  status: 'paid',
  amountDue: 7900,
  amountPaid: 7900,
  amountRemaining: 0,
  currency: 'gbp',
  created: new Date('2024-12-15'),
  paidAt: new Date('2024-12-15'),
  invoicePdf: 'https://stripe.com/invoice.pdf',
  hostedInvoiceUrl: 'https://stripe.com/invoice',
  ...overrides,
});

const mockInvoices: Invoice[] = [
  createMockInvoice({
    id: 'in_001',
    status: 'paid',
    amountPaid: 7900,
    created: new Date('2024-12-15'),
    paidAt: new Date('2024-12-15'),
  }),
  createMockInvoice({
    id: 'in_002',
    status: 'open',
    amountDue: 7900,
    amountPaid: 0,
    created: new Date('2024-11-15'),
    paidAt: null,
  }),
  createMockInvoice({
    id: 'in_003',
    status: 'void',
    amountDue: 2900,
    amountPaid: 0,
    created: new Date('2024-10-15'),
    paidAt: null,
  }),
];

// Mock window.open for view actions
const mockWindowOpen = vi.fn();
Object.defineProperty(window, 'open', { value: mockWindowOpen, writable: true });

// Mock fetch for download actions
global.fetch = vi.fn();

// Mock URL methods
const mockCreateObjectURL = vi.fn(() => 'blob:mock-url');
const mockRevokeObjectURL = vi.fn();
global.URL.createObjectURL = mockCreateObjectURL;
global.URL.revokeObjectURL = mockRevokeObjectURL;

describe('InvoiceList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders invoice list with data', () => {
      render(
        <InvoiceList
          invoices={mockInvoices}
          isLoading={false}
          hasMore={false}
          onLoadMore={vi.fn()}
          total={3}
        />
      );

      expect(screen.getByText('Invoices')).toBeInTheDocument();
      expect(screen.getByText('Showing 3 of 3 invoices')).toBeInTheDocument();
    });

    it('renders all invoice rows', () => {
      render(
        <InvoiceList
          invoices={mockInvoices}
          isLoading={false}
          hasMore={false}
          onLoadMore={vi.fn()}
          total={3}
        />
      );

      // Check table headers
      expect(screen.getByText('Date')).toBeInTheDocument();
      expect(screen.getByText('Invoice')).toBeInTheDocument();
      expect(screen.getByText('Amount')).toBeInTheDocument();
      expect(screen.getByText('Status')).toBeInTheDocument();
      expect(screen.getByText('Actions')).toBeInTheDocument();
    });

    it('shows loading skeleton when loading', () => {
      render(
        <InvoiceList
          invoices={[]}
          isLoading={true}
          hasMore={false}
          onLoadMore={vi.fn()}
          total={0}
        />
      );

      expect(screen.getByText('Loading your invoice history...')).toBeInTheDocument();
    });

    it('shows empty state when no invoices', () => {
      render(
        <InvoiceList
          invoices={[]}
          isLoading={false}
          hasMore={false}
          onLoadMore={vi.fn()}
          total={0}
        />
      );

      expect(screen.getByText('No invoices yet')).toBeInTheDocument();
      expect(
        screen.getByText(/When you subscribe to a plan/)
      ).toBeInTheDocument();
    });
  });

  describe('Status Badges', () => {
    it('shows correct badge for paid invoices', () => {
      render(
        <InvoiceList
          invoices={[createMockInvoice({ status: 'paid' })]}
          isLoading={false}
          hasMore={false}
          onLoadMore={vi.fn()}
          total={1}
        />
      );

      const badge = screen.getByText('Paid');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveClass('bg-green-100');
    });

    it('shows correct badge for open invoices', () => {
      render(
        <InvoiceList
          invoices={[createMockInvoice({ status: 'open' })]}
          isLoading={false}
          hasMore={false}
          onLoadMore={vi.fn()}
          total={1}
        />
      );

      const badge = screen.getByText('Open');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveClass('bg-amber-100');
    });

    it('shows correct badge for void invoices', () => {
      render(
        <InvoiceList
          invoices={[createMockInvoice({ status: 'void' })]}
          isLoading={false}
          hasMore={false}
          onLoadMore={vi.fn()}
          total={1}
        />
      );

      const badge = screen.getByText('Void');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveClass('bg-red-100');
    });

    it('shows correct badge for uncollectible invoices', () => {
      render(
        <InvoiceList
          invoices={[createMockInvoice({ status: 'uncollectible' })]}
          isLoading={false}
          hasMore={false}
          onLoadMore={vi.fn()}
          total={1}
        />
      );

      const badge = screen.getByText('Uncollectible');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveClass('bg-red-100');
    });

    it('shows correct badge for draft invoices', () => {
      render(
        <InvoiceList
          invoices={[createMockInvoice({ status: 'draft' })]}
          isLoading={false}
          hasMore={false}
          onLoadMore={vi.fn()}
          total={1}
        />
      );

      const badge = screen.getByText('Draft');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveClass('bg-slate-100');
    });
  });

  describe('Date Formatting', () => {
    it('formats invoice date correctly', () => {
      render(
        <InvoiceList
          invoices={[createMockInvoice({ created: new Date('2024-12-25') })]}
          isLoading={false}
          hasMore={false}
          onLoadMore={vi.fn()}
          total={1}
        />
      );

      expect(screen.getByText('25 Dec 2024')).toBeInTheDocument();
    });

    it('shows paid date when invoice is paid', () => {
      render(
        <InvoiceList
          invoices={[
            createMockInvoice({
              status: 'paid',
              paidAt: new Date('2024-12-26'),
            }),
          ]}
          isLoading={false}
          hasMore={false}
          onLoadMore={vi.fn()}
          total={1}
        />
      );

      expect(screen.getByText('26 Dec 2024')).toBeInTheDocument();
    });

    it('shows dash when no paid date', () => {
      render(
        <InvoiceList
          invoices={[createMockInvoice({ status: 'open', paidAt: null })]}
          isLoading={false}
          hasMore={false}
          onLoadMore={vi.fn()}
          total={1}
        />
      );

      expect(screen.getByText('-')).toBeInTheDocument();
    });
  });

  describe('Currency Formatting', () => {
    it('formats GBP amounts correctly', () => {
      render(
        <InvoiceList
          invoices={[createMockInvoice({ amountPaid: 7900, currency: 'gbp' })]}
          isLoading={false}
          hasMore={false}
          onLoadMore={vi.fn()}
          total={1}
        />
      );

      expect(screen.getByText('£79.00')).toBeInTheDocument();
    });

    it('formats USD amounts correctly', () => {
      render(
        <InvoiceList
          invoices={[createMockInvoice({ amountPaid: 9999, currency: 'usd' })]}
          isLoading={false}
          hasMore={false}
          onLoadMore={vi.fn()}
          total={1}
        />
      );

      expect(screen.getByText('$99.99')).toBeInTheDocument();
    });
  });

  describe('PDF Actions', () => {
    it('renders download button when PDF available', () => {
      render(
        <InvoiceList
          invoices={[
            createMockInvoice({
              id: 'in_test',
              invoicePdf: 'https://stripe.com/invoice.pdf',
            }),
          ]}
          isLoading={false}
          hasMore={false}
          onLoadMore={vi.fn()}
          total={1}
        />
      );

      const downloadButton = screen.getByLabelText('Download invoice in_test');
      expect(downloadButton).toBeInTheDocument();
    });

    it('renders view button when PDF available', () => {
      render(
        <InvoiceList
          invoices={[
            createMockInvoice({
              id: 'in_test',
              invoicePdf: 'https://stripe.com/invoice.pdf',
            }),
          ]}
          isLoading={false}
          hasMore={false}
          onLoadMore={vi.fn()}
          total={1}
        />
      );

      const viewButton = screen.getByLabelText('View invoice in_test');
      expect(viewButton).toBeInTheDocument();
    });

    it('opens PDF in new tab when view clicked', () => {
      render(
        <InvoiceList
          invoices={[
            createMockInvoice({
              id: 'in_test',
              invoicePdf: 'https://stripe.com/invoice.pdf',
            }),
          ]}
          isLoading={false}
          hasMore={false}
          onLoadMore={vi.fn()}
          total={1}
        />
      );

      const viewButton = screen.getByLabelText('View invoice in_test');
      fireEvent.click(viewButton);

      expect(mockWindowOpen).toHaveBeenCalledWith(
        'https://stripe.com/invoice.pdf',
        '_blank',
        'noopener,noreferrer'
      );
    });

    it('shows "Not available" when no PDF URL', () => {
      render(
        <InvoiceList
          invoices={[
            createMockInvoice({
              invoicePdf: null,
              hostedInvoiceUrl: null,
            }),
          ]}
          isLoading={false}
          hasMore={false}
          onLoadMore={vi.fn()}
          total={1}
        />
      );

      expect(screen.getByText('Not available')).toBeInTheDocument();
    });
  });

  describe('Pagination', () => {
    it('shows Load More button when hasMore is true', () => {
      render(
        <InvoiceList
          invoices={mockInvoices}
          isLoading={false}
          hasMore={true}
          onLoadMore={vi.fn()}
          total={10}
        />
      );

      expect(screen.getByText('Load More')).toBeInTheDocument();
    });

    it('hides Load More button when hasMore is false', () => {
      render(
        <InvoiceList
          invoices={mockInvoices}
          isLoading={false}
          hasMore={false}
          onLoadMore={vi.fn()}
          total={3}
        />
      );

      expect(screen.queryByText('Load More')).not.toBeInTheDocument();
    });

    it('calls onLoadMore when Load More is clicked', () => {
      const onLoadMore = vi.fn();

      render(
        <InvoiceList
          invoices={mockInvoices}
          isLoading={false}
          hasMore={true}
          onLoadMore={onLoadMore}
          total={10}
        />
      );

      const loadMoreButton = screen.getByText('Load More');
      fireEvent.click(loadMoreButton);

      expect(onLoadMore).toHaveBeenCalledTimes(1);
    });

    it('shows loading state when loading more', () => {
      render(
        <InvoiceList
          invoices={mockInvoices}
          isLoading={false}
          hasMore={true}
          onLoadMore={vi.fn()}
          total={10}
          isLoadingMore={true}
        />
      );

      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('disables Load More button when loading more', () => {
      render(
        <InvoiceList
          invoices={mockInvoices}
          isLoading={false}
          hasMore={true}
          onLoadMore={vi.fn()}
          total={10}
          isLoadingMore={true}
        />
      );

      const loadMoreButton = screen.getByRole('button', { name: /loading/i });
      expect(loadMoreButton).toBeDisabled();
    });
  });

  describe('Invoice ID Display', () => {
    it('shows shortened invoice ID', () => {
      render(
        <InvoiceList
          invoices={[createMockInvoice({ id: 'in_1234567890abcdef' })]}
          isLoading={false}
          hasMore={false}
          onLoadMore={vi.fn()}
          total={1}
        />
      );

      // Should show the part after underscore
      expect(screen.getByText('1234567890abcdef')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has accessible labels for action buttons', () => {
      render(
        <InvoiceList
          invoices={[createMockInvoice({ id: 'in_acc_test' })]}
          isLoading={false}
          hasMore={false}
          onLoadMore={vi.fn()}
          total={1}
        />
      );

      expect(
        screen.getByLabelText('Download invoice in_acc_test')
      ).toBeInTheDocument();
      expect(
        screen.getByLabelText('View invoice in_acc_test')
      ).toBeInTheDocument();
    });

    it('has proper table structure', () => {
      render(
        <InvoiceList
          invoices={mockInvoices}
          isLoading={false}
          hasMore={false}
          onLoadMore={vi.fn()}
          total={3}
        />
      );

      expect(screen.getByRole('table')).toBeInTheDocument();
      expect(screen.getAllByRole('row')).toHaveLength(4); // header + 3 data rows
    });
  });
});
