'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@intelliflow/ui';
import { useFormUnsavedChanges } from '@/hooks/useUnsavedChanges';
import {
  type LeadEditFields,
  computeLeadChangeset,
  buildLeadUpdatePayload,
} from '@/lib/leads/change-tracker';

/**
 * Lead edit form (PG-062). Extracted from `app/leads/[id]/edit/page.tsx` — pure
 * form UI + dirty-tracking + minimal-patch submit (via change-tracker). The page
 * owns data fetching, the update mutation, toast and redirect; it passes the lead
 * plus onSave/isSaving/onCancel. Consistent with the create form (NewLeadForm);
 * create/edit unification is IFC-230, not this task.
 */

export interface LeadEditorLead {
  email: string;
  status: string;
  source: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | { value?: string } | null;
  title: string | null;
  company: string | null;
  location?: string | null;
  website?: string | null;
  estimatedValue?: number | null;
  tags?: string[] | null;
}

export interface LeadEditorProps {
  leadId: string;
  lead: LeadEditorLead;
  isSaving: boolean;
  onSave: (payload: Record<string, unknown>) => Promise<unknown> | void;
  onCancel: () => void;
}

const EMPTY_FIELDS: LeadEditFields = {
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

function seedFromLead(lead: LeadEditorLead): LeadEditFields {
  return {
    firstName: lead.firstName ?? '',
    lastName: lead.lastName ?? '',
    phone: typeof lead.phone === 'string' ? lead.phone : (lead.phone?.value ?? ''),
    title: lead.title ?? '',
    company: lead.company ?? '',
    location: lead.location ?? '',
    website: lead.website ?? '',
    estimatedValue: lead.estimatedValue == null ? '' : String(lead.estimatedValue / 100),
    tags: Array.isArray(lead.tags) ? lead.tags.join(', ') : '',
  };
}

const INPUT_CLASS =
  'w-full px-3 h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-[#137fec] focus:border-transparent outline-none transition-all';
const LABEL_CLASS = 'block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1';

export function LeadEditor({
  leadId,
  lead,
  isSaving,
  onSave,
  onCancel,
}: Readonly<LeadEditorProps>) {
  const [formData, setFormData] = useState<LeadEditFields>(EMPTY_FIELDS);
  const [seededSnapshot, setSeededSnapshot] = useState<LeadEditFields | null>(null);
  const [seededId, setSeededId] = useState<string | null>(null);

  // Seed — and RE-seed — when the target lead changes, so a mounted editor that
  // navigates to a different leadId adopts the new lead's values instead of
  // keeping the previous lead's edits. Same leadId across re-renders does not
  // re-seed (so in-progress edits are preserved).
  useEffect(() => {
    if (lead && seededId !== leadId) {
      const seededData = seedFromLead(lead);
      setFormData(seededData);
      setSeededSnapshot(seededData);
      setSeededId(leadId);
    }
  }, [lead, leadId, seededId]);

  // Track unsaved changes against the seeded snapshot.
  const isDirty = seededSnapshot !== null && computeLeadChangeset(seededSnapshot, formData).isDirty;
  useFormUnsavedChanges({ formName: 'editLeadForm', isDirty });

  const updateField = (field: keyof LeadEditFields, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    const { changedFields } = computeLeadChangeset(seededSnapshot ?? EMPTY_FIELDS, formData);
    const payload = buildLeadUpdatePayload(leadId, formData, changedFields);
    // Only `{ id }` means there is nothing persistable — either nothing changed, or
    // the only change was a clear the API can't apply (cleared scalar field). Don't
    // run a no-op update (which would bump updatedAt) or falsely mark the form saved.
    if (Object.keys(payload).length <= 1) return;
    await onSave(payload);
    // A successful save makes the current values the new baseline, so the form is
    // no longer dirty (clears the unsaved-changes registration before redirect).
    setSeededSnapshot(formData);
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Read-only info */}
      <Card className="p-6 mb-6">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-4">Lead Info</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <span className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">
              Email
            </span>
            <div className="flex items-center gap-2 px-3 h-10 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-300">
              <span
                aria-hidden="true"
                className="material-symbols-outlined !text-[16px] text-slate-400"
              >
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
            <label htmlFor="firstName" className={LABEL_CLASS}>
              First Name
            </label>
            <input
              id="firstName"
              type="text"
              value={formData.firstName}
              onChange={(e) => updateField('firstName', e.target.value)}
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label htmlFor="lastName" className={LABEL_CLASS}>
              Last Name
            </label>
            <input
              id="lastName"
              type="text"
              value={formData.lastName}
              onChange={(e) => updateField('lastName', e.target.value)}
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label htmlFor="phone" className={LABEL_CLASS}>
              Phone
            </label>
            <input
              id="phone"
              type="tel"
              value={formData.phone}
              onChange={(e) => updateField('phone', e.target.value)}
              placeholder="+1234567890"
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label htmlFor="title" className={LABEL_CLASS}>
              Job Title
            </label>
            <input
              id="title"
              type="text"
              value={formData.title}
              onChange={(e) => updateField('title', e.target.value)}
              className={INPUT_CLASS}
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="company" className={LABEL_CLASS}>
              Company
            </label>
            <input
              id="company"
              type="text"
              value={formData.company}
              onChange={(e) => updateField('company', e.target.value)}
              className={INPUT_CLASS}
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
            <label htmlFor="location" className={LABEL_CLASS}>
              Location
            </label>
            <input
              id="location"
              type="text"
              value={formData.location}
              onChange={(e) => updateField('location', e.target.value)}
              placeholder="City, State"
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label htmlFor="website" className={LABEL_CLASS}>
              Website
            </label>
            <input
              id="website"
              type="text"
              value={formData.website}
              onChange={(e) => updateField('website', e.target.value)}
              placeholder="https://example.com"
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label htmlFor="estimatedValue" className={LABEL_CLASS}>
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
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label htmlFor="tags" className={LABEL_CLASS}>
              Tags
            </label>
            <input
              id="tags"
              type="text"
              value={formData.tags}
              onChange={(e) => updateField('tags', e.target.value)}
              placeholder="tag1, tag2, tag3"
              className={INPUT_CLASS}
            />
            <p className="text-xs text-slate-400 mt-1">Separate tags with commas</p>
          </div>
        </div>
      </Card>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 h-10 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSaving || !isDirty}
          className="px-6 h-10 rounded-lg bg-[#137fec] text-white text-sm font-semibold hover:bg-blue-600 transition-colors shadow-sm shadow-blue-200 dark:shadow-none disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isSaving ? (
            <>
              <span
                aria-hidden="true"
                className="material-symbols-outlined !text-[18px] animate-spin"
              >
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
  );
}
