/**
 * @vitest-environment jsdom
 */
/**
 * Invoice List Navigation Tests
 *
 * @implements PG-028 (Invoice Detail)
 *
 * Tests cover:
 * - T-028: Invoice row contains Link to /billing/invoices/${id}
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// ============================================
// Mocks
// ============================================

vi.mock('@/lib/billing/stripe-portal', () => ({
  formatBillingDate: (d: string | Date) => {
    const date = typeof d === 'string' ? new Date(d) : d instanceof Date ? d : new Date();
    return date.toLocaleDateString('en-GB');
  },
  formatCurrency: (amount: number, currency: string) =>
    `${currency === 'gbp' ? '£' : '$'}${(amount / 100).toFixed(2)}`,
  getInvoiceStatusDisplay: (status: string) => {
    const map: Record<string, { label: string; variant: string }> = {
      paid: { label: 'Paid', variant: 'success' },
      open: { label: 'Open', variant: 'warning' },
    };
    return map[status] ?? { label: status, variant: 'default' };
  },
}));

vi.mock('@/lib/billing/invoice-actions', () => ({
  downloadInvoice: vi.fn().mockResolvedValue({ success: true, message: '' }),
  viewInvoice: vi.fn().mockReturnValue({ success: true, message: '' }),
  printInvoice: vi.fn().mockReturnValue({ success: true, message: '' }),
  copyInvoiceLink: vi.fn().mockResolvedValue({ success: true, message: '' }),
  emailInvoice: vi.fn().mockReturnValue({ success: true, message: '' }),
  hasViewableUrl: vi.fn().mockReturnValue(true),
}));

import { InvoiceList } from '../invoice-list';

// ============================================
// Test data
// ============================================

const mockInvoices = [
  {
    id: 'in_abc123',
    customerId: 'cus_test',
    status: 'paid' as const,
    amountDue: 7900,
    amountPaid: 7900,
    amountRemaining: 0,
    currency: 'gbp',
    created: '2025-01-15T10:00:00Z',
    invoicePdf: 'https://example.com/pdf',
    hostedInvoiceUrl: 'https://example.com/view',
    paidAt: '2025-01-20T10:00:00Z',
    dueDate: null,
  },
];

// ============================================
// Tests
// ============================================

describe('Invoice List Navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // T-028
  it('invoice row contains Link to /billing/invoices/${id}', () => {
    render(
      <InvoiceList
        invoices={mockInvoices}
        isLoading={false}
        hasMore={false}
        onLoadMore={() => {}}
        total={1}
      />
    );

    const link = screen.getByRole('link', { name: /abc123/i });
    expect(link).toHaveAttribute('href', '/billing/invoices/in_abc123');
  });

  it('multiple invoice rows each have correct link', () => {
    const invoices = [
      { ...mockInvoices[0], id: 'in_first_001' },
      { ...mockInvoices[0], id: 'in_second_002' },
    ];

    render(
      <InvoiceList
        invoices={invoices}
        isLoading={false}
        hasMore={false}
        onLoadMore={() => {}}
        total={2}
      />
    );

    const link1 = screen.getByRole('link', { name: /001/i });
    const link2 = screen.getByRole('link', { name: /002/i });
    expect(link1).toHaveAttribute('href', '/billing/invoices/in_first_001');
    expect(link2).toHaveAttribute('href', '/billing/invoices/in_second_002');
  });
});
