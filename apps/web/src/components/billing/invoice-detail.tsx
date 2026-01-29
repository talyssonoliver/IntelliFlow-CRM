'use client';

/**
 * Invoice Detail Component
 *
 * Displays full invoice details with:
 * - Invoice summary (number, date, status)
 * - Line items table
 * - Totals (subtotal, tax, total)
 * - Action buttons (download, print, email, copy link)
 *
 * @implements PG-028 (Invoice Detail)
 */

import { useState, useCallback } from 'react';
import Link from 'next/link';
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
  formatBillingDateTime,
  formatCurrency,
  getInvoiceStatusDisplay,
  type StatusVariant,
} from '@/lib/billing/stripe-portal';
import {
  downloadInvoice,
  viewInvoice,
  printInvoice,
  copyInvoiceLink,
  emailInvoice,
  hasViewableUrl,
  type InvoiceData,
} from '@/lib/billing/invoice-actions';

// ============================================
// Types
// ============================================

export interface InvoiceLineItem {
  id: string;
  description: string;
  quantity: number;
  unitAmount: number;
  amount: number;
  currency: string;
}

export interface InvoiceDetailData {
  id: string;
  customerId: string;
  subscriptionId?: string;
  status: string;
  amountDue: number;
  amountPaid: number;
  amountRemaining: number;
  currency: string;
  dueDate?: Date | string | null;
  paidAt?: Date | string | null;
  hostedInvoiceUrl?: string | null;
  invoicePdf?: string | null;
  created: Date | string;
  // Extended fields for detail view
  lineItems?: InvoiceLineItem[];
  subtotal?: number;
  tax?: number;
  discount?: number;
  customerEmail?: string;
  customerName?: string;
  billingAddress?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
}

export interface InvoiceDetailProps {
  invoice: InvoiceDetailData | null;
  isLoading: boolean;
  error?: string | null;
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
      className={`${variantClasses[variant]} border-0 font-medium text-sm px-3 py-1`}
      variant="outline"
    >
      {label}
    </Badge>
  );
}

// ============================================
// Action Button Component
// ============================================

interface ActionButtonProps {
  icon: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'default' | 'outline' | 'ghost';
}

function ActionButton({
  icon,
  label,
  onClick,
  disabled = false,
  loading = false,
  variant = 'outline',
}: ActionButtonProps) {
  return (
    <Button
      variant={variant}
      size="sm"
      onClick={onClick}
      disabled={disabled || loading}
      className="gap-2"
    >
      <span
        className={`material-symbols-outlined text-lg ${loading ? 'animate-spin' : ''}`}
      >
        {loading ? 'progress_activity' : icon}
      </span>
      {label}
    </Button>
  );
}

// ============================================
// Loading Skeleton
// ============================================

function InvoiceDetailSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header Skeleton */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
            <Skeleton className="h-8 w-20 rounded-full" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-6 w-28" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Line Items Skeleton */}
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex justify-between py-3">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================
// Error State
// ============================================

