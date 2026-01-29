'use client';

/**
 * Receipts Page
 *
 * Displays a paginated list of payment receipts with download
 * and email functionality.
 *
 * @implements PG-031 (Receipts)
 */

import { useState, useCallback, useEffect } from 'react';
import { ReceiptList, type Receipt } from '@/components/billing/receipt-list';
import { sendReceiptEmail } from '@/lib/billing/receipt-emailer';
import { useToast } from '@intelliflow/ui';

const RECEIPTS_PER_PAGE = 10;

// Mock data for development - replace with tRPC query in production
const MOCK_RECEIPTS: Receipt[] = [
  {
    id: 'rcpt_001',
    receiptNumber: 'RCP-2026-0001',
    amountPaid: 7900,
    currency: 'GBP',
    paymentDate: '2026-01-05',
    paymentMethod: 'Visa ****4242',
    receiptUrl: 'https://pay.stripe.com/receipts/acct_1234/rcpt_001',
    customerEmail: 'customer@example.com',
  },
  {
    id: 'rcpt_002',
    receiptNumber: 'RCP-2025-0012',
    amountPaid: 7900,
    currency: 'GBP',
    paymentDate: '2025-12-05',
    paymentMethod: 'Visa ****4242',
    receiptUrl: 'https://pay.stripe.com/receipts/acct_1234/rcpt_002',
    customerEmail: 'customer@example.com',
  },
  {
    id: 'rcpt_003',
    receiptNumber: 'RCP-2025-0011',
    amountPaid: 7900,
    currency: 'GBP',
    paymentDate: '2025-11-05',
    paymentMethod: 'Mastercard ****5678',
    receiptUrl: 'https://pay.stripe.com/receipts/acct_1234/rcpt_003',
    customerEmail: 'customer@example.com',
  },
  {
    id: 'rcpt_004',
    receiptNumber: 'RCP-2025-0010',
    amountPaid: 7900,
    currency: 'GBP',
    paymentDate: '2025-10-05',
    paymentMethod: 'Visa ****4242',
    receiptUrl: null, // No PDF available
    customerEmail: 'customer@example.com',
  },
  {
    id: 'rcpt_005',
    receiptNumber: 'RCP-2025-0009',
    amountPaid: 19900,
    currency: 'GBP',
    paymentDate: '2025-09-05',
    paymentMethod: 'Amex ****1234',
    receiptUrl: 'https://pay.stripe.com/receipts/acct_1234/rcpt_005',
    customerEmail: 'customer@example.com',
  },
];

export default function ReceiptsPage() {
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [total, setTotal] = useState(0);

  // Simulate initial data fetch
  useEffect(() => {
    // In production, replace with:
    // const { data, isLoading } = trpc.billing.listReceipts.useQuery({
    //   page,
    //   limit: RECEIPTS_PER_PAGE,
    // });

    setIsLoading(true);
    const timer = setTimeout(() => {
      const paginatedReceipts = MOCK_RECEIPTS.slice(0, RECEIPTS_PER_PAGE);
      setReceipts(paginatedReceipts);
      setTotal(MOCK_RECEIPTS.length);
      setIsLoading(false);
    }, 500);

    return () => clearTimeout(timer);
  }, []);

  // Handle pagination
  useEffect(() => {
    if (page > 1 && isFetching) {
      const timer = setTimeout(() => {
        const start = (page - 1) * RECEIPTS_PER_PAGE;
        const end = start + RECEIPTS_PER_PAGE;
        const newReceipts = MOCK_RECEIPTS.slice(start, end);

        setReceipts((prev) => {
          const existingIds = new Set(prev.map((r) => r.id));
          const unique = newReceipts.filter((r) => !existingIds.has(r.id));
          return [...prev, ...unique];
        });
        setIsFetching(false);
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [page, isFetching]);

  const handleLoadMore = useCallback(() => {
    if (isFetching) return;
    setIsFetching(true);
    setPage((prev) => prev + 1);
  }, [isFetching]);

  const handleSendEmail = useCallback(
    async (receiptId: string, email: string) => {
      const result = await sendReceiptEmail(receiptId, email);

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
    [toast]
  );

  const hasMore = receipts.length < total;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Receipts
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Your payment receipts and transaction history
          </p>
        </div>
      </div>

      {/* Receipt List */}
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
