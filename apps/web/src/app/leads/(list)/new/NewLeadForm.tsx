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
import { emailSchema } from '@intelliflow/validators';

// Step configuration
type StepId = 'basic' | 'company' | 'qualification';

interface Step {
  id: StepId;
  number: number;
  label: string;
}

const steps: Step[] = [
  { id: 'basic', number: 1, label: 'Basic Info' },
  { id: 'company', number: 2, label: 'Company Details' },
  { id: 'qualification', number: 3, label: 'Qualification' },
];

// Accessible-name suffix per step status (branchless — keeps the page component
// under the cognitive-complexity budget; current step is conveyed via aria-current).
const STEP_STATUS_SUFFIX: Record<'completed' | 'current' | 'upcoming', string> = {
  completed: ' (completed)',
  current: '',
  upcoming: '',
};

// Form data structure
interface LeadFormData {
  // Step 1: Basic Info
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  jobTitle: string;
  source: string;
  sourceOther: string;
  // Step 2: Company Details
  company: string;
  website: string;
  industry: string;
  companySize: string;
  annualRevenue: string;
  // Step 3: Qualification
  status: string;
  qualificationNotes: string;
  budget: string;
  authority: string;
  need: string;
  timeline: string;
}

const initialFormData: LeadFormData = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  jobTitle: '',
  source: '',
  sourceOther: '',
  company: '',
  website: '',
  industry: '',
  companySize: '',
  annualRevenue: '',
  status: 'NEW',
  qualificationNotes: '',
  budget: '',
  authority: '',
  need: '',
  timeline: '',
};

// Lead source options
const sourceOptions = [
  { value: '', label: 'Select a source...' },
  { value: 'website', label: 'Website / Organic' },
  { value: 'referral', label: 'Referral' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'conference', label: 'Conference / Event' },
  { value: 'cold_outreach', label: 'Cold Outreach' },
  { value: 'other', label: 'Other' },
];

// Industry options
const industryOptions = [
  { value: '', label: 'Select an industry...' },
  { value: 'technology', label: 'Technology' },
  { value: 'finance', label: 'Finance & Banking' },
  { value: 'healthcare', label: 'Healthcare' },
  { value: 'retail', label: 'Retail & E-commerce' },
  { value: 'manufacturing', label: 'Manufacturing' },
  { value: 'consulting', label: 'Consulting' },
  { value: 'education', label: 'Education' },
  { value: 'other', label: 'Other' },
];

// Company size options
const companySizeOptions = [
  { value: '', label: 'Select company size...' },
  { value: '1-10', label: '1-10 employees' },
  { value: '11-50', label: '11-50 employees' },
  { value: '51-200', label: '51-200 employees' },
  { value: '201-500', label: '201-500 employees' },
  { value: '501-1000', label: '501-1000 employees' },
  { value: '1000+', label: '1000+ employees' },
];

// Revenue options
const revenueOptions = [
  { value: '', label: 'Select annual revenue...' },
  { value: '<1M', label: 'Less than $1M' },
  { value: '1M-10M', label: '$1M - $10M' },
  { value: '10M-50M', label: '$10M - $50M' },
  { value: '50M-100M', label: '$50M - $100M' },
  { value: '100M+', label: '$100M+' },
];

// Timeline options
const timelineOptions = [
  { value: '', label: 'Select timeline...' },
  { value: 'immediate', label: 'Immediate (within 1 month)' },
  { value: 'short', label: 'Short-term (1-3 months)' },
  { value: 'medium', label: 'Medium-term (3-6 months)' },
  { value: 'long', label: 'Long-term (6+ months)' },
  { value: 'unknown', label: 'Unknown / Not discussed' },
];

/** Resolve a select value to its human label, falling back to the raw value. */
function labelFor(options: { value: string; label: string }[], value: string): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

// Mirrors the lead.addNote contract (`content: z.string().max(5000)`). The note
// is truncated to this budget client-side so an oversized free-text qualification
// note is persisted (truncated) rather than rejected by the API and lost.
const NOTE_MAX_LENGTH = 5000;

/**
 * Build a human-readable note from the qualification / company-detail fields the
 * `lead.create` schema cannot persist yet (BANT + company profile + the required
 * "Other" source detail). Returns '' when the user filled none of them.
 *
 * This is interim persistence until IFC-242 / IFC-004 add first-class Lead
 * fields: without it these user-entered values would be silently dropped on
 * create. Kept pure (no hooks) so it is unit-testable.
 */
