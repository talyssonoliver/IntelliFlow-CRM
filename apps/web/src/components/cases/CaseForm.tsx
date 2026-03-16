'use client';

/**
 * CaseForm — Create/edit case form with sectioned card layout
 *
 * Matches the design mockup at docs/design/mockups/case-new.png
 * Sections: Case Information, Client Information, Assignment & SLA
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import type { CasePriority } from '@intelliflow/domain';
import { CASE_PRIORITIES } from '@intelliflow/domain';
import { api } from '@/lib/api';
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
  category: string;
  priority: CasePriority;
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
}

// ─── Constants ──────────────────────────────────────────────────────────────

const CATEGORY_OPTIONS = [
  { value: '', label: 'Select Category' },
  { value: 'TECHNICAL', label: 'Technical Issue' },
  { value: 'BILLING', label: 'Billing & Payment' },
  { value: 'FEATURE_REQUEST', label: 'Feature Request' },
  { value: 'ONBOARDING', label: 'Onboarding Assistance' },
  { value: 'OTHER', label: 'Other' },
];

const PRIORITY_LABELS: Record<CasePriority, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent / Critical',
};

// ─── Component ──────────────────────────────────────────────────────────────

export function CaseForm({ initialData, onSubmit, onCancel, isSubmitting, mode }: Readonly<CaseFormProps>) {
  const { timezone: userTimezone } = useTimezoneContext();
  const [formData, setFormData] = useState<CaseFormData>({
    subject: initialData?.subject ?? '',
    description: initialData?.description ?? '',
    category: initialData?.category ?? '',
    priority: initialData?.priority ?? 'MEDIUM',
    clientSearch: initialData?.clientSearch ?? '',
    clientId: initialData?.clientId ?? '',
    clientName: '',
    assigneeId: initialData?.assigneeId ?? 'me',
    deadline: initialData?.deadline ?? '',
    timezone: (initialData as any)?.timezone ?? userTimezone ?? 'Europe/London',
    jurisdiction: (initialData as any)?.jurisdiction ?? '',
  });

  const [errors, setErrors] = useState<Partial<Record<keyof CaseFormData, string>>>({});

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

  const contactQuery = api.contact.list.useQuery(
    { search: debouncedClientSearch, limit: 5, page: 1 },
    { enabled: clientDropdownOpen && debouncedClientSearch.length >= 2 }
  );

  const clientResults: Array<{ id: string; name: string; email?: string; company?: string }> = (
    contactQuery.data?.contacts ?? []
  ).map((c) => ({
    id: c.id,
    name: [c.firstName, c.lastName].filter(Boolean).join(' '),
    email: c.email ?? undefined,
    company: (c as { account?: { name?: string } }).account?.name ?? undefined,
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
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const submitData: Record<string, unknown> = {
      title: formData.subject.trim(),
      priority: formData.priority,
      clientId: formData.clientId,
    };

    if (formData.description.trim()) submitData.description = formData.description.trim();
    if (formData.category) submitData.category = formData.category;
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
              Subject{' '}<span className="text-destructive">*</span>
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
              <p id="subject-error" className="text-xs text-destructive mt-1">
                {errors.subject}
              </p>
            )}
          </div>

          {/* Category & Priority */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label
                htmlFor="category"
                className="block text-sm font-semibold text-foreground mb-1.5"
              >
                Category
              </label>
              <select
                id="category"
                value={formData.category}
                onChange={(e) => updateField('category', e.target.value)}
                className={selectClasses}
              >
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
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
                onChange={(e) => updateField('priority', e.target.value as CasePriority)}
                className={selectClasses}
              >
                {CASE_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label
              htmlFor="description"
              className="block text-sm font-semibold text-foreground mb-1.5"
            >
              Description
            </label>
            <textarea
              id="description"
              value={formData.description}
              onChange={(e) => updateField('description', e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-border text-sm bg-background min-h-[120px] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              placeholder="Provide detailed information about the customer's request..."
              rows={4}
            />
            {errors.description && (
              <p className="text-xs text-destructive mt-1">{errors.description}</p>
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
              Link to Client/Account{' '}<span className="text-destructive">*</span>
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
                  placeholder="Search by name, email or company..."
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
            {clientDropdownOpen && !formData.clientId && debouncedClientSearch.length >= 2 && (
              <div
                id="client-listbox"
                className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-background shadow-lg max-h-56 overflow-y-auto"
                role="listbox" // NOSONAR typescript:S6819 — custom accessible autocomplete dropdown; <select> cannot contain custom-styled items
              >
                {contactQuery.isLoading && (
                  <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
                    <span
                      className="material-symbols-outlined text-[16px] animate-spin"
                      aria-hidden="true"
                    >
                      progress_activity
                    </span>{' '}
                    Searching...
                  </div>
                )}
                {!contactQuery.isLoading && clientResults.length === 0 && (
                  <div className="px-3 py-3 text-sm text-muted-foreground">
                    No clients found for &quot;{debouncedClientSearch}&quot;
                  </div>
                )}
                {!contactQuery.isLoading &&
                  clientResults.map((client) => (
                    <button
                      key={client.id}
                      type="button"
                      onClick={() => handleClientSelect(client.id, client.name)}
                      className="w-full text-left px-3 py-2.5 hover:bg-accent transition-colors flex items-center gap-3"
                      role="option" // NOSONAR typescript:S6819 — listbox option button; <option> cannot contain icons or custom layout
                      aria-selected={false}
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
                  ))}
              </div>
            )}

            {errors.clientSearch ? (
              <p id="client-error" className="text-xs text-destructive mt-1">
                {errors.clientSearch}
              </p>
            ) : (
              <p id="client-help" className="text-xs text-muted-foreground mt-1.5 italic">
                Type to search existing clients or{' '}
                <Link href="/contacts/new" className="text-primary hover:underline">
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
            </label>
            <input
              id="deadline"
              type="date"
              value={formData.deadline}
              onChange={(e) => updateField('deadline', e.target.value)}
              className={inputClasses('deadline')}
            />
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
            </label>
            <input
              id="jurisdiction"
              type="text"
              placeholder="e.g. US-NY, UK-England, EU-GDPR"
              value={formData.jurisdiction}
              onChange={(e) => updateField('jurisdiction', e.target.value)}
              maxLength={100}
              className={inputClasses('jurisdiction')}
            />
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
