'use client';

/**
 * Receipts Page
 *
 * Displays a paginated list of payment receipts with download
 * and email functionality. Receipts are paid invoices fetched
 * from Stripe via the billing.listInvoices tRPC procedure.
 *
 * @implements PG-031 (Receipts)
 */

import { useState, useCallback, useMemo } from 'react';
import { ReceiptList, type Receipt } from '@/components/billing/receipt-list';
import { sendReceiptEmail } from '@/lib/billing/receipt-emailer';
import { PageHeader } from '@/components/shared/page-header';
import { useToast } from '@intelliflow/ui';
import { trpc } from '@/lib/trpc';

const RECEIPTS_PER_PAGE = 10;

/** Format card brand + last4 into a display string like "Visa ****4242". */
function formatPaymentMethod(brand?: string, last4?: string): string {
  if (!brand && !last4) return '';
  const displayBrand = brand ? brand.charAt(0).toUpperCase() + brand.slice(1) : 'Card';
  return last4 ? `${displayBrand} ****${last4}` : displayBrand;
}

/** Map a paid Stripe invoice to the Receipt display type. */
function invoiceToReceipt(invoice: {
  id: string;
  number?: string;
  amountPaid: number;
  currency: string;
  paidAt?: string | Date;
  created: string | Date;
  hostedInvoiceUrl?: string;
  invoicePdf?: string;
  customerEmail?: string;
  paymentMethodBrand?: string;
  paymentMethodLast4?: string;
}): Receipt {
  return {
    id: invoice.id,
    receiptNumber: invoice.number || invoice.id,
    amountPaid: invoice.amountPaid,
    currency: invoice.currency,
    paymentDate: invoice.paidAt ? new Date(invoice.paidAt) : new Date(invoice.created),
    paymentMethod: formatPaymentMethod(invoice.paymentMethodBrand, invoice.paymentMethodLast4),
    receiptUrl: invoice.invoicePdf || invoice.hostedInvoiceUrl || null,
    customerEmail: invoice.customerEmail || '',
  };
}

export default function ReceiptsPage() {
  const { toast } = useToast();
  const sendReceiptEmailMutation = trpc.billing.sendReceiptEmail.useMutation();
  const [page, setPage] = useState(1);

  const { data, isLoading, isFetching } = trpc.billing.listInvoices.useQuery({
    page,
    limit: RECEIPTS_PER_PAGE,
  });

  const receipts: Receipt[] = useMemo(() => {
    if (!data?.invoices) return [];
    return data.invoices.filter((inv) => inv.status === 'paid').map(invoiceToReceipt);
  }, [data]);

  const total = data?.total ?? 0;
  const hasMore = data?.hasMore ?? false;

  const handleLoadMore = useCallback(() => {
    if (isFetching) return;
    setPage((prev) => prev + 1);
  }, [isFetching]);

  const handleSendEmail = useCallback(
    async (receiptId: string, email: string) => {
      const result = await sendReceiptEmail(receiptId, email, sendReceiptEmailMutation.mutateAsync);

      if (result.success) {
        toast({
          title: 'Receipt sent',
          description: `Receipt sent to ${email}`,
        });
      } else {
        toast({
          title: 'Failed to send',
          description: result.error || 'Please try again later',
          variant: 'destructive',
        });
      }
    },
    [toast, sendReceiptEmailMutation.mutateAsync]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: 'Billing', href: '/billing' }, { label: 'Receipts' }]}
        title="Receipts"
        description="Your payment receipts and transaction history."
      />

      <ReceiptList
        receipts={receipts}
        isLoading={isLoading}
        hasMore={hasMore}
        onLoadMore={handleLoadMore}
        onSendEmail={handleSendEmail}
        total={total}
        isLoadingMore={isFetching}
      />
    </div>
  );
}
