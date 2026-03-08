'use client';

import React, { useState, useRef, useCallback, useMemo } from 'react';
import { Card } from '@intelliflow/ui';

// ─── Types ──────────────────────────────────────────────────────────────────────

type ContactStatus = 'ACTIVE' | 'INACTIVE' | 'PROSPECT' | 'CUSTOMER' | 'FORMER_CUSTOMER';

export interface ContactFormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  streetAddress: string;
  city: string;
  zipCode: string;
  company: string;
  jobTitle: string;
  department: string;
  linkedIn: string;
  contactType: string;
  status: ContactStatus;
  tags: string;
  notes: string;
}

export interface ContactFormProps {
  mode: 'create' | 'edit';
  contact?: Partial<ContactFormData>;
  onSubmit: (data: ContactFormData) => Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
  onDirtyChange?: (isDirty: boolean) => void;
}

// ─── Constants ──────────────────────────────────────────────────────────────────

type StepId = 'personal' | 'company' | 'additional';

interface Step {
  id: StepId;
  number: number;
  label: string;
}

const steps: Step[] = [
  { id: 'personal', number: 1, label: 'Personal Details' },
  { id: 'company', number: 2, label: 'Company & Role' },
  { id: 'additional', number: 3, label: 'Additional Info' },
];

const statusOptions: { value: ContactStatus; label: string; description: string }[] = [
  { value: 'ACTIVE', label: 'Active', description: 'Currently engaged contact' },
  { value: 'INACTIVE', label: 'Inactive', description: 'Temporarily not engaged' },
  { value: 'PROSPECT', label: 'Prospect', description: 'Potential customer' },
  { value: 'CUSTOMER', label: 'Customer', description: 'Current customer' },
  { value: 'FORMER_CUSTOMER', label: 'Former Customer', description: 'No longer a customer' },
];

const departmentOptions = [
  { value: '', label: 'Select a department...' },
  { value: 'executive', label: 'Executive / C-Suite' },
  { value: 'sales', label: 'Sales' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'engineering', label: 'Engineering' },
  { value: 'product', label: 'Product' },
  { value: 'operations', label: 'Operations' },
  { value: 'finance', label: 'Finance' },
  { value: 'hr', label: 'Human Resources' },
  { value: 'other', label: 'Other' },
];

const initialFormData: ContactFormData = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  streetAddress: '',
  city: '',
  zipCode: '',
  company: '',
  jobTitle: '',
  department: '',
  linkedIn: '',
  contactType: '',
  status: 'ACTIVE',
  tags: '',
  notes: '',
};

// ─── Component ──────────────────────────────────────────────────────────────────

