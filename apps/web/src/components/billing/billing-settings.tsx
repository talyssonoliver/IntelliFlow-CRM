'use client';

/**
 * Billing Settings Component
 *
 * Organization details, billing address, tax ID and invoice contact management.
 * Uses bento grid layout (12-col) per the Module Settings Playbook.
 *
 * @implements PG-188 (Module Settings - Billing /billing/settings)
 */

import * as React from 'react';
import { Card, CardHeader, CardTitle, CardContent, Input, Label, toast } from '@intelliflow/ui';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/lib/auth/AuthContext';
import { PageHeader, type PageAction } from '@/components/shared/page-header';
import { ErrorState } from './billing-shared';

/** Normalize null/undefined to empty string for form field display */
function normalize(value: string | null | undefined): string {
  return value ?? '';
}

export function BillingSettings() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const utils = trpc.useUtils();

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
  const [taxId, setTaxId] = React.useState('');
  const [invoiceContact, setInvoiceContact] = React.useState('');
  const [initialSnapshot, setInitialSnapshot] = React.useState<string | null>(null);
  // Refs let the effect read latest values without appearing in deps (avoids stale closure
  // while keeping exhaustive-deps rule satisfied — state reads inside effect use refs).
  const initializedRef = React.useRef(false);
  const initialSnapshotRef = React.useRef<string | null>(null);
  const formValuesRef = React.useRef({
    organization: '',
    email: '',
    taxId: '',
    invoiceContact: '',
  });

  // Keep the ref in sync with state so the effect can read it without deps
  formValuesRef.current = { organization, email, taxId, invoiceContact };

  React.useEffect(() => {
    if (!billingInfo) return;
    const org = normalize(billingInfo.organization);
    const eml = normalize(billingInfo.email);
    const tax = normalize(billingInfo.taxId);
    const inv = normalize(billingInfo.invoiceContact);
    const snap = JSON.stringify({ organization: org, email: eml, taxId: tax, invoiceContact: inv });

    if (!initializedRef.current) {
      // First load — initialize form and baseline snapshot
      setOrganization(org);
      setEmail(eml);
      setTaxId(tax);
      setInvoiceContact(inv);
      setInitialSnapshot(snap);
      initialSnapshotRef.current = snap;
      initializedRef.current = true;
    } else if (initialSnapshotRef.current !== null) {
      // Subsequent refetch — only update if form is not dirty (no unsaved edits)
      const currentSnap = JSON.stringify(formValuesRef.current);
      if (currentSnap === initialSnapshotRef.current) {
        setOrganization(org);
        setEmail(eml);
        setTaxId(tax);
        setInvoiceContact(inv);
        setInitialSnapshot(snap);
        initialSnapshotRef.current = snap;
      }
      // If dirty (currentSnap !== initialSnapshot), keep user edits — no override
    }
  }, [billingInfo]);

  const currentSnapshot = React.useMemo(
    () => JSON.stringify({ organization, email, taxId, invoiceContact }),
    [organization, email, taxId, invoiceContact]
  );
  const isDirty = initialSnapshot !== null && currentSnapshot !== initialSnapshot;

  const updateMutation = trpc.billing.updateBillingInformation.useMutation({
    onSuccess: () => {
      // Reset the baseline snapshot so isDirty becomes false after save
      const savedSnap = JSON.stringify(formValuesRef.current);
      setInitialSnapshot(savedSnap);
      initialSnapshotRef.current = savedSnap;
      void utils.billing.getBillingInformation.invalidate();
      toast({ title: 'Saved', description: 'Billing information updated successfully.' });
    },
    onError: (err) => {
      toast({
        title: 'Save failed',
        description: err.message ?? 'Unknown error',
        variant: 'destructive',
      });
    },
  });

  const isPending = updateMutation.isPending;

  function handleSave() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      toast({
        title: 'Billing email is required',
        description: 'Please enter a valid billing email address.',
        variant: 'destructive',
      });
      return;
    }
    updateMutation.mutate({
      organization: organization || null,
      email: trimmedEmail,
      taxId: taxId.trim() || null,
      invoiceContact: invoiceContact.trim() || null,
    });
  }

  function handleCancel() {
    if (!billingInfo) return;
    const org = normalize(billingInfo.organization);
    const eml = normalize(billingInfo.email);
    const tax = normalize(billingInfo.taxId);
    const inv = normalize(billingInfo.invoiceContact);
    setOrganization(org);
    setEmail(eml);
    setTaxId(tax);
    setInvoiceContact(inv);
  }

  if (isLoading || authLoading) {
    return (
      <div className="w-full">
        <div className="mb-6">
          <div className="h-4 bg-muted animate-pulse rounded-md w-48 mb-3" />
          <div className="h-7 bg-muted animate-pulse rounded-md w-64 mb-2" />
          <div className="h-4 bg-muted animate-pulse rounded-md w-96" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
          <div className="lg:col-span-7 h-64 bg-muted animate-pulse rounded-md" />
          <div className="lg:col-span-5 h-48 bg-muted animate-pulse rounded-md" />
        </div>
      </div>
    );
  }

  if (error) {
    return <ErrorState message="Failed to load billing information. Please try again later." />;
  }

  const actions: PageAction[] = [
    {
      label: 'Cancel',
      variant: 'secondary',
      onClick: handleCancel,
      disabled: !isDirty || isPending,
    },
    {
      label: isPending ? 'Saving...' : 'Save Changes',
      variant: 'primary',
      onClick: handleSave,
      disabled: !isDirty || isPending,
      loading: isPending,
    },
  ];

  const address = billingInfo?.address;

  return (
    <div className="w-full">
      <PageHeader
        breadcrumbs={[
          { label: 'Dashboard', href: '/' },
          { label: 'Billing', href: '/billing' },
          { label: 'Settings' },
        ]}
        title="Billing Settings"
        description="Manage your organization details, tax ID, and invoice contact."
        actions={actions}
        className="mb-6"
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
        {/* Organization Details — editable */}
        <div className="lg:col-span-7">
          <Card className="border border-slate-200 dark:border-slate-800 h-full">
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <span className="material-symbols-outlined text-primary" aria-hidden="true">
                  business
                </span>{' '}
                Organization Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="billing-org">Organization Name</Label>
                <Input
                  id="billing-org"
                  type="text"
                  value={organization}
                  onChange={(e) => setOrganization(e.target.value)}
                  aria-label="Organization Name"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="billing-email">Billing Email</Label>
                <Input
                  id="billing-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-label="Billing Email"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="billing-tax-id">Tax ID</Label>
                <Input
                  id="billing-tax-id"
                  type="text"
                  value={taxId}
                  onChange={(e) => setTaxId(e.target.value)}
                  aria-label="Tax ID"
                  placeholder="e.g. GB123456789"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="billing-invoice-contact">Invoice Contact</Label>
                <Input
                  id="billing-invoice-contact"
                  type="email"
                  value={invoiceContact}
                  onChange={(e) => setInvoiceContact(e.target.value)}
                  aria-label="Invoice Contact"
                  placeholder="e.g. ap@yourcompany.com"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Billing Address — read-only */}
        <div className="lg:col-span-5">
          <Card className="border border-slate-200 dark:border-slate-800 h-full">
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <span className="material-symbols-outlined text-primary" aria-hidden="true">
                  location_on
                </span>{' '}
                Billing Address
              </CardTitle>
            </CardHeader>
            <CardContent>
              {address ? (
                <div className="space-y-1 text-sm text-slate-700 dark:text-slate-300">
                  <p>{address.line1}</p>
                  {address.line2 && <p>{address.line2}</p>}
                  <p>
                    {[address.city, address.state, address.postalCode].filter(Boolean).join(', ')}
                  </p>
                  <p>{address.country}</p>
                </div>
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">No address on file.</p>
              )}
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-4 flex items-center gap-1">
                <span className="material-symbols-outlined text-sm" aria-hidden="true">
                  info
                </span>{' '}
                Contact support to update your billing address.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
