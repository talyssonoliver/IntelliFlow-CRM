'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
import { enrichFromEmail } from '@/lib/leads/lead-enrichment';
import {
  buildQualificationNote,
  mapSourceToEnum,
  toTimeline,
  toRevenueBand,
} from '@/lib/leads/lead-form-utils';
import {
  LeadForm,
  validateLeadFormValues,
  EMPTY_FORM_VALUES,
  type LeadFormValues,
} from '@/components/leads/LeadForm';

type StepId = 'basic' | 'company' | 'qualification';
type StepStatus = 'completed' | 'current' | 'upcoming';

const STEPS: Array<{ id: StepId; n: number; label: string }> = [
  { id: 'basic', n: 1, label: 'Basic Info' },
  { id: 'company', n: 2, label: 'Company Details' },
  { id: 'qualification', n: 3, label: 'Qualification' },
];

const STEP_CIRCLE_CLASS: Record<StepStatus, string> = {
  upcoming:
    'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border-2 border-slate-200 dark:border-slate-700',
  current: 'bg-[#137fec] text-white',
  completed: 'bg-[#137fec] text-white hover:bg-[#0e6ac7]',
};

const STEP_LABEL_CLASS: Record<StepStatus, string> = {
  upcoming: 'text-slate-500 dark:text-slate-400',
  current: 'font-bold text-slate-900 dark:text-white',
  completed: 'font-bold text-slate-900 dark:text-white hover:text-[#137fec]',
};

function stepStatus(i: number, current: number): StepStatus {
  if (i < current) return 'completed';
  if (i === current) return 'current';
  return 'upcoming';
}

interface StepIndicatorProps {
  currentStepIndex: number;
  onClick: (step: { id: StepId; n: number; label: string }) => void;
}

