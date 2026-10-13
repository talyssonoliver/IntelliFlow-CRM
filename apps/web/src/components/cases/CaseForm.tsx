'use client';

/**
 * CaseForm — Create/edit case form with sectioned card layout
 *
 * Matches the design mockup at docs/design/mockups/case-new.png
 * Sections: Case Information, Client Information, Assignment & SLA
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import type { CasePriority, CaseRequiredFieldKey } from '@intelliflow/domain';
import { CASE_PRIORITIES } from '@intelliflow/domain';
import type { CaseTypeOptionDto } from '@intelliflow/validators';
import { api } from '@/lib/api';
import {
  defaultPriorityOptionLabel,
  describeCaseTypeDefaults,
  effectiveRequiredFields,
} from './case-type-labels';
import { useTimezoneContext } from '@/providers/TimezoneProvider';
import { TimezoneSelector } from '@/components/settings/TimezoneSelector';

// ─── Hooks ───────────────────────────────────────────────────────────────────

function useDebounce(value: string, delay: number): string {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface CaseFormData {
  subject: string;
  description: string;
  /** PG-204: '' = no case type. */
  caseTypeId: string;
  /** PG-204: '' = use the type / Case Settings default (omitted from the payload). */
  priority: CasePriority | '';
  clientSearch: string;
  clientId: string;
  clientName: string;
  assigneeId: string;
  deadline: string;
  timezone: string;
  jurisdiction: string;
}

interface CaseFormProps {
  initialData?: Partial<CaseFormData>;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
  mode: 'create' | 'edit';
  /** PG-204: active case types for the picker (the default one is preselected). */
  caseTypes?: readonly CaseTypeOptionDto[];
  /** PG-204: Case Settings required fields, used when no type (or a type without its own). */
  moduleRequiredFields?: readonly CaseRequiredFieldKey[];
}

const NO_REQUIRED_FIELDS: readonly CaseRequiredFieldKey[] = [];
const NO_CASE_TYPES: readonly CaseTypeOptionDto[] = [];

/** `*` for sighted users, "(required)" for screen readers. */
function RequiredMark() {
  return (
    <>
      <span className="text-destructive" aria-hidden="true">
        {' *'}
      </span>
      <span className="sr-only"> (required)</span>
    </>
  );
}

// ─── Constants ──────────────────────────────────────────────────────────────

const PRIORITY_LABELS: Record<CasePriority, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent / Critical',
};

// ─── Component ──────────────────────────────────────────────────────────────

