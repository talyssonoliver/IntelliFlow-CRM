'use client';

/**
 * Invoice List Component
 *
 * Displays a paginated list of invoices with status badges,
 * date formatting, currency display, and PDF download actions.
 *
 * @implements PG-027 (Invoices)
 */

import {
  Badge,
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
import {
  formatBillingDate,
  formatCurrency,
  getInvoiceStatusDisplay,
  type StatusVariant,
} from '@/lib/billing/stripe-portal';
import {
  downloadInvoicePdf,
  generateInvoiceFilename,
  getInvoicePdfInfo,
  openInvoicePdf,
} from '@/lib/billing/pdf-generator';
import type { Invoice } from '@intelliflow/validators';

// ============================================
// Types
// ============================================

// SerializedInvoice allows date fields to be either Date or string (JSON serialization)
type DateOrString = Date | string;
type SerializedInvoice = Omit<Invoice, 'created' | 'paidAt' | 'dueDate'> & {
  created: DateOrString;
  paidAt?: DateOrString | null;
  dueDate?: DateOrString | null;
};

export interface InvoiceListProps {
  invoices: SerializedInvoice[];
  isLoading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  total: number;
  isLoadingMore?: boolean;
}

// ============================================
// Status Badge Component
// ============================================

function StatusBadge({ status }: { status: string }) {
  const { label, variant } = getInvoiceStatusDisplay(status);

  const variantClasses: Record<StatusVariant, string> = {
    success:
      'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    warning:
      'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    error: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    default:
      'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300',
  };

  return (
    <Badge
      className={`${variantClasses[variant]} border-0 font-medium`}
      variant="outline"
    >
      {label}
    </Badge>
  );
}

// ============================================
// Loading Skeleton
// ============================================

function InvoiceListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center justify-between py-3">
          <div className="flex items-center gap-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="flex items-center gap-4">
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-8 w-8 rounded" />
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
          receipt_long
        </span>
      </div>
      <h3 className="mb-2 text-lg font-semibold text-slate-900 dark:text-white">
        No invoices yet
      </h3>
      <p className="max-w-sm text-sm text-slate-500 dark:text-slate-400">
        When you subscribe to a plan or make payments, your invoices will appear
        here.
      </p>
    </div>
  );
}

// ============================================
// Invoice Row Actions
// ============================================

function InvoiceActions({ invoice }: { invoice: SerializedInvoice }) {
  const pdfInfo = getInvoicePdfInfo(invoice.invoicePdf, invoice.hostedInvoiceUrl);

  const handleDownload = async () => {
    if (!pdfInfo.pdfUrl) return;

    const filename = generateInvoiceFilename(invoice.id, new Date(invoice.created));
    try {
      await downloadInvoicePdf(pdfInfo.pdfUrl, filename);
    } catch {
      // Fallback handled in downloadInvoicePdf
    }
  };

  const handleView = () => {
    const url = pdfInfo.pdfUrl || pdfInfo.hostedUrl;
    if (url) {
      openInvoicePdf(url);
    }
  };

  if (!pdfInfo.canView) {
    return (
      <span className="text-xs text-slate-400 dark:text-slate-500">
        Not available
      </span>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {pdfInfo.canDownload && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={handleDownload}
          title="Download PDF"
          aria-label={`Download invoice ${invoice.id}`}
        >
          <span className="material-symbols-outlined text-lg">download</span>
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0"
        onClick={handleView}
        title="View invoice"
        aria-label={`View invoice ${invoice.id}`}
      >
        <span className="material-symbols-outlined text-lg">open_in_new</span>
      </Button>
    </div>
  );
}

// ============================================
// Invoice Table Row
// ============================================

function InvoiceRow({ invoice }: { invoice: SerializedInvoice }) {
  // Format invoice ID for display (show shortened version)
  const displayId = invoice.id.includes('_')
    ? invoice.id.split('_').pop()
    : invoice.id.slice(0, 12);

  return (
    <TableRow className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
      <TableCell className="font-medium text-slate-900 dark:text-white">
        {formatBillingDate(invoice.created)}
      </TableCell>
      <TableCell className="text-slate-600 dark:text-slate-400">
        <span className="font-mono text-xs">{displayId}</span>
      </TableCell>
      <TableCell className="text-right font-medium text-slate-900 dark:text-white">
        {formatCurrency(invoice.amountPaid || invoice.amountDue, invoice.currency)}
      </TableCell>
      <TableCell>
        <StatusBadge status={invoice.status} />
      </TableCell>
      <TableCell>
        {invoice.paidAt ? (
          <span className="text-sm text-slate-600 dark:text-slate-400">
            {formatBillingDate(invoice.paidAt)}
          </span>
        ) : (
          <span className="text-sm text-slate-400">-</span>
        )}
      </TableCell>
      <TableCell className="text-right">
        <InvoiceActions invoice={invoice} />
      </TableCell>
    </TableRow>
  );
}

// ============================================
// Main Component
// ============================================

export function InvoiceList({
  invoices,
  isLoading,
  hasMore,
  onLoadMore,
  total,
  isLoadingMore = false,
}: InvoiceListProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="material-symbols-outlined text-xl text-primary">
              receipt_long
            </span>
            Invoices
          </CardTitle>
          <CardDescription>Loading your invoice history...</CardDescription>
        </CardHeader>
        <CardContent>
          <InvoiceListSkeleton />
        </CardContent>
      </Card>
    );
  }

  if (invoices.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="material-symbols-outlined text-xl text-primary">
              receipt_long
            </span>
            Invoices
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
                receipt_long
              </span>
              Invoices
            </CardTitle>
            <CardDescription>
              Showing {invoices.length} of {total} invoices
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
                <TableHead className="font-medium">Invoice</TableHead>
                <TableHead className="text-right font-medium">Amount</TableHead>
                <TableHead className="font-medium">Status</TableHead>
                <TableHead className="font-medium">Paid Date</TableHead>
                <TableHead className="text-right font-medium">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((invoice) => (
                <InvoiceRow key={invoice.id} invoice={invoice} />
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

export default InvoiceList;
