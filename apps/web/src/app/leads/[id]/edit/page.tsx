'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  Card,
  Skeleton,
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
} from '@intelliflow/ui';
import { api } from '@/lib/api';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { invalidateLeadsCache } from '@/app/leads/(list)/actions';
import { LeadEditor } from '@/components/leads/lead-editor';
import type { LeadUpdatePayload } from '@/lib/leads/change-tracker';

const LEAD_EDIT_SKELETON_KEYS = [
  'le-skel-0',
  'le-skel-1',
  'le-skel-2',
  'le-skel-3',
  'le-skel-4',
  'le-skel-5',
] as const;

type ToastData = {
  open: boolean;
  variant: 'default' | 'destructive' | 'success';
  title: string;
  description: string;
};

export default function EditLeadPage() {
  const params = useParams();
  const router = useRouter();
  const leadId = params.id as string;

  const { isLoading: authLoading, isAuthenticated } = useRequireAuth();

  const {
    data: lead,
    isLoading,
    error,
  } = api.lead.getById.useQuery(
    { id: leadId },
    { enabled: isAuthenticated && !authLoading && !!leadId }
  );

  const [toast, setToast] = useState<ToastData>({
    open: false,
    variant: 'default',
    title: '',
    description: '',
  });

  const utils = api.useUtils();

  const updateLead = api.lead.update.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.lead.getById.invalidate({ id: leadId }),
        utils.lead.list.invalidate(),
        utils.lead.stats.invalidate(),
      ]);
      invalidateLeadsCache().catch(() => {});

      setToast({
        open: true,
        variant: 'success',
        title: 'Lead updated',
        description: 'Changes saved successfully.',
      });

      setTimeout(() => {
        router.push(`/leads/${leadId}`);
      }, 1000);
    },
    onError: (error) => {
      setToast({
        open: true,
        variant: 'destructive',
        title: 'Failed to update lead',
        description: error.message,
      });
    },
  });

  // F9 (IFC-242): LeadEditor validates the patch with updateLeadSchema and hands
  // back a fully-typed LeadUpdatePayload (the tRPC input shape), so this boundary
  // needs no cast.
  const handleSave = (payload: LeadUpdatePayload) => updateLead.mutateAsync(payload);

  // Loading states
  if (authLoading || isLoading) {
    return (
      <div className="mx-auto max-w-2xl px-4 pt-8 pb-16">
        <Skeleton className="h-8 w-48 mb-6" />
        <Card className="p-6 space-y-6">
          {LEAD_EDIT_SKELETON_KEYS.map((key) => (
            <div key={key} className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </Card>
      </div>
    );
  }

  if (error || !lead) {
    return (
      <div className="mx-auto max-w-2xl px-4 pt-8 pb-16">
        <Card className="p-8 text-center">
          <span className="material-symbols-outlined text-4xl text-slate-400 mb-3 block">
            error_outline
          </span>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">
            Lead not found
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-4">
            {error?.message ?? 'The lead you are looking for does not exist.'}
          </p>
          <Link href="/leads" className="text-[#137fec] hover:underline text-sm font-medium">
            Back to leads
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <ToastProvider>
      <div className="mx-auto max-w-2xl px-4 pt-8 pb-16">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="flex mb-6">
          <ol className="flex items-center space-x-2 text-sm">
            <li>
              <Link
                href="/leads"
                className="text-slate-500 dark:text-slate-400 hover:text-[#137fec] font-medium transition-colors"
              >
                Leads
              </Link>
            </li>
            <li>
              <span className="text-slate-300 dark:text-slate-600">/</span>
            </li>
            <li>
              <Link
                href={`/leads/${leadId}`}
                className="text-slate-500 dark:text-slate-400 hover:text-[#137fec] font-medium transition-colors"
              >
                {lead.firstName} {lead.lastName}
              </Link>
            </li>
            <li>
              <span className="text-slate-300 dark:text-slate-600">/</span>
            </li>
            <li>
              <span className="font-medium text-slate-900 dark:text-white">Edit</span>
            </li>
          </ol>
        </nav>

        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Edit Lead</h1>

        <LeadEditor
          leadId={leadId}
          lead={lead}
          isSaving={updateLead.isPending}
          onSave={handleSave}
          onCancel={() => router.back()}
        />
      </div>

      {/* Toast notifications */}
      <Toast
        open={toast.open}
        onOpenChange={(open) => setToast((t) => ({ ...t, open }))}
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
