'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
} from '@intelliflow/ui';
import { trpc } from '@/lib/trpc';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { revalidateDealCaches } from '@/app/deals/actions';
import { useFormUnsavedChanges } from '@/hooks/useUnsavedChanges';
import { PageHeader } from '@/components/shared/page-header';
import { DealForm, type DealFormData } from '@/components/deals/DealForm';

interface ToastState {
  open: boolean;
  title: string;
  description: string;
  variant: 'default' | 'destructive';
}

export default function NewDealPage() {
  const { user } = useRequireAuth();
  const router = useRouter();
  const [isDirty, setIsDirty] = useState(false);
  const [toast, setToast] = useState<ToastState>({
    open: false,
    title: '',
    description: '',
    variant: 'default',
  });

  useFormUnsavedChanges({
    formName: 'newDealForm',
    isDirty,
  });

  const createMutation = trpc.opportunity.create.useMutation({
    onSuccess: (data) => {
      revalidateDealCaches(user?.id ?? null).catch(() => {});
      setIsDirty(false);
      setToast({
        open: true,
        title: 'Deal created',
        description: `"${data.name}" has been created successfully.`,
        variant: 'default',
      });
      // Navigate after a brief delay so toast is visible
      setTimeout(() => {
        router.push(`/deals/${data.id}`);
      }, 500);
    },
    onError: (error) => {
      setToast({
        open: true,
        title: 'Failed to create deal',
        description: error.message || 'An unexpected error occurred. Please try again.',
        variant: 'destructive',
      });
    },
  });

  function handleSubmit(formData: DealFormData) {
    createMutation.mutate({
      name: formData.name.trim(),
      value: { amount: formData.value.amount, currency: formData.value.currency },
      stage: formData.stage,
      probability: formData.probability,
      expectedCloseDate: formData.expectedCloseDate
        ? new Date(formData.expectedCloseDate)
        : undefined,
      accountId: formData.accountId,
      contactId: formData.contactId || undefined,
      description: formData.description.trim() || undefined,
    });
  }

  return (
    <ToastProvider>
      <div className="flex flex-col gap-6">
        <PageHeader
          breadcrumbs={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Deals', href: '/deals' },
            { label: 'New Deal' },
          ]}
          title="New Deal"
          description="Create a new deal to track your sales opportunity."
        />

        <div className="max-w-2xl">
          <DealForm
            mode="create"
            onSubmit={handleSubmit}
            onDirtyChange={setIsDirty}
            isSubmitting={createMutation.isPending}
          />
        </div>
      </div>

      <Toast
        open={toast.open}
        onOpenChange={(open) => setToast((prev) => ({ ...prev, open }))}
        variant={toast.variant}
      >
        <ToastTitle>{toast.title}</ToastTitle>
        <ToastDescription>{toast.description}</ToastDescription>
        <ToastClose />
      </Toast>
      <ToastViewport />
    </ToastProvider>
  );
}
