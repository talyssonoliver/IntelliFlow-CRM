'use client';

/**
 * Shared lead form body (IFC-230). Used by the create wizard (NewLeadForm) and
 * the edit wrapper (LeadEditor). Stateless — all state lives in the parent shell.
 */

import React from 'react';
import { Card } from '@intelliflow/ui';
import {
  sourceOptions,
  industryOptions,
  companySizeOptions,
  revenueOptions,
  timelineOptions,
  type SelectOption,
} from '@/lib/leads/lead-form-utils';
import { emailSchema, updateLeadSchema } from '@intelliflow/validators';

export interface LeadFormValues {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  title: string;
  source: string;
  sourceOther: string;
  company: string;
  website: string;
  industry: string;
  companySize: string;
  annualRevenue: string;
  location: string;
  estimatedValue: string;
  tags: string;
  status: string;
  qualificationNotes: string;
  budget: string;
  authority: string;
  need: string;
  timeline: string;
}

/** Empty form state — used by NewLeadForm (INIT) and LeadEditor (EMPTY). */
export const EMPTY_FORM_VALUES: LeadFormValues = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  title: '',
  source: '',
  sourceOther: '',
  company: '',
  website: '',
  industry: '',
  companySize: '',
  annualRevenue: '',
  location: '',
  estimatedValue: '',
  tags: '',
  status: '',
  qualificationNotes: '',
  budget: '',
  authority: '',
  need: '',
  timeline: '',
};

export interface LeadFormProps {
  mode: 'create' | 'edit';
  values: LeadFormValues;
  errors: Partial<Record<keyof LeadFormValues, string>>;
  onChange: (field: keyof LeadFormValues, value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  isSubmitting: boolean;
  onCancel: () => void;
  visibleSections?: Array<'basic' | 'company' | 'qualification'>;
  onEmailBlur?: () => void;
  enrichmentNotice?: string;
  readOnlyInfo?: { email: string; status: string; source: string };
  disabled?: boolean;
  /** Pass false when the parent shell owns action buttons (e.g. wizard). */
  showActions?: boolean;
}

function validateCreateBasic(
  values: LeadFormValues,
  errs: Partial<Record<keyof LeadFormValues, string>>
): void {
  if (!values.firstName.trim()) errs.firstName = 'First name is required';
  if (!values.lastName.trim()) errs.lastName = 'Last name is required';
  if (!values.email.trim()) errs.email = 'Email is required';
  else if (!emailSchema.safeParse(values.email).success)
    errs.email = 'Please enter a valid email address';
  if (values.source === 'other' && !values.sourceOther.trim())
    errs.sourceOther = 'Please specify where the lead came from';
}

export function validateLeadFormValues(
  values: LeadFormValues,
  mode: 'create' | 'edit',
  sections?: Array<'basic' | 'company' | 'qualification'>
): Partial<Record<keyof LeadFormValues, string>> {
  const errs: Partial<Record<keyof LeadFormValues, string>> = {};
  if (mode === 'create') {
    if (!sections || sections.includes('basic')) validateCreateBasic(values, errs);
    return errs;
  }
  // estimatedValue (dollar string) and tags (comma string) are DISPLAY strings that the
  // change-tracker transforms to the schema's number/array on submit (with its own guards),
  // so they must not be validated here as raw strings — that produced spurious
  // estimatedValue/tags errors for any populated lead. Validate only the string-typed fields.
  const SKIP_DISPLAY_FIELDS = new Set(['estimatedValue', 'tags']);
  const nonBlank: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values))
    if (typeof v === 'string' && v.trim() !== '' && !SKIP_DISPLAY_FIELDS.has(k)) nonBlank[k] = v;
  const parsed = updateLeadSchema.omit({ id: true }).partial().safeParse(nonBlank);
  if (!parsed.success) {
    const fe = parsed.error.flatten().fieldErrors as Record<string, string[] | undefined>;
    for (const key of Object.keys(fe) as Array<keyof LeadFormValues>) {
      const msg = fe[key]?.[0];
      if (msg) errs[key] = msg;
    }
  }
  return errs;
}