function buildQualificationNote(formData: LeadFormData): string {
  const lines: string[] = [];
  if (formData.source === 'other' && formData.sourceOther.trim()) {
    lines.push(`Source detail: ${formData.sourceOther.trim()}`);
  }
  if (formData.budget.trim()) lines.push(`Budget: ${formData.budget.trim()}`);
  if (formData.authority.trim()) lines.push(`Authority: ${formData.authority.trim()}`);
  if (formData.need.trim()) lines.push(`Need: ${formData.need.trim()}`);
  if (formData.timeline.trim())
    lines.push(`Timeline: ${labelFor(timelineOptions, formData.timeline)}`);
  if (formData.companySize.trim()) {
    lines.push(`Company size: ${labelFor(companySizeOptions, formData.companySize)}`);
  }
  if (formData.industry.trim())
    lines.push(`Industry: ${labelFor(industryOptions, formData.industry)}`);
  if (formData.annualRevenue.trim()) {
    lines.push(`Annual revenue: ${labelFor(revenueOptions, formData.annualRevenue)}`);
  }
  if (formData.qualificationNotes.trim())
    lines.push(`Notes: ${formData.qualificationNotes.trim()}`);
  if (lines.length === 0) return '';
  const body = `Lead qualification details (captured on the New Lead form):\n${lines.join('\n')}`;
  // Cap at the API note budget so an oversized free-text note is persisted
  // (truncated) instead of being rejected by lead.addNote and silently lost.
  return body.length > NOTE_MAX_LENGTH ? `${body.slice(0, NOTE_MAX_LENGTH - 1)}…` : body;
}

type ToastData = {
  open: boolean;
  variant: 'default' | 'destructive' | 'success';
  title: string;
  description: string;
};

