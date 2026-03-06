/**
 * @vitest-environment jsdom
 */
/**
 * Invoice Detail Page Tests
 *
 * @implements PG-028 (Invoice Detail)
 *
 * Tests cover:
 * - T-001: Page renders heading
 * - T-002: Calls getInvoice with correct invoiceId
 * - T-003: Shows loading skeleton
 * - T-004: Passes fetched invoice data to component
 * - T-005: Shows error state
 * - T-006: Shows not-found when invoice null
 * - T-007: Query disabled when invoiceId undefined
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// ============================================
// Mocks
// ============================================

const mockUseParams = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
  useParams: mockUseParams,
}));

const mockUseQuery = vi.hoisted(() => vi.fn());
const mockUseMutation = vi.hoisted(() => vi.fn());
vi.mock('@/lib/trpc', () => ({
  trpc: {
    billing: {
      getInvoice: { useQuery: mockUseQuery },
      payInvoice: { useMutation: mockUseMutation },
    },
  },
}));

const mockInvoiceDetail = vi.hoisted(() => vi.fn());
vi.mock('@/components/billing/invoice-detail', () => ({
  InvoiceDetail: mockInvoiceDetail,
}));

import InvoiceDetailPage from '../page';

// ============================================
// Test data
// ============================================

const mockInvoice = {
  id: 'in_test123',
  customerId: 'cus_123',
  status: 'paid',
  amountDue: 7900,
  amountPaid: 7900,
  amountRemaining: 0,
  currency: 'gbp',
  created: '2025-01-15T10:00:00Z',
};

// ============================================
// Tests
// ============================================

describe('InvoiceDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseParams.mockReturnValue({ id: 'in_test123' });
    mockUseMutation.mockReturnValue({ mutateAsync: vi.fn() });
    mockInvoiceDetail.mockImplementation((props: Record<string, unknown>) => {
      const { invoice, isLoading, error } = props;
      return (
        <div data-testid="invoice-detail">
          {isLoading ? <span>loading</span> : null}
          {error ? <span>{`error: ${String(error)}`}</span> : null}
          {invoice ? <span>{`invoice: ${(invoice as Record<string, string>).id}`}</span> : null}
        </div>
      );
    });
  });

  // T-001
  it('renders "Invoice Details" heading', () => {
    mockUseQuery.mockReturnValue({ data: null, isLoading: false, error: null });

    render(<InvoiceDetailPage />);

    expect(screen.getByText('Invoice Details')).toBeInTheDocument();
  });

  // T-002
  it('calls getInvoice.useQuery with correct invoiceId', () => {
    mockUseQuery.mockReturnValue({ data: null, isLoading: true, error: null });

    render(<InvoiceDetailPage />);

    expect(mockUseQuery).toHaveBeenCalledWith({ invoiceId: 'in_test123' }, { enabled: true });
  });

  // T-003
  it('shows loading state when query is loading', () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: true, error: null });

    render(<InvoiceDetailPage />);

    expect(screen.getByText('loading')).toBeInTheDocument();
  });

  // T-004
  it('passes fetched invoice data to InvoiceDetail component', () => {
    mockUseQuery.mockReturnValue({ data: mockInvoice, isLoading: false, error: null });

    render(<InvoiceDetailPage />);

    expect(screen.getByText('invoice: in_test123')).toBeInTheDocument();
  });

  // T-005
  it('shows error state when query fails', () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: { message: 'Invoice not found.' },
    });

    render(<InvoiceDetailPage />);

    expect(screen.getByText('error: Invoice not found.')).toBeInTheDocument();
  });

  // T-006
  it('shows not-found when invoice is null after query succeeds', () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: false, error: null });

    render(<InvoiceDetailPage />);

    // InvoiceDetail receives null invoice, not loading, no error
    expect(mockInvoiceDetail).toHaveBeenCalledWith(
      expect.objectContaining({
        invoice: null,
        isLoading: false,
        error: null,
      }),
      undefined
    );
  });

  // T-007
  it('query disabled when invoiceId is undefined', () => {
    mockUseParams.mockReturnValue({});
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: false, error: null });

    render(<InvoiceDetailPage />);

    expect(mockUseQuery).toHaveBeenCalledWith(expect.anything(), { enabled: false });
  });

  it('passes onPayNow callback to InvoiceDetail', () => {
    mockUseQuery.mockReturnValue({ data: mockInvoice, isLoading: false, error: null });

    render(<InvoiceDetailPage />);

    expect(mockInvoiceDetail).toHaveBeenCalledWith(
      expect.objectContaining({
        onPayNow: expect.any(Function),
      }),
      undefined
    );
  });
});