const INPUT_CLASS =
  'w-full rounded-lg border bg-slate-50 dark:bg-slate-800/50 px-4 py-2.5 text-sm ' +
  'text-slate-900 dark:text-white focus:ring-2 focus:ring-[#137fec]/20 focus:border-[#137fec] ' +
  'placeholder-slate-400 transition-shadow';
const LABEL_CLASS = 'block text-sm font-semibold text-slate-700 dark:text-slate-300';
const BORDER_DEFAULT = 'border-slate-200 dark:border-slate-700';
const SYMBOL_CLASS = 'material-symbols-outlined !text-[18px]';
const ICON_LEFT_CLASS = `${SYMBOL_CLASS} absolute left-3 top-1/2 -translate-y-1/2 text-slate-400`;
const CHEVRON_CLASS = `${SYMBOL_CLASS} absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none`;

type FieldErrors = Partial<Record<keyof LeadFormValues, string>>;
type OnChangeHandler = (field: keyof LeadFormValues, value: string) => void;

function ariaProps(field: keyof LeadFormValues, errors: FieldErrors) {
  return errors[field]
    ? { 'aria-invalid': true as const, 'aria-describedby': `${field}-error` }
    : {};
}

function FieldError({ field, errors }: { field: keyof LeadFormValues; errors: FieldErrors }) {
  return errors[field] ? (
    <p id={`${field}-error`} role="alert" className="text-xs text-red-500 mt-1">
      {errors[field]}
    </p>
  ) : null;
}

interface TextFieldConfig {
  id: keyof LeadFormValues;
  label: string;
  required?: boolean;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
  colSpan?: boolean;
  icon?: string;
  hint?: string;
  onBlur?: () => void;
}

interface SelectFieldConfig {
  id: keyof LeadFormValues;
  label: string;
  options: SelectOption[];
  colSpan?: boolean;
  onChangeSide?: (value: string) => void;
}

type TextFieldProps = TextFieldConfig & {
  values: LeadFormValues;
  errors: FieldErrors;
  onChange: OnChangeHandler;
};

type SelectFieldProps = SelectFieldConfig & {
  values: LeadFormValues;
  onChange: OnChangeHandler;
};

function TextField({
  id,
  label,
  required,
  type,
  autoComplete,
  placeholder,
  colSpan,
  icon,
  hint,
  onBlur,
  values,
  errors,
  onChange,
}: Readonly<TextFieldProps>) {
  const borderClass = errors[id] ? 'border-red-500' : BORDER_DEFAULT;
  return (
    <div className={`space-y-1.5${colSpan ? ' md:col-span-2' : ''}`}>
      <label htmlFor={id} className={LABEL_CLASS}>
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      <div className={icon ? 'relative' : undefined}>
        {icon && (
          <span aria-hidden="true" className={ICON_LEFT_CLASS}>
            {icon}
          </span>
        )}
        <input
          type={type ?? 'text'}
          id={id}
          autoComplete={autoComplete}
          value={values[id]}
          onChange={(e) => onChange(id, e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
          className={`${INPUT_CLASS} ${borderClass}${icon ? ' pl-10' : ''}`}
          {...ariaProps(id, errors)}
        />
      </div>
      <FieldError field={id} errors={errors} />
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

function SelectField({
  id,
  label,
  options,
  colSpan,
  onChangeSide,
  values,
  onChange,
}: Readonly<SelectFieldProps>) {
  return (
    <div className={`space-y-1.5${colSpan ? ' md:col-span-2' : ''}`}>
      <label htmlFor={id} className={LABEL_CLASS}>
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          value={values[id]}
          onChange={(e) => {
            onChange(id, e.target.value);
            onChangeSide?.(e.target.value);
          }}
          className={`${INPUT_CLASS} ${BORDER_DEFAULT} appearance-none cursor-pointer`}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.value === ''}>
              {o.label}
            </option>
          ))}
        </select>
        <span aria-hidden="true" className={CHEVRON_CLASS}>
          expand_more
        </span>
      </div>
    </div>
  );
}

