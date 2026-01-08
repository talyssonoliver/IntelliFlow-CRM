'use client';

/**
 * Invoice Detail Page
 *
 * Displays detailed view of a single invoice with:
 * - Invoice summary and status
 * - Line items breakdown
 * - Action buttons (download, print, email)
 *
 * @implements PG-028 (Invoice Detail)
 */

import { useParams } from 'next/navigation';
import { useEffect, useState, useCallback, useRef } from 'react';
import { InvoiceDetail, type InvoiceDetailData } from '@/components/billing/invoice-detail';
import { trpc } from '@/lib/trpc';

const INVOICES_PER_PAGE = 100; // Fetch more to find the invoice

export default function InvoiceDetailPage() {
  const params = useParams();
  const invoiceId = params?.id as string;

  const [invoice, setInvoice] = useState<InvoiceDetailData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  // Fetch invoices list and find the specific invoice
  const { data, isLoading: queryLoading, error: queryError } = trpc.billing.listInvoices.useQuery(
    { page: 1, limit: INVOICES_PER_PAGE },
    { enabled: !!invoiceId }
  );

  // Find the invoice from the list
  const findInvoice = useCallback(() => {
    if (!data?.invoices || !invoiceId) return;

    const found = data.invoices.find((inv) => inv.id === invoiceId);

    if (found) {
      // Transform to InvoiceDetailData format
      const detailData: InvoiceDetailData = {
        ...found,
        // Mock line items for display (in production, these would come from API)
        lineItems: generateMockLineItems(found),
        subtotal: found.amountDue,
        tax: 0,
        discount: 0,
      };
      setInvoice(detailData);
      setError(null);
    } else {
      setInvoice(null);
      setError('Invoice not found');
    }
    setIsLoading(false);
  }, [data?.invoices, invoiceId]);

  useEffect(() => {
    if (queryLoading) {
      setIsLoading(true);
      return;
    }

    if (queryError) {
      setError(queryError.message);
      setIsLoading(false);
      return;
    }

    if (!fetchedRef.current && data) {
      fetchedRef.current = true;
      findInvoice();
    }
  }, [data, queryLoading, queryError, findInvoice]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Invoice Details
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          View and manage invoice information
        </p>
      </div>

      {/* Invoice Detail Component */}
      <InvoiceDetail
        invoice={invoice}
        isLoading={isLoading}
        error={error}
      />
    </div>
  );
}

// ============================================
// Helper Functions
// ============================================

/**
 * Generate mock line items based on invoice amount
 * In production, line items would come from Stripe API
 */
function generateMockLineItems(invoice: {
  id: string;
  amountDue: number;
  amountPaid: number;
  currency: string;
  subscriptionId?: string;
}): InvoiceDetailData['lineItems'] {
  // Generate representative line items based on the invoice
  const items: InvoiceDetailData['lineItems'] = [];

  if (invoice.subscriptionId) {
    // Subscription invoice - show plan line item
    items.push({
      id: `li_${invoice.id}_1`,
      description: 'IntelliFlow CRM - Monthly Subscription',
      quantity: 1,
      unitAmount: invoice.amountDue,
      amount: invoice.amountDue,
      currency: invoice.currency,
    });
  } else {
    // One-time invoice
    items.push({
      id: `li_${invoice.id}_1`,
      description: 'IntelliFlow CRM Service',
      quantity: 1,
      unitAmount: invoice.amountDue,
      amount: invoice.amountDue,
      currency: invoice.currency,
    });
  }

  return items;
}
