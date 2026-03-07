'use client';

import React, { useState, useEffect } from 'react';
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
import { useFormUnsavedChanges } from '@/hooks/useUnsavedChanges';
import { invalidateLeadsCache } from '@/app/leads/(list)/actions';

interface EditFormData {
  firstName: string;
  lastName: string;
  phone: string;
  title: string;
  company: string;
  location: string;
  website: string;
  estimatedValue: string;
  tags: string;
}

const initialFormData: EditFormData = {
  firstName: '',
  lastName: '',
  phone: '',
  title: '',
  company: '',
  location: '',
  website: '',
  estimatedValue: '',
  tags: '',
};

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

  const [formData, setFormData] = useState<EditFormData>(initialFormData);
  const [seededSnapshot, setSeededSnapshot] = useState<string | null>(null);
  const [seeded, setSeeded] = useState(false);
  const [toast, setToast] = useState<ToastData>({
    open: false,
    variant: 'default',
    title: '',
    description: '',
  });

  // Seed form from fetched lead data
  useEffect(() => {
    if (lead && !seeded) {
      const seededData: EditFormData = {
        firstName: lead.firstName ?? '',
        lastName: lead.lastName ?? '',
        phone:
          typeof lead.phone === 'string'
            ? lead.phone
            : ((lead.phone as { value?: string } | null)?.value ?? ''),
        title: lead.title ?? '',
        company: lead.company ?? '',
        location: ((lead as Record<string, unknown>).location as string) ?? '',
        website: ((lead as Record<string, unknown>).website as string) ?? '',
        estimatedValue:
          (lead as Record<string, unknown>).estimatedValue == null
            ? ''
            : String(((lead as Record<string, unknown>).estimatedValue as number) / 100),
        tags: Array.isArray((lead as Record<string, unknown>).tags)
          ? ((lead as Record<string, unknown>).tags as string[]).join(', ')
          : '',
      };
      setFormData(seededData);
      setSeededSnapshot(JSON.stringify(seededData));
      setSeeded(true);
    }
  }, [lead, seeded]);

  // Track unsaved changes — compare against seeded snapshot, not empty initial
  const isDirty = seeded && seededSnapshot !== null && JSON.stringify(formData) !== seededSnapshot;
  useFormUnsavedChanges({ formName: 'editLeadForm', isDirty });

  const utils = api.useUtils();

  const updateLead = api.lead.update.useMutation({
    onSuccess: async () => {
      // Invalidate caches
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

  const updateField = (field: keyof EditFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const toOptional = (value: string): string | undefined =>
    value.trim() ? value.trim() : undefined;

  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();

    const payload: Record<string, unknown> = {
      id: leadId,
      firstName: toOptional(formData.firstName),
      lastName: toOptional(formData.lastName),
      company: toOptional(formData.company),
      title: toOptional(formData.title),
      phone: toOptional(formData.phone),
      location: toOptional(formData.location),
      website: toOptional(formData.website),
      tags: formData.tags.trim()
        ? formData.tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
        : undefined,
    };

    // Convert dollars to cents for estimatedValue
    if (formData.estimatedValue.trim()) {
      const cents = Math.round(Number.parseFloat(formData.estimatedValue) * 100);
      if (!Number.isNaN(cents) && cents >= 0) {
        payload.estimatedValue = cents;
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await updateLead.mutateAsync(payload as any);
  };

  // Loading states
  if (authLoading || isLoading) {
    return (
      <div className="mx-auto max-w-2xl px-4 pt-8 pb-16">
        <Skeleton className="h-8 w-48 mb-6" />
        <Card className="p-6 space-y-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-2"> {/* NOSONAR typescript:S6479 */}
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

        <form onSubmit={handleSubmit}>
          {/* Read-only info */}
          <Card className="p-6 mb-6">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-4">
              Lead Info
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <span className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">
                  Email
                </span>
                <div className="flex items-center gap-2 px-3 h-10 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-300">
                  <span className="material-symbols-outlined !text-[16px] text-slate-400">
                    lock
                  </span>
                  <span className="truncate">{lead.email}</span>
                </div>
              </div>
              <div>
                <span className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">
                  Status
                </span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                  {lead.status}
                </span>
              </div>
              <div>
                <span className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">
                  Source
                </span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  {lead.source}
                </span>
              </div>
            </div>
          </Card>

          {/* Editable: Contact Information */}
          <Card className="p-6 mb-6">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-4">
              Contact Information
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="firstName"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  First Name
                </label>
                <input
                  id="firstName"
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => updateField('firstName', e.target.value)}
                  className="w-full px-3 h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-[#137fec] focus:border-transparent outline-none transition-all"
                />
              </div>
              <div>
                <label
                  htmlFor="lastName"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Last Name
                </label>
                <input
                  id="lastName"
                  type="text"
                  value={formData.lastName}
                  onChange={(e) => updateField('lastName', e.target.value)}
                  className="w-full px-3 h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-[#137fec] focus:border-transparent outline-none transition-all"
                />
              </div>
              <div>
                <label
                  htmlFor="phone"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Phone
                </label>
                <input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => updateField('phone', e.target.value)}
                  placeholder="+1234567890"
                  className="w-full px-3 h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-[#137fec] focus:border-transparent outline-none transition-all"
                />
              </div>
              <div>
                <label
                  htmlFor="title"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Job Title
                </label>
                <input
                  id="title"
                  type="text"
                  value={formData.title}
                  onChange={(e) => updateField('title', e.target.value)}
                  className="w-full px-3 h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-[#137fec] focus:border-transparent outline-none transition-all"
                />
              </div>
              <div className="sm:col-span-2">
                <label
                  htmlFor="company"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Company
                </label>
                <input
                  id="company"
                  type="text"
                  value={formData.company}
                  onChange={(e) => updateField('company', e.target.value)}
                  className="w-full px-3 h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-[#137fec] focus:border-transparent outline-none transition-all"
                />
              </div>
            </div>
          </Card>

          {/* Editable: Additional Details */}
          <Card className="p-6 mb-6">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-4">
              Additional Details
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="location"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Location
                </label>
                <input
                  id="location"
                  type="text"
                  value={formData.location}
                  onChange={(e) => updateField('location', e.target.value)}
                  placeholder="City, State"
                  className="w-full px-3 h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-[#137fec] focus:border-transparent outline-none transition-all"
                />
              </div>
              <div>
                <label
                  htmlFor="website"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Website
                </label>
                <input
                  id="website"
                  type="text"
                  value={formData.website}
                  onChange={(e) => updateField('website', e.target.value)}
                  placeholder="https://example.com"
                  className="w-full px-3 h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-[#137fec] focus:border-transparent outline-none transition-all"
                />
              </div>
              <div>
                <label
                  htmlFor="estimatedValue"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Estimated Value ($)
                </label>
                <input
                  id="estimatedValue"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.estimatedValue}
                  onChange={(e) => updateField('estimatedValue', e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-[#137fec] focus:border-transparent outline-none transition-all"
                />
              </div>
              <div>
                <label
                  htmlFor="tags"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Tags
                </label>
                <input
                  id="tags"
                  type="text"
                  value={formData.tags}
                  onChange={(e) => updateField('tags', e.target.value)}
                  placeholder="tag1, tag2, tag3"
                  className="w-full px-3 h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-[#137fec] focus:border-transparent outline-none transition-all"
                />
                <p className="text-xs text-slate-400 mt-1">Separate tags with commas</p>
              </div>
            </div>
          </Card>

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              className="px-4 h-10 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={updateLead.isPending}
              className="px-6 h-10 rounded-lg bg-[#137fec] text-white text-sm font-semibold hover:bg-blue-600 transition-colors shadow-sm shadow-blue-200 dark:shadow-none disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {updateLead.isPending ? (
                <>
                  <span className="material-symbols-outlined !text-[18px] animate-spin">
                    progress_activity
                  </span>{' '}
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </button>
          </div>
        </form>
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