const BASIC_FIELDS: TextFieldConfig[] = [
  { id: 'firstName', label: 'First Name', autoComplete: 'given-name', placeholder: 'e.g. Sarah' },
  {
    id: 'lastName',
    label: 'Last Name',
    autoComplete: 'family-name',
    placeholder: 'e.g. Connor',
  },
  {
    id: 'phone',
    label: 'Phone',
    type: 'tel',
    autoComplete: 'tel',
    placeholder: '+1 (555) 000-0000',
    icon: 'phone',
  },
  {
    id: 'title',
    label: 'Job Title',
    autoComplete: 'organization-title',
    placeholder: 'e.g. VP of Marketing',
  },
];

const COMPANY_FIELDS: TextFieldConfig[] = [
  {
    id: 'company',
    label: 'Company',
    autoComplete: 'organization',
    placeholder: 'e.g. Acme Corporation',
  },
  {
    id: 'website',
    label: 'Website',
    type: 'url',
    autoComplete: 'url',
    placeholder: 'https://www.example.com',
    icon: 'language',
  },
  { id: 'location', label: 'Location', placeholder: 'City, State' },
  {
    id: 'tags',
    label: 'Tags',
    placeholder: 'tag1, tag2, tag3',
    hint: 'Separate tags with commas',
  },
];

const COMPANY_SELECTS: SelectFieldConfig[] = [
  { id: 'industry', label: 'Industry', options: industryOptions },
  { id: 'companySize', label: 'Company Size', options: companySizeOptions },
  { id: 'annualRevenue', label: 'Annual Revenue', options: revenueOptions, colSpan: true },
];

const QUALIFICATION_FIELDS: TextFieldConfig[] = [
  { id: 'budget', label: 'Budget', placeholder: 'e.g. $50,000 - $100,000' },
  { id: 'authority', label: 'Authority', placeholder: 'e.g. Decision maker, Influencer' },
  { id: 'need', label: 'Need', placeholder: 'e.g. CRM solution, Sales automation' },
];

interface SectionProps {
  values: LeadFormValues;
  errors: FieldErrors;
  onChange: OnChangeHandler;
  mode: 'create' | 'edit';
  onEmailBlur?: () => void;
}

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex items-center justify-between">
      <h3 className="text-lg font-bold text-slate-900 dark:text-white">{title}</h3>
      <span className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</span>
    </div>
  );
}

