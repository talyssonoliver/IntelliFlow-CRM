'use client';

/**
 * Invoice Detail Page
 *
 * Displays detailed view of a single invoice with:
 * - Invoice summary and status
 * - Line items breakdown
 * - Action buttons (download, print, email, pay)
 *
 * @implements PG-028 (Invoice Detail)
 */

import { useParams } from 'next/navigation';
import { useCallback } from 'react';
import { InvoiceDetail } from '@/components/billing/invoice-detail';
import { trpc } from '@/lib/trpc';

export default function InvoiceDetailPage() {
  const params = useParams();
  const invoiceId = params?.id as string;

  // Single getInvoice call — replaces listInvoices + client-side filter (AC-001)
  const {
    data: invoice,
    isLoading,
    error,
  } = trpc.billing.getInvoice.useQuery({ invoiceId }, { enabled: !!invoiceId });

  // Pay invoice mutation
  const payInvoiceMutation = trpc.billing.payInvoice.useMutation();

  const handlePayNow = useCallback(
    async (id: string) => {
      await payInvoiceMutation.mutateAsync({ invoiceId: id });
    },
    [payInvoiceMutation]
  );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Invoice Details</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          View and manage invoice information
        </p>
      </div>

      {/* Invoice Detail Component */}
      <InvoiceDetail
        invoice={invoice ?? null}
        isLoading={isLoading}
        error={error?.message ?? null}
        onPayNow={handlePayNow}
      />
    </div>
  );
}
