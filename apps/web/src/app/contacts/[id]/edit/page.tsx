'use client';

import React, { useState, useEffect } from 'react';

const CONTACT_EDIT_SKELETON_KEYS = ['ce-skel-0', 'ce-skel-1', 'ce-skel-2', 'ce-skel-3', 'ce-skel-4', 'ce-skel-5'] as const;
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
import { invalidateContactsCache } from '@/app/contacts/(list)/actions';
import { ContactForm, type ContactFormData } from '@/components/contacts/ContactForm';

type ToastData = {
  open: boolean;
  variant: 'default' | 'destructive' | 'success';
  title: string;
  description: string;
};

export default function EditContactPage() {
  const params = useParams();
  const router = useRouter();
  const contactId = params.id as string;

  const { isLoading: authLoading, isAuthenticated } = useRequireAuth();

  const query = api.contact.getById.useQuery(
    { id: contactId },
    { enabled: isAuthenticated && !authLoading && !!contactId }
  );
  const isLoading = query.isLoading;
  const error = query.error;
  // Narrow tRPC's deeply-generic output to a flat record type at the boundary
  // to avoid TS2589 "excessively deep" when consumed in effects/JSX below.
  const record = query.data as unknown as Record<string, unknown> | undefined;

  const [formData, setFormData] = useState<Partial<ContactFormData> | null>(null);
  const [seeded, setSeeded] = useState(false);
  const [toastData, setToastData] = useState<ToastData>({
    open: false,
    variant: 'default',
    title: '',
    description: '',
  });

  // Seed form from fetched contact data
  useEffect(() => {
    if (record && !seeded) {
      const r = record as unknown as Record<string, unknown>;
      const phoneRaw = r.phone;
      const phone =
        typeof phoneRaw === 'string'
          ? phoneRaw
          : ((phoneRaw as { value?: string } | null)?.value ?? '');
      const tagsRaw = r.tags;

      const next: Partial<ContactFormData> = {
        firstName: (r.firstName as string | null) ?? '',
        lastName: (r.lastName as string | null) ?? '',
        email: (r.email as string | null) ?? '',
        phone,
        streetAddress: (r.streetAddress as string | null) ?? '',
        city: (r.city as string | null) ?? '',
        zipCode: (r.zipCode as string | null) ?? '',
        company: (r.company as string | null) ?? '',
        jobTitle: (r.title as string | null) ?? '',
        department: (r.department as string | null) ?? '',
        linkedIn: (r.linkedInUrl as string | null) ?? '',
        contactType: (r.contactType as string | null) ?? '',
        status: (r.status as ContactFormData['status']) ?? 'ACTIVE',
        tags: Array.isArray(tagsRaw) ? (tagsRaw as string[]).join(', ') : '',
        notes: (r.contactNotes as string | null) ?? '',
      };
      setFormData(next);
      setSeeded(true);
    }
  }, [record, seeded]);

  // Track unsaved changes — dirty state reported by ContactForm via onDirtyChange
  const [isDirty, setIsDirty] = useState(false);
  useFormUnsavedChanges({ formName: 'editContactForm', isDirty });

  const utils = api.useUtils();

  const mutation = api.contact.update.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.contact.getById.invalidate({ id: contactId }),
        utils.contact.list.invalidate(),
        utils.contact.stats.invalidate(),
      ]);
      invalidateContactsCache().catch(() => {});

      setToastData({
        open: true,
        variant: 'success',
        title: 'Contact updated',
        description: 'Changes saved successfully.',
      });

      setTimeout(() => {
        router.push(`/contacts/${contactId}`);
      }, 1000);
    },
    onError: (err) => {
      setToastData({
        open: true,
        variant: 'destructive',
        title: 'Failed to update contact',
        description: err.message,
      });
    },
  });

  const toOptional = (value: string): string | undefined =>
    value.trim() ? value.trim() : undefined;

  const handleSubmit = async (data: ContactFormData) => {
    const payload: Record<string, unknown> = {
      id: contactId,
      firstName: toOptional(data.firstName),
      lastName: toOptional(data.lastName),
      phone: toOptional(data.phone),
      title: toOptional(data.jobTitle),
      department: toOptional(data.department),
      status: data.status || undefined,
      streetAddress: toOptional(data.streetAddress),
      city: toOptional(data.city),
      zipCode: toOptional(data.zipCode),
      company: toOptional(data.company),
      linkedInUrl: toOptional(data.linkedIn),
      contactType: toOptional(data.contactType),
      contactNotes: toOptional(data.notes),
      tags: data.tags.trim()
        ? data.tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
        : undefined,
      // email omitted — read-only
    };

    await mutation.mutateAsync(payload as never);
  };

  // Loading states
  if (authLoading || isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 pt-8 pb-16">
        <Skeleton className="h-8 w-48 mb-6" />
        <Card className="p-6 space-y-6">
          {CONTACT_EDIT_SKELETON_KEYS.map((key) => (
            <div key={key} className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </Card>
      </div>
    );
  }

  if (error || !record) {
    return (
      <div className="mx-auto max-w-3xl px-4 pt-8 pb-16">
        <Card className="p-8 text-center">
          <span className="material-symbols-outlined text-4xl text-slate-400 mb-3 block">
            error_outline
          </span>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">
            Contact not found
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-4">
            {error?.message ?? 'The contact you are looking for does not exist.'}
          </p>
          <Link href="/contacts" className="text-[#137fec] hover:underline text-sm font-medium">
            Back to contacts
          </Link>
        </Card>
      </div>
    );
  }

  const contactName =
    [record.firstName as string | null, record.lastName as string | null]
      .filter(Boolean)
      .join(' ') || 'Contact';

  return (
    <ToastProvider>
      <div className="mx-auto max-w-3xl px-4 pt-8 pb-16">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="flex mb-6">
          <ol className="flex items-center space-x-2 text-sm">
            <li>
              <Link
                href="/contacts"
                className="text-slate-500 dark:text-slate-400 hover:text-[#137fec] font-medium transition-colors"
              >
                Contacts
              </Link>
            </li>
            <li>
              <span className="text-slate-300 dark:text-slate-600">/</span>
            </li>
            <li>
              <Link
                href={`/contacts/${contactId}`}
                className="text-slate-500 dark:text-slate-400 hover:text-[#137fec] font-medium transition-colors"
              >
                {contactName}
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

        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Edit Contact</h1>

        {/* Read-only email info */}
        <Card className="p-6 mb-6">
          <div>
            <span className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">
              Email
            </span>
            <div className="flex items-center gap-2 px-3 h-10 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-300 max-w-sm">
              <span className="material-symbols-outlined !text-[16px] text-slate-400">lock</span>
              <span className="truncate">{record.email as string}</span>
            </div>
          </div>
        </Card>

        {formData && (
          <ContactForm
            mode="edit"
            contact={formData}
            onSubmit={handleSubmit}
            onCancel={() => router.back()}
            isSubmitting={mutation.isPending}
            onDirtyChange={setIsDirty}
          />
        )}
      </div>

      {/* Toast notifications */}
      <Toast
        open={toastData.open}
        onOpenChange={(open) => setToastData((t) => ({ ...t, open }))}
        variant={toastData.variant}
      >
        <ToastTitle>{toastData.title}</ToastTitle>
        <ToastDescription>{toastData.description}</ToastDescription>
        <ToastClose />
      </Toast>
      <ToastViewport />
    </ToastProvider>
  );
}