function StepIndicator({ currentStepIndex, onClick }: Readonly<StepIndicatorProps>) {
  return (
    <div className="px-8 pt-8 pb-6 border-b border-slate-200 dark:border-slate-700">
      <nav
        aria-label="Form steps"
        className="relative flex items-center justify-between w-full max-w-2xl mx-auto"
      >
        <div
          className="absolute left-0 top-5 w-full h-0.5 bg-slate-100 dark:bg-slate-700 -z-10"
          aria-hidden="true"
        />
        {STEPS.map((step) => {
          const status = stepStatus(step.n - 1, currentStepIndex);
          const isClickable = status !== 'upcoming';
          const ariaLabel = `Step ${step.n}: ${step.label}${status === 'completed' ? ' (completed)' : ''}`;
          return (
            <button
              key={step.id}
              type="button"
              aria-current={status === 'current' ? 'step' : undefined}
              aria-label={ariaLabel}
              onClick={() => onClick(step)}
              disabled={!isClickable}
              className={`flex flex-col items-center gap-2 ${isClickable ? 'cursor-pointer' : 'cursor-not-allowed'}`}
            >
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ring-4 ring-white dark:ring-slate-900 shadow-sm transition-all ${STEP_CIRCLE_CLASS[status]}`}
              >
                {status === 'completed' ? (
                  <span aria-hidden="true" className="material-symbols-outlined !text-[20px]">
                    check
                  </span>
                ) : (
                  step.n
                )}
              </div>
              <span className={`text-sm font-medium ${STEP_LABEL_CLASS[status]}`}>
                {step.label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

const INIT: LeadFormValues = { ...EMPTY_FORM_VALUES, status: 'NEW' };

type ToastState = {
  open: boolean;
  variant: 'default' | 'destructive' | 'success';
  title: string;
  description: string;
};

export default function NewLeadForm() {
  const router = useRouter();
  const { isLoading: authLoading, isAuthenticated } = useRequireAuth();
  const [step, setStep] = useState<StepId>('basic');
  const [form, setForm] = useState<LeadFormValues>(INIT);
  const [errors, setErrors] = useState<Partial<Record<keyof LeadFormValues, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<ToastState>({
    open: false,
    variant: 'default',
    title: '',
    description: '',
  });
  const [notice, setNotice] = useState('');
  const [autoFilled, setAutoFilled] = useState({ website: false, company: false });

  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const isDirty = JSON.stringify(form) !== JSON.stringify(INIT);
  useFormUnsavedChanges({ formName: 'newLeadForm', isDirty });

  const createLead = api.lead.create.useMutation({
    onSuccess: () => {
      setForm(INIT);
      setToast({
        open: true,
        variant: 'success',
        title: 'Success!',
        description: 'Lead created successfully. Redirecting...',
      });
      setTimeout(() => router.push('/leads'), 1500);
    },
    onError: (err) => {
      console.error('Failed to create lead:', err.message);
      setToast({
        open: true,
        variant: 'destructive',
        title: 'Failed to create lead',
        description: err.message,
      });
    },
  });

  if (authLoading || !isAuthenticated)
    return (
      <div className="flex flex-col gap-8 p-8">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[400px] w-full rounded-xl" />
      </div>
    );

  const update = (field: keyof LeadFormValues, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
    if (field === 'website' || field === 'company')
      setAutoFilled((prev) => ({ ...prev, [field]: false }));
  };

  const onEmailBlur = () => {
    const enriched = enrichFromEmail(form.email, {
      website: autoFilled.website ? '' : form.website,
      company: autoFilled.company ? '' : form.company,
    });
    const willFillWebsite = !form.website.trim() || autoFilled.website;
    const willFillCompany = !form.company.trim() || autoFilled.company;
    const newWebsite = willFillWebsite ? (enriched.website ?? '') : form.website;
    const newCompany = willFillCompany ? (enriched.company ?? '') : form.company;
    if (newWebsite !== form.website || newCompany !== form.company)
      setForm((prev) => ({ ...prev, website: newWebsite, company: newCompany }));
    setAutoFilled({
      website: willFillWebsite ? !!newWebsite : autoFilled.website,
      company: willFillCompany ? !!newCompany : autoFilled.company,
    });
    const filledParts = [
      willFillCompany && !!newCompany ? 'company' : null,
      willFillWebsite && !!newWebsite ? 'website' : null,
    ].filter(Boolean);
    setNotice(
      filledParts.length ? `Auto-filled ${filledParts.join(' and ')} from the email domain.` : ''
    );
  };

  const validate = () => {
    const fieldErrors = validateLeadFormValues(form, 'create', [step]);
    setErrors(fieldErrors);
    return Object.keys(fieldErrors).length === 0;
  };

  const goToStep = (targetId: StepId) => {
    setStep(targetId);
    setNotice('');
  };

  const nextStep = () => {
    if (!validate()) return;
    if (stepIndex + 1 < STEPS.length) goToStep(STEPS[stepIndex + 1].id);
  };

  const prevStep = () => {
    if (stepIndex > 0) goToStep(STEPS[stepIndex - 1].id);
  };

  const onStepClick = (clicked: { id: StepId; n: number }) => {
    if (clicked.n - 1 <= stepIndex) goToStep(clicked.id);
  };

  const submit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const optional = (v: string) => (v.trim() ? v.trim() : undefined);
      const qualificationNote = buildQualificationNote({
        source: form.source,
        sourceOther: form.sourceOther,
        companySize: form.companySize,
        industry: form.industry,
        qualificationNotes: form.qualificationNotes,
      });
      const parsedTags = form.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      await createLead.mutateAsync({
        email: form.email.trim(),
        firstName: optional(form.firstName),
        lastName: optional(form.lastName),
        company: optional(form.company),
        title: optional(form.title),
        phone: optional(form.phone),
        source: mapSourceToEnum(form.source),
        website: optional(form.website),
        location: optional(form.location),
        ...(parsedTags.length > 0 ? { tags: parsedTags } : {}),
        budget: optional(form.budget),
        authority: optional(form.authority),
        need: optional(form.need),
        timeline: toTimeline(form.timeline),
        annualRevenue: toRevenueBand(form.annualRevenue),
        ...(qualificationNote ? { qualificationNote } : {}),
      });
    } catch (e) {
      console.error('Mutation error:', e);
    } finally {
      setSubmitting(false);
    }
  };

  const symbolClass = 'material-symbols-outlined !text-[18px]';

  return (
    <ToastProvider>
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-4">
          <nav aria-label="Breadcrumb" className="flex">
            <ol className="flex items-center space-x-2">
              <li>
                <Link
                  href="/dashboard"
                  className="text-slate-500 dark:text-slate-400 hover:text-[#137fec] text-sm font-medium transition-colors"
                >
                  Dashboard
                </Link>
              </li>
              <li>
                <span className="text-slate-300 dark:text-slate-600">/</span>
              </li>
              <li>
                <Link
                  href="/leads"
                  className="text-slate-500 dark:text-slate-400 hover:text-[#137fec] text-sm font-medium transition-colors"
                >
                  Leads
                </Link>
              </li>
              <li>
                <span className="text-slate-300 dark:text-slate-600">/</span>
              </li>
              <li>
                <span className="text-slate-900 dark:text-white text-sm font-medium">New Lead</span>
              </li>
            </ol>
          </nav>
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">
              Create New Lead
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-base">
              Capture information about a potential opportunity.
            </p>
          </div>
          <output aria-live="polite" className="sr-only">
            {notice}
          </output>
        </div>

        <Card className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          <StepIndicator currentStepIndex={stepIndex} onClick={onStepClick} />
          <div className="p-8">
            <LeadForm
              mode="create"
              visibleSections={[step]}
              values={form}
              errors={errors}
              onChange={update}
              onSubmit={(e) => {
                e.preventDefault();
                if (stepIndex < STEPS.length - 1) {
                  nextStep();
                } else {
                  void submit();
                }
              }}
              onEmailBlur={onEmailBlur}
              enrichmentNotice={notice}
              isSubmitting={submitting}
              onCancel={() => router.push('/leads')}
              showActions={false}
            />
            <div className="flex items-center justify-between pt-6 border-t border-slate-200 dark:border-slate-700 mt-2">
              <button
                type="button"
                onClick={stepIndex === 0 ? () => router.push('/leads') : prevStep}
                className="px-5 py-2.5 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                {stepIndex === 0 ? 'Cancel' : 'Previous'}
              </button>
              {stepIndex < STEPS.length - 1 ? (
                <button
                  type="button"
                  onClick={nextStep}
                  className="flex items-center gap-2 bg-[#137fec] hover:bg-[#0e6ac7] text-white font-bold py-2.5 px-6 rounded-lg shadow-sm shadow-[#137fec]/30 transition-all active:scale-95"
                >
                  <span>Next Step</span>
                  <span aria-hidden="true" className={symbolClass}>
                    arrow_forward
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void submit()}
                  disabled={submitting}
                  className="flex items-center gap-2 bg-[#137fec] hover:bg-[#0e6ac7] text-white font-bold py-2.5 px-6 rounded-lg shadow-sm shadow-[#137fec]/30 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? (
                    <>
                      <span aria-hidden="true" className={`${symbolClass} animate-spin`}>
                        progress_activity
                      </span>
                      <span>Creating...</span>
                    </>
                  ) : (
                    <>
                      <span>Create Lead</span>
                      <span aria-hidden="true" className={symbolClass}>
                        check
                      </span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </Card>

        <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800/30">
          <span
            aria-hidden="true"
            className="material-symbols-outlined !text-[20px] text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0"
          >
            info
          </span>
          <div className="flex flex-col gap-1">
            <h4 className="text-sm font-bold text-blue-900 dark:text-blue-100">Pro Tip</h4>
            <p className="text-sm text-blue-800 dark:text-blue-300/80">
              You can skip the &apos;Qualification&apos; step for now if you haven&apos;t spoken to
              the lead yet. You can always update the qualification status later from the lead
              detail view.
            </p>
          </div>
        </div>
      </div>

      <Toast
        open={toast.open}
        onOpenChange={(open) => setToast({ ...toast, open })}
        variant={toast.variant}
      >
        <div className="grid gap-1">
          <ToastTitle>{toast.title}</ToastTitle>
          <ToastDescription>{toast.description}</ToastDescription>
        </div>
        <ToastClose />
      </Toast>
      <ToastViewport />
    </ToastProvider>
  );
}
