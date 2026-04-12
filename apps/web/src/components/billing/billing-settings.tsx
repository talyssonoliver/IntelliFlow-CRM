'use client';

/**
 * Billing Settings Component
 *
 * Organization details and billing address management form.
 *
 * @implements PG-172 (Billing Ghost Pages — Settings)
 */

import * as React from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter, Button } from '@intelliflow/ui';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/lib/auth/AuthContext';
import { ErrorState, CardSkeleton } from './billing-shared';

export function BillingSettings() {
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

  const [organization, setOrganization] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [initialized, setInitialized] = React.useState(false);

  // Sync form state when data loads
  React.useEffect(() => {
    if (billingInfo && !initialized) {
      setOrganization(billingInfo.organization ?? '');
      setEmail(billingInfo.email ?? '');
      setInitialized(true);
    }
  }, [billingInfo, initialized]);

  const updateMutation = trpc.billing.updateBillingInformation.useMutation({
    onSuccess: () => {
      // Success handled
    },
  });

  if (isLoading || authLoading) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <CardSkeleton rows={3} />
      </div>
    );
  }

  if (error) {
    return <ErrorState message="Failed to load billing information. Please try again later." />;
  }

  function handleSave() {
    updateMutation.mutate({ organization, email } as Record<string, unknown>);
  }

  function handleCancel() {
    setOrganization(billingInfo?.organization ?? '');
    setEmail(billingInfo?.email ?? '');
  }

  const address = billingInfo?.address;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Editable fields */}
      <Card className="border border-slate-200 dark:border-slate-800">
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <span className="material-symbols-outlined text-primary" aria-hidden="true">
              business
            </span>
            {' '}Organization Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label
              htmlFor="org-name"
              className="text-sm font-medium text-slate-700 dark:text-slate-300 block mb-1"
            >
              Organization Name
            </label>
            <input
              id="org-name"
              type="text"
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-primary focus:border-primary"
              aria-label="Organization Name"
            />
          </div>
          <div>
            <label
              htmlFor="billing-email"
              className="text-sm font-medium text-slate-700 dark:text-slate-300 block mb-1"
            >
              Billing Email
            </label>
            <input
              id="billing-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-primary focus:border-primary"
              aria-label="Billing Email"
            />
          </div>
        </CardContent>
        <CardFooter className="flex gap-3 pt-0">
          <Button
            onClick={handleSave}
            disabled={updateMutation.isPending}
            aria-label="Save Changes"
          >
            {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
          <Button variant="outline" onClick={handleCancel} aria-label="Cancel">
            Cancel
          </Button>
        </CardFooter>
      </Card>

      {/* Read-only address */}
      <Card className="border border-slate-200 dark:border-slate-800">
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <span className="material-symbols-outlined text-primary" aria-hidden="true">
              location_on
            </span>
            {' '}Billing Address
          </CardTitle>
        </CardHeader>
        <CardContent>
          {address ? (
            <div className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
              <p>{address.line1}</p>
              {address.line2 && <p>{address.line2}</p>}
              <p>{[address.city, address.state, address.postalCode].filter(Boolean).join(', ')}</p>
              <p>{address.country}</p>
            </div>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">No address on file.</p>
          )}
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-4 flex items-center gap-1">
            <span className="material-symbols-outlined text-sm" aria-hidden="true">
              info
            </span>
            {' '}Contact support to update your billing address.
          </p>
        </CardContent>
      </Card>

      {/* Success/error feedback */}
      {updateMutation.isSuccess && (
        <div
          className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-sm text-green-700 dark:text-green-400"
          role="alert"
          aria-live="polite"
        >
          Billing information updated successfully.
        </div>
      )}
    </div>
  );
}
