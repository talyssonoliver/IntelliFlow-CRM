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
import { PageHeader } from '@/components/shared/page-header';
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
      <PageHeader
        breadcrumbs={[
          { label: 'Billing', href: '/billing' },
          { label: 'Invoices', href: '/billing/invoices' },
          { label: `Invoice ${invoiceId ? `#${invoiceId.slice(0, 8)}` : ''}` },
        ]}
        title="Invoice Details"
        description="View and manage invoice information."
      />

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
