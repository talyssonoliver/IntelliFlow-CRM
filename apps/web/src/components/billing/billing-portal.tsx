'use client';

/**
 * Billing Portal Component
 *
 * Main billing portal UI with subscription overview, payment methods,
 * billing information, and billing history.
 *
 * @implements PG-025 (Billing Portal)
 */

import * as React from 'react';
import Link from 'next/link';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
  Badge,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
} from '@intelliflow/ui';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/lib/auth/AuthContext';
import {
  formatCurrency,
  formatBillingDate,
  getSubscriptionStatusDisplay,
  getInvoiceStatusDisplay,
  getCardBrandDisplay,
  getPlanByPriceId,
} from '@/lib/billing/stripe-portal';
import { EmptyState, ErrorState, CardSkeleton } from './billing-shared';

// ============================================
// Types
// ============================================

interface BillingPortalProps {
  className?: string;
}

// ============================================
// Sub-Components
// ============================================

function SubscriptionOverviewCard() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const {
    data: subscription,
    isLoading,
    error,
  } = trpc.billing.getSubscription.useQuery(undefined, {
    enabled: isAuthenticated && !authLoading,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  if (isLoading || authLoading) return <CardSkeleton rows={2} />;

  if (error) {
    return (
      <Card className="border border-slate-200 dark:border-slate-800">
        <CardContent className="p-6">
          <ErrorState message="Failed to load subscription details" />
        </CardContent>
      </Card>
    );
  }

  if (!subscription) {
    return (
      <Card className="border border-slate-200 dark:border-slate-800">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <span className="material-symbols-outlined text-primary" aria-hidden="true">
              auto_awesome
            </span>{' '}
            Subscription Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState icon="credit_card_off" entity="subscriptions" />
          <div className="text-center mt-2">
            <Button asChild>
              <Link href="/upgrade">
                <span className="material-symbols-outlined text-lg" aria-hidden="true">
                  rocket_launch
                </span>{' '}
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
    <Card className="border border-slate-200 dark:border-slate-800">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <span className="material-symbols-outlined text-primary" aria-hidden="true">
              auto_awesome
            </span>{' '}
            Subscription Overview
          </CardTitle>
          <Badge
            variant={status.variant === 'success' ? 'default' : 'secondary'}
            className={cn(
              'text-xs',
              status.variant === 'success' &&
                'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
              status.variant === 'warning' &&
                'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
              status.variant === 'error' &&
                'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
            )}
            aria-label={`Subscription status: ${status.label}`}
          >
            {status.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col sm:flex-row gap-6">
          <div className="flex-1">
            <p className="text-lg font-semibold text-slate-900 dark:text-white">{planName}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {plan?.description ?? 'Your current subscription plan'}
            </p>
          </div>
          <div className="flex-1 sm:text-right">
            <p className="text-sm text-slate-500 dark:text-slate-400">Next Billing Date</p>
            <p className="text-lg font-semibold text-slate-900 dark:text-white">
              {formatBillingDate(subscription.currentPeriodEnd)}
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Amount due: {plan ? formatCurrency(plan.priceMonthly, plan.currency) : '--'}
            </p>
          </div>
        </div>

        {subscription.cancelAtPeriodEnd && (
          <div className="mt-6 flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
            <span
              className="material-symbols-outlined text-amber-600 dark:text-amber-400"
              aria-hidden="true"
            >
              warning
            </span>
            <div>
              <p className="font-medium text-amber-800 dark:text-amber-300">Subscription Ending</p>
              <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                Your subscription will end on {formatBillingDate(subscription.currentPeriodEnd)}.
                You can reactivate anytime before this date.
              </p>
            </div>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex gap-3 pt-0">
        <Button asChild>
          <Link href="/upgrade">Upgrade Plan</Link>
        </Button>
        <Button
          variant="outline"
          className="text-red-600 hover:text-red-700 border-red-200 hover:border-red-300 dark:text-red-400 dark:border-red-800"
          asChild
        >
          <Link href="/billing/cancel">Cancel Subscription</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

function PaymentMethodSection() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const {
    data: paymentMethods,
    isLoading,
    error,
  } = trpc.billing.getPaymentMethods.useQuery(undefined, {
    enabled: isAuthenticated && !authLoading,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  if (isLoading || authLoading) return <CardSkeleton rows={2} />;

  if (error) {
    return (
      <Card className="border border-slate-200 dark:border-slate-800">
        <CardContent className="p-6">
          <ErrorState message="Failed to load payment methods" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border border-slate-200 dark:border-slate-800">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <span className="material-symbols-outlined" aria-hidden="true">
            credit_card
          </span>{' '}
          Payment Methods
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!paymentMethods || paymentMethods.length === 0 ? (
          <EmptyState icon="credit_card_off" entity="payment-methods" />
        ) : (
          paymentMethods.map((pm) => (
            <div
              key={pm.id}
              className="relative p-4 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700"
            >
              {pm.isDefault && (
                <Badge className="absolute top-2 right-2 bg-primary text-white rounded-full text-xs">
                  DEFAULT
                </Badge>
              )}
              <div className="flex items-start gap-4">
                <div className="w-12 h-8 flex items-center justify-center border border-slate-200 dark:border-slate-600 rounded bg-white dark:bg-slate-900">
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    {pm.card ? getCardBrandDisplay(pm.card.brand) : pm.type}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900 dark:text-white">
                    •••• •••• •••• {pm.card?.last4 ?? '----'}
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Expires {pm.card?.expMonth}/{pm.card?.expYear}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  aria-label="Edit payment method"
                >
                  <span className="material-symbols-outlined text-lg" aria-hidden="true">
                    edit
                  </span>
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
      <CardFooter className="pt-0 justify-center">
        <Button asChild>
          <Link href="/billing/payment-methods">
            <span className="material-symbols-outlined text-lg mr-2" aria-hidden="true">
              add
            </span>{' '}
            Add Payment Method
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

function BillingInformationCard() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const {
    data: billingInfo,
    isLoading,
    error,
  } = trpc.billing.getBillingInformation.useQuery(undefined, {
    enabled: isAuthenticated && !authLoading,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  if (isLoading || authLoading) return <CardSkeleton rows={2} />;

  if (error) {
    return (
      <Card className="border border-slate-200 dark:border-slate-800">
        <CardContent className="p-6">
          <ErrorState message="Failed to load billing information" />
        </CardContent>
      </Card>
    );
  }

  if (!billingInfo) {
    return (
      <Card className="border border-slate-200 dark:border-slate-800">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <span className="material-symbols-outlined" aria-hidden="true">
              account_balance
            </span>{' '}
            Billing Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState icon="info" entity="invoices" message="No billing information on file" />
        </CardContent>
      </Card>
    );
  }

  const formattedAddress = billingInfo.address
    ? [
        billingInfo.address.line1,
        billingInfo.address.line2,
        billingInfo.address.city,
        billingInfo.address.state,
        billingInfo.address.postalCode,
        billingInfo.address.country,
      ]
        .filter(Boolean)
        .join(', ')
    : null;

  return (
    <Card className="border border-slate-200 dark:border-slate-800">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <span className="material-symbols-outlined" aria-hidden="true">
            account_balance
          </span>{' '}
          Billing Information
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-3">
          <span
            className="material-symbols-outlined text-slate-400 dark:text-slate-500"
            aria-hidden="true"
          >
            business
          </span>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Organization
            </p>
            <p className="text-sm font-medium text-slate-900 dark:text-white">
              {billingInfo.organization ?? '--'}
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <span
            className="material-symbols-outlined text-slate-400 dark:text-slate-500"
            aria-hidden="true"
          >
            mail
          </span>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Email
            </p>
            <p className="text-sm font-medium text-slate-900 dark:text-white">
              {billingInfo.email}
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <span
            className="material-symbols-outlined text-slate-400 dark:text-slate-500"
            aria-hidden="true"
          >
            location_on
          </span>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Address
            </p>
            <p className="text-sm font-medium text-slate-900 dark:text-white">
              {formattedAddress ?? '--'}
            </p>
          </div>
        </div>
      </CardContent>
      <CardFooter className="pt-0">
        <Link
          href="/billing/settings"
          className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium text-sm rounded-lg hover:bg-slate-50 hover:border-slate-400 dark:hover:bg-slate-700 dark:hover:border-slate-500 transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
        >
          <span className="material-symbols-outlined text-lg" aria-hidden="true">
            edit
          </span>{' '}
          Update Info
        </Link>
      </CardFooter>
    </Card>
  );
}

function BillingHistoryTable() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [page, setPage] = React.useState(1);
  const { data, isLoading, error } = trpc.billing.listInvoices.useQuery(
    { page, limit: 5 },
    { enabled: isAuthenticated && !authLoading, staleTime: 5 * 60 * 1000, retry: 1 }
  );

  if (isLoading || authLoading) return <CardSkeleton rows={3} />;

  if (error) {
    return (
      <Card className="border border-slate-200 dark:border-slate-800">
        <CardContent className="p-6">
          <ErrorState message="Failed to load billing history" />
        </CardContent>
      </Card>
    );
  }

  const invoices = data?.invoices ?? [];

  return (
    <Card className="border border-slate-200 dark:border-slate-800">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <span className="material-symbols-outlined" aria-hidden="true">
              history
            </span>{' '}
            Billing History
          </CardTitle>
          <Link
            href="/billing/invoices"
            className="text-sm font-medium text-primary hover:text-primary-hover flex items-center gap-1"
          >
            View All{' '}
            <span className="material-symbols-outlined text-sm" aria-hidden="true">
              arrow_forward
            </span>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {invoices.length === 0 ? (
          <EmptyState icon="receipt_long" message="No invoices yet" />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Invoice Date</TableHead>
                  <TableHead scope="col">Amount</TableHead>
                  <TableHead scope="col">Status</TableHead>
                  <TableHead scope="col" className="text-right">
                    Action
                  </TableHead>
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
                      <TableCell>{formatCurrency(invoice.amountPaid, invoice.currency)}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-xs',
                            status.variant === 'success' &&
                              'border-green-200 text-green-800 bg-green-100 dark:border-green-800 dark:text-green-400 dark:bg-green-900/30',
                            status.variant === 'warning' &&
                              'border-amber-200 text-amber-800 bg-amber-100 dark:border-amber-800 dark:text-amber-400 dark:bg-amber-900/30',
                            status.variant === 'error' &&
                              'border-red-200 text-red-800 bg-red-100 dark:border-red-800 dark:text-red-400 dark:bg-red-900/30'
                          )}
                          aria-label={`Invoice status: ${status.label}`}
                        >
                          {status.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {invoice.invoicePdf && (
                          <Button variant="ghost" size="sm" asChild className="h-8 w-8 p-0">
                            <a
                              href={invoice.invoicePdf}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label="Download Invoice"
                            >
                              <span
                                className="material-symbols-outlined text-lg"
                                aria-hidden="true"
                              >
                                download
                              </span>
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

        {data?.hasMore && (
          <div className="mt-4 text-center">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)}>
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

export function BillingPortal({ className }: Readonly<BillingPortalProps>) {
  return (
    <div className={cn('grid grid-cols-1 lg:grid-cols-3 gap-6', className)}>
      {/* Row 1: Subscription + Payment Methods */}
      <div className="lg:col-span-2 [&>*]:h-full">
        <SubscriptionOverviewCard />
      </div>
      <div className="[&>*]:h-full">
        <PaymentMethodSection />
      </div>

      {/* Row 2: Billing History + Billing Information */}
      <div className="lg:col-span-2 [&>*]:h-full">
        <BillingHistoryTable />
      </div>
      <div className="[&>*]:h-full">
        <BillingInformationCard />
      </div>
    </div>
  );
}