export function ContactForm({
  mode,
  contact,
  onSubmit,
  onCancel,
  isSubmitting = false,
  onDirtyChange,
}: Readonly<ContactFormProps>) {
  const [currentStep, setCurrentStep] = useState<StepId>('personal');
  const initialData = useMemo(() => ({ ...initialFormData, ...contact }), []);
  const [formData, setFormData] = useState<ContactFormData>(initialData);
  const [errors, setErrors] = useState<Partial<Record<keyof ContactFormData, string>>>({});
  const errorSummaryRef = useRef<HTMLDivElement>(null);

  // Report dirty state to parent
  const initialSnapshot = useMemo(() => JSON.stringify(initialData), [initialData]);
  React.useEffect(() => {
    onDirtyChange?.(JSON.stringify(formData) !== initialSnapshot);
  }, [formData, initialSnapshot, onDirtyChange]);

  const currentStepIndex = steps.indexOf((s) => s.id === currentStep);

  const updateField = useCallback((field: keyof ContactFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  }, []);

  const validateStep = useCallback((): boolean => {
    const newErrors: Partial<Record<keyof ContactFormData, string>> = {};

    if (currentStep === 'personal') {
      if (!formData.firstName.trim()) newErrors.firstName = 'First name is required';
      if (!formData.lastName.trim()) newErrors.lastName = 'Last name is required';
      if (!formData.email.trim()) {
        newErrors.email = 'Email is required';
      } else if (!/^[^\s@]+@[^\s@.]+\.[^\s@.]+$/.test(formData.email)) {
        newErrors.email = 'Please enter a valid email address';
      }
      if (formData.phone && !/^\+?[\d\s()-]+$/.test(formData.phone)) {
        newErrors.phone = 'Please enter a valid phone number';
      }
    }

    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) {
      // Focus on error summary for screen readers
      setTimeout(() => errorSummaryRef.current?.focus(), 0);
      return false;
    }
    return true;
  }, [currentStep, formData]);

  const handleNextStep = useCallback(() => {
    if (!validateStep()) return;
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < steps.length) {
      setCurrentStep(steps[nextIndex].id);
    }
  }, [validateStep, currentStepIndex]);

  const handlePrevStep = useCallback(() => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(steps[prevIndex].id);
    }
  }, [currentStepIndex]);

  const handleStepClick = useCallback(
    (step: Step) => {
      const targetIndex = steps.indexOf((s) => s.id === step.id);
      if (targetIndex <= currentStepIndex) {
        setCurrentStep(step.id);
      }
    },
    [currentStepIndex]
  );

  const handleSubmit = useCallback(async () => {
    if (!validateStep()) return;
    await onSubmit(formData);
  }, [validateStep, formData, onSubmit]);

  const getStepStatus = (step: Readonly<Step>): 'completed' | 'current' | 'upcoming' => {
    const idx = steps.indexOf((s) => s.id === step.id);
    if (idx < currentStepIndex) return 'completed';
    if (idx === currentStepIndex) return 'current';
    return 'upcoming';
  };

  const hasErrors = Object.keys(errors).length > 0;
  const submitButtonIdleLabel = mode === 'create' ? 'Create Contact' : 'Save Changes';
  const submitButtonSubmittingLabel = mode === 'create' ? 'Creating...' : 'Saving...';
  const submitButtonLabel = isSubmitting ? submitButtonSubmittingLabel : submitButtonIdleLabel;

  return (
    <Card className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
      {/* Step Indicator */}
      <nav
        aria-label="Form progress"
        className="px-8 pt-8 pb-6 border-b border-slate-200 dark:border-slate-700"
      >
        <div
          role="progressbar" // NOSONAR typescript:S6819 — step indicator with child step elements; <progress> cannot contain child nodes
          aria-valuenow={currentStepIndex + 1}
          aria-valuemin={1}
          aria-valuemax={steps.length}
          aria-label={`Step ${currentStepIndex + 1} of ${steps.length}`}
          className="relative flex items-center justify-between w-full max-w-2xl mx-auto"
        >
          <div
            className="absolute left-0 top-5 w-full h-0.5 bg-slate-100 dark:bg-slate-700 -z-10"
            aria-hidden="true"
          />
          {steps.map((step) => {
            const status = getStepStatus(step);
            const isClickable = status === 'completed' || status === 'current';
            const completedOrDefaultCircleClass = status === 'completed'
              ? 'bg-primary text-white hover:bg-blue-600'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-400 border-2 border-slate-200 dark:border-slate-700';
            const stepCircleClass = status === 'current'
              ? 'bg-primary text-white'
              : completedOrDefaultCircleClass;
            return (
              <button
                key={step.id}
                type="button"
                onClick={() => handleStepClick(step)}
                disabled={!isClickable}
                aria-current={status === 'current' ? 'step' : undefined}
                className={`flex flex-col items-center gap-2 ${isClickable ? 'cursor-pointer' : 'cursor-not-allowed'}`}
              >
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ring-4 ring-white dark:ring-slate-900 shadow-sm transition-all ${stepCircleClass}`}
                >
                  {status === 'completed' ? (
                    <span className="material-symbols-outlined text-lg" aria-hidden="true">
                      check
                    </span>
                  ) : (
                    step.number
                  )}
                </div>
                <span
                  className={`text-sm font-medium ${status === 'upcoming' ? 'text-slate-500 dark:text-slate-400' : 'font-bold text-slate-900 dark:text-white'}`}
                >
                  {step.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Form Content */}
      <div className="p-8">
        <form onSubmit={(e) => e.preventDefault()} className="flex flex-col gap-8">
          {/* Error Summary */}
          {hasErrors && (
            <div
              ref={errorSummaryRef}
              tabIndex={-1}
              role="alert"
              className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg"
            >
              <p className="text-sm font-semibold text-red-800 dark:text-red-300">
                Please fix the following errors:
              </p>
              <ul className="mt-2 list-disc list-inside text-sm text-red-700 dark:text-red-400">
                {Object.entries(errors).map(
                  ([field, message]) => message && <li key={field}>{message}</li>
                )}
              </ul>
            </div>
          )}

          {/* Step 1: Personal Details */}
          {currentStep === 'personal' && (
            <div className="flex flex-col gap-6">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Contact Information
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField label="First Name" id="firstName" required error={errors.firstName}>
                  <input
                    type="text"
                    id="firstName"
                    value={formData.firstName}
                    onChange={(e) => updateField('firstName', e.target.value)}
                    placeholder="e.g. Sarah"
                    aria-required="true"
                    aria-invalid={!!errors.firstName}
                    aria-describedby={errors.firstName ? 'firstName-error' : undefined}
                    className={fieldClassName(errors.firstName)}
                  />
                </FormField>
                <FormField label="Last Name" id="lastName" required error={errors.lastName}>
                  <input
                    type="text"
                    id="lastName"
                    value={formData.lastName}
                    onChange={(e) => updateField('lastName', e.target.value)}
                    placeholder="e.g. Connor"
                    aria-required="true"
                    aria-invalid={!!errors.lastName}
                    aria-describedby={errors.lastName ? 'lastName-error' : undefined}
                    className={fieldClassName(errors.lastName)}
                  />
                </FormField>
                <FormField label="Email Address" id="email" required error={errors.email}>
                  <input
                    type="email"
                    id="email"
                    value={formData.email}
                    onChange={(e) => updateField('email', e.target.value)}
                    placeholder="sarah@example.com"
                    aria-required="true"
                    aria-invalid={!!errors.email}
                    aria-describedby={errors.email ? 'email-error' : undefined}
                    className={fieldClassName(errors.email)}
                  />
                </FormField>
                <FormField label="Phone Number" id="phone" error={errors.phone}>
                  <input
                    type="tel"
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => updateField('phone', e.target.value)}
                    placeholder="+1 (555) 000-0000"
                    aria-invalid={!!errors.phone}
                    aria-describedby={errors.phone ? 'phone-error' : undefined}
                    className={fieldClassName(errors.phone)}
                  />
                </FormField>
              </div>
            </div>
          )}

          {/* Step 2: Company & Role */}
          {currentStep === 'company' && (
            <div className="flex flex-col gap-6">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Company & Role</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField label="Company Name" id="company">
                  <input
                    type="text"
                    id="company"
                    value={formData.company}
                    onChange={(e) => updateField('company', e.target.value)}
                    placeholder="e.g. Acme Corporation"
                    className={fieldClassName()}
                  />
                </FormField>
                <FormField label="Job Title" id="jobTitle">
                  <input
                    type="text"
                    id="jobTitle"
                    value={formData.jobTitle}
                    onChange={(e) => updateField('jobTitle', e.target.value)}
                    placeholder="e.g. VP of Marketing"
                    className={fieldClassName()}
                  />
                </FormField>
                <FormField label="Department" id="department">
                  <select
                    id="department"
                    value={formData.department}
                    onChange={(e) => updateField('department', e.target.value)}
                    className={fieldClassName()}
                  >
                    {departmentOptions.map((o) => (
                      <option key={o.value} value={o.value} disabled={o.value === ''}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField label="LinkedIn Profile" id="linkedIn">
                  <input
                    type="url"
                    id="linkedIn"
                    value={formData.linkedIn}
                    onChange={(e) => updateField('linkedIn', e.target.value)}
                    placeholder="https://linkedin.com/in/username"
                    className={fieldClassName()}
                  />
                </FormField>
              </div>
            </div>
          )}

          {/* Step 3: Additional Info */}
          {currentStep === 'additional' && (
            <div className="flex flex-col gap-6">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Additional Information
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <fieldset>
                  <legend className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                    Status
                  </legend>
                  <div role="radiogroup" aria-label="Contact status" className="space-y-2">
                    {statusOptions.map((opt) => (
                      // eslint-disable-next-line jsx-a11y/label-has-associated-control -- label wraps radio input
                      <label
                        key={opt.value}
                        className="flex items-start gap-3 p-2 rounded hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        <input
                          type="radio"
                          name="status"
                          value={opt.value}
                          checked={formData.status === opt.value}
                          aria-checked={formData.status === opt.value}
                          onChange={() => updateField('status', opt.value)}
                          className="mt-1 text-primary focus:ring-primary"
                        />
                        <div>
                          <span className="text-sm font-medium text-slate-900 dark:text-white">
                            {opt.label}
                          </span>
                          <p className="text-xs text-slate-500">{opt.description}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="space-y-6">
                  <FormField label="Tags" id="tags">
                    <input
                      type="text"
                      id="tags"
                      value={formData.tags}
                      onChange={(e) => updateField('tags', e.target.value)}
                      placeholder="e.g. VIP, Decision Maker"
                      className={fieldClassName()}
                    />
                  </FormField>
                  <FormField label="Notes" id="notes">
                    <textarea
                      id="notes"
                      value={formData.notes}
                      onChange={(e) => updateField('notes', e.target.value)}
                      placeholder="Add any notes..."
                      rows={4}
                      className={fieldClassName() + ' resize-none'}
                    />
                  </FormField>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-6 border-t border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={currentStepIndex === 0 ? onCancel : handlePrevStep}
              className="px-5 py-2.5 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {currentStepIndex === 0 ? 'Cancel' : 'Previous'}
            </button>

            {currentStepIndex < steps.length - 1 ? (
              <button
                type="button"
                onClick={handleNextStep}
                className="flex items-center gap-2 bg-primary hover:bg-blue-600 text-white font-bold py-2.5 px-6 rounded-lg transition-all"
              >
                Next Step
                {' '}<span className="material-symbols-outlined text-lg" aria-hidden="true">
                  arrow_forward
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting}
                aria-busy={isSubmitting}
                className="flex items-center gap-2 bg-primary hover:bg-blue-600 text-white font-bold py-2.5 px-6 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitButtonLabel}
                {!isSubmitting && (
                  <span className="material-symbols-outlined text-lg" aria-hidden="true">
                    check
                  </span>
                )}
              </button>
            )}
          </div>
        </form>
      </div>
    </Card>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────────

function FormField({
  label,
  id,
  required,
  error,
  children,
}: Readonly<{
  label: string;
  id: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}>) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="block text-sm font-semibold text-slate-700 dark:text-slate-300"
      >
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}

function fieldClassName(error?: string) {
  return `w-full rounded-lg border bg-slate-50 dark:bg-slate-800/50 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-primary/20 focus:border-primary placeholder-slate-400 transition-shadow ${
    error ? 'border-red-500' : 'border-slate-200 dark:border-slate-700'
  }`;
}
