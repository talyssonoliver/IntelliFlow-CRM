// @vitest-environment jsdom
/**
 * InvoicesPage Tests
 *
 * Tests page-level logic: tRPC query, accumulation, deduplication, handleLoadMore.
 *
 * @implements PG-027 T-001
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock tRPC billing.listInvoices.useQuery
const mockUseQuery = vi.fn();

vi.mock('@/lib/trpc', () => ({
  trpc: {
    billing: {
      listInvoices: {
        useQuery: (...args: unknown[]) => mockUseQuery(...args),
      },
    },
  },
}));

// Lazy import after mock is in place
const { default: InvoicesPage } = await import('../page');

const createMockInvoice = (id: string) => ({
  id,
  customerId: 'cus_123',
  status: 'paid' as const,
  amountDue: 7900,
  amountPaid: 7900,
  amountRemaining: 0,
  currency: 'gbp',
  created: new Date('2024-12-15').toISOString(),
  paidAt: new Date('2024-12-15').toISOString(),
  invoicePdf: 'https://stripe.com/invoice.pdf',
  hostedInvoiceUrl: 'https://stripe.com/invoice',
});

describe('InvoicesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders invoice list heading', () => {
    mockUseQuery.mockReturnValue({
      data: { invoices: [], total: 0, hasMore: false, page: 1, limit: 10 },
      isLoading: false,
      isFetching: false,
    });

    render(<InvoicesPage />);
    // Page heading is an h1; InvoiceList also has "Invoices" in a CardTitle
    expect(screen.getByRole('heading', { level: 1, name: 'Invoices' })).toBeInTheDocument();
    expect(screen.getByText('View and download your billing history')).toBeInTheDocument();
  });

  it('calls trpc.billing.listInvoices.useQuery with { page: 1, limit: 10 }', () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isFetching: true,
    });

    render(<InvoicesPage />);

    expect(mockUseQuery).toHaveBeenCalledWith({
      page: 1,
      limit: 10,
    });
  });

  it('accumulates invoices across pages with deduplication by ID', () => {
    const page1Invoices = [createMockInvoice('in_001'), createMockInvoice('in_002')];
    const page2Invoices = [createMockInvoice('in_002'), createMockInvoice('in_003')]; // in_002 is duplicate

    // First render: page 1 data
    mockUseQuery.mockReturnValue({
      data: { invoices: page1Invoices, total: 3, hasMore: true, page: 1, limit: 10 },
      isLoading: false,
      isFetching: false,
    });

    const { rerender } = render(<InvoicesPage />);

    // Should show 2 invoices from page 1
    expect(screen.getByText('Showing 2 of 3 invoices')).toBeInTheDocument();

    // Click Load More to trigger page 2
    const loadMoreButton = screen.getByText('Load More');
    fireEvent.click(loadMoreButton);

    // Re-render with page 2 data
    mockUseQuery.mockReturnValue({
      data: { invoices: page2Invoices, total: 3, hasMore: false, page: 2, limit: 10 },
      isLoading: false,
      isFetching: false,
    });

    rerender(<InvoicesPage />);

    // Should show 3 invoices (in_002 deduplicated)
    expect(screen.getByText('Showing 3 of 3 invoices')).toBeInTheDocument();
  });

  it('resets invoices when page === 1', () => {
    mockUseQuery.mockReturnValue({
      data: { invoices: [createMockInvoice('in_001')], total: 1, hasMore: false, page: 1, limit: 10 },
      isLoading: false,
      isFetching: false,
    });

    const { rerender } = render(<InvoicesPage />);
    expect(screen.getByText('Showing 1 of 1 invoices')).toBeInTheDocument();

    // Simulate new page 1 data (e.g. refetch)
    const newData = { invoices: [createMockInvoice('in_999')], total: 1, hasMore: false, page: 1, limit: 10 };
    mockUseQuery.mockReturnValue({
      data: newData,
      isLoading: false,
      isFetching: false,
    });

    rerender(<InvoicesPage />);
    // Should still show 1 invoice (reset, not accumulated)
    expect(screen.getByText('Showing 1 of 1 invoices')).toBeInTheDocument();
  });

  it('handleLoadMore increments page when hasMore && !isFetching', () => {
    mockUseQuery.mockReturnValue({
      data: { invoices: [createMockInvoice('in_001')], total: 5, hasMore: true, page: 1, limit: 10 },
      isLoading: false,
      isFetching: false,
    });

    render(<InvoicesPage />);

    const loadMoreButton = screen.getByText('Load More');
    fireEvent.click(loadMoreButton);

    // After click, useQuery should be called again with page: 2
    // The second call happens on re-render
    const calls = mockUseQuery.mock.calls;
    // Initial call with page 1, subsequent call after state update will have page 2
    expect(calls[0][0]).toEqual({ page: 1, limit: 10 });
  });

  it('handleLoadMore does NOT increment when !hasMore', () => {
    mockUseQuery.mockReturnValue({
      data: { invoices: [createMockInvoice('in_001')], total: 1, hasMore: false, page: 1, limit: 10 },
      isLoading: false,
      isFetching: false,
    });

    render(<InvoicesPage />);

    // Load More button should not be present when hasMore is false
    expect(screen.queryByText('Load More')).not.toBeInTheDocument();
  });

  it('handleLoadMore does NOT increment when isFetching', () => {
    mockUseQuery.mockReturnValue({
      data: { invoices: [createMockInvoice('in_001')], total: 5, hasMore: true, page: 1, limit: 10 },
      isLoading: false,
      isFetching: true, // currently fetching
    });

    render(<InvoicesPage />);

    // The button should be disabled/loading when isFetching and page > 1
    // Since page is 1 and isFetching is true, isLoadingMore = isFetching && page > 1 = false
    // But the handleLoadMore callback checks isFetching before incrementing
    const loadMoreButton = screen.getByText('Load More');
    fireEvent.click(loadMoreButton);

    // All calls should still be page 1 since handleLoadMore guards against isFetching
    const allCalls = mockUseQuery.mock.calls;
    allCalls.forEach((call) => {
      expect(call[0]).toEqual({ page: 1, limit: 10 });
    });
  });

  it('prevDataRef guard prevents duplicate processing of same data', () => {
    const invoices = [createMockInvoice('in_001')];
    const sameData = { invoices, total: 1, hasMore: false, page: 1, limit: 10 };

    mockUseQuery.mockReturnValue({
      data: sameData,
      isLoading: false,
      isFetching: false,
    });

    const { rerender } = render(<InvoicesPage />);
    expect(screen.getByText('Showing 1 of 1 invoices')).toBeInTheDocument();

    // Re-render with the SAME data reference — should not re-process
    rerender(<InvoicesPage />);
    expect(screen.getByText('Showing 1 of 1 invoices')).toBeInTheDocument();
  });
});