export function CaseForm({
  initialData,
  onSubmit,
  onCancel,
  isSubmitting,
  mode,
  caseTypes = NO_CASE_TYPES,
  moduleRequiredFields = NO_REQUIRED_FIELDS,
}: Readonly<CaseFormProps>) {
  const { timezone: userTimezone } = useTimezoneContext();
  const [formData, setFormData] = useState<CaseFormData>({
    subject: initialData?.subject ?? '',
    description: initialData?.description ?? '',
    caseTypeId: initialData?.caseTypeId ?? '',
    priority: initialData?.priority ?? '',
    clientSearch: initialData?.clientSearch ?? '',
    clientId: initialData?.clientId ?? '',
    clientName: '',
    assigneeId: initialData?.assigneeId ?? 'me',
    deadline: initialData?.deadline ?? '',
    timezone:
      (initialData as { timezone?: string; jurisdiction?: string } | undefined)?.timezone ??
      userTimezone ??
      'Europe/London',
    jurisdiction:
      (initialData as { timezone?: string; jurisdiction?: string } | undefined)?.jurisdiction ?? '',
  });

  const [errors, setErrors] = useState<Partial<Record<keyof CaseFormData, string>>>({});

  // PG-204: preselect the default case type once types load, unless the user already chose.
  const [caseTypeTouched, setCaseTypeTouched] = useState(false);
  const defaultCaseTypeId = caseTypes.find((type) => type.isDefault)?.id;
  useEffect(() => {
    if (mode !== 'create' || caseTypeTouched || !defaultCaseTypeId) return;
    setFormData((prev) => (prev.caseTypeId ? prev : { ...prev, caseTypeId: defaultCaseTypeId }));
  }, [mode, caseTypeTouched, defaultCaseTypeId]);

  const selectedCaseType = caseTypes.find((type) => type.id === formData.caseTypeId) ?? null;
  const requiredFields = effectiveRequiredFields(
    selectedCaseType?.requiredFields,
    moduleRequiredFields
  );
  const descriptionRequired = requiredFields.has('description');
  const jurisdictionRequired = requiredFields.has('jurisdiction');
  // An SLA on the type fills the deadline, so it never has to be typed in.
  const deadlineRequired =
    requiredFields.has('deadline') && selectedCaseType?.defaultSlaDays == null;

  const updateField = useCallback(
    <K extends keyof CaseFormData>(field: K, value: CaseFormData[K]) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
      if (errors[field]) {
        setErrors((prev) => ({ ...prev, [field]: undefined }));
      }
    },
    [errors]
  );

  // ── Client search state ──────────────────────────────────────────────────
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false);
  const clientContainerRef = useRef<HTMLDivElement>(null);
  const debouncedClientSearch = useDebounce(formData.clientSearch, 300);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: Readonly<MouseEvent>) {
      if (clientContainerRef.current && !clientContainerRef.current.contains(e.target as Node)) {
        setClientDropdownOpen(false);
      }
    }
    if (clientDropdownOpen) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [clientDropdownOpen]);

  // ── Team assignees query ─────────────────────────────────────────────────
  const assigneesQuery = api.cases.assignees.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });

  const teamMembers = assigneesQuery.data ?? [];

  // PG-204: a case's client is an Account (cases.clientId → accounts). The picker
  // previously searched contacts, whose ids the server rejects.
  const clientQuery = api.account.list.useQuery(
    { search: debouncedClientSearch, limit: 5, page: 1 },
    { enabled: clientDropdownOpen && debouncedClientSearch.length >= 2 }
  );

  const clientResults: Array<{ id: string; name: string; email?: string; company?: string }> = (
    clientQuery.data?.accounts ?? []
  ).map((account) => ({
    id: account.id,
    name: account.name,
    company: account.industry ?? undefined,
  }));

  function handleClientSelect(id: string, name: string) {
    setFormData((prev) => ({ ...prev, clientId: id, clientName: name, clientSearch: '' }));
    setClientDropdownOpen(false);
    if (errors.clientSearch) {
      setErrors((prev) => ({ ...prev, clientSearch: undefined }));
    }
  }

  function handleClientClear() {
    setFormData((prev) => ({ ...prev, clientId: '', clientName: '', clientSearch: '' }));
  }

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof CaseFormData, string>> = {};

    if (!formData.subject.trim()) {
      newErrors.subject = 'Subject is required';
    } else if (formData.subject.length > 300) {
      newErrors.subject = 'Subject must be 300 characters or less';
    }

    if (!formData.clientId) {
      newErrors.clientSearch = 'Please search and select a client';
    }

    if (formData.description && formData.description.length > 5000) {
      newErrors.description = 'Description must be 5000 characters or less';
    } else if (descriptionRequired && !formData.description.trim()) {
      newErrors.description = 'Description is required for this case';
    }

    if (deadlineRequired && !formData.deadline) {
      newErrors.deadline = 'A deadline is required for this case';
    }

    if (jurisdictionRequired && !formData.jurisdiction.trim()) {
      newErrors.jurisdiction = 'Jurisdiction is required for this case';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!validate()) {
      // After React commits the error state, focus the first invalid field (WCAG 3.3.1).
      const form = e.currentTarget as HTMLFormElement;
      setTimeout(() => form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0);
      return;
    }

    const submitData: Record<string, unknown> = {
      title: formData.subject.trim(),
      clientId: formData.clientId,
    };

    // PG-204: a blank priority lets the server apply the type / Case Settings default.
    if (formData.priority) submitData.priority = formData.priority;
    if (formData.caseTypeId) submitData.caseTypeId = formData.caseTypeId;
    if (formData.description.trim()) submitData.description = formData.description.trim();
    if (
      formData.assigneeId &&
      formData.assigneeId !== 'unassigned' &&
      formData.assigneeId !== 'me'
    ) {
      submitData.assignedTo = formData.assigneeId;
    }
    // When 'me' is selected, omit assignedTo — backend defaults to current user
    if (formData.deadline) submitData.deadline = new Date(formData.deadline);
    if (formData.timezone) submitData.timezone = formData.timezone;
    if (formData.jurisdiction) submitData.jurisdiction = formData.jurisdiction;

    await onSubmit(submitData);
  };

  const inputClasses = (field: keyof CaseFormData) =>
    `w-full px-3 py-2.5 rounded-lg border text-sm bg-background h-11 ${
      errors[field] ? 'border-destructive' : 'border-border'
    } focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all`;

  const selectClasses =
    'w-full px-3 py-2.5 rounded-lg border border-border text-sm bg-background h-11 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all appearance-none';

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-3xl" noValidate>
      {/* ── Section: Case Information ───────────────────────────────────── */}
      <section className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center gap-2">
          <span className="material-symbols-outlined text-primary" aria-hidden="true">
            info
          </span>
          <h2 className="text-lg font-bold text-foreground">Case Information</h2>
        </div>
        <div className="p-6 space-y-5">
          {/* Subject */}
          <div>
            <label htmlFor="subject" className="block text-sm font-semibold text-foreground mb-1.5">
              Subject <span className="text-destructive">*</span>
            </label>
            <input
              id="subject"
              type="text"
              value={formData.subject}
              onChange={(e) => updateField('subject', e.target.value)}
              className={inputClasses('subject')}
              placeholder="Enter a descriptive title for this case"
              aria-invalid={!!errors.subject}
              aria-describedby={errors.subject ? 'subject-error' : undefined}
            />
            {errors.subject && (
              <p id="subject-error" role="alert" className="text-xs text-destructive mt-1">
                {errors.subject}
              </p>
            )}
          </div>

          {/* Case type & Priority (PG-204: the type replaces the unpersisted category list) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label
                htmlFor="caseType"
                className="block text-sm font-semibold text-foreground mb-1.5"
              >
                Case type
              </label>
              <select
                id="caseType"
                value={formData.caseTypeId}
                onChange={(e) => {
                  setCaseTypeTouched(true);
                  updateField('caseTypeId', e.target.value);
                }}
                className={selectClasses}
                aria-describedby="case-type-hint"
              >
                <option value="">None</option>
                {caseTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.category ? `${type.name} (${type.category})` : type.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="priority"
                className="block text-sm font-semibold text-foreground mb-1.5"
              >
                Priority
              </label>
              <select
                id="priority"
                value={formData.priority}
                onChange={(e) => updateField('priority', e.target.value as CasePriority | '')}
                className={selectClasses}
                aria-describedby="case-type-hint"
              >
                <option value="">{defaultPriorityOptionLabel(selectedCaseType)}</option>
                {CASE_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>
            <output
              id="case-type-hint"
              className="block sm:col-span-2 -mt-2 text-xs text-muted-foreground"
            >
              {describeCaseTypeDefaults(selectedCaseType)}
            </output>
          </div>

          {/* Description */}
          <div>
            <label
              htmlFor="description"
              className="block text-sm font-semibold text-foreground mb-1.5"
            >
              Description
              {descriptionRequired && <RequiredMark />}
            </label>
            <textarea
              id="description"
              value={formData.description}
              onChange={(e) => updateField('description', e.target.value)}
              aria-required={descriptionRequired || undefined}
              aria-invalid={!!errors.description}
              aria-describedby={errors.description ? 'description-error' : undefined}
              className="w-full px-3 py-2.5 rounded-lg border border-border text-sm bg-background min-h-[120px] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              placeholder="Provide detailed information about the customer's request..."
              rows={4}
            />
            {errors.description && (
              <p id="description-error" role="alert" className="text-xs text-destructive mt-1">
                {errors.description}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ── Section: Client Information ─────────────────────────────────── */}
      <section className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center gap-2">
          <span className="material-symbols-outlined text-primary" aria-hidden="true">
            groups
          </span>
          <h2 className="text-lg font-bold text-foreground">Client Information</h2>
        </div>
        <div className="p-6">
          <div ref={clientContainerRef} className="relative">
            <label
              htmlFor="clientSearch"
              className="block text-sm font-semibold text-foreground mb-1.5"
            >
              Link to Client/Account <span className="text-destructive">*</span>
            </label>

            {formData.clientId ? (
              /* ── Selected client chip ── */
              <div className="flex items-center gap-2 w-full rounded-lg border border-border bg-background px-3 py-2.5 h-11 text-sm">
                <span className="material-symbols-outlined text-primary text-xl" aria-hidden="true">
                  person
                </span>
                <span className="flex-1 truncate font-medium">{formData.clientName}</span>
                <button
                  type="button"
                  onClick={handleClientClear}
                  disabled={isSubmitting}
                  className="text-muted-foreground hover:text-foreground shrink-0 transition-colors"
                  aria-label="Clear client selection"
                >
                  <span className="material-symbols-outlined !text-[18px]">close</span>
                </button>
              </div>
            ) : (
              /* ── Search input ── */
              <div className="relative">
                <span
                  className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xl"
                  aria-hidden="true"
                >
                  search
                </span>
                <input
                  id="clientSearch"
                  type="text"
                  value={formData.clientSearch}
                  onChange={(e) => {
                    updateField('clientSearch', e.target.value);
                    if (!clientDropdownOpen) setClientDropdownOpen(true);
                  }}
                  onFocus={() => setClientDropdownOpen(true)}
                  className={`${inputClasses('clientSearch')} pl-10`}
                  placeholder="Search accounts by name..."
                  disabled={isSubmitting}
                  aria-invalid={!!errors.clientSearch}
                  aria-describedby={errors.clientSearch ? 'client-error' : 'client-help'}
                  role="combobox"
                  aria-controls="client-listbox"
                  aria-expanded={clientDropdownOpen}
                  autoComplete="off"
                />
              </div>
            )}

            {/* ── Dropdown results ── */}
            {}
            {clientDropdownOpen && !formData.clientId && debouncedClientSearch.length >= 2 && (
              <ul
                id="client-listbox"
                className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-background shadow-lg max-h-56 overflow-y-auto list-none m-0 p-0"
              >
                {clientQuery.isLoading && (
                  <li className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
                    <span
                      className="material-symbols-outlined text-[16px] animate-spin"
                      aria-hidden="true"
                    >
                      progress_activity
                    </span>{' '}
                    Searching...
                  </li>
                )}
                {!clientQuery.isLoading && clientResults.length === 0 && (
                  <li className="px-3 py-3 text-sm text-muted-foreground">
                    No clients found for &quot;{debouncedClientSearch}&quot;
                  </li>
                )}
                {!clientQuery.isLoading &&
                  clientResults.map((client) => (
                    <li key={client.id}>
                      <button
                        type="button"
                        onClick={() => handleClientSelect(client.id, client.name)}
                        className="w-full text-left px-3 py-2.5 hover:bg-accent transition-colors flex items-center gap-3"
                      >
                        <span
                          className="material-symbols-outlined text-muted-foreground text-xl shrink-0"
                          aria-hidden="true"
                        >
                          person
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-foreground truncate">
                            {client.name}
                          </div>
                          {(client.email || client.company) && (
                            <div className="text-xs text-muted-foreground truncate">
                              {[client.email, client.company].filter(Boolean).join(' · ')}
                            </div>
                          )}
                        </div>
                      </button>
                    </li>
                  ))}
              </ul>
            )}
            {}

            {errors.clientSearch ? (
              <p id="client-error" className="text-xs text-destructive mt-1">
                {errors.clientSearch}
              </p>
            ) : (
              <p id="client-help" className="text-xs text-muted-foreground mt-1.5 italic">
                Type to search existing clients or{' '}
                <Link href="/accounts/new" className="text-primary hover:underline">
                  create a new one
                </Link>
                .
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ── Section: Assignment & SLA ───────────────────────────────────── */}
      <section className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center gap-2">
          <span className="material-symbols-outlined text-primary" aria-hidden="true">
            assignment_ind
          </span>
          <h2 className="text-lg font-bold text-foreground">Assignment & SLA</h2>
        </div>
        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label
              htmlFor="assigneeId"
              className="block text-sm font-semibold text-foreground mb-1.5"
            >
              Assign To
            </label>
            <select
              id="assigneeId"
              value={formData.assigneeId}
              onChange={(e) => updateField('assigneeId', e.target.value)}
              className={selectClasses}
              disabled={assigneesQuery.isLoading}
            >
              <option value="me">Assign to me (current user)</option>
              <option value="unassigned">Leave Unassigned</option>
              {teamMembers.length > 0 && (
                <option disabled className="text-muted-foreground">
                  ── Team Members ──
                </option>
              )}
              {teamMembers.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                  {member.title ? ` — ${member.title}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="deadline"
              className="block text-sm font-semibold text-foreground mb-1.5"
            >
              Deadline / Due Date
              {deadlineRequired && <RequiredMark />}
            </label>
            <input
              id="deadline"
              type="date"
              value={formData.deadline}
              onChange={(e) => updateField('deadline', e.target.value)}
              className={inputClasses('deadline')}
              aria-required={deadlineRequired || undefined}
              aria-invalid={!!errors.deadline}
              aria-describedby={errors.deadline ? 'deadline-error' : 'case-type-hint'}
            />
            {errors.deadline && (
              <p id="deadline-error" role="alert" className="text-xs text-destructive mt-1">
                {errors.deadline}
              </p>
            )}
          </div>
          <fieldset>
            <legend className="block text-sm font-semibold text-foreground mb-1.5">
              Deadline Timezone
            </legend>
            <TimezoneSelector
              value={formData.timezone}
              onChange={(val) => updateField('timezone', val)}
            />
          </fieldset>
          <div className="sm:col-span-2">
            <label
              htmlFor="jurisdiction"
              className="block text-sm font-semibold text-foreground mb-1.5"
            >
              Jurisdiction
              {jurisdictionRequired && <RequiredMark />}
            </label>
            <input
              id="jurisdiction"
              type="text"
              placeholder="e.g. US-NY, UK-England, EU-GDPR"
              value={formData.jurisdiction}
              onChange={(e) => updateField('jurisdiction', e.target.value)}
              maxLength={100}
              className={inputClasses('jurisdiction')}
              aria-required={jurisdictionRequired || undefined}
              aria-invalid={!!errors.jurisdiction}
              aria-describedby={errors.jurisdiction ? 'jurisdiction-error' : undefined}
            />
            {errors.jurisdiction && (
              <p id="jurisdiction-error" role="alert" className="text-xs text-destructive mt-1">
                {errors.jurisdiction}
              </p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              Legal jurisdiction for court deadlines and filing requirements
            </p>
          </div>
        </div>
      </section>

      {/* ── Form Actions ────────────────────────────────────────────────── */}
      <div className="flex items-center justify-end gap-3 pt-2 pb-8">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="px-5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-8 py-2.5 rounded-lg bg-primary text-sm font-bold text-white shadow-sm shadow-primary/30 hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isSubmitting && (
            <span className="material-symbols-outlined text-[16px] animate-spin" aria-hidden="true">
              progress_activity
            </span>
          )}
          {mode === 'create' ? 'Create Case' : 'Save Changes'}
        </button>
      </div>
    </form>
  );
}
