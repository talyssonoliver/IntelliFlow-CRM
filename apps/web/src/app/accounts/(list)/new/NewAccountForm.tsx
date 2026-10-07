'use client';

/**
 * New Account form (PG-197). The route shell `page.tsx` renders this client
 * component so the logic is unit-test-measured (PG-060 lead pattern).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '@intelliflow/ui';
import { api } from '@/lib/api';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { useFormUnsavedChanges } from '@/hooks/useUnsavedChanges';
import { revalidateAccountCaches } from '@/app/accounts/actions';
import { PageHeader } from '@/components/shared/page-header';
import {
  AccountForm,
  buildCreateAccountPayload,
  toOptionsStatus,
  type AccountFormValues,
} from '@/components/accounts/AccountForm';

export default function NewAccountForm() {
  const router = useRouter();
  const { isLoading: authLoading, isAuthenticated, user } = useRequireAuth();
  const enabled = isAuthenticated && !authLoading;

  const industryQuery = api.accountSettings.industry.list.useQuery(undefined, { enabled });
  const ownerQuery = api.account.assignees.useQuery(undefined, { enabled });

  const [isDirty, setIsDirty] = useState(false);
  useFormUnsavedChanges({ formName: 'newAccountForm', isDirty });

  const utils = api.useUtils();
  const mutation = api.account.create.useMutation({
    onSuccess: async (account) => {
      setIsDirty(false);
      await Promise.all([utils.account.list.invalidate(), utils.account.stats.invalidate()]);
      if (user) revalidateAccountCaches(user.id).catch(() => {});
      toast({ title: 'Account created', description: `${account.name} was created.` });
      router.push(`/accounts/${account.id}`);
    },
    onError: (error) => {
      toast({
        title: 'Could not create account',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = async (values: AccountFormValues) => {
    await mutation.mutateAsync(buildCreateAccountPayload(values)).catch(() => undefined);
  };

  const industryOptions = (industryQuery.data ?? [])
    .filter((option) => option.isActive)
    .map((option) => option.label);

  return (
    <div className="w-full">
      <PageHeader
        breadcrumbs={[
          { label: 'Dashboard', href: '/' },
          { label: 'Accounts', href: '/accounts' },
          { label: 'New Account' },
        ]}
        title="New Account"
        description="Add a company. Location is optional and drives territory assignment."
        className="mb-6"
      />
      <div className="max-w-3xl">
        <AccountForm
          mode="create"
          industryOptions={industryOptions}
          industryStatus={toOptionsStatus(industryQuery)}
          ownerOptions={ownerQuery.data ?? []}
          ownerStatus={toOptionsStatus(ownerQuery)}
          currentUser={user ? { id: user.id, role: user.role } : null}
          onSubmit={handleSubmit}
          onCancel={() => router.push('/accounts')}
          isSubmitting={mutation.isPending}
          onDirtyChange={setIsDirty}
        />
      </div>
    </div>
  );
}