function ErrorState({ error }: { error: string }) {
  return (
    <Card className="border-red-200 dark:border-red-800/50">
      <CardContent className="py-12">
        <div className="flex flex-col items-center justify-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
            <span className="material-symbols-outlined text-3xl text-red-600 dark:text-red-400">
              error
            </span>
          </div>
          <h3 className="mb-2 text-lg font-semibold text-slate-900 dark:text-white">
            Error Loading Invoice
          </h3>
          <p className="max-w-sm text-sm text-slate-500 dark:text-slate-400">
            {error}
          </p>
          <Link href="/billing/invoices" className="mt-4">
            <Button variant="outline">Back to Invoices</Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================
// Not Found State
// ============================================

function NotFoundState() {
  return (
    <Card>
      <CardContent className="py-12">
        <div className="flex flex-col items-center justify-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
            <span className="material-symbols-outlined text-3xl text-slate-400">
              receipt_long
            </span>
          </div>
          <h3 className="mb-2 text-lg font-semibold text-slate-900 dark:text-white">
            Invoice Not Found
          </h3>
          <p className="max-w-sm text-sm text-slate-500 dark:text-slate-400">
            The invoice you&apos;re looking for doesn&apos;t exist or you
            don&apos;t have permission to view it.
          </p>
          <Link href="/billing/invoices" className="mt-4">
            <Button variant="outline">Back to Invoices</Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================
// Line Items Table
// ============================================

function LineItemsTable({
  items,
  currency,
}: {
  items: InvoiceLineItem[];
  currency: string;
}) {
  if (items.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
        No line items available
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50 dark:bg-slate-800/50">
            <TableHead className="font-medium">Description</TableHead>
            <TableHead className="text-right font-medium">Qty</TableHead>
            <TableHead className="text-right font-medium">Unit Price</TableHead>
            <TableHead className="text-right font-medium">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow
              key={item.id}
              className="hover:bg-slate-50 dark:hover:bg-slate-800/30"
            >
              <TableCell className="text-slate-900 dark:text-white">
                {item.description}
              </TableCell>
              <TableCell className="text-right text-slate-600 dark:text-slate-400">
                {item.quantity}
              </TableCell>
              <TableCell className="text-right text-slate-600 dark:text-slate-400">
                {formatCurrency(item.unitAmount, currency)}
              </TableCell>
              <TableCell className="text-right font-medium text-slate-900 dark:text-white">
                {formatCurrency(item.amount, currency)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ============================================
// Totals Section
// ============================================

function TotalsSection({
  invoice,
}: {
  invoice: InvoiceDetailData;
}) {
  const { currency, subtotal, tax, discount, amountDue, amountPaid } = invoice;

  return (
    <div className="space-y-2 border-t border-slate-200 dark:border-slate-800 pt-4">
      {subtotal !== undefined && (
        <div className="flex justify-between text-sm">
          <span className="text-slate-500 dark:text-slate-400">Subtotal</span>
          <span className="text-slate-900 dark:text-white">
            {formatCurrency(subtotal, currency)}
          </span>
        </div>
      )}

      {discount !== undefined && discount > 0 && (
        <div className="flex justify-between text-sm">
          <span className="text-slate-500 dark:text-slate-400">Discount</span>
          <span className="text-green-600 dark:text-green-400">
            -{formatCurrency(discount, currency)}
          </span>
        </div>
      )}

      {tax !== undefined && (
        <div className="flex justify-between text-sm">
          <span className="text-slate-500 dark:text-slate-400">Tax</span>
          <span className="text-slate-900 dark:text-white">
            {formatCurrency(tax, currency)}
          </span>
        </div>
      )}

      <div className="flex justify-between text-base font-semibold pt-2 border-t border-slate-200 dark:border-slate-700">
        <span className="text-slate-900 dark:text-white">Total</span>
        <span className="text-slate-900 dark:text-white">
          {formatCurrency(amountDue, currency)}
        </span>
      </div>

      {amountPaid > 0 && amountPaid !== amountDue && (
        <>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500 dark:text-slate-400">
              Amount Paid
            </span>
            <span className="text-green-600 dark:text-green-400">
              -{formatCurrency(amountPaid, currency)}
            </span>
          </div>
          <div className="flex justify-between text-base font-semibold">
            <span className="text-slate-900 dark:text-white">
              Balance Due
            </span>
            <span className="text-slate-900 dark:text-white">
              {formatCurrency(amountDue - amountPaid, currency)}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export function InvoiceDetail({ invoice, isLoading, error }: InvoiceDetailProps) {
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const showMessage = useCallback(
    (type: 'success' | 'error', text: string) => {
      setActionMessage({ type, text });
      setTimeout(() => setActionMessage(null), 3000);
    },
    []
  );

  const handleDownload = useCallback(async () => {
    if (!invoice) return;
    setActionLoading('download');
    const result = await downloadInvoice(invoice as InvoiceData);
    showMessage(result.success ? 'success' : 'error', result.message);
    setActionLoading(null);
  }, [invoice, showMessage]);

  const handleView = useCallback(() => {
    if (!invoice) return;
    const result = viewInvoice(invoice as InvoiceData);
    if (!result.success) {
      showMessage('error', result.message);
    }
  }, [invoice, showMessage]);

  const handlePrint = useCallback(() => {
    if (!invoice) return;
    const result = printInvoice(invoice as InvoiceData);
    showMessage(result.success ? 'success' : 'error', result.message);
  }, [invoice, showMessage]);

  const handleCopyLink = useCallback(async () => {
    if (!invoice) return;
    setActionLoading('copy');
    const result = await copyInvoiceLink(invoice as InvoiceData);
    showMessage(result.success ? 'success' : 'error', result.message);
    setActionLoading(null);
  }, [invoice, showMessage]);

  const handleEmail = useCallback(() => {
    if (!invoice) return;
    const result = emailInvoice(invoice as InvoiceData);
    if (!result.success) {
      showMessage('error', result.message);
    }
  }, [invoice, showMessage]);

  if (isLoading) {
    return <InvoiceDetailSkeleton />;
  }

  if (error) {
    return <ErrorState error={error} />;
  }

  if (!invoice) {
    return <NotFoundState />;
  }

  // Format invoice ID for display
  const displayId = invoice.id.includes('_')
    ? invoice.id.split('_').pop()
    : invoice.id.slice(0, 12);

  const canView = hasViewableUrl(invoice as InvoiceData);

  return (
    <div className="space-y-6">
      {/* Action Message Toast */}
      {actionMessage && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 ${
            actionMessage.type === 'success'
              ? 'bg-green-100 text-green-800 dark:bg-green-900/80 dark:text-green-200'
              : 'bg-red-100 text-red-800 dark:bg-red-900/80 dark:text-red-200'
          }`}
          role="alert"
        >
          <span className="material-symbols-outlined text-lg">
            {actionMessage.type === 'success' ? 'check_circle' : 'error'}
          </span>
          {actionMessage.text}
        </div>
      )}

      {/* Back Link */}
      <Link
        href="/billing/invoices"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors"
      >
        <span className="material-symbols-outlined text-lg">arrow_back</span>
        Back to Invoices
      </Link>

      {/* Invoice Header */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-3">
                <span className="material-symbols-outlined text-2xl text-primary">
                  receipt_long
                </span>
                Invoice #{displayId}
              </CardTitle>
              <CardDescription className="mt-1">
                Created on {formatBillingDateTime(invoice.created)}
              </CardDescription>
            </div>
            <StatusBadge status={invoice.status} />
          </div>
        </CardHeader>
        <CardContent>
          {/* Invoice Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-6">
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Invoice Date
              </p>
              <p className="text-base font-medium text-slate-900 dark:text-white mt-1">
                {formatBillingDate(invoice.created)}
              </p>
            </div>

            {invoice.dueDate && (
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Due Date
                </p>
                <p className="text-base font-medium text-slate-900 dark:text-white mt-1">
                  {formatBillingDate(invoice.dueDate)}
                </p>
              </div>
            )}

            {invoice.paidAt && (
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Paid Date
                </p>
                <p className="text-base font-medium text-green-600 dark:text-green-400 mt-1">
                  {formatBillingDate(invoice.paidAt)}
                </p>
              </div>
            )}

            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Amount
              </p>
              <p className="text-base font-semibold text-slate-900 dark:text-white mt-1">
                {formatCurrency(invoice.amountPaid || invoice.amountDue, invoice.currency)}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2 pt-4 border-t border-slate-200 dark:border-slate-800">
            {canView && (
              <>
                <ActionButton
                  icon="download"
                  label="Download PDF"
                  onClick={handleDownload}
                  loading={actionLoading === 'download'}
                />
                <ActionButton
                  icon="open_in_new"
                  label="View"
                  onClick={handleView}
                  variant="ghost"
                />
                <ActionButton
                  icon="print"
                  label="Print"
                  onClick={handlePrint}
                  variant="ghost"
                />
                <ActionButton
                  icon="link"
                  label="Copy Link"
                  onClick={handleCopyLink}
                  loading={actionLoading === 'copy'}
                  variant="ghost"
                />
              </>
            )}
            <ActionButton
              icon="mail"
              label="Email"
              onClick={handleEmail}
              variant="ghost"
            />
          </div>
        </CardContent>
      </Card>

      {/* Customer Details (if available) */}
      {(invoice.customerName || invoice.customerEmail || invoice.billingAddress) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Billing Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Customer Info */}
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">
                  Customer
                </p>
                {invoice.customerName && (
                  <p className="text-slate-900 dark:text-white font-medium">
                    {invoice.customerName}
                  </p>
                )}
                {invoice.customerEmail && (
                  <p className="text-slate-600 dark:text-slate-400 text-sm">
                    {invoice.customerEmail}
                  </p>
                )}
              </div>

              {/* Billing Address */}
              {invoice.billingAddress && (
                <div>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">
                    Billing Address
                  </p>
                  <address className="not-italic text-sm text-slate-600 dark:text-slate-400">
                    {invoice.billingAddress.line1 && (
                      <span className="block">{invoice.billingAddress.line1}</span>
                    )}
                    {invoice.billingAddress.line2 && (
                      <span className="block">{invoice.billingAddress.line2}</span>
                    )}
                    {(invoice.billingAddress.city || invoice.billingAddress.state || invoice.billingAddress.postalCode) && (
                      <span className="block">
                        {[
                          invoice.billingAddress.city,
                          invoice.billingAddress.state,
                          invoice.billingAddress.postalCode,
                        ]
                          .filter(Boolean)
                          .join(', ')}
                      </span>
                    )}
                    {invoice.billingAddress.country && (
                      <span className="block">{invoice.billingAddress.country}</span>
                    )}
                  </address>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Line Items */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Line Items</CardTitle>
        </CardHeader>
        <CardContent>
          <LineItemsTable
            items={invoice.lineItems || []}
            currency={invoice.currency}
          />
          <div className="mt-6 max-w-sm ml-auto">
            <TotalsSection invoice={invoice} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default InvoiceDetail;
