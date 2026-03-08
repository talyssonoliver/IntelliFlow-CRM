'use client';

/**
 * TicketForm — Create/edit ticket form (PG-137)
 *
 * @implements AC-11 (TicketForm validates with createTicketSchema)
 */

import { useState } from 'react';
import type { TicketPriority, TicketCategory } from '@intelliflow/domain';
import { TICKET_PRIORITIES, TICKET_CATEGORIES } from '@intelliflow/domain';
import { getPriorityConfig } from '@/lib/tickets/ticket-utils';

interface TicketFormData {
  subject: string;
  description: string;
  contactName: string;
  contactEmail: string;
  priority: TicketPriority;
  category: TicketCategory | '';
  channel: string;
  assigneeId: string;
  tags: string;
}

interface TicketFormProps {
  initialData?: Partial<TicketFormData>;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
  mode: 'create' | 'edit';
  /** Optional content rendered between form fields and action buttons (e.g. FileUploader) */
  renderBeforeActions?: React.ReactNode;
}

const CHANNEL_OPTIONS = [
  { value: '', label: 'Select channel...' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'PHONE', label: 'Phone' },
  { value: 'CHAT', label: 'Chat' },
  { value: 'PORTAL', label: 'Portal' },
  { value: 'OTHER', label: 'Other' },
];