export default function NewLeadForm() {
  const router = useRouter();
  const { isLoading: authLoading, isAuthenticated } = useRequireAuth();
  const [currentStep, setCurrentStep] = useState<StepId>('basic');
  const [formData, setFormData] = useState<LeadFormData>(initialFormData);
  const [errors, setErrors] = useState<Partial<Record<keyof LeadFormData, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<ToastData>({
    open: false,
    variant: 'default',
    title: '',
    description: '',
  });
  // PG-060: screen-reader announcement when enrichment auto-fills a field.
  const [enrichmentNotice, setEnrichmentNotice] = useState('');
  // PG-060: which enrichable fields currently hold an auto-filled value (vs a
  // hand-entered one). Lets a later email change refresh stale auto-fills while
  // never clobbering a value the user typed themselves.
  const [autoFilled, setAutoFilled] = useState<{ website: boolean; company: boolean }>({
    website: false,
    company: false,
  });

  const currentStepIndex = steps.findIndex((s) => s.id === currentStep);

  // Track if form has unsaved changes
  const isDirty = JSON.stringify(formData) !== JSON.stringify(initialFormData);

  // Register form as having unsaved changes
  useFormUnsavedChanges({
    formName: 'newLeadForm',
    isDirty,
  });

  // tRPC mutation for creating leads (IFC-004 integration).
  // Declared BEFORE the auth-gate early return below so this hook is called on
  // every render. Moving it after the `return` would make it a conditional hook
  // (Rules of Hooks violation) that throws "rendered more hooks than during the
  // previous render" on the loading -> authenticated transition.
  const createLead = api.lead.create.useMutation({
    onSuccess: () => {
      // Reset to the pristine form so the unsaved-changes registry is no longer
      // dirty before we navigate away (useFormUnsavedChanges registers from
      // isDirty and has no unmount cleanup — a stale 'newLeadForm' entry would
      // otherwise trigger a false unsaved-work warning after redirect).
      setFormData(initialFormData);

      // Show success toast
      setToast({
        open: true,
        variant: 'success',
        title: 'Success!',
        description: 'Lead created successfully. Redirecting...',
      });

      // Redirect to leads list after a short delay
      setTimeout(() => {
        router.push('/leads');
      }, 1500);
    },
    onError: (error) => {
      console.error('Failed to create lead:', error.message);

      // Show error toast
      setToast({
        open: true,
        variant: 'destructive',
        title: 'Failed to create lead',
        description: error.message,
      });
    },
  });

  // Auth gate — show skeleton while checking authentication or if not authenticated
  // useRequireAuth() handles the redirect to /login internally via useEffect,
  // but we must prevent the form from rendering during the redirect frame
  if (authLoading || !isAuthenticated) {
    return (
      <div className="flex flex-col gap-8 p-8">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[400px] w-full rounded-xl" />
      </div>
    );
  }

  // Update form field
  const updateField = (field: keyof LeadFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error when user types
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
    // A hand edit to an enrichable field makes it user-owned, so a later email
    // change must not overwrite it.
    if (field === 'website' || field === 'company') {
      setAutoFilled((prev) => ({ ...prev, [field]: false }));
    }
  };

  // PG-060: derive website/company from the email domain when the email field
  // loses focus. Fills a field the user left blank AND refreshes a field we
  // previously auto-filled (so changing the email domain replaces a now-stale
  // Acme website/company), but never overwrites a value the user typed by hand.
  const handleEmailBlur = () => {
    const enriched = enrichFromEmail(formData.email, {
      // Pass blank for auto-filled fields so the lib re-derives them; pass the
      // user's value for hand-entered fields so they are preserved.
      website: autoFilled.website ? '' : formData.website,
      company: autoFilled.company ? '' : formData.company,
    });

    const websiteFillable = !formData.website.trim() || autoFilled.website;
    const companyFillable = !formData.company.trim() || autoFilled.company;
    const nextWebsite = websiteFillable ? (enriched.website ?? '') : formData.website;
    const nextCompany = companyFillable ? (enriched.company ?? '') : formData.company;

    if (nextWebsite !== formData.website || nextCompany !== formData.company) {
      setFormData((prev) => ({ ...prev, website: nextWebsite, company: nextCompany }));
    }

    // Remember which fields now hold an auto-filled value (cleared if the new
    // email yields nothing for a field we'd been auto-filling).
    setAutoFilled({
      website: websiteFillable ? !!nextWebsite : autoFilled.website,
      company: companyFillable ? !!nextCompany : autoFilled.company,
    });

    const filledCompany = companyFillable && !!nextCompany;
    const filledWebsite = websiteFillable && !!nextWebsite;
    const parts = [filledCompany ? 'company' : null, filledWebsite ? 'website' : null].filter(
      Boolean
    );
    setEnrichmentNotice(
      parts.length ? `Auto-filled ${parts.join(' and ')} from the email domain.` : ''
    );
  };

  // Validate current step
  const validateStep = (): boolean => {
    const newErrors: Partial<Record<keyof LeadFormData, string>> = {};

    if (currentStep === 'basic') {
      if (!formData.firstName.trim()) newErrors.firstName = 'First name is required';
      if (!formData.lastName.trim()) newErrors.lastName = 'Last name is required';
      if (!formData.email.trim()) {
        newErrors.email = 'Email is required';
      } else if (!emailSchema.safeParse(formData.email).success) {
        // Use the shared/server email validator so the client accepts exactly
        // what the API does (multi-label domains: acme.co.uk, mail.acme.com).
        newErrors.email = 'Please enter a valid email address';
      }
      // Validate sourceOther when 'Other' is selected
      if (formData.source === 'other' && !formData.sourceOther.trim()) {
        newErrors.sourceOther = 'Please specify where the lead came from';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Navigate to next step
  const handleNextStep = () => {
    if (!validateStep()) return;

    const nextIndex = currentStepIndex + 1;
    if (nextIndex < steps.length) {
      setCurrentStep(steps[nextIndex].id);
      setEnrichmentNotice('');
    }
  };

  // Navigate to previous step
  const handlePrevStep = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(steps[prevIndex].id);
      setEnrichmentNotice('');
    }
  };

  // Handle form submission
  const handleSubmit = async () => {
    if (!validateStep()) return;

    setIsSubmitting(true);
    try {
      // Map form data to API schema (createLeadSchema from @intelliflow/validators)
      // Schema-supported fields: email, firstName, lastName, company, title, phone, source,
      //   location, website, avatarUrl, lastContactedAt, estimatedValue, tags.
      //
      // BANT fields NOT yet in schema (tracked for schema extension in IFC-004):
      //   budget, authority, need, timeline, companySize, industry, annualRevenue,
      //   qualificationNotes — these are collected in the form UI but not sent to the API.
      //   Schema extension task: add a `metadata` JSON column or dedicated BANT fields to Lead.

      // Helper to convert empty strings to undefined
      const toOptional = (value: string): string | undefined =>
        value.trim() ? value.trim() : undefined;

      // The qualification / company-detail + required "Other" source fields have
      // no first-class column yet (IFC-242 / IFC-004). They ride along on create
      // as `qualificationNote`, which the server persists atomically with the
      // lead (rolling the lead back if the note write fails) — so the user's
      // input is never silently dropped by a best-effort second write.
      const qualificationNote = buildQualificationNote(formData);

      const leadData = {
        email: formData.email.trim(),
        firstName: toOptional(formData.firstName),
        lastName: toOptional(formData.lastName),
        company: toOptional(formData.company),
        title: toOptional(formData.jobTitle),
        phone: toOptional(formData.phone),
        source: mapSourceToEnum(formData.source),
        // Lead 360 fields (schema-supported)
        website: toOptional(formData.website),
        // estimatedValue (the lead's deal value, in cents) is left unset: this form
        // has no deal-value input. The company revenue band, company size, industry
        // and BANT inputs are UI-only pending dedicated schema fields (see IFC-242).
        ...(qualificationNote ? { qualificationNote } : {}),
      };

      await createLead.mutateAsync(leadData);
      // Success handled by mutation onSuccess callback
    } catch (error) {
      // Error handled by mutation onError callback
      console.error('Mutation error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Map UI source values to the API enum. Returns undefined for a blank/unknown
  // selection so the create payload omits `source` and the server default
  // (WEBSITE — see createLeadSchema) applies, instead of mislabelling an
  // unspecified source as the explicit "Other" option.
  function mapSourceToEnum(
    source: string
  ): 'WEBSITE' | 'REFERRAL' | 'SOCIAL' | 'EMAIL' | 'COLD_CALL' | 'EVENT' | 'OTHER' | undefined {
    const sourceMap: Record<
      string,
      'WEBSITE' | 'REFERRAL' | 'SOCIAL' | 'EMAIL' | 'COLD_CALL' | 'EVENT' | 'OTHER'
    > = {
      website: 'WEBSITE',
      referral: 'REFERRAL',
      linkedin: 'SOCIAL',
      conference: 'EVENT',
      cold_outreach: 'COLD_CALL',
      other: 'OTHER',
    };
    return sourceMap[source];
  }

  // Cancel and go back
  const handleCancel = () => {
    router.push('/leads');
  };

  // Get step status for styling
  const getStepStatus = (step: Step): 'completed' | 'current' | 'upcoming' => {
    const stepIndex = steps.findIndex((s) => s.id === step.id);
    if (stepIndex < currentStepIndex) return 'completed';
    if (stepIndex === currentStepIndex) return 'current';
    return 'upcoming';
  };

  // Navigate to a specific step by clicking on it
  const handleStepClick = (step: Step) => {
    const targetIndex = steps.findIndex((s) => s.id === step.id);
    // Only allow navigating to completed steps or current step
    if (targetIndex <= currentStepIndex) {
      setCurrentStep(step.id);
      setEnrichmentNotice('');
    }
  };

  return (
    <ToastProvider>
      <div className="flex flex-col gap-8">
        {/* Breadcrumb */}
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

          {/* Page Title */}
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">
              Create New Lead
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-base">
              Capture information about a potential opportunity.
            </p>
          </div>

          {/* PG-060: a11y live region — announces enrichment auto-fills to AT. */}
          <output aria-live="polite" className="sr-only">
            {enrichmentNotice}
          </output>
        </div>

        {/* Form Card */}
        <Card className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          {/* Step Indicator */}
          <div className="px-8 pt-8 pb-6 border-b border-slate-200 dark:border-slate-700">
            <nav
              aria-label="Form steps"
              className="relative flex items-center justify-between w-full max-w-2xl mx-auto"
            >
              {/* Progress Line */}
              <div
                className="absolute left-0 top-5 w-full h-0.5 bg-slate-100 dark:bg-slate-700 -z-10"
                aria-hidden="true"
              />

              {steps.map((step) => {
                const status = getStepStatus(step);
                const isClickable = status === 'completed' || status === 'current';
                let stepCircleClass: string;
                if (status === 'current') {
                  stepCircleClass = 'bg-[#137fec] text-white';
                } else if (status === 'completed') {
                  stepCircleClass = 'bg-[#137fec] text-white hover:bg-[#0e6ac7]';
                } else {
                  stepCircleClass =
                    'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border-2 border-slate-200 dark:border-slate-700';
                }
                return (
                  <button
                    key={step.id}
                    type="button"
                    aria-current={status === 'current' ? 'step' : undefined}
                    aria-label={`Step ${step.number}: ${step.label}${STEP_STATUS_SUFFIX[status]}`}
                    onClick={() => handleStepClick(step)}
                    disabled={!isClickable}
                    className={`flex flex-col items-center gap-2 ${isClickable ? 'cursor-pointer' : 'cursor-not-allowed'}`}
                  >
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ring-4 ring-white dark:ring-slate-900 shadow-sm transition-all ${stepCircleClass}`}
                    >
                      {status === 'completed' ? (
                        <svg
                          className="w-5 h-5"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          aria-hidden="true"
                        >
                          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                        </svg>
                      ) : (
                        step.number
                      )}
                    </div>
                    <span
                      className={`text-sm font-medium ${(() => {
                        if (status === 'current') return 'font-bold text-slate-900 dark:text-white';
                        if (status === 'completed')
                          return 'font-bold text-slate-900 dark:text-white hover:text-[#137fec]';
                        return 'text-slate-500 dark:text-slate-400';
                      })()}`}
                    >
                      {step.label}
                    </span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Form Content */}
          <div className="p-8">
            <form
              onSubmit={(e) => {
                e.preventDefault();
              }}
              className="flex flex-col gap-8"
            >
              {/* Step 1: Basic Info */}
              {currentStep === 'basic' && (
                <div className="flex flex-col gap-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                      Lead Information
                    </h3>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      * Required fields
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* First Name */}
                    <div className="space-y-1.5">
                      <label
                        htmlFor="firstName"
                        className="block text-sm font-semibold text-slate-700 dark:text-slate-300"
                      >
                        First Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        id="firstName"
                        autoComplete="given-name"
                        value={formData.firstName}
                        onChange={(e) => updateField('firstName', e.target.value)}
                        aria-invalid={!!errors.firstName}
                        aria-describedby={errors.firstName ? 'firstName-error' : undefined}
                        placeholder="e.g. Sarah"
                        className={`w-full rounded-lg border bg-slate-50 dark:bg-slate-800/50 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-[#137fec]/20 focus:border-[#137fec] placeholder-slate-400 transition-shadow ${
                          errors.firstName
                            ? 'border-red-500'
                            : 'border-slate-200 dark:border-slate-700'
                        }`}
                      />
                      {errors.firstName && (
                        <p id="firstName-error" className="text-xs text-red-500">
                          {errors.firstName}
                        </p>
                      )}
                    </div>

                    {/* Last Name */}
                    <div className="space-y-1.5">
                      <label
                        htmlFor="lastName"
                        className="block text-sm font-semibold text-slate-700 dark:text-slate-300"
                      >
                        Last Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        id="lastName"
                        autoComplete="family-name"
                        value={formData.lastName}
                        onChange={(e) => updateField('lastName', e.target.value)}
                        aria-invalid={!!errors.lastName}
                        aria-describedby={errors.lastName ? 'lastName-error' : undefined}
                        placeholder="e.g. Connor"
                        className={`w-full rounded-lg border bg-slate-50 dark:bg-slate-800/50 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-[#137fec]/20 focus:border-[#137fec] placeholder-slate-400 transition-shadow ${
                          errors.lastName
                            ? 'border-red-500'
                            : 'border-slate-200 dark:border-slate-700'
                        }`}
                      />
                      {errors.lastName && (
                        <p id="lastName-error" className="text-xs text-red-500">
                          {errors.lastName}
                        </p>
                      )}
                    </div>

                    {/* Email */}
                    <div className="space-y-1.5">
                      <label
                        htmlFor="email"
                        className="block text-sm font-semibold text-slate-700 dark:text-slate-300"
                      >
                        Email Address <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                          <svg
                            className="w-5 h-5"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            aria-hidden="true"
                          >
                            <path d="M4 20q-.825 0-1.412-.587Q2 18.825 2 18V6q0-.825.588-1.412Q3.175 4 4 4h16q.825 0 1.413.588Q22 5.175 22 6v12q0 .825-.587 1.413Q20.825 20 20 20Zm8-7 8-5V6l-8 5-8-5v2Z" />
                          </svg>
                        </span>
                        <input
                          type="email"
                          id="email"
                          autoComplete="email"
                          value={formData.email}
                          onChange={(e) => updateField('email', e.target.value)}
                          onBlur={handleEmailBlur}
                          aria-invalid={!!errors.email}
                          aria-describedby={errors.email ? 'email-error' : undefined}
                          placeholder="sarah@example.com"
                          className={`w-full rounded-lg border bg-slate-50 dark:bg-slate-800/50 pl-10 pr-4 py-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-[#137fec]/20 focus:border-[#137fec] placeholder-slate-400 transition-shadow ${
                            errors.email
                              ? 'border-red-500'
                              : 'border-slate-200 dark:border-slate-700'
                          }`}
                        />
                      </div>
                      {errors.email && (
                        <p id="email-error" className="text-xs text-red-500">
                          {errors.email}
                        </p>
                      )}
                    </div>

                    {/* Phone */}
                    <div className="space-y-1.5">
                      <label
                        htmlFor="phone"
                        className="block text-sm font-semibold text-slate-700 dark:text-slate-300"
                      >
                        Phone Number
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                          <svg
                            className="w-5 h-5"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            aria-hidden="true"
                          >
                            <path d="M19.95 21q-3.125 0-6.175-1.362-3.05-1.363-5.55-3.863-2.5-2.5-3.862-5.55Q3 7.175 3 4.05q0-.45.3-.75t.75-.3H8.1q.35 0 .625.238.275.237.325.562l.65 3.5q.05.4-.025.675-.075.275-.275.475L6.65 11.2q.7 1.3 1.65 2.475.95 1.175 2.1 2.175l2.65-2.65q.225-.225.525-.325.3-.1.625-.025l3.3.7q.35.1.563.363.212.262.212.587v4.05q0 .45-.3.75t-.75.3Z" />
                          </svg>
                        </span>
                        <input
                          type="tel"
                          id="phone"
                          autoComplete="tel"
                          value={formData.phone}
                          onChange={(e) => updateField('phone', e.target.value)}
                          placeholder="+1 (555) 000-0000"
                          className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 pl-10 pr-4 py-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-[#137fec]/20 focus:border-[#137fec] placeholder-slate-400 transition-shadow"
                        />
                      </div>
                    </div>

                    {/* Job Title */}
                    <div className="space-y-1.5">
                      <label
                        htmlFor="jobTitle"
                        className="block text-sm font-semibold text-slate-700 dark:text-slate-300"
                      >
                        Job Title
                      </label>
                      <input
                        type="text"
                        id="jobTitle"
                        autoComplete="organization-title"
                        value={formData.jobTitle}
                        onChange={(e) => updateField('jobTitle', e.target.value)}
                        placeholder="e.g. VP of Marketing"
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-[#137fec]/20 focus:border-[#137fec] placeholder-slate-400 transition-shadow"
                      />
                    </div>

                    {/* Lead Source */}
                    <div className="space-y-1.5">
                      <label
                        htmlFor="source"
                        className="block text-sm font-semibold text-slate-700 dark:text-slate-300"
                      >
                        Lead Source
                      </label>
                      <div className="relative">
                        <select
                          id="source"
                          value={formData.source}
                          onChange={(e) => {
                            updateField('source', e.target.value);
                            // Clear sourceOther when switching away from 'other'
                            if (e.target.value !== 'other') {
                              updateField('sourceOther', '');
                            }
                          }}
                          className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-[#137fec]/20 focus:border-[#137fec] appearance-none cursor-pointer transition-shadow"
                        >
                          {sourceOptions.map((option) => (
                            <option
                              key={option.value}
                              value={option.value}
                              disabled={option.value === ''}
                            >
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                          <svg
                            className="w-5 h-5"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            aria-hidden="true"
                          >
                            <path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
                          </svg>
                        </span>
                      </div>
                    </div>

                    {/* Other Source Specification - shown when 'Other' is selected */}
                    {formData.source === 'other' && (
                      <div className="space-y-1.5 md:col-span-2">
                        <label
                          htmlFor="sourceOther"
                          className="block text-sm font-semibold text-slate-700 dark:text-slate-300"
                        >
                          Please specify where the lead came from{' '}
                          <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          id="sourceOther"
                          value={formData.sourceOther}
                          onChange={(e) => updateField('sourceOther', e.target.value)}
                          aria-invalid={!!errors.sourceOther}
                          aria-describedby={errors.sourceOther ? 'sourceOther-error' : undefined}
                          placeholder="e.g. Industry newsletter, Partner referral, Podcast ad..."
                          className={`w-full rounded-lg border bg-slate-50 dark:bg-slate-800/50 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-[#137fec]/20 focus:border-[#137fec] placeholder-slate-400 transition-shadow ${
                            errors.sourceOther
                              ? 'border-red-500'
                              : 'border-slate-200 dark:border-slate-700'
                          }`}
                        />
                        {errors.sourceOther && (
                          <p id="sourceOther-error" className="text-xs text-red-500">
                            {errors.sourceOther}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Step 2: Company Details */}
              {currentStep === 'company' && (
                <div className="flex flex-col gap-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                      Company Information
                    </h3>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Optional fields
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Company Name */}
                    <div className="space-y-1.5">
                      <label
                        htmlFor="company"
                        className="block text-sm font-semibold text-slate-700 dark:text-slate-300"
                      >
                        Company Name
                      </label>
                      <input
                        type="text"
                        id="company"
                        autoComplete="organization"
                        value={formData.company}
                        onChange={(e) => updateField('company', e.target.value)}
                        placeholder="e.g. Acme Corporation"
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-[#137fec]/20 focus:border-[#137fec] placeholder-slate-400 transition-shadow"
                      />
                    </div>

                    {/* Website */}
                    <div className="space-y-1.5">
                      <label
                        htmlFor="website"
                        className="block text-sm font-semibold text-slate-700 dark:text-slate-300"
                      >
                        Website
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                          <svg
                            className="w-5 h-5"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            aria-hidden="true"
                          >
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
                          </svg>
                        </span>
                        <input
                          type="url"
                          id="website"
                          autoComplete="url"
                          value={formData.website}
                          onChange={(e) => updateField('website', e.target.value)}
                          placeholder="https://www.example.com"
                          className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 pl-10 pr-4 py-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-[#137fec]/20 focus:border-[#137fec] placeholder-slate-400 transition-shadow"
                        />
                      </div>
                    </div>

                    {/* Industry */}
                    <div className="space-y-1.5">
                      <label
                        htmlFor="industry"
                        className="block text-sm font-semibold text-slate-700 dark:text-slate-300"
                      >
                        Industry
                      </label>
                      <div className="relative">
                        <select
                          id="industry"
                          value={formData.industry}
                          onChange={(e) => updateField('industry', e.target.value)}
                          className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-[#137fec]/20 focus:border-[#137fec] appearance-none cursor-pointer transition-shadow"
                        >
                          {industryOptions.map((option) => (
                            <option
                              key={option.value}
                              value={option.value}
                              disabled={option.value === ''}
                            >
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                          <svg
                            className="w-5 h-5"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            aria-hidden="true"
                          >
                            <path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
                          </svg>
                        </span>
                      </div>
                    </div>

                    {/* Company Size */}
                    <div className="space-y-1.5">
                      <label
                        htmlFor="companySize"
                        className="block text-sm font-semibold text-slate-700 dark:text-slate-300"
                      >
                        Company Size
                      </label>
                      <div className="relative">
                        <select
                          id="companySize"
                          value={formData.companySize}
                          onChange={(e) => updateField('companySize', e.target.value)}
                          className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-[#137fec]/20 focus:border-[#137fec] appearance-none cursor-pointer transition-shadow"
                        >
                          {companySizeOptions.map((option) => (
                            <option
                              key={option.value}
                              value={option.value}
                              disabled={option.value === ''}
                            >
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                          <svg
                            className="w-5 h-5"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            aria-hidden="true"
                          >
                            <path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
                          </svg>
                        </span>
                      </div>
                    </div>

                    {/* Annual Revenue */}
                    <div className="space-y-1.5 md:col-span-2">
                      <label
                        htmlFor="annualRevenue"
                        className="block text-sm font-semibold text-slate-700 dark:text-slate-300"
                      >
                        Annual Revenue
                      </label>
                      <div className="relative">
                        <select
                          id="annualRevenue"
                          value={formData.annualRevenue}
                          onChange={(e) => updateField('annualRevenue', e.target.value)}
                          className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-[#137fec]/20 focus:border-[#137fec] appearance-none cursor-pointer transition-shadow"
                        >
                          {revenueOptions.map((option) => (
                            <option
                              key={option.value}
                              value={option.value}
                              disabled={option.value === ''}
                            >
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                          <svg
                            className="w-5 h-5"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            aria-hidden="true"
                          >
                            <path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
                          </svg>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3: Qualification */}
              {currentStep === 'qualification' && (
                <div className="flex flex-col gap-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                      Qualification (BANT)
                    </h3>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Optional - can be updated later
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Budget */}
                    <div className="space-y-1.5">
                      <label
                        htmlFor="budget"
                        className="block text-sm font-semibold text-slate-700 dark:text-slate-300"
                      >
                        Budget
                      </label>
                      <input
                        type="text"
                        id="budget"
                        value={formData.budget}
                        onChange={(e) => updateField('budget', e.target.value)}
                        placeholder="e.g. $50,000 - $100,000"
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-[#137fec]/20 focus:border-[#137fec] placeholder-slate-400 transition-shadow"
                      />
                    </div>

                    {/* Authority */}
                    <div className="space-y-1.5">
                      <label
                        htmlFor="authority"
                        className="block text-sm font-semibold text-slate-700 dark:text-slate-300"
                      >
                        Authority
                      </label>
                      <input
                        type="text"
                        id="authority"
                        value={formData.authority}
                        onChange={(e) => updateField('authority', e.target.value)}
                        placeholder="e.g. Decision maker, Influencer"
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-[#137fec]/20 focus:border-[#137fec] placeholder-slate-400 transition-shadow"
                      />
                    </div>

                    {/* Need */}
                    <div className="space-y-1.5">
                      <label
                        htmlFor="need"
                        className="block text-sm font-semibold text-slate-700 dark:text-slate-300"
                      >
                        Need
                      </label>
                      <input
                        type="text"
                        id="need"
                        value={formData.need}
                        onChange={(e) => updateField('need', e.target.value)}
                        placeholder="e.g. CRM solution, Sales automation"
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-[#137fec]/20 focus:border-[#137fec] placeholder-slate-400 transition-shadow"
                      />
                    </div>

                    {/* Timeline */}
                    <div className="space-y-1.5">
                      <label
                        htmlFor="timeline"
                        className="block text-sm font-semibold text-slate-700 dark:text-slate-300"
                      >
                        Timeline
                      </label>
                      <div className="relative">
                        <select
                          id="timeline"
                          value={formData.timeline}
                          onChange={(e) => updateField('timeline', e.target.value)}
                          className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-[#137fec]/20 focus:border-[#137fec] appearance-none cursor-pointer transition-shadow"
                        >
                          {timelineOptions.map((option) => (
                            <option
                              key={option.value}
                              value={option.value}
                              disabled={option.value === ''}
                            >
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                          <svg
                            className="w-5 h-5"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            aria-hidden="true"
                          >
                            <path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
                          </svg>
                        </span>
                      </div>
                    </div>

                    {/* Qualification Notes */}
                    <div className="space-y-1.5 md:col-span-2">
                      <label
                        htmlFor="qualificationNotes"
                        className="block text-sm font-semibold text-slate-700 dark:text-slate-300"
                      >
                        Qualification Notes
                      </label>
                      <textarea
                        id="qualificationNotes"
                        value={formData.qualificationNotes}
                        onChange={(e) => updateField('qualificationNotes', e.target.value)}
                        placeholder="Add any additional notes about lead qualification..."
                        rows={4}
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-[#137fec]/20 focus:border-[#137fec] placeholder-slate-400 transition-shadow resize-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-6 border-t border-slate-200 dark:border-slate-700 mt-2">
                <button
                  type="button"
                  onClick={currentStepIndex === 0 ? handleCancel : handlePrevStep}
                  className="px-5 py-2.5 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  {currentStepIndex === 0 ? 'Cancel' : 'Previous'}
                </button>

                {currentStepIndex < steps.length - 1 ? (
                  <button
                    type="button"
                    onClick={handleNextStep}
                    className="flex items-center gap-2 bg-[#137fec] hover:bg-[#0e6ac7] text-white font-bold py-2.5 px-6 rounded-lg shadow-sm shadow-[#137fec]/30 transition-all active:scale-95"
                  >
                    <span>Next Step</span>
                    <svg
                      className="w-[18px] h-[18px]"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8-8-8z" />
                    </svg>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className="flex items-center gap-2 bg-[#137fec] hover:bg-[#0e6ac7] text-white font-bold py-2.5 px-6 rounded-lg shadow-sm shadow-[#137fec]/30 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? (
                      <>
                        <svg
                          className="animate-spin h-4 w-4"
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                            fill="none"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          />
                        </svg>
                        <span>Creating...</span>
                      </>
                    ) : (
                      <>
                        <span>Create Lead</span>
                        <svg
                          className="w-[18px] h-[18px]"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          aria-hidden="true"
                        >
                          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                        </svg>
                      </>
                    )}
                  </button>
                )}
              </div>
            </form>
          </div>
        </Card>

        {/* Pro Tip */}
        <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800/30">
          <svg
            className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
          </svg>
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

      {/* Toast Notifications */}
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