function BasicSection({ values, errors, onChange, mode, onEmailBlur }: Readonly<SectionProps>) {
  const fieldBag = { values, errors, onChange };
  const isCreate = mode === 'create';
  return (
    <div className="flex flex-col gap-6">
      <SectionHeader title="Lead Information" subtitle="* Required fields" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {BASIC_FIELDS.map((f) => (
          <TextField
            key={f.id}
            {...f}
            required={isCreate && (f.id === 'firstName' || f.id === 'lastName')}
            {...fieldBag}
          />
        ))}
        {isCreate && (
          <>
            <TextField
              id="email"
              label="Email Address"
              required
              type="email"
              autoComplete="email"
              placeholder="sarah@example.com"
              icon="mail"
              onBlur={onEmailBlur}
              {...fieldBag}
            />
            <SelectField
              id="source"
              label="Lead Source"
              options={sourceOptions}
              onChangeSide={(value) => {
                if (value !== 'other') onChange('sourceOther', '');
              }}
              {...fieldBag}
            />
            {values.source === 'other' && (
              <TextField
                id="sourceOther"
                label="Please specify where the lead came from"
                required
                placeholder="e.g. Industry newsletter, Partner referral, Podcast ad..."
                colSpan
                {...fieldBag}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Industry and Company Size are create-only: in create mode they feed into the
 * qualificationNote prose; there is no corresponding Lead column, so edit mode
 * would render them but never be able to persist or seed them. annualRevenue IS
 * a real column and therefore shown in both modes.
 */
const CREATE_ONLY_SELECTS = new Set<keyof LeadFormValues>(['industry', 'companySize']);

function CompanySection({ values, errors, onChange, mode }: Readonly<SectionProps>) {
  const fieldBag = { values, errors, onChange };
  const visibleSelects =
    mode === 'create'
      ? COMPANY_SELECTS
      : COMPANY_SELECTS.filter((f) => !CREATE_ONLY_SELECTS.has(f.id));
  return (
    <div className="flex flex-col gap-6">
      <SectionHeader title="Company Information" subtitle="Optional fields" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {COMPANY_FIELDS.map((f) => (
          <TextField key={f.id} {...f} {...fieldBag} />
        ))}
        {visibleSelects.map((f) => (
          <SelectField key={f.id} {...f} {...fieldBag} />
        ))}
      </div>
    </div>
  );
}

function QualificationSection({ values, errors, onChange, mode }: Readonly<SectionProps>) {
  const fieldBag = { values, errors, onChange };
  return (
    <div className="flex flex-col gap-6">
      <SectionHeader title="Qualification (BANT)" subtitle="Optional - can be updated later" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {QUALIFICATION_FIELDS.map((f) => (
          <TextField key={f.id} {...f} {...fieldBag} />
        ))}
        <SelectField id="timeline" label="Timeline" options={timelineOptions} {...fieldBag} />
        {mode === 'edit' && (
          <TextField
            id="estimatedValue"
            label="Estimated Value ($)"
            type="number"
            placeholder="0.00"
            {...fieldBag}
          />
        )}
        {mode === 'create' && (
          <div className="space-y-1.5 md:col-span-2">
            <label htmlFor="qualificationNotes" className={LABEL_CLASS}>
              Qualification Notes
            </label>
            <textarea
              id="qualificationNotes"
              value={values.qualificationNotes}
              onChange={(e) => onChange('qualificationNotes', e.target.value)}
              placeholder="Add any additional notes about lead qualification..."
              rows={4}
              className={`${INPUT_CLASS} ${BORDER_DEFAULT} resize-none`}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function ReadOnlyField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">
        {label}
      </span>
      {children}
    </div>
  );
}

export function LeadForm({
  mode,
  values,
  errors,
  onChange,
  onSubmit,
  isSubmitting,
  onCancel,
  visibleSections,
  onEmailBlur,
  enrichmentNotice,
  readOnlyInfo,
  disabled,
  showActions = true,
}: Readonly<LeadFormProps>) {
  const sections = visibleSections ?? ['basic', 'company', 'qualification'];
  const sectionProps: SectionProps = { values, errors, onChange, mode, onEmailBlur };
  const submitLabel = mode === 'edit' ? 'Save Changes' : 'Create Lead';

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-8">
      {mode === 'edit' && readOnlyInfo && (
        <Card className="p-6 mb-6">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-4">Lead Info</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <ReadOnlyField label="Email">
              <div className="flex items-center gap-2 px-3 h-10 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-300">
                <span
                  aria-hidden="true"
                  className="material-symbols-outlined !text-[16px] text-slate-400"
                >
                  lock
                </span>
                <span className="truncate">{readOnlyInfo.email}</span>
              </div>
            </ReadOnlyField>
            <ReadOnlyField label="Status">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                {readOnlyInfo.status}
              </span>
            </ReadOnlyField>
            <ReadOnlyField label="Source">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                {readOnlyInfo.source}
              </span>
            </ReadOnlyField>
          </div>
        </Card>
      )}

      {mode === 'create' && enrichmentNotice && (
        <p aria-live="polite" className="text-sm text-blue-600 dark:text-blue-400">
          {enrichmentNotice}
        </p>
      )}

      {sections.includes('basic') && <BasicSection {...sectionProps} />}
      {sections.includes('company') && <CompanySection {...sectionProps} />}
      {sections.includes('qualification') && <QualificationSection {...sectionProps} />}

      {showActions && (
        <div className="flex items-center justify-between pt-6 border-t border-slate-200 dark:border-slate-700 mt-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 h-10 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting || (disabled ?? false)}
            className="px-6 h-10 rounded-lg bg-[#137fec] text-white text-sm font-semibold hover:bg-blue-600 transition-colors shadow-sm shadow-blue-200 dark:shadow-none disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSubmitting ? (
              <>
                <span
                  aria-hidden="true"
                  className="material-symbols-outlined !text-[18px] animate-spin"
                >
                  progress_activity
                </span>
                <span>Saving...</span>
              </>
            ) : (
              submitLabel
            )}
          </button>
        </div>
      )}
    </form>
  );
}
