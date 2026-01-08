'use client';

/**
 * Receipt List Component
 *
 * Displays a paginated list of payment receipts with download
 * and email actions.
 *
 * @implements PG-031 (Receipts)
 */

import { useState } from 'react';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@intelliflow/ui';
import { formatBillingDate, formatCurrency } from '@/lib/billing/stripe-portal';
import {
  downloadInvoicePdf,
  openInvoicePdf,
  isValidPdfUrl,
} from '@/lib/billing/pdf-generator';

// ============================================
// Types
// ============================================

export interface Receipt {
  id: string;
  receiptNumber: string;
  amountPaid: number;
  currency: string;
  paymentDate: Date | string;
  paymentMethod: string;
  receiptUrl: string | null;
  customerEmail: string;
}

export interface ReceiptListProps {
  receipts: Receipt[];
  isLoading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onSendEmail: (receiptId: string, email: string) => Promise<void>;
  total: number;
  isLoadingMore?: boolean;
}

// ============================================
// Loading Skeleton
// ============================================

function ReceiptListSkeleton() {
  return (
    <div className="space-y-3" aria-label="Loading receipts">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center justify-between py-3">
          <div className="flex items-center gap-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="flex items-center gap-4">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-8 w-16 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================
// Empty State
// ============================================

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
        <span className="material-symbols-outlined text-3xl text-slate-400">
          receipt
        </span>
      </div>
      <h3 className="mb-2 text-lg font-semibold text-slate-900 dark:text-white">
        No receipts yet
      </h3>
      <p className="max-w-sm text-sm text-slate-500 dark:text-slate-400">
        When you make payments, your receipts will appear here.
      </p>
    </div>
  );
}

// ============================================
// Receipt Actions
// ============================================

function ReceiptActions({
  receipt,
  onSendEmail,
  isSending,
}: {
  receipt: Receipt;
  onSendEmail: (receiptId: string, email: string) => Promise<void>;
  isSending: boolean;
}) {
  const hasUrl = isValidPdfUrl(receipt.receiptUrl);

  const handleDownload = async () => {
    if (!receipt.receiptUrl) return;
    const filename = `receipt-${receipt.receiptNumber}.pdf`;
    try {
      await downloadInvoicePdf(receipt.receiptUrl, filename);
    } catch {
      openInvoicePdf(receipt.receiptUrl);
    }
  };

  const handleEmail = async () => {
    await onSendEmail(receipt.id, receipt.customerEmail);
  };

  return (
    <div className="flex items-center gap-1">
      {hasUrl && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={handleDownload}
          title="Download receipt"
          aria-label={`Download receipt ${receipt.receiptNumber}`}
        >
          <span className="material-symbols-outlined text-lg">download</span>
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0"
        onClick={handleEmail}
        disabled={isSending}
        title="Email receipt"
        aria-label={`Email receipt ${receipt.receiptNumber}`}
      >
        {isSending ? (
          <span className="material-symbols-outlined text-lg animate-spin">
            progress_activity
          </span>
        ) : (
          <span className="material-symbols-outlined text-lg">mail</span>
        )}
      </Button>
    </div>
  );
}

// ============================================
// Receipt Row
// ============================================

function ReceiptRow({
  receipt,
  onSendEmail,
  isSending,
}: {
  receipt: Receipt;
  onSendEmail: (receiptId: string, email: string) => Promise<void>;
  isSending: boolean;
}) {
  return (
    <TableRow className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
      <TableCell className="font-medium text-slate-900 dark:text-white">
        {formatBillingDate(receipt.paymentDate)}
      </TableCell>
      <TableCell className="text-slate-600 dark:text-slate-400">
        <span className="font-mono text-xs">{receipt.receiptNumber}</span>
      </TableCell>
      <TableCell className="text-right font-medium text-slate-900 dark:text-white">
        {formatCurrency(receipt.amountPaid, receipt.currency)}
      </TableCell>
      <TableCell className="text-slate-600 dark:text-slate-400">
        {receipt.paymentMethod}
      </TableCell>
      <TableCell className="text-right">
        <ReceiptActions
          receipt={receipt}
          onSendEmail={onSendEmail}
          isSending={isSending}
        />
      </TableCell>
    </TableRow>
  );
}

// ============================================
// Main Component
// ============================================

export function ReceiptList({
  receipts,
  isLoading,
  hasMore,
  onLoadMore,
  onSendEmail,
  total,
  isLoadingMore = false,
}: ReceiptListProps) {
  const [sendingReceiptId, setSendingReceiptId] = useState<string | null>(null);

  const handleSendEmail = async (receiptId: string, email: string) => {
    setSendingReceiptId(receiptId);
    try {
      await onSendEmail(receiptId, email);
    } finally {
      setSendingReceiptId(null);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="material-symbols-outlined text-xl text-primary">
              receipt
            </span>
            Receipts
          </CardTitle>
          <CardDescription>Loading your receipts...</CardDescription>
        </CardHeader>
        <CardContent>
          <ReceiptListSkeleton />
        </CardContent>
      </Card>
    );
  }

  if (receipts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="material-symbols-outlined text-xl text-primary">
              receipt
            </span>
            Receipts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <span className="material-symbols-outlined text-xl text-primary">
                receipt
              </span>
              Receipts
            </CardTitle>
            <CardDescription>
              Showing {receipts.length} of {total} receipts
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50 dark:bg-slate-800/50">
                <TableHead className="font-medium">Date</TableHead>
                <TableHead className="font-medium">Receipt #</TableHead>
                <TableHead className="text-right font-medium">Amount</TableHead>
                <TableHead className="font-medium">Payment Method</TableHead>
                <TableHead className="text-right font-medium">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {receipts.map((receipt) => (
                <ReceiptRow
                  key={receipt.id}
                  receipt={receipt}
                  onSendEmail={handleSendEmail}
                  isSending={sendingReceiptId === receipt.id}
                />
              ))}
            </TableBody>
          </Table>
        </div>

        {hasMore && (
          <div className="mt-4 flex justify-center">
            <Button
              variant="outline"
              onClick={onLoadMore}
              disabled={isLoadingMore}
              className="min-w-[120px]"
            >
              {isLoadingMore ? (
                <>
                  <span className="material-symbols-outlined animate-spin mr-2 text-lg">
                    progress_activity
                  </span>
                  Loading...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined mr-2 text-lg">
                    expand_more
                  </span>
                  Load More
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default ReceiptList;
