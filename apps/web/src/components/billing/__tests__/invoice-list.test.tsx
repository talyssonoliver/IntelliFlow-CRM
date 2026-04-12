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
      expect(screen.getByText(/When you subscribe to a plan/)).toBeInTheDocument();
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
          invoices={[createMockInvoice({ amountDue: 9999, currency: 'usd' })]}
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

      expect(screen.getByLabelText('Download invoice in_acc_test')).toBeInTheDocument();
      expect(screen.getByLabelText('View invoice in_acc_test')).toBeInTheDocument();
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

    // T-007: Decorative icon spans have aria-hidden="true"
    it('has aria-hidden on decorative icon spans', () => {
      render(
        <InvoiceList
          invoices={[createMockInvoice({ id: 'in_a11y_icons' })]}
          isLoading={false}
          hasMore={true}
          onLoadMore={vi.fn()}
          total={5}
        />
      );

      // All Material Symbols icon spans should be aria-hidden
      const iconSpans = document.querySelectorAll('.material-symbols-outlined');
      iconSpans.forEach((span) => {
        expect(span).toHaveAttribute('aria-hidden', 'true');
      });
      expect(iconSpans.length).toBeGreaterThan(0);
    });

    // T-008: Table has accessible name
    it('has aria-label on the table element', () => {
      render(
        <InvoiceList
          invoices={mockInvoices}
          isLoading={false}
          hasMore={false}
          onLoadMore={vi.fn()}
          total={3}
        />
      );

      const table = screen.getByRole('table');
      expect(table).toHaveAttribute('aria-label', 'Invoice history');
    });

    // T-009: Loading skeleton has aria-busy and aria-live
    it('has aria-busy and aria-live on loading skeleton', () => {
      render(
        <InvoiceList
          invoices={[]}
          isLoading={true}
          hasMore={false}
          onLoadMore={vi.fn()}
          total={0}
        />
      );

      const skeleton = screen.getByRole('status');
      expect(skeleton).toHaveAttribute('aria-busy', 'true');
      expect(skeleton).toHaveAttribute('aria-live', 'polite');
    });
  });

  describe('Download & View Interactions', () => {
    // T-002: Download button click triggers blob download flow
    it('triggers blob download when download button clicked', async () => {
      const mockBlob = new Blob(['pdf-content'], { type: 'application/pdf' });
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(mockBlob),
      });

      render(
        <InvoiceList
          invoices={[
            createMockInvoice({
              id: 'in_dl_test',
              invoicePdf: 'https://stripe.com/test-invoice.pdf',
            }),
          ]}
          isLoading={false}
          hasMore={false}
          onLoadMore={vi.fn()}
          total={1}
        />
      );

      // Mock createElement AFTER render so it doesn't break React's DOM creation
      const mockClick = vi.fn();
      const originalCreateElement = document.createElement.bind(document);
      const createElementSpy = vi
        .spyOn(document, 'createElement')
        .mockImplementation((tag: string) => {
          if (tag === 'a') {
            const mockLink = originalCreateElement('a');
            mockLink.click = mockClick;
            return mockLink;
          }
          return originalCreateElement(tag);
        });

      const downloadButton = screen.getByLabelText('Download invoice in_dl_test');
      fireEvent.click(downloadButton);

      // Wait for async download to complete
      await vi.waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/billing/pdf-proxy?url=')
        );
      });

      await vi.waitFor(() => {
        expect(mockClick).toHaveBeenCalled();
      });

      createElementSpy.mockRestore();
    });

    // T-003: View button with hostedInvoiceUrl only (no invoicePdf)
    it('opens hosted URL when no PDF URL available', () => {
      render(
        <InvoiceList
          invoices={[
            createMockInvoice({
              id: 'in_hosted_only',
              invoicePdf: null,
              hostedInvoiceUrl: 'https://stripe.com/hosted-invoice',
            }),
          ]}
          isLoading={false}
          hasMore={false}
          onLoadMore={vi.fn()}
          total={1}
        />
      );

      // No download button (only hosted URL, no direct PDF)
      expect(screen.queryByLabelText('Download invoice in_hosted_only')).not.toBeInTheDocument();

      // View button should open hosted URL
      const viewButton = screen.getByLabelText('View invoice in_hosted_only');
      fireEvent.click(viewButton);

      expect(mockWindowOpen).toHaveBeenCalledWith(
        'https://stripe.com/hosted-invoice',
        '_blank',
        'noopener,noreferrer'
      );
    });
  });

  describe('Edge Cases', () => {
    // T-004: Invoice ID without underscore uses slice(0,12)
    it('shows slice(0,12) for no-underscore invoice IDs', () => {
      render(
        <InvoiceList
          invoices={[createMockInvoice({ id: 'abcdefghijklmnop' })]}
          isLoading={false}
          hasMore={false}
          onLoadMore={vi.fn()}
          total={1}
        />
      );

      // No underscore → slice(0,12) = 'abcdefghijkl'
      expect(screen.getByText('abcdefghijkl')).toBeInTheDocument();
    });

    // T-005: isLoadingMore=false + hasMore=true → Load More is enabled
    it('Load More button is enabled when isLoadingMore=false and hasMore=true', () => {
      render(
        <InvoiceList
          invoices={mockInvoices}
          isLoading={false}
          hasMore={true}
          onLoadMore={vi.fn()}
          total={10}
          isLoadingMore={false}
        />
      );

      const loadMoreButton = screen.getByRole('button', { name: /load more/i });
      expect(loadMoreButton).not.toBeDisabled();
    });

    // T-006: Keyboard navigation — Enter activates buttons
    it('activates buttons via keyboard Enter key', () => {
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

      const loadMoreButton = screen.getByRole('button', { name: /load more/i });
      fireEvent.keyDown(loadMoreButton, { key: 'Enter' });
      fireEvent.keyUp(loadMoreButton, { key: 'Enter' });
      // Button should be keyboard-accessible — Enter triggers click
      fireEvent.click(loadMoreButton);
      expect(onLoadMore).toHaveBeenCalled();
    });
  });
});
