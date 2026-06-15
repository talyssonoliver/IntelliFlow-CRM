'use client';

import React, { useState, useEffect } from 'react';
import { useFormUnsavedChanges } from '@/hooks/useUnsavedChanges';
import {
  type LeadEditFields,
  type LeadUpdatePayload,
  computeLeadChangeset,
  buildLeadUpdatePayload,
} from '@/lib/leads/change-tracker';
import { updateLeadSchema } from '@intelliflow/validators';
import { LeadForm, EMPTY_FORM_VALUES, type LeadFormValues } from '@/components/leads/LeadForm';

/**
 * Lead edit form (IFC-230). Thin wrapper: owns dirty-tracking, seeding, and the
 * minimal-patch submit (via change-tracker). Delegates all field rendering to
 * `<LeadForm mode="edit">`.
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
  budget?: string | null;
  authority?: string | null;
  need?: string | null;
  timeline?: string | null;
  annualRevenue?: string | null;
}

export interface LeadEditorProps {
  leadId: string;
  lead: LeadEditorLead;
  isSaving: boolean;
  onSave: (payload: LeadUpdatePayload) => Promise<unknown> | void;
  onCancel: () => void;
}

function toEF(v: LeadFormValues): LeadEditFields {
  // Omit create-only fields; remainder exactly matches LeadEditFields.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const {
    email: _a,
    status: _b,
    source: _c,
    sourceOther: _d,
    industry: _e,
    companySize: _f,
    qualificationNotes: _g,
    ...rest
  } = v;
  return rest;
}

const EMPTY = EMPTY_FORM_VALUES;

function seed(lead: LeadEditorLead): LeadFormValues {
  return {
    ...EMPTY,
    firstName: lead.firstName ?? '',
    lastName: lead.lastName ?? '',
    phone: typeof lead.phone === 'string' ? lead.phone : (lead.phone?.value ?? ''),
    title: lead.title ?? '',
    company: lead.company ?? '',
    location: lead.location ?? '',
    website: lead.website ?? '',
    estimatedValue: lead.estimatedValue == null ? '' : String(lead.estimatedValue / 100),
    tags: Array.isArray(lead.tags) ? lead.tags.join(', ') : '',
    budget: lead.budget ?? '',
    authority: lead.authority ?? '',
    need: lead.need ?? '',
    timeline: lead.timeline ?? '',
    annualRevenue: lead.annualRevenue ?? '',
  };
}

export function LeadEditor({
  leadId,
  lead,
  isSaving,
  onSave,
  onCancel,
}: Readonly<LeadEditorProps>) {
  const [form, setForm] = useState<LeadFormValues>(EMPTY);
  const [snap, setSnap] = useState<LeadFormValues | null>(null);
  const [seededId, setSeededId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof LeadFormValues, string>>>({});

  useEffect(() => {
    if (lead && seededId !== leadId) {
      const d = seed(lead);
      setForm(d);
      setSnap(d);
      setSeededId(leadId);
    }
  }, [lead, leadId, seededId]);

  const base = snap ?? EMPTY;
  const { isDirty } = computeLeadChangeset(toEF(base), toEF(form));
  useFormUnsavedChanges({ formName: 'editLeadForm', isDirty });

  const update = (field: keyof LeadFormValues, value: string) => {
    setForm((p) => ({ ...p, [field]: value }));
    setErrors((p) => (p[field] ? { ...p, [field]: undefined } : p));
  };

  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    const { changedFields } = computeLeadChangeset(toEF(base), toEF(form));
    const payload = buildLeadUpdatePayload(leadId, toEF(form), changedFields);
    if (Object.keys(payload).length <= 1) return;

    const parsed = updateLeadSchema.omit({ id: true }).safeParse(payload);
    if (!parsed.success) {
      const fe = parsed.error.flatten().fieldErrors;
      const next: Partial<Record<keyof LeadFormValues, string>> = {};
      for (const k of Object.keys(fe) as Array<keyof typeof fe>) {
        const msg = (fe[k] as string[] | undefined)?.[0];
        if (msg) next[k as keyof LeadFormValues] = msg;
      }
      setErrors(next);
      return;
    }

    setErrors({});
    await onSave(payload);
    setSnap(form);
  };

  return (
    <LeadForm
      mode="edit"
      values={form}
      errors={errors}
      onChange={update}
      onSubmit={handleSubmit}
      isSubmitting={isSaving}
      onCancel={onCancel}
      disabled={!isDirty}
      readOnlyInfo={{ email: lead.email, status: lead.status, source: lead.source }}
    />
  );
}