export function TicketForm({
  initialData,
  onSubmit,
  onCancel,
  isSubmitting,
  mode,
  renderBeforeActions,
}: Readonly<TicketFormProps>) {
  const [formData, setFormData] = useState<TicketFormData>({
    subject: initialData?.subject ?? '',
    description: initialData?.description ?? '',
    contactName: initialData?.contactName ?? '',
    contactEmail: initialData?.contactEmail ?? '',
    priority: initialData?.priority ?? 'MEDIUM',
    category: initialData?.category ?? '',
    channel: initialData?.channel ?? '',
    assigneeId: initialData?.assigneeId ?? '',
    tags: initialData?.tags ?? '',
  });

  const [errors, setErrors] = useState<Partial<Record<keyof TicketFormData, string>>>({});

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof TicketFormData, string>> = {};

    if (!formData.subject.trim()) {
      newErrors.subject = 'Subject is required';
    } else if (formData.subject.length > 200) {
      newErrors.subject = 'Subject must be 200 characters or less';
    }

    if (!formData.contactName.trim()) {
      newErrors.contactName = 'Contact name is required';
    }

    if (!formData.contactEmail.trim()) {
      newErrors.contactEmail = 'Contact email is required';
    } else if (!/^[^\s@]+@[^\s@.]+\.[^\s@.]+$/.test(formData.contactEmail)) {
      newErrors.contactEmail = 'Invalid email format';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const submitData: Record<string, unknown> = {
      subject: formData.subject.trim(),
      priority: formData.priority,
      contactName: formData.contactName.trim(),
      contactEmail: formData.contactEmail.trim(),
      slaPolicyId: 'default-sla-policy',
    };

    if (formData.description.trim()) submitData.description = formData.description.trim();
    if (formData.category) submitData.category = formData.category;
    if (formData.assigneeId) submitData.assigneeId = formData.assigneeId;

    await onSubmit(submitData);
  };

  const updateField = <K extends keyof TicketFormData>(field: K, value: TicketFormData[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const inputClass = (hasError: boolean) =>
    `w-full rounded-lg border bg-slate-50 dark:bg-slate-800/50 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-400 transition-shadow focus:ring-2 focus:ring-[#137fec]/20 focus:border-[#137fec] focus:outline-none ${
      hasError ? 'border-red-500' : 'border-slate-200 dark:border-slate-700'
    }`;

  const selectClass =
    'w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-3 py-2 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-[#137fec]/20 focus:border-[#137fec] focus:outline-none transition-shadow';

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      {/* Row 1: Subject (full width) */}
      <div className="space-y-1">
        <label htmlFor="subject" className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
          Subject <span className="text-red-500">*</span>
        </label>
        <input
          id="subject"
          type="text"
          value={formData.subject}
          onChange={(e) => updateField('subject', e.target.value)}
          className={inputClass(!!errors.subject)}
          placeholder="Brief description of the issue"
          aria-invalid={!!errors.subject}
          aria-describedby={errors.subject ? 'subject-error' : undefined}
        />
        {errors.subject && (
          <p id="subject-error" className="text-xs text-red-500">
            {errors.subject}
          </p>
        )}
      </div>

      {/* Row 2: Description (full width, compact) */}
      <div className="space-y-1">
        <label htmlFor="description" className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
          Description
        </label>
        <textarea
          id="description"
          value={formData.description}
          onChange={(e) => updateField('description', e.target.value)}
          className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-400 min-h-[72px] focus:ring-2 focus:ring-[#137fec]/20 focus:border-[#137fec] focus:outline-none transition-shadow resize-y"
          placeholder="Provide details about the issue..."
          rows={3}
        />
      </div>

      {/* Row 3: Contact Name + Contact Email */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1">
          <label htmlFor="contactName" className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
            Contact Name <span className="text-red-500">*</span>
          </label>
          <input
            id="contactName"
            type="text"
            value={formData.contactName}
            onChange={(e) => updateField('contactName', e.target.value)}
            className={inputClass(!!errors.contactName)}
            placeholder="Customer name"
            aria-invalid={!!errors.contactName}
            aria-describedby={errors.contactName ? 'contactName-error' : undefined}
          />
          {errors.contactName && (
            <p id="contactName-error" className="text-xs text-red-500">
              {errors.contactName}
            </p>
          )}
        </div>
        <div className="space-y-1">
          <label htmlFor="contactEmail" className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
            Contact Email <span className="text-red-500">*</span>
          </label>
          <input
            id="contactEmail"
            type="email"
            value={formData.contactEmail}
            onChange={(e) => updateField('contactEmail', e.target.value)}
            className={inputClass(!!errors.contactEmail)}
            placeholder="customer@example.com"
            aria-invalid={!!errors.contactEmail}
            aria-describedby={errors.contactEmail ? 'contactEmail-error' : undefined}
          />
          {errors.contactEmail && (
            <p id="contactEmail-error" className="text-xs text-red-500">
              {errors.contactEmail}
            </p>
          )}
        </div>
      </div>

      {/* Row 4: Priority + Category */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1">
          <label htmlFor="priority" className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
            Priority <span className="text-red-500">*</span>
          </label>
          <select
            id="priority"
            value={formData.priority}
            onChange={(e) => updateField('priority', e.target.value as TicketPriority)}
            className={selectClass}
          >
            {TICKET_PRIORITIES.map((p) => {
              const config = getPriorityConfig(p);
              return (
                <option key={p} value={p}>
                  {config.label}
                </option>
              );
            })}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="category" className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
            Category
          </label>
          <select
            id="category"
            value={formData.category}
            onChange={(e) => updateField('category', e.target.value as TicketCategory | '')}
            className={selectClass}
          >
            <option value="">Select category...</option>
            {TICKET_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Row 5: Channel + Tags */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1">
          <label htmlFor="channel" className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
            Channel
          </label>
          <select
            id="channel"
            value={formData.channel}
            onChange={(e) => updateField('channel', e.target.value)}
            className={selectClass}
          >
            {CHANNEL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="tags" className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
            Tags
          </label>
          <input
            id="tags"
            type="text"
            value={formData.tags}
            onChange={(e) => updateField('tags', e.target.value)}
            className={inputClass(false)}
            placeholder="Separate tags with commas"
          />
        </div>
      </div>

      {/* Extra content slot (e.g. FileUploader) */}
      {renderBeforeActions}

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-700 mt-1">
        <button
          type="button"
          onClick={onCancel}
          className="px-5 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          disabled={isSubmitting}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex items-center gap-2 bg-[#137fec] hover:bg-[#0e6ac7] text-white font-bold py-2 px-6 rounded-lg shadow-sm shadow-[#137fec]/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting && (
            <span className="material-symbols-outlined text-[16px] animate-spin">
              progress_activity
            </span>
          )}
          {mode === 'create' ? 'Create Ticket' : 'Save Changes'}
        </button>
      </div>
    </form>
  );
}
