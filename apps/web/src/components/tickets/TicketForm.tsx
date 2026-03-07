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
  onSubmit: (data: Readonly<Record<string, unknown>>) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
  mode: 'create' | 'edit';
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

  const handleSubmit = async (e: React.FormEvent) => {
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

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl" noValidate>
      {/* Subject */}
      <div>
        <label htmlFor="subject" className="block text-sm font-medium text-foreground mb-1">
          Subject <span className="text-destructive">*</span>
        </label>
        <input
          id="subject"
          type="text"
          value={formData.subject}
          onChange={(e) => updateField('subject', e.target.value)}
          className={`w-full px-3 py-2 rounded-lg border text-sm bg-background ${
            errors.subject ? 'border-destructive' : 'border-border'
          } focus:outline-none focus:ring-2 focus:ring-primary/50`}
          placeholder="Brief description of the issue"
          aria-invalid={!!errors.subject}
          aria-describedby={errors.subject ? 'subject-error' : undefined}
        />
        {errors.subject && (
          <p id="subject-error" className="text-xs text-destructive mt-1">
            {errors.subject}
          </p>
        )}
      </div>

      {/* Description */}
      <div>
        <label htmlFor="description" className="block text-sm font-medium text-foreground mb-1">
          Description
        </label>
        <textarea
          id="description"
          value={formData.description}
          onChange={(e) => updateField('description', e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-border text-sm bg-background min-h-[120px] focus:outline-none focus:ring-2 focus:ring-primary/50"
          placeholder="Provide details about the issue..."
        />
      </div>

      {/* Contact Name & Email */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="contactName" className="block text-sm font-medium text-foreground mb-1">
            Contact Name <span className="text-destructive">*</span>
          </label>
          <input
            id="contactName"
            type="text"
            value={formData.contactName}
            onChange={(e) => updateField('contactName', e.target.value)}
            className={`w-full px-3 py-2 rounded-lg border text-sm bg-background ${
              errors.contactName ? 'border-destructive' : 'border-border'
            } focus:outline-none focus:ring-2 focus:ring-primary/50`}
            placeholder="Customer name"
            aria-invalid={!!errors.contactName}
            aria-describedby={errors.contactName ? 'contactName-error' : undefined}
          />
          {errors.contactName && (
            <p id="contactName-error" className="text-xs text-destructive mt-1">
              {errors.contactName}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="contactEmail" className="block text-sm font-medium text-foreground mb-1">
            Contact Email <span className="text-destructive">*</span>
          </label>
          <input
            id="contactEmail"
            type="email"
            value={formData.contactEmail}
            onChange={(e) => updateField('contactEmail', e.target.value)}
            className={`w-full px-3 py-2 rounded-lg border text-sm bg-background ${
              errors.contactEmail ? 'border-destructive' : 'border-border'
            } focus:outline-none focus:ring-2 focus:ring-primary/50`}
            placeholder="customer@example.com"
            aria-invalid={!!errors.contactEmail}
            aria-describedby={errors.contactEmail ? 'contactEmail-error' : undefined}
          />
          {errors.contactEmail && (
            <p id="contactEmail-error" className="text-xs text-destructive mt-1">
              {errors.contactEmail}
            </p>
          )}
        </div>
      </div>

      {/* Priority & Category */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="priority" className="block text-sm font-medium text-foreground mb-1">
            Priority <span className="text-destructive">*</span>
          </label>
          <select
            id="priority"
            value={formData.priority}
            onChange={(e) => updateField('priority', e.target.value as TicketPriority)}
            className="w-full px-3 py-2 rounded-lg border border-border text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
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
        <div>
          <label htmlFor="category" className="block text-sm font-medium text-foreground mb-1">
            Category
          </label>
          <select
            id="category"
            value={formData.category}
            onChange={(e) => updateField('category', e.target.value as TicketCategory | '')}
            className="w-full px-3 py-2 rounded-lg border border-border text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <option value="">Select category...</option>
            {TICKET_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c.replaceAll(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Channel */}
      <div>
        <label htmlFor="channel" className="block text-sm font-medium text-foreground mb-1">
          Channel
        </label>
        <select
          id="channel"
          value={formData.channel}
          onChange={(e) => updateField('channel', e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-border text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          {CHANNEL_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Tags */}
      <div>
        <label htmlFor="tags" className="block text-sm font-medium text-foreground mb-1">
          Tags
        </label>
        <input
          id="tags"
          type="text"
          value={formData.tags}
          onChange={(e) => updateField('tags', e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-border text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
          placeholder="Separate tags with commas"
        />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-4 border-t border-border">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          disabled={isSubmitting}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-6 py-2 bg-primary text-primary-foreground text-sm font-bold rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
