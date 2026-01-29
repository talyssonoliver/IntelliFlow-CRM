'use client';

/**
 * Billing Portal Component
 *
 * Main billing portal UI with subscription overview, payment methods,
 * invoice history, and usage metrics.
 *
 * @implements PG-025 (Billing Portal)
 */

import * as React from 'react';
import Link from 'next/link';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  Button,
  Progress,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
} from '@intelliflow/ui';
import { trpc } from '@/lib/trpc';
import {
  formatCurrency,
  formatBillingDate,
  getSubscriptionStatusDisplay,
  getInvoiceStatusDisplay,
  getCardBrandDisplay,
  getUsagePercentage,
  isNearUsageLimit,
  getPlanByPriceId,
} from '@/lib/billing/stripe-portal';

// ============================================
// Types
// ============================================

interface BillingPortalProps {
  className?: string;
}

// ============================================
// Sub-Components
// ============================================

/**
 * Subscription Overview Card
 */
function SubscriptionOverviewCard() {
  const { data: subscription, isLoading } = trpc.billing.getSubscription.useQuery();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-48 mt-2" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i}>
                <Skeleton className="h-4 w-20 mb-1" />
                <Skeleton className="h-5 w-24" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!subscription) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center">
            <span
              className="material-symbols-outlined text-5xl text-slate-400 dark:text-slate-500 mb-4 block"
              aria-hidden="true"
            >
              credit_card_off
            </span>
            <h3 className="text-lg font-semibold text-foreground mb-2">
              No Active Subscription
            </h3>
            <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
              Choose a plan to get started with IntelliFlow CRM and unlock powerful features.
            </p>
            <Button asChild>
              <Link href="/billing/plans">
                <span className="material-symbols-outlined text-lg mr-2" aria-hidden="true">
                  rocket_launch
                </span>
                View Plans
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const status = getSubscriptionStatusDisplay(subscription.status);
  const plan = getPlanByPriceId(subscription.priceId);
  const planName = plan?.name ?? 'Current Plan';

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-3">
              {planName}
              <Badge
                variant={status.variant === 'success' ? 'default' : 'secondary'}
                className={cn(
                  status.variant === 'success' && 'bg-success text-white',
                  status.variant === 'warning' && 'bg-warning text-white',
                  status.variant === 'error' && 'bg-destructive text-white'
                )}
              >
                {status.label}
              </Badge>
            </CardTitle>
            <CardDescription className="mt-1">
              Your subscription renews on {formatBillingDate(subscription.currentPeriodEnd)}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/billing/plans">Change Plan</Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div>
            <p className="text-sm text-muted-foreground">Billing Cycle</p>
            <p className="font-medium text-foreground">Monthly</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Next Billing Date</p>
            <p className="font-medium text-foreground">
              {formatBillingDate(subscription.currentPeriodEnd)}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Seats Used</p>
            <p className="font-medium text-foreground">
              {subscription.quantity} {plan?.maxUsers ? `/ ${plan.maxUsers}` : ''}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Amount</p>
            <p className="font-medium text-foreground">
              {plan ? formatCurrency(plan.priceMonthly, plan.currency) : '--'}/mo
            </p>
          </div>
        </div>

        {subscription.cancelAtPeriodEnd && (
          <div className="mt-6 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
            <div className="flex items-start gap-3">
              <span
                className="material-symbols-outlined text-amber-600 dark:text-amber-400"
                aria-hidden="true"
              >
                warning
              </span>
              <div>
                <p className="font-medium text-amber-800 dark:text-amber-200">
                  Subscription Ending
                </p>
                <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                  Your subscription will end on {formatBillingDate(subscription.currentPeriodEnd)}.
                  You can reactivate anytime before this date.
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Payment Method Section
 */
function PaymentMethodSection() {
  const { data: paymentMethods, isLoading } = trpc.billing.getPaymentMethods.useQuery();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  const defaultMethod = paymentMethods?.find((pm) => pm.isDefault);

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Payment Method</CardTitle>
          <Button variant="outline" size="sm" asChild>
            <Link href="/billing/payment-methods">
              <span className="material-symbols-outlined text-lg mr-1" aria-hidden="true">
                add
              </span>
              Add Card
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {defaultMethod?.card ? (
          <div className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
            <span
              className="material-symbols-outlined text-2xl text-primary"
              aria-hidden="true"
            >
              credit_card
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-foreground">
                {getCardBrandDisplay(defaultMethod.card.brand)} **** {defaultMethod.card.last4}
              </p>
              <p className="text-sm text-muted-foreground">
                Expires {defaultMethod.card.expMonth}/{defaultMethod.card.expYear}
              </p>
            </div>
            <Badge variant="outline">Default</Badge>
          </div>
        ) : (
          <div className="text-center py-6">
            <span
              className="material-symbols-outlined text-4xl text-slate-400 dark:text-slate-500 mb-2 block"
              aria-hidden="true"
            >
              credit_card_off
            </span>
            <p className="text-muted-foreground">No payment method on file</p>
            <Button variant="outline" size="sm" className="mt-3" asChild>
              <Link href="/billing/payment-methods">Add Payment Method</Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Usage Metrics Section
 */
function UsageMetricsSection() {
  const { data: usage, isLoading } = trpc.billing.getUsageMetrics.useQuery();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i}>
              <Skeleton className="h-4 w-full mb-2" />
              <Skeleton className="h-2 w-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!usage) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-lg">Usage This Month</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <UsageBar
          label="API Calls"
          current={usage.apiCalls.current}
          limit={usage.apiCalls.limit}
        />
        <UsageBar
          label="Storage"
          current={usage.storage.current}
          limit={usage.storage.limit}
          suffix={usage.storage.unit}
        />
        <UsageBar
          label="Active Users"
          current={usage.activeUsers.current}
          limit={usage.activeUsers.limit}
        />
      </CardContent>
    </Card>
  );
}

/**
 * Usage Bar Component
 */
interface UsageBarProps {
  label: string;
  current: number;
  limit: number;
  suffix?: string;
}

function UsageBar({ label, current, limit, suffix = '' }: UsageBarProps) {
  const percentage = getUsagePercentage(current, limit);
  const nearLimit = isNearUsageLimit(current, limit);

  return (
    <div>
      <div className="flex justify-between text-sm mb-2">
        <span className="text-muted-foreground">{label}</span>
        <span className={cn('font-medium', nearLimit ? 'text-amber-600' : 'text-foreground')}>
          {current.toLocaleString()}
          {suffix && ` ${suffix}`} / {limit.toLocaleString()}
          {suffix && ` ${suffix}`}
        </span>
      </div>
      <Progress
        value={percentage}
        className={cn('h-2', nearLimit && '[&>div]:bg-amber-500')}
      />
    </div>
  );
}

/**
 * Invoice History Table
 */
function InvoiceHistoryTable() {
  const [page, setPage] = React.useState(1);
  const { data, isLoading } = trpc.billing.listInvoices.useQuery({ page, limit: 5 });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const invoices = data?.invoices ?? [];

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Invoice History</CardTitle>
          <Button variant="outline" size="sm" asChild>
            <Link href="/billing/invoices">View All</Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {invoices.length === 0 ? (
          <div className="text-center py-8">
            <span
              className="material-symbols-outlined text-4xl text-slate-400 dark:text-slate-500 mb-2 block"
              aria-hidden="true"
            >
              receipt_long
            </span>
            <p className="text-muted-foreground">No invoices yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice) => {
                  const status = getInvoiceStatusDisplay(invoice.status);

                  return (
                    <TableRow key={invoice.id}>
                      <TableCell className="font-medium">
                        {formatBillingDate(invoice.created)}
                      </TableCell>
                      <TableCell>
                        {formatCurrency(invoice.amountPaid, invoice.currency)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            status.variant === 'success' &&
                              'border-success text-success bg-success/10',
                            status.variant === 'warning' &&
                              'border-warning text-warning bg-warning/10',
                            status.variant === 'error' &&
                              'border-destructive text-destructive bg-destructive/10'
                          )}
                        >
                          {status.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {invoice.invoicePdf && (
                          <Button
                            variant="ghost"
                            size="sm"
                            asChild
                            className="h-8 w-8 p-0"
                          >
                            <a
                              href={invoice.invoicePdf}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Download PDF"
                            >
                              <span
                                className="material-symbols-outlined text-lg"
                                aria-hidden="true"
                              >
                                download
                              </span>
                              <span className="sr-only">Download Invoice</span>
                            </a>
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {data && data.hasMore && (
          <div className="mt-4 text-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
            >
              Load More
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================
// Main Component
// ============================================

export function BillingPortal({ className }: BillingPortalProps) {
  return (
    <div className={cn('space-y-6', className)}>
      {/* Subscription Overview */}
      <SubscriptionOverviewCard />

      {/* Two-column layout for payment and usage */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PaymentMethodSection />
        <UsageMetricsSection />
      </div>

      {/* Invoice History */}
      <InvoiceHistoryTable />
    </div>
  );
}
