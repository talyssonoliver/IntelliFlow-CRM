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
import { useAuth } from '@/lib/auth/AuthContext';
import {
  formatCurrency,
  formatBillingDate,
  getSubscriptionStatusDisplay,
  getInvoiceStatusDisplay,
  getCardBrandDisplay,
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
 *
 * Redesigned with flex layout, status badge, and footer buttons.
 */
function SubscriptionOverviewCard() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const {
    data: subscription,
    isLoading,
    error,
  } = trpc.billing.getSubscription.useQuery(undefined, {
    enabled: isAuthenticated && !authLoading,
  });

  if (isLoading || authLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-6">
            <Skeleton className="h-16 w-full sm:w-1/2" />
            <Skeleton className="h-16 w-full sm:w-1/2" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center">
            <span
              className="material-symbols-outlined text-4xl text-destructive mb-2 block"
              aria-hidden="true"
            >
              error
            </span>
            <p className="text-muted-foreground">Failed to load subscription details</p>
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
            <h3 className="text-lg font-semibold text-foreground mb-2">No Active Subscription</h3>
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
          <CardTitle className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary" aria-hidden="true">
              auto_awesome
            </span>
            Subscription Overview
          </CardTitle>
          <Badge
            variant={status.variant === 'success' ? 'default' : 'secondary'}
            className={cn(
              status.variant === 'success' && 'bg-success text-white',
              status.variant === 'warning' && 'bg-warning text-white',
              status.variant === 'error' && 'bg-destructive text-white'
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
            <p className="text-lg font-semibold text-foreground">{planName}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {plan?.description ?? 'Your current subscription plan'}
            </p>
          </div>
          <div className="flex-1 sm:text-right">
            <p className="text-sm text-muted-foreground">Next Billing Date</p>
            <p className="text-lg font-semibold text-foreground">
              {formatBillingDate(subscription.currentPeriodEnd)}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Amount due: {plan ? formatCurrency(plan.priceMonthly, plan.currency) : '--'}
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
      <CardFooter className="flex gap-3 pt-0">
        <Button asChild>
          <Link href="/billing/plans">Upgrade Plan</Link>
        </Button>
        <Button variant="outline" className="text-destructive hover:text-destructive" asChild>
          <Link href="/billing/cancel">Cancel Subscription</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

/**
 * Payment Method Section
 *
 * Redesigned with vertical card layout and brand logo boxes.
 */
function PaymentMethodSection() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const {
    data: paymentMethods,
    isLoading,
    error,
  } = trpc.billing.getPaymentMethods.useQuery(undefined, {
    enabled: isAuthenticated && !authLoading,
  });

  if (isLoading || authLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center">
            <span
              className="material-symbols-outlined text-4xl text-destructive mb-2 block"
              aria-hidden="true"
            >
              error
            </span>
            <p className="text-muted-foreground">Failed to load payment methods</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-lg flex items-center gap-2">
          <span className="material-symbols-outlined" aria-hidden="true">
            credit_card
          </span>
          Payment Methods
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!paymentMethods || paymentMethods.length === 0 ? (
          <div className="text-center py-6">
            <span
              className="material-symbols-outlined text-4xl text-slate-400 dark:text-slate-500 mb-2 block"
              aria-hidden="true"
            >
              credit_card_off
            </span>
            <p className="text-muted-foreground">No payment method on file</p>
          </div>
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
                  <p className="font-medium text-foreground">
                    •••• •••• •••• {pm.card?.last4 ?? '----'}
                  </p>
                  <p className="text-sm text-muted-foreground">
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

        <button
          className="w-full border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg p-4 text-sm text-slate-500 dark:text-slate-400 hover:border-primary hover:text-primary transition-colors"
          onClick={() => {
            // Navigate to add payment method
            window.location.href = '/billing/payment-methods';
          }}
        >
          + Add New Payment Method
        </button>
      </CardContent>
    </Card>
  );
}

/**
 * Billing Information Card
 *
 * Displays organization name, email, and address from Stripe customer.
 */
function BillingInformationCard() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const {
    data: billingInfo,
    isLoading,
    error,
  } = trpc.billing.getBillingInformation.useQuery(undefined, {
    enabled: isAuthenticated && !authLoading,
  });

  if (isLoading || authLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-5 w-5" />
              <div>
                <Skeleton className="h-3 w-20 mb-1" />
                <Skeleton className="h-4 w-32" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center">
            <span
              className="material-symbols-outlined text-4xl text-destructive mb-2 block"
              aria-hidden="true"
            >
              error
            </span>
            <p className="text-muted-foreground">Failed to load billing information</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!billingInfo) {
    return (
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <span className="material-symbols-outlined" aria-hidden="true">
              receipt
            </span>
            Billing Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <p className="text-muted-foreground">No billing information on file</p>
          </div>
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
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-lg flex items-center gap-2">
          <span className="material-symbols-outlined" aria-hidden="true">
            receipt
          </span>
          Billing Information
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-3">
          <span className="material-symbols-outlined text-muted-foreground" aria-hidden="true">
            business
          </span>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Organization</p>
            <p className="text-sm font-medium text-foreground">
              {billingInfo.organization ?? '--'}
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <span className="material-symbols-outlined text-muted-foreground" aria-hidden="true">
            mail
          </span>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Email</p>
            <p className="text-sm font-medium text-foreground">{billingInfo.email}</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <span className="material-symbols-outlined text-muted-foreground" aria-hidden="true">
            location_on
          </span>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Address</p>
            <p className="text-sm font-medium text-foreground">{formattedAddress ?? '--'}</p>
          </div>
        </div>
      </CardContent>
      <CardFooter className="pt-0">
        <Button variant="outline" size="sm" asChild>
          <Link href="/billing/settings">Update Info</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

/**
 * Billing History Table
 *
 * Renamed from Invoice History, with updated columns and a11y.
 */
function BillingHistoryTable() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [page, setPage] = React.useState(1);
  const { data, isLoading, error } = trpc.billing.listInvoices.useQuery(
    { page, limit: 5 },
    { enabled: isAuthenticated && !authLoading }
  );

  if (isLoading || authLoading) {
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

  if (error) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center">
            <span
              className="material-symbols-outlined text-4xl text-destructive mb-2 block"
              aria-hidden="true"
            >
              error
            </span>
            <p className="text-muted-foreground">Failed to load billing history</p>
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
          <CardTitle className="text-lg flex items-center gap-2">
            <span className="material-symbols-outlined" aria-hidden="true">
              history
            </span>
            Billing History
          </CardTitle>
          <Link
            href="/billing/invoices"
            className="text-sm text-primary hover:underline flex items-center gap-1"
          >
            View All
            <span className="material-symbols-outlined text-sm" aria-hidden="true">
              arrow_forward
            </span>
          </Link>
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
                            status.variant === 'success' &&
                              'border-success text-success bg-success/10',
                            status.variant === 'warning' &&
                              'border-warning text-warning bg-warning/10',
                            status.variant === 'error' &&
                              'border-destructive text-destructive bg-destructive/10'
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

        {data && data.hasMore && (
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

export function BillingPortal({ className }: BillingPortalProps) {
  return (
    <div className={cn('grid grid-cols-1 lg:grid-cols-3 gap-6', className)}>
      {/* Left Column - Subscription + Billing History */}
      <div className="space-y-6 lg:col-span-2">
        <SubscriptionOverviewCard />
        <BillingHistoryTable />
      </div>

      {/* Right Column - Payment Methods + Billing Information */}
      <div className="space-y-6">
        <PaymentMethodSection />
        <BillingInformationCard />
      </div>
    </div>
  );
}
