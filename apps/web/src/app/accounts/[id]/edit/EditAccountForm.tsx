'use client';

/**
 * Edit Account form (PG-197). Prefills from `account.getById`, sends only the
 * changed fields (cleared location fields as null) to `account.update`.
 * Not-found and load failures are distinct states.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Card, Skeleton, toast } from '@intelliflow/ui';
import { api } from '@/lib/api';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { useFormUnsavedChanges } from '@/hooks/useUnsavedChanges';
import { revalidateAccountCaches } from '@/app/accounts/actions';
import { PageHeader } from '@/components/shared/page-header';
import {
  AccountForm,
  buildUpdateAccountPayload,
  EMPTY_ACCOUNT_FORM_VALUES,
  toOptionsStatus,
  type AccountFormValues,
} from '@/components/accounts/AccountForm';

const SKELETON_KEYS = ['ae-0', 'ae-1', 'ae-2', 'ae-3', 'ae-4'] as const;

interface AccountRecord {
  name: string;
  website: string | null;
  industry: string | null;
  employees: number | null;
  revenue: number | string | null;
  description: string | null;
  country: string | null;
  region: string | null;
  postalCode: string | null;
}

export function toFormValues(record: AccountRecord): AccountFormValues {
  const text = (value: string | number | null) => (value == null ? '' : String(value));
  return {
    ...EMPTY_ACCOUNT_FORM_VALUES,
    name: record.name,
    website: text(record.website),
    industry: text(record.industry),
    employees: text(record.employees),
    revenue: text(record.revenue),
    description: text(record.description),
    country: text(record.country),
    region: text(record.region),
    postalCode: text(record.postalCode),
  };
}

function isNotFound(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('data' in error)) return false;
  const { data } = error;
  return typeof data === 'object' && data !== null && 'code' in data && data.code === 'NOT_FOUND';
}

export default function EditAccountForm({ accountId }: Readonly<{ accountId: string }>) {
  const router = useRouter();
  const { isLoading: authLoading, isAuthenticated, user } = useRequireAuth();
  const enabled = isAuthenticated && !authLoading && !!accountId;

  const accountQuery = api.account.getById.useQuery({ id: accountId }, { enabled, retry: false });
  const industryQuery = api.accountSettings.industry.list.useQuery(undefined, { enabled });

  const initialValues = useMemo(
    () => (accountQuery.data ? toFormValues(accountQuery.data) : null),
    [accountQuery.data]
  );

  const [isDirty, setIsDirty] = useState(false);
  useFormUnsavedChanges({ formName: 'editAccountForm', isDirty });

  const utils = api.useUtils();
  const mutation = api.account.update.useMutation({
    onSuccess: async () => {
      setIsDirty(false);
      await Promise.all([
        utils.account.getById.invalidate({ id: accountId }),
        utils.account.list.invalidate(),
        utils.account.stats.invalidate(),
      ]);
      if (user) revalidateAccountCaches(user.id).catch(() => {});
      toast({ title: 'Account updated', description: 'Changes saved.' });
      router.push(`/accounts/${accountId}`);
    },
    onError: (error) => {
      toast({
        title: 'Could not update account',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = async (values: AccountFormValues) => {
    if (!initialValues) return;
    const payload = buildUpdateAccountPayload(accountId, initialValues, values);
    await mutation.mutateAsync(payload).catch(() => undefined);
  };

  if (authLoading || accountQuery.isLoading) {
    return (
      <div className="w-full max-w-3xl" aria-busy="true">
        <Skeleton className="h-8 w-48 mb-6" />
        <Card className="p-6 space-y-6">
          {SKELETON_KEYS.map((key) => (
            <div key={key} className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </Card>
      </div>
    );
  }

  if (accountQuery.error || !accountQuery.data || !initialValues) {
    const notFound = !accountQuery.error || isNotFound(accountQuery.error);
    return (
      <Card className="p-8 text-center max-w-3xl">
        <span
          className="material-symbols-outlined text-4xl text-muted-foreground mb-3 block"
          aria-hidden="true"
        >
          {notFound ? 'search_off' : 'cloud_off'}
        </span>
        <h1 className="text-lg font-semibold text-foreground mb-1">
          {notFound ? 'Account not found' : 'Could not load this account'}
        </h1>
        <p className="text-muted-foreground text-sm mb-4">
          {notFound
            ? 'It may have been deleted, or you may not have access to it.'
            : 'Check your connection and try again.'}
        </p>
        {notFound ? (
          <Link href="/accounts" className="text-primary hover:underline text-sm font-medium">
            Back to accounts
          </Link>
        ) : (
          <Button type="button" variant="outline" onClick={() => accountQuery.refetch()}>
            Retry
          </Button>
        )}
      </Card>
    );
  }

  const industryOptions = (industryQuery.data ?? [])
    .filter((option) => option.isActive)
    .map((option) => option.label);

  return (
    <div className="w-full">
      <PageHeader
        breadcrumbs={[
          { label: 'Accounts', href: '/accounts' },
          { label: accountQuery.data.name, href: `/accounts/${accountId}` },
          { label: 'Edit' },
        ]}
        title="Edit Account"
        className="mb-6"
      />
      <div className="max-w-3xl">
        <AccountForm
          mode="edit"
          initialValues={initialValues}
          industryOptions={industryOptions}
          industryStatus={toOptionsStatus(industryQuery)}
          onSubmit={handleSubmit}
          onCancel={() => router.push(`/accounts/${accountId}`)}
          isSubmitting={mutation.isPending}
          onDirtyChange={setIsDirty}
        />
      </div>
    </div>
  );
}
